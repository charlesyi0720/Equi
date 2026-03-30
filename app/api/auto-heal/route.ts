import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { healSchedule, FluidTask } from "@/app/equi/lib/autoHealing";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { userId, tasks, disruptionSlot } = await req.json();

    if (!userId || !tasks) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 获取用户数据
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_data")
      .eq("id", userId)
      .single();

    if (!profile?.user_data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = profile.user_data;
    const currentTime = new Date();

    // 执行液态日程算法
    const healed = healSchedule(
      tasks,
      currentTime,
      userData.lifeStructure?.fixedActivities || [],
      userData.understanding?.biologicalClock || { focusPeaks: [], energyDips: [] },
      userData.calendarAgentEvents || [],
      disruptionSlot
    );

    return NextResponse.json({ healed });
  } catch (error) {
    console.error("Auto-healing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
