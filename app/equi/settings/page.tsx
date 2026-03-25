"use client";

import React, { useState, useEffect, useRef } from "react";
import { EquiUser, FixedActivity, ActivitySlot, CognitiveCategory, Weekday } from "../types";
import { supabase } from "../lib/supabase";
import { embedUser } from "../lib/embedUser";

// ─── Icons ───────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

const CATEGORY_COLORS: Record<string, string> = {
  DeepWork: "bg-amber-50 border-amber-200 text-amber-700",
  ShallowWork: "bg-blue-50 border-blue-200 text-blue-700",
  Admin: "bg-stone-50 border-stone-200 text-stone-700",
  Creative: "bg-violet-50 border-violet-200 text-violet-700",
  Social: "bg-rose-50 border-rose-200 text-rose-700",
  Recovery: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableActivity {
  id: string;
  label: string;
  category: CognitiveCategory;
  activityType: "strictlyFixed" | "flexibleFloating";
  weekdayPattern: Weekday[];
  slots: ActivitySlot[];
  flexibleQuota?: { dailyMinutes: number; preferredSlot: "focusPeaks" | "anytime" };
  isHardConstraint: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimeSlotRow({
  slot,
  day,
  onUpdate,
  onRemove,
}: {
  slot: ActivitySlot;
  day: Weekday;
  onUpdate: (field: keyof ActivitySlot, value: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-[11px] font-medium text-slate-400 w-8 shrink-0">{DAY_SHORT[day].slice(0, 2)}</span>
      <select
        value={slot.startHour}
        onChange={(e) => onUpdate("startHour", Number(e.target.value))}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-200"
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="text-[11px] text-slate-400">:</span>
      <select
        value={slot.startMinute ?? 0}
        onChange={(e) => onUpdate("startMinute", Number(e.target.value))}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-mono text-slate-700 w-12 focus:outline-none focus:ring-1 focus:ring-emerald-200"
      >
        {[0, 15, 30, 45].map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="text-[11px] text-slate-400 mx-1">→</span>
      <select
        value={slot.endHour}
        onChange={(e) => onUpdate("endHour", Number(e.target.value))}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-200"
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="text-[11px] text-slate-400">:</span>
      <select
        value={slot.endMinute ?? 0}
        onChange={(e) => onUpdate("endMinute", Number(e.target.value))}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-mono text-slate-700 w-12 focus:outline-none focus:ring-1 focus:ring-emerald-200"
      >
        {[0, 15, 30, 45].map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
      <button
        onClick={onRemove}
        className="ml-auto text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
        title="Remove this slot"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function ActivityCard({
  activity,
  index,
  onUpdate,
  onRemove,
}: {
  activity: EditableActivity;
  index: number;
  onUpdate: (patch: Partial<EditableActivity>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const catColorClass = CATEGORY_COLORS[activity.category] ?? "bg-gray-50 border-gray-200 text-gray-700";

  const addSlotForDay = (day: Weekday) => {
    const existing = activity.slots.find((s) => s.day === day);
    if (existing) return;
    onUpdate({ slots: [...activity.slots, { day, startHour: 9, endHour: 10, startMinute: 0, endMinute: 0 }] });
  };

  const updateSlot = (day: Weekday, field: keyof ActivitySlot, value: number) => {
    onUpdate({
      slots: activity.slots.map((s) => (s.day === day ? { ...s, [field]: value } : s)),
    });
  };

  const removeSlot = (day: Weekday) => {
    onUpdate({ slots: activity.slots.filter((s) => s.day !== day) });
  };

  const occupiedDays = new Set(activity.slots.map((s) => s.day));
  const availableDays = DAYS.filter((d) => !occupiedDays.has(d));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={activity.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Activity name"
            className="w-full text-sm font-semibold text-slate-900 bg-transparent border-none outline-none placeholder:text-slate-300"
          />
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-lg border ${catColorClass}`}>
          {activity.category}
        </span>
        <button
          onClick={onRemove}
          className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer p-1"
          title="Remove activity"
        >
          <TrashIcon />
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer px-1 text-sm font-bold"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          {/* Category */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 font-medium w-16 shrink-0">Category</label>
            <select
              value={activity.category}
              onChange={(e) => onUpdate({ category: e.target.value as CognitiveCategory })}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {Object.keys(CATEGORY_COLORS).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 font-medium w-16 shrink-0">Type</label>
            <div className="flex gap-2 flex-1">
              <button
                onClick={() => onUpdate({ activityType: "strictlyFixed" })}
                className={`flex-1 rounded-xl border py-2 text-[11px] font-semibold transition-all cursor-pointer ${
                  activity.activityType === "strictlyFixed"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-slate-500 hover:border-gray-300"
                }`}
              >
                Fixed Time
              </button>
              <button
                onClick={() => onUpdate({ activityType: "flexibleFloating" })}
                className={`flex-1 rounded-xl border py-2 text-[11px] font-semibold transition-all cursor-pointer ${
                  activity.activityType === "flexibleFloating"
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-gray-200 text-slate-500 hover:border-gray-300"
                }`}
              >
                Flexible
              </button>
            </div>
          </div>

          {/* Fixed time slots */}
          {activity.activityType === "strictlyFixed" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-500 font-medium">Time Slots</label>
                {availableDays.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) addSlotForDay(e.target.value as Weekday); }}
                    className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 cursor-pointer focus:outline-none"
                  >
                    <option value="">+ Add day</option>
                    {availableDays.map((d) => (
                      <option key={d} value={d}>{DAY_SHORT[d]}</option>
                    ))}
                  </select>
                )}
              </div>
              {activity.slots.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-2">No time slots. Add a day above.</p>
              ) : (
                <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-3">
                  {DAYS.map((day) => {
                    const slot = activity.slots.find((s) => s.day === day);
                    if (!slot) return null;
                    return (
                      <TimeSlotRow
                        key={day}
                        slot={slot}
                        day={day}
                        onUpdate={(field, value) => updateSlot(day, field, value)}
                        onRemove={() => removeSlot(day)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Flexible quota */}
          {activity.activityType === "flexibleFloating" && (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-500 font-medium">Daily Quota</label>
                <span className="text-[11px] font-mono font-semibold text-slate-600">
                  {((activity.flexibleQuota?.dailyMinutes ?? 60) / 60).toFixed(1)}h / day
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="480"
                step="30"
                value={activity.flexibleQuota?.dailyMinutes ?? 60}
                onChange={(e) =>
                  onUpdate({
                    flexibleQuota: {
                      dailyMinutes: Number(e.target.value),
                      preferredSlot: activity.flexibleQuota?.preferredSlot ?? "anytime",
                    },
                  })
                }
                className="w-full accent-emerald-500"
              />
              <div className="flex gap-2">
                {(["focusPeaks", "anytime"] as const).map((slot) => (
                  <button
                    key={slot}
                    onClick={() =>
                      onUpdate({
                        flexibleQuota: {
                          dailyMinutes: activity.flexibleQuota?.dailyMinutes ?? 60,
                          preferredSlot: slot,
                        },
                      })
                    }
                    className={`flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      (activity.flexibleQuota?.preferredSlot ?? "anytime") === slot
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 text-slate-400"
                    }`}
                  >
                    {slot === "focusPeaks" ? "Focus Peaks" : "Anytime"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hard constraint */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onUpdate({ isHardConstraint: !activity.isHardConstraint })}
              className={`w-9 h-5 rounded-full transition-all cursor-pointer relative ${
                activity.isHardConstraint ? "bg-emerald-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  activity.isHardConstraint ? "translate-x-4 left-0.5" : "translate-x-0.5"
                }`}
              />
            </button>
            <div>
              <div className="text-xs font-semibold text-slate-700">
                {activity.isHardConstraint ? "Hard Constraint" : "Flexible"}
              </div>
              <div className="text-[10px] text-slate-400">
                {activity.isHardConstraint ? "Cannot be moved by the agent" : "Can be adjusted if needed"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [userData, setUserData] = useState<EquiUser | null>(null);
  const [activities, setActivities] = useState<EditableActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const isMountedRef = useRef(true);

  // Load profile
  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/equi/login"; return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_data")
        .eq("id", user.id)
        .single();

      if (!isMountedRef.current) return;

      if (profile?.user_data) {
        const ud = profile.user_data as EquiUser;
        setUserData(ud);
        setActivities(
          (ud.lifeStructure?.fixedActivities ?? []).map((a) => ({
            id: a.id,
            label: a.label,
            category: a.category,
            activityType: a.activityType,
            weekdayPattern: a.weekdayPattern as Weekday[],
            slots: a.slots ?? [],
            flexibleQuota: a.flexibleQuota,
            isHardConstraint: a.isHardConstraint,
          }))
        );
      }
      setIsLoading(false);
    };
    load();
    return () => { isMountedRef.current = false; };
  }, []);

  const generateId = () => Math.random().toString(36).substring(2, 11);

  const addActivity = () => {
    setActivities((prev) => [
      ...prev,
      {
        id: generateId(),
        label: "",
        category: "DeepWork",
        activityType: "strictlyFixed",
        weekdayPattern: [],
        slots: [],
        flexibleQuota: { dailyMinutes: 60, preferredSlot: "anytime" },
        isHardConstraint: false,
      },
    ]);
  };

  const updateActivity = (index: number, patch: Partial<EditableActivity>) => {
    setActivities((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const removeActivity = (index: number) => {
    setActivities((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!userData) return;
    setIsSaving(true);
    setSaveMsg(null);

    const merged: EquiUser = {
      ...userData,
      lifeStructure: {
        ...userData.lifeStructure,
        fixedActivities: activities.map((a) => ({
          id: a.id,
          label: a.label,
          category: a.category,
          activityType: a.activityType,
          weekdayPattern: a.weekdayPattern,
          slots: a.slots,
          flexibleQuota: a.flexibleQuota,
          isHardConstraint: a.isHardConstraint,
        })),
      },
    };

    if (!supabase) { setIsSaving(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setIsSaving(false); return; }

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ user_data: merged }),
      });
      if (res.ok) {
        setUserData(merged);
        setSaveMsg({ type: "success", text: "Changes saved" });
        // Re-sync knowledge graph so the agent sees updated fixed activities immediately.
        if (userData?.id) {
          embedUser({ ...merged, id: userData.id } as any).catch((e) =>
            console.warn("[settings] Re-embed failed:", e)
          );
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveMsg({ type: "error", text: err.error ?? "Save failed" });
      }
    } catch {
      setSaveMsg({ type: "error", text: "Network error" });
    } finally {
      setIsSaving(false);
      setTimeout(() => { if (isMountedRef.current) setSaveMsg(null); }, 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-4">
          <a
            href="/equi/dashboard"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <BackIcon />
            Dashboard
          </a>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSaving ? (
                "Saving…"
              ) : (
                <>
                  <CheckIcon />
                  Save Changes
                </>
              )}
            </button>
            {saveMsg && (
              <div
                className={`animate-toast-in max-w-[min(16rem,calc(100vw-8rem))] ${
                  saveMsg.type === "success"
                    ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-[0_4px_24px_rgba(16,185,129,0.2)]"
                    : "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 shadow-[0_4px_24px_rgba(244,63,94,0.15)]"
                }`}
                role="status"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      saveMsg.type === "success" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                    }`}
                  >
                    {saveMsg.type === "success" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${saveMsg.type === "success" ? "text-emerald-800" : "text-rose-800"}`}>
                    {saveMsg.text}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your fixed activities from onboarding. Changes take effect immediately.
          </p>
        </div>

        {/* Activities */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">Fixed Activities</h2>
            <button
              onClick={addActivity}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-all cursor-pointer"
            >
              <PlusIcon />
              Add Activity
            </button>
          </div>

          {activities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <div className="text-slate-400 text-sm">No fixed activities yet.</div>
              <button
                onClick={addActivity}
                className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium underline cursor-pointer"
              >
                Add your first activity
              </button>
            </div>
          ) : (
            activities.map((activity, index) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                index={index}
                onUpdate={(patch) => updateActivity(index, patch)}
                onRemove={() => removeActivity(index)}
              />
            ))
          )}
        </div>

        {/* Agent events */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">AI Suggestions</h2>
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-10 text-center">
            <div className="text-sm text-slate-400">
              Agent-added events appear on the calendar automatically.
              <br />
              Delete them from the calendar view on the dashboard.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
