/**
 * POST /api/embed
 *
 * Embeds an array of natural-language chunks into Supabase pgvector via
 * Gemini embedding REST API (768-dim), then upserts them into the equi_knowledge table.
 *
 * Table contract (confirmed via probing):
 *   user_id   UUID     NOT NULL REFERENCES auth.users(id)
 *   content   TEXT     NOT NULL
 *   embedding vector(768) NOT NULL
 *   metadata  JSONB
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../equi/lib/supabase";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** Primary embedding model — 768-dim, widely supported. */
const PRIMARY_MODEL = "models/text-embedding-004";
/** Fallback model if primary fails. */
const FALLBACK_MODEL = "models/embedding-001";

const EMBEDDING_MODELS = [PRIMARY_MODEL, FALLBACK_MODEL] as const;

// Chunk-type labels used in metadata, aligned with semanticParser chunk order
const CHUNK_TYPE_LABELS = [
  "persona_summary",
  "personality_analysis",
  "biological_clock",
  "fixed_activities",
  "life_mode_context",
] as const;

// ---------------------------------------------------------------------------
// GET /api/embed — health check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "embed",
    models: EMBEDDING_MODELS,
  });
}

// ---------------------------------------------------------------------------
// POST /api/embed
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Parse body
  let body: { userId?: string; chunks?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, chunks } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    return NextResponse.json(
      { error: "chunks must be a non-empty string array" },
      { status: 400 }
    );
  }

  // 2. Validate GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    console.error("[embed] GEMINI_API_KEY is not set in environment");
    return NextResponse.json(
      { error: "Embedding service misconfigured" },
      { status: 500 }
    );
  }

  // 3. Validate supabaseAdmin
  if (!supabaseAdmin) {
    console.error("[embed] supabaseAdmin client is null");
    return NextResponse.json(
      { error: "Database client misconfigured" },
      { status: 500 }
    );
  }

  // 4. Embed each chunk via Gemini REST API with per-model retry
  const embeddingResults: number[][] = [];
  const MAX_RETRIES_PER_MODEL = 2;

  for (const model of EMBEDDING_MODELS) {
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          const results = await Promise.all(
            chunks.map(async (chunk) => {
              const apiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1/${model}:embedContent?key=${GEMINI_API_KEY}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model,
                    content: { parts: [{ text: chunk }] },
                    taskType: "SEMANTIC_SIMILARITY",
                  }),
                }
              );

              if (!apiRes.ok) {
                const errText = await apiRes.text();
                throw new Error(`Gemini API ${apiRes.status}: ${errText}`);
              }

              const data = await apiRes.json() as {
                embedding?: { values?: number[] };
                embeddingValues?: number[];
              };
              const values = data.embedding?.values ?? data.embeddingValues;
              if (!Array.isArray(values)) {
                throw new Error(`Unexpected embedding response shape: ${JSON.stringify(data).slice(0, 200)}`);
              }
              return values as number[];
            })
          );

          // All chunks succeeded with this model
          embeddingResults.push(...results);
          console.log(`[embed] Successfully embedded ${results.length} chunks with model: ${model}`);
          break; // exit retry loop, move to next chunk
        } catch (chunkErr) {
          const isLast = attempt === MAX_RETRIES_PER_MODEL;
          console.error(`[embed] Model=${model} attempt ${attempt + 1} failed for chunk batch:`, chunkErr);
          if (isLast && model === EMBEDDING_MODELS[EMBEDDING_MODELS.length - 1]) {
            // All models exhausted
            return NextResponse.json(
              { error: "Embedding generation failed" },
              { status: 502 }
            );
          }
          if (isLast) {
            // Try next model
            console.warn(`[embed] All retries exhausted for ${model}, trying next model...`);
            break;
          }
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    } catch {
      // Move to next model
    }
    if (embeddingResults.length === chunks.length) break;
  }

  if (embeddingResults.length !== chunks.length) {
    console.error(`[embed] Only embedded ${embeddingResults.length}/${chunks.length} chunks`);
    return NextResponse.json(
      { error: "Embedding generation failed" },
      { status: 502 }
    );
  }

  // 5. Verify all vectors are 768-dimensional (pgvector schema requires vector(768))
  const malformed = embeddingResults.findIndex((v) => v.length !== 768);
  if (malformed !== -1) {
    console.error(`[embed] Chunk[${malformed}] returned ${embeddingResults[malformed].length} dims, expected 768`);
    return NextResponse.json(
      { error: `Embedding dimension mismatch at chunk ${malformed}` },
      { status: 502 }
    );
  }

  // 6. Delete old knowledge rows for this user (idempotency)
  const { error: deleteError } = await supabaseAdmin!
    .from("equi_knowledge")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[embed] Failed to delete old rows:", deleteError);
    return NextResponse.json(
      { error: "Failed to clear previous knowledge data" },
      { status: 500 }
    );
  }

  // 7. Batch insert new rows
  const rows = embeddingResults.map((embedding, i) => ({
    user_id: userId,
    content: chunks[i],
    embedding,
    metadata: { chunk_type: CHUNK_TYPE_LABELS[i] ?? `chunk_${i}` },
  }));

  const { error: insertError } = await supabaseAdmin!
    .from("equi_knowledge")
    .insert(rows);

  if (insertError) {
    console.error("[embed] Batch insert failed:", insertError);
    return NextResponse.json(
      { error: "Failed to store embeddings" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      userId,
      chunksStored: chunks.length,
      dimensions: embeddingResults[0]?.length ?? 768,
    },
    { status: 201 }
  );
}
