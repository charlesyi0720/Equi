/**
 * POST /api/embed
 *
 * Embeds an array of natural-language chunks (from generateUserContextChunks)
 * into Supabase pgvector via Gemini text-embedding-004, then upserts them into
 * the equi_knowledge table.
 *
 * Table contract (confirmed via probing):
 *   user_id   UUID     NOT NULL REFERENCES auth.users(id)
 *   content   TEXT     NOT NULL
 *   embedding vector(768) NOT NULL
 *   metadata  JSONB
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "../../equi/lib/supabase";
import { generateUserContextChunks } from "../../equi/lib/semanticParser";
import { EquiUser } from "../../equi/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";

// Chunk-type labels used in metadata, aligned with semanticParser chunk order
const CHUNK_TYPE_LABELS = [
  "persona_summary",
  "personality_analysis",
  "biological_clock",
  "fixed_activities",
  "life_mode_context",
] as const;
type ChunkType = (typeof CHUNK_TYPE_LABELS)[number];

// ---------------------------------------------------------------------------
// GET /api/embed — health check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "embed",
    embeddingModel: EMBEDDING_MODEL,
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

  // 4. Parallel embedding via Gemini text-embedding-004
  let embeddingResults: number[][];
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getEmbeddingModel(EMBEDDING_MODEL);

    embeddingResults = await Promise.all(
      chunks.map(async (chunk) => {
        const result = await model.embedContent(chunk);
        return result.embedding.values as number[];
      })
    );
  } catch (err) {
    console.error("[embed] Gemini embedding failed:", err);
    return NextResponse.json(
      { error: "Embedding generation failed" },
      { status: 502 }
    );
  }

  // 5. Verify all vectors are 768-dimensional
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
      dimensions: 768,
    },
    { status: 201 }
  );
}

// ---------------------------------------------------------------------------
// Convenience helper — embeds a full EquiUser in one call
// ---------------------------------------------------------------------------

/**
 * Shortcut: takes a complete EquiUser object, generates context chunks
 * and persists them. Use this from server-side route handlers or cron jobs.
 *
 * Usage:
 *   import { embedUser } from "@/app/equi/lib/embedUser";
 *   await embedUser(equiUser);
 */
export async function embedUser(userData: EquiUser): Promise<{ ok: boolean; error?: string }> {
  const chunks = generateUserContextChunks(userData);
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userData.id, chunks }),
  });
  const json = await res.json();
  return res.ok ? { ok: true } : { ok: false, error: json.error };
}
