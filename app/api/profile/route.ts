/**
 * Profile API Route — Server-side profile management
 *
 * All writes go through supabaseAdmin (service role key) so they bypass RLS.
 * Auth is validated via Bearer JWT extracted from Authorization header.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../equi/lib/supabase";

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
    user_data?: Record<string, unknown>;
    onboarding_completed?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.user_data !== undefined) updates.user_data = body.user_data;
  if (body.onboarding_completed !== undefined) updates.onboarding_completed = body.onboarding_completed;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    console.error("[api/profile] Write failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
