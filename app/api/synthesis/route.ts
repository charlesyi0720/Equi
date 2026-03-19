/**
 * Synthesis API Route — RAG-enabled Conversational AI
 *
 * Data flow per POST /api/synthesis:
 *   Step A: Embed user message → Gemini text-embedding-004 (768-dim)
 *   Step B: Semantic search   → Supabase RPC match_equi_knowledge (top-3)
 *   Step C: Inject knowledge  → Enhanced system prompt → Gemini generateContent
 *
 * Auth: requires valid Supabase JWT; userId is extracted from the verified token.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "../../equi/lib/supabase";
import { geminiConfig } from "../../equi/lib/gemini";

// #region agent log
const LOG_ENDPOINT = "http://127.0.0.1:7854/ingest/5d92c0cc-abdd-4cd6-a71f-0a761f717228";
const SESSION_ID = "089970";
function log(payload: Record<string, unknown>) {
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION_ID },
    body: JSON.stringify({ ...payload, sessionId: SESSION_ID, timestamp: Date.now() }),
  }).catch(() => {});
}
// #endregion

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SynthesisMessage {
  role: "user" | "model";
  content: string;
}

interface SynthesisBody {
  message: string;
  conversationHistory?: SynthesisMessage[];
  userData?: {
    mbti?: string;
    name?: string;
    focusPeaks?: Array<{
      weekday: string;
      start: { hour: number; minute?: number };
      end: { hour: number; minute?: number };
    }>;
    energyDips?: Array<{
      weekday: string;
      start: { hour: number; minute?: number };
      end: { hour: number; minute?: number };
    }>;
    todaySchedule?: string;
    preferredAgentPersona?: string;
  };
}

interface MatchedKnowledge {
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

const EMBEDDING_MODEL = "text-embedding-004";
const MAX_HISTORY = 10;   // keep last 10 turns for context
const MATCH_COUNT = 3;   // top-K knowledge chunks to retrieve

// ---------------------------------------------------------------------------
// System Prompt Templates
// ---------------------------------------------------------------------------

const TONE_INSTRUCTIONS = `

【语气要求】
- 当你引用用户的"精力低谷"或"MBTI 特质"进行建议时，请使用鼓励性且专业的语气。
- 遇到挑战时，以建设性方案为导向，避免批评或施压。
`;

const SCHEDULE_UPDATE_MARKER =
  "💡 [SCHEDULE_UPDATE]";

const SCHEDULE_INSTRUCTIONS = `

【日程建议输出规范】
- 当你建议修改用户日程时，请在相关建议句末附加标记：${SCHEDULE_UPDATE_MARKER}
- 前端会识别此标记并高亮显示日程建议区域。请勿在其他类型的回复中添加此标记。
`;

function buildRagContext(matches: MatchedKnowledge[]): string {
  if (!matches.length) return "";

  const blocks = matches.map((m, i) => {
    const tag = (m.metadata?.chunk_type as string) ?? `块${i + 1}`;
    return `[${tag}] ${m.content}`;
  });

  return (
    "\n\n【用户背景知识】\n" +
    blocks.join("\n\n") +
    "\n\n请基于以上背景知识回答用户提问。如知识块与问题无关，仅作参考依据而非限制。"
  );
}

function buildSystemPrompt(
  userData: SynthesisBody["userData"],
  ragContext: string
): string {
  const { mbti, focusPeaks, energyDips, todaySchedule, preferredAgentPersona } =
    userData ?? {};

  const personaIntro =
    preferredAgentPersona === "DevotedSecretary"
      ? "你是一位温暖鼓励型的私人 AI 生活架构师，擅长以同理心陪伴用户制定计划。"
      : preferredAgentPersona === "HardSupervisor"
      ? "你是一位简洁有力的 AI 督导型生活架构师，注重效率与成果交付。"
      : "你是一位专业且贴心的 AI 生活架构师。";

  const mbtiLine = mbti
    ? `用户 MBTI 类型为 ${mbti}，可据此调整表达风格与建议方式。`
    : "";

  const focusLine = focusPeaks?.length
    ? `用户在以下时段精力最充沛：${focusPeaks.map((p) => `${p.weekday} ${p.start.hour}:00–${p.end.hour}:00`).join("、")}。`
    : "";

  const dipLine = energyDips?.length
    ? `用户在以下时段精力较低：${energyDips.map((d) => `${d.weekday} ${d.start.hour}:00–${d.end.hour}:00`).join("、")}。`
    : "";

  const scheduleLine = todaySchedule
    ? `今日日程摘要：${todaySchedule}`
    : "";

  return [
    personaIntro,
    mbtiLine,
    focusLine,
    dipLine,
    scheduleLine,
    TONE_INSTRUCTIONS,
    SCHEDULE_INSTRUCTIONS,
    ragContext,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Step A: Embed user message with Gemini text-embedding-004
// ---------------------------------------------------------------------------

async function embedMessage(message: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(message);
  return result.embedding.values as number[];
}

// ---------------------------------------------------------------------------
// Step B: Retrieve top-K knowledge chunks from Supabase
// ---------------------------------------------------------------------------

async function retrieveKnowledge(
  queryEmbedding: number[],
  userId: string
): Promise<MatchedKnowledge[]> {
  if (!supabaseAdmin) throw new Error("supabaseAdmin is not initialised");

  const { data, error } = await supabaseAdmin.rpc("match_equi_knowledge", {
    query_embedding: queryEmbedding,
    p_user_id: userId,
    p_match_count: MATCH_COUNT,
  });

  if (error) {
    console.error("[synthesis] RPC match_equi_knowledge error:", error);
    return []; // degrade gracefully — RAG failure shouldn't block chat
  }

  return (data as MatchedKnowledge[]) ?? [];
}

// ---------------------------------------------------------------------------
// Auth helper — verify userId from Bearer token in Authorization header
// Uses supabaseAdmin.auth.getUser(token) with the raw JWT for server-side verification.
// ---------------------------------------------------------------------------

async function authUserId(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (!supabaseAdmin) {
    log({ location: "authUserId:env", message: "supabaseAdmin null", hypothesisId: "A", runId: "pre-fix" });
    return NextResponse.json(
      { error: "Supabase environment not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  log({
    location: "authUserId:entry",
    message: "Authorization header",
    data: { hasAuth: authHeader.length > 0, scheme: authHeader.split(" ")[0] },
    hypothesisId: "A",
    runId: "pre-fix",
  });

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // getUser(token) verifies the JWT against Supabase Auth server-side
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  log({
    location: "authUserId:getUser",
    message: "getUser result",
    data: { hasUser: !!user, userId: user?.id ?? null, errorMessage: error?.message ?? null, errorStatus: error?.status ?? null },
    hypothesisId: "C",
    runId: "pre-fix",
  });

  if (error || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// GET /api/synthesis — opening message (unchanged behaviour)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userDataParam = searchParams.get("userData");

  if (!userDataParam) {
    return NextResponse.json({ error: "userData is required" }, { status: 400 });
  }

  let userData: SynthesisBody["userData"];
  try {
    userData = JSON.parse(decodeURIComponent(userDataParam));
  } catch {
    return NextResponse.json({ error: "Invalid userData format" }, { status: 400 });
  }

  const { name } = userData ?? {};

  const systemPrompt = buildSystemPrompt(userData, "");
  const openingText = `${name || "你"}，你好。我是 Equi，你的个人 AI 生活架构师。`;

  const response = await fetch(geminiConfig.getUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        role: "system",
        parts: [
          {
            text:
              systemPrompt +
              "\n\n请用 1-2 句话作为开场白，语气根据人格设定调整（DevotedSecretary 要温暖鼓励，HardSupervisor 要简洁有力）。",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: openingText }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 100, topP: 0.95, topK: 40 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: "Gemini API failed", details: errorText }, { status: 500 });
  }

  const result = await response.json();
  const text =
    result.candidates?.[0]?.content?.parts?.[0]?.text ||
    "让我帮你优化今天的时间安排。";

  return NextResponse.json({ openingMessage: text });
}

// ---------------------------------------------------------------------------
// POST /api/synthesis — RAG chat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const authResult = await authUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // 2. Parse body
  let body: SynthesisBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, conversationHistory, userData } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // 3. Step A — embed user message
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedMessage(message);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[synthesis] Step A embed failed — full error:", err);
    return NextResponse.json(
      { error: "Embed failed", details: detail },
      { status: 502 }
    );
  }

  // 4. Step B — retrieve knowledge (degrades gracefully on failure)
  let matchedKnowledge: MatchedKnowledge[] = [];
  try {
    matchedKnowledge = await retrieveKnowledge(queryEmbedding, userId);
  } catch (err) {
    console.warn("[synthesis] Step B retrieval failed, continuing without RAG:", err);
  }

  // 5. Step C — build enhanced system prompt
  const ragContext = buildRagContext(matchedKnowledge);
  const systemPrompt = buildSystemPrompt(userData, ragContext);

  // 6. Format conversation history (last MAX_HISTORY turns)
  const historyParts = (conversationHistory ?? [])
    .slice(-MAX_HISTORY)
    .map((msg) => ({ role: msg.role, parts: [{ text: msg.content }] }));

  // 7. Build Gemini generateContent request
  const requestBody = {
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents: [
      ...historyParts,
      { role: "user", parts: [{ text: message }] },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      topP: 0.95,
      topK: 40,
      stream: true,
    },
  };

  // 8. Call Gemini with streaming
  const response = await fetch(geminiConfig.getUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[synthesis] Gemini API error:", response.status, errorText);
    return NextResponse.json(
      { error: "Gemini API failed", details: errorText },
      { status: 502 }
    );
  }

  // 9. Stream Gemini SSE response to client
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split("\n").filter((l) => l.trim() !== "");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(encoder.encode(text));
                }
              } catch {
                // skip malformed SSE lines
              }
            }
          }
        }
      } catch (e) {
        console.error("[synthesis] stream read error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
