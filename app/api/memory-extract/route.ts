/**
 * Memory Extractor API — Layer 2: Long-Term Memory (Dynamic RAG)
 *
 * POST /api/memory-extract
 *
 * Silently extracts high-value preference/fact statements from recent
 * conversation messages and writes them as "learned_preference" chunks
 * into equi_knowledge (RAG).
 *
 * This endpoint is intentionally silent — it returns 204 No Content
 * regardless of outcome. Failures are logged but never surfaced to the client.
 *
 * Body: { userId: string; sessionId: string }
 *
 * Auth: Bearer JWT validated server-side.
 * Triggered by: dashboard/page.tsx after every N message exchanges.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../equi/lib/supabase";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHAT_MODEL = "gemini-3.1-flash-lite-preview";
const EMBEDDING_MODEL = "gemini-embedding-001";

const MEMORY_EXTRACTION_PROMPT = `你是一个精准的用户偏好提炼专家。请分析以下聊天记录，提取用户关于以下方面的长期偏好、习惯、约束或生物钟规律。只提炼明确表达的、可操作的事实。不要提炼已知的固定活动（如 gym、上课等）重复信息。

聊天记录：
{conversation}

请以以下 JSON 格式返回（只返回 JSON，不要其他内容）：
{{"fact": "提炼出的事实短句，如：用户周三晚上习惯打球，不安排高认知任务", "confidence": 0.85, "evidence": ["原始聊天摘录1", "原始聊天摘录2"]}}

如果没有提炼出任何新信息，返回：
{{"fact": null}}`;

interface ExtractionResult {
  fact: string | null;
  confidence: number;
  evidence: string[];
}

async function authUserId(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({}, { status: 204 });
  const token = req.headers.get("Authorization")?.startsWith("Bearer ")
    ? req.headers.get("Authorization")!.slice(7)
    : null;
  if (!token) return NextResponse.json({}, { status: 204 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({}, { status: 204 });
  return { userId: user.id };
}

async function getRecentMessagesForExtract(userId: string, sessionId: string): Promise<string> {
  const { data } = await supabaseAdmin!.rpc("get_messages_for_extract", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_limit: 20,
  });
  if (!data || !Array.isArray(data)) return "";

  return (data as Array<{ role: string; content: string }>)
    .map((m) => `${m.role}: ${m.content}`)
    .reverse()
    .join("\n");
}

async function embedText(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "SEMANTIC_SIMILARITY",
    }),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}`);
  const json = await res.json() as {
    embedding?: { values?: number[] };
    embeddingValues?: number[];
    predictions?: Array<{ embedding?: { values?: number[] } }>;
  };
  const values =
    json.embedding?.values ?? json.embeddingValues ?? json.predictions?.[0]?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("No embedding values");
  return (values as number[]).slice(0, 768);
}

async function extractPreference(conversation: string): Promise<ExtractionResult> {
  const prompt = MEMORY_EXTRACTION_PROMPT.replace("{conversation}", conversation);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as ExtractionResult;
    if (typeof parsed.fact === "string" && parsed.fact.length > 0) {
      return { fact: parsed.fact, confidence: parsed.confidence ?? 0.5, evidence: parsed.evidence ?? [] };
    }
  } catch {
    console.warn("[memory-extract] Failed to parse Gemini response:", text.slice(0, 100));
  }
  return { fact: null, confidence: 0, evidence: [] };
}

export async function POST(req: NextRequest) {
  // Auth — fail silently
  const authResult = await authUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: { userId?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({}, { status: 204 });
  }

  const { userId: bodyUserId, sessionId } = body;
  const targetUserId = bodyUserId ?? userId;

  if (!targetUserId || !sessionId || !GEMINI_API_KEY) {
    return NextResponse.json({}, { status: 204 });
  }

  try {
    // Step 1: Pull recent messages
    const conversation = await getRecentMessagesForExtract(targetUserId, sessionId);
    if (!conversation.trim()) return NextResponse.json({}, { status: 204 });

    // Step 2: Gemini extraction
    const result = await extractPreference(conversation);
    if (!result.fact) return NextResponse.json({}, { status: 204 });

    // Step 3: Embed and write to equi_knowledge
    const chunkContent = `[learned_preference] ${result.fact}`;
    const embedding = await embedText(chunkContent);

    await supabaseAdmin!.from("equi_knowledge").insert({
      user_id: targetUserId,
      content: chunkContent,
      embedding,
      metadata: {
        chunk_type: "learned_preference",
        confidence: result.confidence,
        evidence: result.evidence,
        extracted_at: new Date().toISOString(),
      },
    });

    // Step 4: Append to profiles.user_data.agentBrain.longTermMemory.behaviorPatterns
    const { data: profile } = await supabaseAdmin!.from("profiles")
      .select("user_data")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profile) {
      const userData = (profile.user_data ?? {}) as Record<string, unknown>;
      const agentBrain = (userData.agentBrain ?? {}) as Record<string, unknown>;
      const ltm = (agentBrain.longTermMemory ?? {}) as Record<string, unknown>;

      const patterns = Array.isArray(ltm.behaviorPatterns) ? [...ltm.behaviorPatterns] : [];
      patterns.push({
        patternId: crypto.randomUUID(),
        description: result.fact,
        evidence: result.evidence,
        confidence: result.confidence,
        lastUpdated: new Date().toISOString(),
      });

      await supabaseAdmin!.from("profiles")
        .update({
          user_data: {
            ...userData,
            agentBrain: {
              ...agentBrain,
              longTermMemory: {
                ...ltm,
                behaviorPatterns: patterns,
                conversationMessagesSinceLastExtract: 0,
                lastExtractAt: new Date().toISOString(),
              },
            },
          },
        })
        .eq("id", targetUserId);
    }

    console.log(`[memory-extract] ✓ Extracted: "${result.fact}" (confidence=${result.confidence})`);
  } catch (err) {
    console.warn("[memory-extract] Silent failure:", err);
  }

  return NextResponse.json({}, { status: 204 });
}
