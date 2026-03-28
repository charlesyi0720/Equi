/**
 * Conversation API — Layer 1: Short-Term (Episodic) Memory
 *
 * POST /api/conversation
 *   Inserts a single message into conversation_messages.
 *   body: { sessionId: string; role: "user"|"assistant"; content: string }
 *
 * GET /api/conversation?sessionId=xxx
 *   Returns recent messages for a session (page load).
 *   query: { sessionId, limit? }
 *
 * GET /api/conversation?sessions=true
 *   Returns all session previews (for resume dialog).
 *   query: { limit? }
 *
 * Auth: Bearer JWT validated server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../equi/lib/supabase";

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface SessionPreview {
  session_id: string;
  last_message: string;
  last_timestamp: string;
  message_count: number;
}

async function authUserId(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const token = req.headers.get("Authorization")?.startsWith("Bearer ")
    ? req.headers.get("Authorization")!.slice(7)
    : null;
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// POST — insert a message
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const authResult = await authUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: { sessionId?: string; role?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, role, content } = body;
  if (!sessionId || !role || !content) {
    return NextResponse.json({ error: "sessionId, role, content are required" }, { status: 400 });
  }
  if (role !== "user" && role !== "assistant") {
    return NextResponse.json({ error: "role must be 'user' or 'assistant'" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin!
    .from("conversation_messages")
    .insert({ user_id: userId, session_id: sessionId, role, content })
    .select("id, session_id, role, content, timestamp")
    .single();

  if (error) {
    console.error("[conversation/POST] insert failed:", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// ---------------------------------------------------------------------------
// GET — retrieve messages or session previews
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authResult = await authUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const isSessions = searchParams.get("sessions") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  if (isSessions) {
    // Return session preview list (for resume dialog)
    const { data, error } = await supabaseAdmin!
      .rpc("get_sessions_preview", { p_user_id: userId, p_limit: limit });

    if (error) {
      console.error("[conversation/GET] get_sessions_preview failed:", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const sessions: SessionPreview[] = (data ?? []).map((row: Record<string, unknown>) => ({
      session_id: row.session_id as string,
      last_message: (row.last_message as string)?.slice(0, 120) ?? "",
      last_timestamp: row.last_timestamp as string,
      message_count: Number(row.message_count ?? 0),
    }));

    return NextResponse.json({ sessions });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  // Return recent messages for a session
  const { data, error } = await supabaseAdmin!
    .rpc("get_recent_messages", { p_user_id: userId, p_session_id: sessionId, p_limit: limit });

  if (error) {
    console.error("[conversation/GET] get_recent_messages failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const messages: StoredMessage[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    timestamp: row.timestamp as string,
  }));

  return NextResponse.json({ messages });
}
