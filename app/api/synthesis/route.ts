/**
 * Synthesis API Route — RAG-enabled Conversational AI
 *
 * Data flow per POST /api/synthesis:
 *   Step A: Embed user message → Gemini gemini-embedding-001 (768-dim)
 *   Step B: Semantic search   → Supabase RPC match_equi_knowledge (top-3)
 *   Step C: Inject knowledge  → Enhanced system prompt → Gemini generateContent
 *
 * Auth: requires valid Supabase JWT; userId is extracted from the verified token.
 */

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "../../equi/lib/supabase";

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
  isGreeting?: boolean;
  message?: string;
  conversationHistory?: SynthesisMessage[];
  timezone?: string;
  localTimeStr?: string;
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

const EMBEDDING_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
const MAX_HISTORY = 10;   // keep last 10 turns for context
const MATCH_COUNT = 3;   // top-K knowledge chunks to retrieve

// ---------------------------------------------------------------------------
// System Prompt Templates
// ---------------------------------------------------------------------------

const TONE_INSTRUCTIONS = `

[Tone Requirements]
- When citing the user's "energy dips" or "MBTI traits" for advice, use an encouraging and professional tone.
- When facing challenges, orient toward constructive solutions; avoid criticism or pressure.
`;

const BREVITY_INSTRUCTIONS = `

[Brevity Requirements]
- Keep responses short and focused: aim for 2-4 sentences maximum.
- Start with the key conclusion or action first, then one clarifying detail if needed.
- Only elaborate when the user explicitly asks for details or steps.
- For scheduling suggestions: lead with the proposed time block, then one brief rationale.
`;

const SCHEDULE_UPDATE_MARKER =
  "💡 [SCHEDULE_UPDATE]:";

const SCHEDULE_INSTRUCTIONS = `

[Schedule Suggestion Output Format]
- When you suggest modifying the user's schedule, include the machine-readable tag ON ITS OWN LINE at the END of your response:
  ${SCHEDULE_UPDATE_MARKER} Event Title | startHour | endHour | day
  Example: 💡 [SCHEDULE_UPDATE]: Deep Work Block | 14 | 16 | wed
- Field definitions: title (plain text, MUST NOT contain the pipe character | or line breaks—use a comma in the title if needed), startHour (integer 0-23), endHour (integer 0-23, must be greater than startHour), day (3-letter lowercase: mon/tue/wed/thu/fri/sat/sun).
- Do NOT put any other text on that same line. The app parses this line automatically when your reply finishes; the user may also tap "Apply to Calendar" if shown.
- Do NOT add this tag to non-scheduling responses.
`;

function buildRagContext(matches: MatchedKnowledge[]): string {
  if (!matches.length) return "";

  const blocks = matches.map((m, i) => {
    const tag = (m.metadata?.chunk_type as string) ?? `Chunk ${i + 1}`;
    return `[${tag}] ${m.content}`;
  });

  return (
    "\n\n[User Background Knowledge]\n" +
    blocks.join("\n\n") +
    "\n\nPlease answer the user's question based on the above background knowledge. If knowledge chunks are unrelated to the question, use them as reference only and do not let them limit your answer."
  );
}

function buildSystemPrompt(
  userData: SynthesisBody["userData"],
  ragContext: string,
  timezone: string,
  localTimeStr?: string
): string {
  const { mbti, name, focusPeaks, energyDips, todaySchedule, preferredAgentPersona } =
    userData ?? {};

  const tz = timezone || "UTC";
  const serverTimeStr = new Date().toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  });

  const nameLine = name
    ? `The user's name is ${name}. Always address the user by their name. Do not use generic terms like "Boss" unless the persona specifically dictates it.`
    : "";

  const personaInstruction = preferredAgentPersona
    ? `Your personality and tone MUST strictly match this persona: ${preferredAgentPersona}.`
    : "";

  const personaIntro =
    preferredAgentPersona === "DevotedSecretary"
      ? "You are a warm and encouraging AI personal life architect, skilled at empathetically accompanying users to plan their schedules."
      : preferredAgentPersona === "HardSupervisor"
      ? "You are a concise and powerful AI supervisor-style life architect, focused on efficiency and delivering results."
      : "You are a professional and caring AI life architect.";

  const mbtiLine = mbti
    ? `The user's MBTI type is ${mbti}. You may adjust your communication style and advice approach accordingly.`
    : "";

  const focusLine = focusPeaks?.length
    ? `The user is most energetic during these time slots: ${focusPeaks.map((p) => `${p.weekday} ${p.start.hour}:00–${p.end.hour}:00`).join(", ")}.`
    : "";

  const dipLine = energyDips?.length
    ? `The user experiences energy dips during these time slots: ${energyDips.map((d) => `${d.weekday} ${d.start.hour}:00–${d.end.hour}:00`).join(", ")}.`
    : "";

  const scheduleLine = todaySchedule
    ? `Today's schedule summary: ${todaySchedule}`
    : "";

  const languageRule =
    "CRITICAL RULE: You MUST respond entirely in the language the user is currently typing in (e.g., reply in English if the user types in English. DO NOT force Chinese).";

  return [
    `The user's current local time is: ${localTimeStr ?? serverTimeStr}. Adjust your greetings and scheduling suggestions strictly to match this time of day. Never say "Good morning" when it is clearly evening or night.`,
    nameLine,
    personaInstruction,
    personaIntro,
    mbtiLine,
    focusLine,
    dipLine,
    scheduleLine,
    TONE_INSTRUCTIONS,
    BREVITY_INSTRUCTIONS,
    SCHEDULE_INSTRUCTIONS,
    ragContext,
    languageRule,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Step A: Embed user message with Gemini gemini-embedding-001
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
// POST /api/synthesis — handles both greeting and RAG chat
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

  // 3. Route: greeting vs. RAG chat
  if (body.isGreeting) {
    return handleGreeting(body);
  }

  return handleRagChat(body, userId);
}

