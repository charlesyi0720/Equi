/**
 * Synthesis API Route — RAG-enabled Conversational AI
 *
 * Data flow per POST /api/synthesis:
 *   Step A: Embed user message → Gemini text-embedding-004 REST API (768-dim)
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
    /** Human-readable summary of the user's fixed activities (gym, class, etc.). */
    fixedActivitiesSummary?: string;
    /** Human-readable summary of the user's flexible/floating activities (gym daily quota, etc.). */
    flexibleActivitiesSummary?: string;
    /** Existing calendar events to avoid conflicts. */
    existingEvents?: Array<{ title: string; day: string; start: number; end: number }>;
  };
}

interface MatchedKnowledge {
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

const EMBEDDING_MODEL = "gemini-embedding-001";
/** Gemini 3.1 Flash-Lite (preview) — cost/latency friendly for high-volume chat. */
const CHAT_MODEL = "gemini-3.1-flash-lite-preview";
const MAX_HISTORY = 10;   // keep last 10 turns for context
const MATCH_COUNT = 3;   // top-K knowledge chunks to retrieve

// ---------------------------------------------------------------------------
// chunk_type → Chinese semantic hint (used by inferChunkTypes)
// ---------------------------------------------------------------------------

const CHUNK_TYPE_HINTS: Record<string, string> = {
  persona_summary:        "用户的基本信息（姓名、职业、简介）",
  personality_analysis:   "用户的 MBTI 性格类型、拖延倾向、压力敏感度",
  biological_clock:       "用户的专注力高峰和精力低谷时间段",
  fixed_activities:       "用户每周的固定日程（Gym、上课、会议等），用于安排或调整日程时",
  life_mode_context:      "用户当前的生活模式（正常/专注模式/度假等）",
  learned_preference:      "用户在对话中流露的长期偏好、习惯或约束（Agent 提炼的）",
};

/**
 * Infer which chunk_type values to filter by from the user's question keywords.
 * Returns an empty array when no signal is found (caller will fetch all types).
 */
function inferChunkTypes(message: string): string[] {
  const m = message.toLowerCase();
  const matched: string[] = [];

  if (/mbti|性格|拖延|压力|工作\s*风格|personality|procrastination/i.test(m)) {
    matched.push("personality_analysis");
  }
  if (/专注|高峰|精力|低谷|focus|energy|生物.?钟|几点/i.test(m)) {
    matched.push("biological_clock");
  }
  if (/日程|安排|schedule|calendar|block|空出|预约|上课|gym|健身|class|会议|assignment|作业|课程|weekday|weekend|周一|周二|周三|周四|周五|周六|周日/i.test(m)) {
    matched.push("fixed_activities");
  }
  if (/模式|mode|life|度假|holiday|恢复|recovery|旅行|travel/i.test(m)) {
    matched.push("life_mode_context");
  }
  if (/我是谁|who am i|职业|occupation|简历|个人.?简介|about me/i.test(m)) {
    matched.push("persona_summary");
  }

  if (/偏好|习惯|constraint|约束|我发现|usually|always|never|normally|tend to/i.test(m)) {
    matched.push("learned_preference");
  }

  return matched;
}

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
- Whenever you confirm adding, moving, or reserving a concrete calendar block (or tell the user you updated their schedule), you MUST include the machine-readable tag ON ITS OWN LINE at the END of your response — even if the rest of your reply is in Chinese or another language.
- CRITICAL: If you are adding MULTIPLE tasks, you MUST output ONE tag per task, each on its own line.
- Tag format (ASCII pipes only):
  ${SCHEDULE_UPDATE_MARKER} Event Title | startHour | endHour | day [| YYYY-MM-DD]
  Examples (single task):
  💡 [SCHEDULE_UPDATE]: Deep Work Block | 14 | 16 | wed
  💡 [SCHEDULE_UPDATE]: Macroeconomics homework | 14 | 15 | wed | 2026-03-25

