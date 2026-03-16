"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { EquiUser } from "../types";
import { supabase } from "../lib/supabase";
import { onAuthStateChange, signOut } from "../lib/auth";

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ERROR BOUNDARY] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-lg text-red-600">Something went wrong</div>
            <div className="text-sm text-slate-500">{this.state.error?.message}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-900 text-white rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ============================================================================
// SKELETON LOADER COMPONENTS
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:py-8">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 animate-pulse">
          <div className="h-3 w-80 bg-slate-100 rounded" />
          <div className="mt-2 h-3 w-[520px] bg-slate-100 rounded" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_7fr]">
          <div className="rounded-xl border border-slate-200 bg-white animate-pulse">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
            <div className="px-5 py-4">
              <div className="h-[420px] rounded-xl border border-slate-200 bg-slate-50" />
              <div className="mt-4 h-11 rounded-xl border border-slate-200 bg-white" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white animate-pulse">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </div>
            <div className="px-5 py-4">
              <div className="h-[520px] rounded-xl border border-slate-200 bg-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ERROR COMPONENT
// ============================================================================

function ErrorDisplay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md p-6">
        <div className="text-lg text-red-600 font-medium">Connection Error</div>
        <div className="text-sm text-slate-600">{message}</div>
        <button
          onClick={onRetry}
          className="px-6 py-2 text-sm rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// DASHBOARD COMPONENT
// ============================================================================