// ---------------------------------------------------------------------------
// Greeting path — non-streaming, returns JSON { openingMessage }
// ---------------------------------------------------------------------------

async function handleGreeting(body: SynthesisBody): Promise<NextResponse> {
  const { userData, timezone, localTimeStr } = body;
  const { name, preferredAgentPersona } = userData ?? {};

  const systemPrompt = buildSystemPrompt(userData ?? {}, "", timezone ?? "UTC", localTimeStr);
  const openingText = `${name || "there"}, hello. I am Equi, your personal AI life architect.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API Key missing" }, { status: 500 });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          role: "system",
          parts: [
            {
              text:
                systemPrompt +
                "\n\nPlease give a 1-2 sentence opening in English, with tone adjusted to match the persona (DevotedSecretary should be warm and encouraging, HardSupervisor should be concise and powerful).",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: openingText }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 256, topP: 0.95, topK: 40 },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[synthesis/greeting] Gemini API error:", response.status, errorText);
    return NextResponse.json({ error: "Gemini API failed", details: errorText }, { status: 502 });
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];

  const finishReason = candidate?.finishReason;
  const rawParts: Array<{ text?: string }> = candidate?.content?.parts ?? [];
  const allText = rawParts.map((p) => p.text ?? "").join("").trim();

  if (!allText || finishReason === "MAX_TOKENS" || finishReason === "SAFETY") {
    const tz = timezone ?? "UTC";
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const hour = parseInt(hourStr, 10);
    const greeting = !isNaN(hour) && hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const fallback = `${greeting}! What would you like to accomplish today?`;
    console.warn(
      `[synthesis/greeting] Unusable response, falling back. finishReason=${finishReason}, text=${allText.slice(0, 40)}`
    );
    return NextResponse.json({ openingMessage: fallback });
  }

  return NextResponse.json({ openingMessage: allText });
}

// ---------------------------------------------------------------------------
// RAG chat path — streaming, streams SSE to client
// ---------------------------------------------------------------------------

async function handleRagChat(body: SynthesisBody, userId: string): Promise<NextResponse> {
  const { message, conversationHistory, userData, timezone, localTimeStr } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Step A — embed user message
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedMessage(message);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[synthesis/rag] Step A embed failed:", err);
    return NextResponse.json({ error: "Embed failed", details: detail }, { status: 502 });
  }

  // Step B — retrieve knowledge (degrades gracefully)
  let matchedKnowledge: MatchedKnowledge[] = [];
  try {
    matchedKnowledge = await retrieveKnowledge(queryEmbedding, userId);
  } catch (err) {
    console.warn("[synthesis/rag] Step B retrieval failed, continuing without RAG:", err);
  }

  // Step C — build enhanced system prompt
  const ragContext = buildRagContext(matchedKnowledge);
  const systemPrompt = buildSystemPrompt(userData ?? {}, ragContext, timezone ?? "UTC", localTimeStr);

  // Format conversation history (last MAX_HISTORY turns)
  const historyParts = (conversationHistory ?? [])
    .slice(-MAX_HISTORY)
    .map((msg) => ({ role: msg.role, parts: [{ text: msg.content }] }));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API Key missing" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

  let result;
  try {
    result = await model.generateContentStream({
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
      contents: historyParts,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40,
      },
    });
  } catch (err: any) {
    console.error("[synthesis/rag] Gemini API Crash:", err);
    return NextResponse.json({ error: "Gemini Generation Failed", details: err.message }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          controller.enqueue(encoder.encode(chunk.text()));
        }
      } catch (e) {
        console.error("[synthesis/rag] stream error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
  });
}
