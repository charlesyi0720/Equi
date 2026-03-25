/**
 * POST /api/embed
 *
 * Embeds chunks into Supabase pgvector via Gemini REST API, then upserts
 * into the equi_knowledge table.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../equi/lib/supabase";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** Primary embedding model — 768-dim, confirmed supported for embedContent in v1beta. */
const PRIMARY_MODEL = "gemini-embedding-001";
/** Fallback: newer preview model. */
const FALLBACK_MODEL = "gemini-embedding-2-preview";

const CHUNK_TYPE_LABELS = [
  "persona_summary",
  "personality_analysis",
  "biological_clock",
  "fixed_activities",
  "life_mode_context",
] as const;

// ---------------------------------------------------------------------------
// GET health check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    status: "ok",
    models: [PRIMARY_MODEL, FALLBACK_MODEL],
    hasApiKey: !!GEMINI_API_KEY,
    hasSupabase: !!supabaseAdmin,
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
    return NextResponse.json({ error: "chunks must be a non-empty string array" }, { status: 400 });
  }

  // 2. Validate environment
  if (!GEMINI_API_KEY) {
    console.error("[embed] GEMINI_API_KEY is not set");
    return NextResponse.json({ error: "GEMINI_API_KEY missing from environment" }, { status: 500 });
  }
  if (!supabaseAdmin) {
    console.error("[embed] supabaseAdmin is null");
    return NextResponse.json({ error: "Database client misconfigured" }, { status: 500 });
  }

  // 3. Embed each chunk — try models in order, 3 retries each
  const embeddingResults: number[][] = [];
  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];

  for (const model of modelsToTry) {
    let attempt = 0;

    while (attempt < 3) {
      attempt++;

      try {
        const results = await Promise.all(
          chunks.map(async (_chunk, idx) => {
            // Correct URL: v1beta/models/{model}:embedContent
            const url =
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GEMINI_API_KEY}`;

            const apiRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: `models/${model}`,
                content: { parts: [{ text: _chunk }] },
                taskType: "SEMANTIC_SIMILARITY",
              }),
            });

            if (!apiRes.ok) {
              const errText = await apiRes.text();
              throw new Error(`API ${apiRes.status}: ${errText.slice(0, 200)}`);
            }

            const data = await apiRes.json() as {
              embedding?: { values?: number[] };
              embeddingValues?: number[];
              predictions?: Array<{ embedding?: { values?: number[] } }>;
            };

            const values =
              data.embedding?.values ??
              data.embeddingValues ??
              data.predictions?.[0]?.embedding?.values;

            if (!Array.isArray(values)) {
              throw new Error(`Unexpected response shape for chunk ${idx}: ${JSON.stringify(data).slice(0, 100)}`);
            }
            return values as number[];
          })
        );

        // All chunks succeeded with this model
        embeddingResults.push(...results);
        console.log(`[embed] ✓ model=${model} succeeded, ${results.length} chunks`);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[embed] ✗ model=${model} attempt ${attempt} failed: ${msg}`);
        if (attempt >= 3) {
          console.warn(`[embed] All attempts exhausted for ${model}, trying next model...`);
          break;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (embeddingResults.length === chunks.length) break;
  }

  if (embeddingResults.length !== chunks.length) {
    console.error(`[embed] All models exhausted — only got ${embeddingResults.length}/${chunks.length}`);
    return NextResponse.json({ error: "Embedding generation failed" }, { status: 502 });
  }

  // 4. Dimension check
  const badDim = embeddingResults.findIndex((v) => v.length !== 768);
  if (badDim !== -1) {
    console.error(`[embed] Chunk[${badDim}] dim=${embeddingResults[badDim].length}, expected 768`);
    return NextResponse.json(
      { error: `Dimension mismatch at chunk ${badDim}` },
      { status: 502 }
    );
  }

  // 5. Delete old rows for idempotency
  const { error: deleteError } = await supabaseAdmin!
    .from("equi_knowledge")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[embed] Delete old rows failed:", deleteError);
    return NextResponse.json({ error: "Failed to clear previous knowledge data" }, { status: 500 });
  }

  // 6. Batch insert
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
    console.error("[embed] Insert failed:", insertError);
    return NextResponse.json({ error: "Failed to store embeddings" }, { status: 500 });
  }

  console.log(`[embed] ✓ Done — ${rows.length} rows stored for user=${userId}`);
  return NextResponse.json({ ok: true, userId, chunksStored: rows.length, dimensions: 768 }, { status: 201 });
}