function DashboardContent() {
  const [userData, setUserData] = useState<EquiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const calendarScrollRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/equi/login";
  };

  // ============================================================================
  // CLEAN FETCH: Pure Supabase calls without localStorage hacks
  // ============================================================================
  const initializeDashboard = async (retryCount = 0) => {
    const MAX_RETRIES = 2;
    
    try {
      // 1. Lightweight auth check using getUser (not getSession - avoids polling deadlock)
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        throw new Error(`Authentication failed: ${authError.message}`);
      }

      if (!user) {
        window.location.href = "/equi/login";
        return;
      }

      // 2. Precise profile fetch using maybeSingle
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(`Failed to load profile: ${profileError.message}`);
      }

      // 3. Check onboarding status
      if (!profile || !profile.onboarding_completed) {
        window.location.href = "/equi/onboarding";
        return;
      }

      // 4. Success - set user data from cloud
      if (isMountedRef.current) {
        setUserData(profile.user_data as EquiUser);
        setIsLoading(false);
      }

    } catch (err: any) {
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        if (isMountedRef.current) {
          initializeDashboard(retryCount + 1);
        }
        return;
      }
      
      // Show real error after all retries failed
      if (isMountedRef.current) {
        setError(err?.message || "Failed to connect to database");
        setIsLoading(false);
      }
    }
  };

  // Mount effect
  useEffect(() => {
    initializeDashboard();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Real-time auth listener
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        initializeDashboard();
      } else if (event === "SIGNED_OUT") {
        window.location.href = "/equi/login";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Auto-trigger opening message
  useEffect(() => {
    if (userData && messages.length === 0) {
      generateOpeningMessage();
    }
  }, [userData]);

  const generateOpeningMessage = async () => {
    if (!userData) return;

    const { name, mbti, biologicalClock, preferredAgentPersona } = userData.understanding || {};
    
    try {
      const userDataParam = encodeURIComponent(JSON.stringify({
        name,
        mbti,
        focusPeaks: biologicalClock?.focusPeaks,
        energyDips: biologicalClock?.energyDips,
        preferredAgentPersona,
      }));

      const response = await fetch(`/api/synthesis?userData=${userDataParam}`);
      const data = await response.json();
      
      const openingMessage: Message = {
        id: generateId(),
        role: "assistant",
        content:
          data.openingMessage ||
          "Good morning. Want me to shape today around your 10 AM–1 PM focus peak?",
        timestamp: new Date(),
      };
      
      setMessages([openingMessage]);
    } catch (error) {
      console.error("Failed to generate opening message:", error);
      const fallbackMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "Good morning. What would you like to accomplish today?",
        timestamp: new Date(),
      };
      setMessages([fallbackMessage]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);

    const conversationHistory = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: m.content,
    }));

    const userContext = {
      mbti: userData?.understanding?.mbti,
      focusPeaks: userData?.understanding?.biologicalClock?.focusPeaks,
      energyDips: userData?.understanding?.biologicalClock?.energyDips,
    };

    try {
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory,
          userData: userContext,
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        assistantMessage.content += chunk;
        
        setMessages((prev) => 
          prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantMessage.content } : m)
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "Sorry — I hit a snag. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Calendar time calculations - must be BEFORE early returns
  const headerHeight = 44;
  const hourRowHeight = 64; // h-16 = 64px per hour

  // Get current time for the red line
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeTop = headerHeight + (currentHour * hourRowHeight) + (currentMinute / 60) * hourRowHeight;

  // Auto-scroll to current time on mount - must be BEFORE early returns
  useEffect(() => {
    // Scroll to 8:30 AM after loading completes
    if (!isLoading && calendarScrollRef.current) {
      // Delay 50ms to wait for browser CSS Grid rendering
      const timer = setTimeout(() => {
        calendarScrollRef.current!.scrollTop = 500;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={() => { setError(null); setIsLoading(true); initializeDashboard(); }} />;
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">No user data found</div>
          <a href="/equi/onboarding" className="text-xs underline text-slate-600 mt-2 block">
            Go to Onboarding
          </a>
        </div>
      </div>
    );
  }

  const name = userData?.understanding?.name || "User";

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  const startHour = 0;
  const endHour = 23;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Build real events from userData
  const userEvents: Array<{
    title: string;
    dayIdx: number;
    start: number;
    end: number;
    isFixed: boolean;
  }> = [];

  // Map full weekday names to short names
  const weekdayToShort: Record<string, string> = {
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun",
  };

  // Extract fixed activities from userData (with defensive checks)
  const fixedActivities = userData?.lifeStructure?.fixedActivities || [];
  for (const activity of (Array.isArray(fixedActivities) ? fixedActivities : [])) {
    if (activity?.activityType === "strictlyFixed" && Array.isArray(activity?.slots)) {
      for (const slot of activity.slots) {
        if (slot?.day == null || slot?.startHour == null || slot?.endHour == null) continue;
        const shortDay = weekdayToShort[slot.day] || slot.day;
        const dayIdx = days.indexOf(shortDay as typeof days[number]);
        if (dayIdx >= 0) {
          const start = (slot.startHour ?? 0) + ((slot.startMinute ?? 0) / 60);
          const end = (slot.endHour ?? 0) + ((slot.endMinute ?? 0) / 60);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
          userEvents.push({
            title: activity.label || "Untitled",
            dayIdx,
            start,
            end,
            isFixed: true,
          });
        }
      }
    }
  }

  // Add AI-suggested placeholder if no events exist
  if (userEvents.length === 0) {
    userEvents.push({
      title: "Deep Work: Thesis",
      dayIdx: 2, // Wed
      start: 10,
      end: 13,
      isFixed: false,
    });
  }

  const hourLabel = (h: number) => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    if (h < 12) return `${h} AM`;
    return `${h - 12} PM`;
  };

  const gridColForDayIdx = (dayIdx: number) => dayIdx + 2; // +2 because col 1 is time labels, col 2+ are days
  const gridRowForHour = (h: number) => h + 2; // +2 because row 1 is header, row 2 = hour 0
  const gridRowEndForHour = (h: number) => h + 3; // end is exclusive

  const focusPeakStart = 10;
  const focusPeakEnd = 13;
  const dipStart = 21;

  const submitQuickAction = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    const conversationHistory = [...messages, userMessage].map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: m.content,
    }));

    const userContext = {
      mbti: userData?.understanding?.mbti,
      focusPeaks: userData?.understanding?.biologicalClock?.focusPeaks,
      energyDips: userData?.understanding?.biologicalClock?.energyDips,
    };

    try {
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory,
          userData: userContext,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Chat API error:", response.status, errorText);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantMessage.content += chunk;

        setMessages((prev) =>
          prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantMessage.content } : m))
        );
      }
    } catch (error: any) {
      console.error("Error sending message:", error?.message || error);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: `Sorry — I hit a snag: ${error?.message || "Unknown error"}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:py-8">
        {/* Top: Executive Briefing */}
        <div className="w-full rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-slate-700" aria-hidden="true">✨</div>
            <div className="text-sm leading-relaxed text-slate-700">
              <span className="font-medium text-slate-900">Good morning, {name}.</span>{" "}
              Your focus peaks at 10 AM today. I&apos;ve optimized your deep-work blocks accordingly.
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <div>Executive Copilot · Weekly view</div>
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Bottom: 30/70 split */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_7fr]">
          {/* Left Panel: Copilot Chat */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900">Executive Copilot</div>
                <div className="text-xs text-slate-500">{isStreaming ? "Thinking…" : "Ready"}</div>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" style={{ height: "calc(100vh - 350px)" }}>
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.role === "user"
                          ? "ml-auto max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700"
                          : "max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800"
                      }
                    >
                      {m.content}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => submitQuickAction("Optimize my day around my focus peaks.")}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={isStreaming}
                  >
                    ⚡ Optimize Today
                  </button>
                  <button
                    onClick={() => submitQuickAction("I’m exhausted. Make today lighter and protect recovery time.")}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={isStreaming}
                  >
                    🧘 I&apos;m exhausted
                  </button>
                  <button
                    onClick={() => submitQuickAction("Export my plan for today to my calendar.")}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={isStreaming}
                  >
                    📅 Export
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Message your copilot…"
                    disabled={isStreaming}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isStreaming}
                    className="h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>

                <div className="text-xs text-slate-500">Try: “Protect a 90-minute deep-work block.”</div>
              </div>
            </div>
          </div>

          {/* Right Panel: Energy-Aware Weekly Calendar */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">This Week</div>
                  <div className="mt-1 text-xs text-slate-500">Mon–Sun · 12 AM–11 PM</div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border border-slate-200 bg-blue-50/60" />
                    Focus peak
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded border border-slate-200"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(135deg, rgba(148,163,184,0.25) 0px, rgba(148,163,184,0.25) 4px, rgba(255,255,255,0) 4px, rgba(255,255,255,0) 10px)",
                      }}
                    />
                    Energy dip
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border border-red-400 border-dashed" />
                    Now
                  </div>
                </div>
              </div>
            </div>

            <div ref={calendarScrollRef} className="overflow-x-auto overflow-y-auto" style={{ height: "calc(100vh - 180px)" }}>
              <div className="w-full min-w-[700px]">
                <div
                  className="grid relative"
                  style={{
                    gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))",
                    gridTemplateRows: `44px repeat(${hours.length}, ${hourRowHeight}px)`,
                  }}
                >
                  {/* Header row corner */}
                  <div className="border-b border-r border-slate-200 bg-slate-50 sticky top-0 z-10" />

                  {/* Day headers - sticky */}
                  {days.map((d, idx) => (
                    <div
                      key={d}
                      className="sticky top-0 z-10 flex items-center justify-center border-b border-r border-slate-200 bg-white text-xs font-medium text-slate-700"
                      style={{ left: idx === 0 ? 0 : undefined }}
                    >
                      {d}
                    </div>
                  ))}

                  {/* Time column and day cells */}
                  {hours.map((h) => (
                    <React.Fragment key={h}>
                      {/* Time label */}
                      <div 
                        className="flex items-start justify-end border-b border-r border-slate-200 bg-white pr-2 pt-2 text-[11px] text-slate-500 sticky left-0 z-10 bg-white"
                        style={{ gridColumn: 1, gridRow: gridRowForHour(h) }}
                      >
                        {hourLabel(h)}
                      </div>
                      {days.map((_, dayIdx) => {
                        const isPeak = h >= focusPeakStart && h < focusPeakEnd;
                        const isDip = h >= dipStart;
                        const baseClass = "border-b border-r border-slate-200";
                        if (isDip) {
                          return (
                            <div
                              key={`${dayIdx}-${h}`}
                              className={`${baseClass} bg-white`}
                              style={{
                                gridColumn: gridColForDayIdx(dayIdx),
                                gridRow: gridRowForHour(h),
                                backgroundImage:
                                  "repeating-linear-gradient(135deg, rgba(148,163,184,0.22) 0px, rgba(148,163,184,0.22) 4px, rgba(255,255,255,0) 4px, rgba(255,255,255,0) 12px)",
                              }}
                            />
                          );
                        }
                        return (
                          <div
                            key={`${dayIdx}-${h}`}
                            className={`${baseClass} ${isPeak ? "bg-blue-50/40" : "bg-white"}`}
                            style={{ gridColumn: gridColForDayIdx(dayIdx), gridRow: gridRowForHour(h) }}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* Current time red line */}
                  <div
                    className="absolute z-20 border-t-2 border-red-500 pointer-events-none"
                    style={{
                      top: `${currentTimeTop}px`,
                      left: "64px",
                      right: 0,
                    }}
                  >
                    <div className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-red-500" />
                  </div>

                  {/* Render real events */}
                  {(Array.isArray(userEvents) ? userEvents : []).map((event, idx) => {
                    if (!event || !Number.isFinite(event.dayIdx) || !Number.isFinite(event.start) || !Number.isFinite(event.end)) {
                      return null;
                    }
                    const colStart = gridColForDayIdx(event.dayIdx);
                    const rowStart = gridRowForHour(Math.floor(event.start));
                    const rowEnd = gridRowEndForHour(Math.ceil(event.end));
                    if (!Number.isFinite(colStart) || !Number.isFinite(rowStart) || !Number.isFinite(rowEnd)) {
                      return null;
                    }
                    return (
                    <div
                      key={idx}
                      className={`z-10 mx-1 my-1 rounded-lg px-3 py-2 text-xs text-slate-900 overflow-hidden ${
                        event.isFixed
                          ? "border border-slate-300 bg-slate-50"
                          : "border border-dashed border-slate-400 bg-white"
                      }`}
                      style={{
                        gridColumnStart: colStart,
                        gridColumnEnd: colStart + 1,
                        gridRowStart: rowStart,
                        gridRowEnd: rowEnd,
                      }}
                    >
                      <div className={`font-medium ${!event.isFixed ? "flex items-center gap-2" : ""}`}>
                        {!event.isFixed && <span aria-hidden="true">✨</span>}
                        {event.title}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600">
                        {hourLabel(Math.floor(event.start))}–{hourLabel(Math.ceil(event.end))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Wrapper component with Error Boundary
export default function EquiDashboard() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