  Examples (multiple tasks):
  💡 [SCHEDULE_UPDATE]: Macro Lecture Review | 14 | 15 | wed
  💡 [SCHEDULE_UPDATE]: Online Assessment | 14 | 16 | wed
  💡 [SCHEDULE_UPDATE]: Scholarship Application | 16 | 17 | wed
- Title: Use the EXACT activity name from user's message (e.g., if user says "gym session", use "Gym Session", not "Workout" or "Exercise Block"). Plain text, MUST NOT contain | or line breaks. Avoid generic placeholders like "Focus block", "Deep work", or "Calendar event" unless the user used those exact words.
- startHour/endHour: integers 0-23 (24-hour), endHour > startHour.
- day: mon/tue/wed/thu/fri/sat/sun (English, lowercase).
- If the block is for "today", always include the 5th field YYYY-MM-DD using today's date given in the prompt (so it does not repeat every week).
- Do NOT put any other text on that tag line. Nothing may follow that line.
- Do NOT add this tag when you are only giving general advice without placing a specific block.
`;

const RESCHEDULE_INSTRUCTIONS = `

[Disruption Detection & Reschedule Trigger]
When user mentions unexpected events that disrupt their schedule (emergency meetings, delays, procrastination, overtime):
- Acknowledge the disruption empathetically
- Identify which existing task is affected
- Suggest an alternative time slot (preferably during their focus peak)
- Include this tag on its own line at the END of your response:
  [RESCHEDULE_TRIGGER]: startHour | endHour | taskTitle | suggestedDay | suggestedStart | suggestedEnd
  Examples:
  [RESCHEDULE_TRIGGER]: 14 | 16 | Deep Work Session | wed | 9 | 11
  [RESCHEDULE_TRIGGER]: 13 | 15 | Gym | thu | 18 | 19
- startHour/endHour: disruption time (24-hour format)
- taskTitle: the affected task name
- suggestedDay: mon/tue/wed/thu/fri/sat/sun
- suggestedStart/suggestedEnd: suggested alternative time (24-hour format)
- This triggers two buttons: "Cancel Task" and "Reschedule to [suggested time]"
- Do NOT add this tag for planned events — only for disruptions to existing schedule
`;

/** Extra system text when the user message clearly asks for a time block — overrides models skipping the tag. */
const SCHEDULE_TAG_MANDATORY_APPENDIX = (todayIso: string) => `

[CALENDAR SYNC — MANDATORY FOR THIS REQUEST]
The user is asking to place or change a specific time on their calendar.
After your normal reply in their language, you MUST append exactly one final line with NO text after it:
${SCHEDULE_UPDATE_MARKER} <short title> | <startHour> | <endHour> | <mon..sun> | ${todayIso}
Use 24-hour hours. Match the day-of-week to ${todayIso} unless they explicitly said another day (then adjust day + date).
If you cannot honor the request, omit the tag and explain why — do not claim you updated the calendar without the tag.
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

function todayIsoInTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

function isLikelyScheduleRequest(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (
    /点|上午|下午|晚上|半夜|午间|am\b|pm\b|:\d{2}\b|日程|日历|安排|预约|空出|focus|assignment|作业|专注|block|calendar|schedule(\s|$)|time block|book\b/i.test(
      m
    )
  ) {
    return true;
  }
  if (/\d{1,2}\s*[-–至到~\uff5e]\s*\d{1,2}/.test(m)) return true;
  return false;
}

function buildSystemPrompt(
  userData: SynthesisBody["userData"],
  ragContext: string,
  timezone: string,
  localTimeStr?: string,
  scheduleTagMandatory?: boolean
): string {
  const { mbti, name, focusPeaks, energyDips, todaySchedule, preferredAgentPersona, fixedActivitiesSummary, flexibleActivitiesSummary } =
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

  const fixedActivitiesLine = fixedActivitiesSummary
    ? `[Fixed Activities — DO NOT schedule over these without the user's explicit consent]\n${fixedActivitiesSummary}`
    : "";

  const flexibleActivitiesLine = flexibleActivitiesSummary
    ? `[Flexible/Floating Activities — these have no fixed slot; schedule them when convenient or during focus peaks]\n${flexibleActivitiesSummary}`
    : "";

  const existingEvents = userData?.existingEvents || [];
  const existingEventsText = existingEvents.length > 0
    ? existingEvents.map(e => `- ${e.title}: ${e.day} ${e.start}:00–${e.end}:00`).join("\n")
    : "None yet.";

  const conflictDetectionLine = `[Existing Calendar Events — NEVER place a new block over these times]\n${existingEventsText}\n\nBefore suggesting any time block, verify it does not overlap with the above. If a conflict exists, propose a non-conflicting slot instead.`;

  const languageRule =
    "CRITICAL RULE: You MUST respond entirely in the language the user is currently typing in (e.g., reply in English if the user types in English. DO NOT force Chinese).";

  const todayIso = todayIsoInTimeZone(tz);
  const todayDayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date());

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(tomorrow);
  const tomorrowIso = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);

  const scheduleMandatoryBlock = scheduleTagMandatory ? SCHEDULE_TAG_MANDATORY_APPENDIX(todayIso) : "";

  return [
    `The user's current local time is: ${localTimeStr ?? serverTimeStr}. Adjust your greetings and scheduling suggestions strictly to match this time of day. Never say "Good morning" when it is clearly evening or night.`,
    `Today is ${todayDayOfWeek}, ${todayIso}. When user says "tomorrow", it means ${tomorrowDayOfWeek}, ${tomorrowIso}.`,
    nameLine,
    personaInstruction,
    personaIntro,
    mbtiLine,
    focusLine,
    dipLine,
    scheduleLine,
    fixedActivitiesLine,
    flexibleActivitiesLine,
    conflictDetectionLine,
    TONE_INSTRUCTIONS,
    BREVITY_INSTRUCTIONS,
    SCHEDULE_INSTRUCTIONS,
    RESCHEDULE_INSTRUCTIONS,
    scheduleMandatoryBlock,
    ragContext,
    languageRule,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Step A: Embed user message with Gemini REST API (matches embed/route.ts)
// ---------------------------------------------------------------------------

async function embedMessage(message: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: message }] },
      taskType: "SEMANTIC_SIMILARITY",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    embedding?: { values?: number[] };
    embeddingValues?: number[];
    predictions?: Array<{ embedding?: { values?: number[] } }>;
  };
  const values =
    data.embedding?.values ??
    data.embeddingValues ??
    data.predictions?.[0]?.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error(`Unexpected embedding response: ${JSON.stringify(data).slice(0, 100)}`);
  }
  // Truncate to 768 to match pgvector schema
  return (values as number[]).slice(0, 768);
}

