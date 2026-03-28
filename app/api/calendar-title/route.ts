/**
 * POST /api/calendar-title
 *
 * Uses Gemini to produce short, task-focused calendar titles from copilot chat.
 * Auth: Bearer JWT (same as /api/profile).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../equi/lib/supabase";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHAT_MODEL = "gemini-3.1-flash-lite-preview";

type SlotInput = { slotLabel: string; fallbackTitle: string };

function sanitizeCalendarTitle(v: unknown, fallback: string): string {
  const fb = fallback.replace(/\s+/g, " ").trim().slice(0, 80) || "Scheduled block";
  if (typeof v !== "string") return fb;
  const t = v.replace(/[\n\r|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!t) return fb;
  if (
    /精力充沛|黄金时段|最佳状态|非常适合|注意休息|keep\s+(your\s+)?best|peak\s+energy/i.test(t)
  ) {
    return fb;
  }
  return t;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: {
    userMessage?: string;
    assistantMessage?: string;
    broaderHistory?: string;
    activityLabels?: string[];
    slots?: SlotInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slots = Array.isArray(body.slots) ? body.slots : [];
  if (slots.length === 0) {
    return NextResponse.json({ titles: [] });
  }

  const fallbacks = slots.map((s) =>
    typeof s.fallbackTitle === "string" ? s.fallbackTitle : "Scheduled block"
  );

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ titles: fallbacks });
  }

  const userMessage = String(body.userMessage ?? "").slice(0, 8000);
  const assistantMessage = String(body.assistantMessage ?? "").slice(0, 8000);
  const broader = String(body.broaderHistory ?? "").slice(0, 4000);
  const labels = (Array.isArray(body.activityLabels) ? body.activityLabels : [])
    .filter((s): s is string => typeof s === "string")
    .slice(0, 40);

  const slotsBlock = slots
    .map((s, i) => {
      const label = typeof s.slotLabel === "string" ? s.slotLabel : `Slot ${i + 1}`;
      const fb = typeof s.fallbackTitle === "string" ? s.fallbackTitle : "";
      return `${i + 1}. ${label} (heuristic: "${fb}")`;
    })
    .join("\n");

  const prompt = `You name calendar events for a productivity copilot app.

Return ONLY valid JSON (no markdown fences): {"titles":["..."]}
The "titles" array MUST have exactly ${slots.length} strings, in the same order as the numbered slots.

Rules for each title:
- Short: about 2–8 words, maximum 40 characters.
- Name the real task or subject only (e.g. "Macro review", "微观经济学复习", "Gym", "Thesis").
- Use the same language as the user's task in the messages (Chinese or English) when natural.

FORBIDDEN — never use as a title:
- Coaching or energy commentary (e.g. 精力充沛, 黄金时段, 最佳状态, peak energy, motivational fragments copied from the assistant).
- Vague labels like "时间安排" or "Scheduled block" unless the user explicitly asked for that.

Known user activity labels (prefer exact spelling when they fit): ${labels.length ? labels.join(", ") : "(none)"}

Slots:
${slotsBlock}

--- User message ---
${userMessage}

--- Assistant message ---
${assistantMessage}

--- Earlier context ---
${broader || "(none)"}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
      }),
    });

    if (!res.ok) {
      console.warn("[api/calendar-title] Gemini HTTP", res.status);
      return NextResponse.json({ titles: fallbacks });
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { titles?: unknown };
    const raw = Array.isArray(parsed.titles) ? parsed.titles : [];
    const titles = slots.map((slot, i) =>
      sanitizeCalendarTitle(raw[i], typeof slot.fallbackTitle === "string" ? slot.fallbackTitle : fallbacks[i])
    );
    return NextResponse.json({ titles });
  } catch (e) {
    console.warn("[api/calendar-title] failed:", e);
    return NextResponse.json({ titles: fallbacks });
  }
}