// ---------------------------------------------------------------------------
// Step B: Retrieve top-K knowledge chunks from Supabase
// ---------------------------------------------------------------------------

async function retrieveKnowledge(
  queryEmbedding: number[],
  userId: string,
  chunkTypes?: string[]
): Promise<MatchedKnowledge[]> {
  if (!supabaseAdmin) throw new Error("supabaseAdmin is not initialised");

  const filterTypes = chunkTypes && chunkTypes.length > 0 ? chunkTypes : null;

  let result: { data: MatchedKnowledge[] | null; error: { message: string } | null };

  if (filterTypes !== null) {
    // Try new filtered RPC first; fall back if function not deployed yet.
    try {
      result = await supabaseAdmin.rpc("match_equi_knowledge_filtered", {
        query_embedding: queryEmbedding,
        p_user_id: userId,
        p_match_count: MATCH_COUNT,
        p_chunk_types: filterTypes,
      });
    } catch (_fallbackErr) {
      // New function not in DB yet — use unfiltered original.
      result = await supabaseAdmin.rpc("match_equi_knowledge", {
        query_embedding: queryEmbedding,
        p_user_id: userId,
        p_match_count: MATCH_COUNT,
      });
    }
  } else {
    result = await supabaseAdmin.rpc("match_equi_knowledge", {
      query_embedding: queryEmbedding,
      p_user_id: userId,
      p_match_count: MATCH_COUNT,
    });
  }

  if (result.error) {
    console.error("[synthesis] RPC error:", result.error);
    return []; // degrade gracefully — RAG failure shouldn't block chat
  }

  return (result.data as MatchedKnowledge[]) ?? [];
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
  const relevantTypes = inferChunkTypes(message);
  let matchedKnowledge: MatchedKnowledge[] = [];
  try {
    matchedKnowledge = await retrieveKnowledge(queryEmbedding, userId, relevantTypes);
  } catch (err) {
    console.warn("[synthesis/rag] Step B retrieval failed, continuing without RAG:", err);
  }

  log({
    location: "handleRagChat:postRetrieval",
    message: "RAG retrieval result",
    data: {
      relevantTypes,
      matchedCount: matchedKnowledge.length,
      chunks: matchedKnowledge.map((k) => ({ type: k.metadata?.chunk_type, similarity: k.similarity, preview: k.content.slice(0, 80) })),
    },
    hypothesisId: "F",
    runId: "auto",
  });

  // Step C — build enhanced system prompt
  const ragContext = buildRagContext(matchedKnowledge);
  const systemPrompt = buildSystemPrompt(userData ?? {}, ragContext, timezone ?? "UTC", localTimeStr);

  // Format conversation history (last MAX_HISTORY turns); drop empty turns (invalid for Gemini).
  let historyParts = (conversationHistory ?? [])
    .slice(-MAX_HISTORY)
    .map((msg) => ({ role: msg.role, parts: [{ text: msg.content ?? "" }] }))
    .filter((p) => (p.parts[0]?.text?.length ?? 0) > 0);

  // Gemini requires the first Content to be from the user. Opening assistant-only greeting would
  // otherwise yield [model, user] and cause API errors (502 on Vercel).
  while (historyParts.length > 0 && historyParts[0].role === "model") {
    historyParts = historyParts.slice(1);
  }

  // Current user message must appear in `contents`. handleSubmit sends history WITHOUT the new turn;
  // submitQuickAction sends history that already includes the new user message — avoid duplicating.
  const lastPart = historyParts[historyParts.length - 1];
  const lastAlreadyThisUser =
    lastPart?.role === "user" && lastPart.parts[0]?.text === message;
  const contents = lastAlreadyThisUser
    ? historyParts
    : [...historyParts, { role: "user" as const, parts: [{ text: message }] }];

  if (contents.length === 0) {
    console.error("[synthesis/rag] contents empty after history strip");
    return NextResponse.json({ error: "No valid messages to send" }, { status: 400 });
  }

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
      contents,
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
          const piece =
            typeof (chunk as { text?: () => string }).text === "function"
              ? (chunk as { text: () => string }).text()
              : "";
          if (piece) controller.enqueue(encoder.encode(piece));
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
