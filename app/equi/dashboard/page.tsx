"use client";

import React, { useState, useEffect, useRef } from "react";
import { EquiUser } from "../types";
import { supabase } from "../lib/supabase";
import { onAuthStateChange, signOut } from "../lib/auth";

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

export default function EquiDashboard() {
  const [userData, setUserData] = useState<EquiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleSubmit = async (e: React.FormEvent) => {
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
  const startHour = 8;
  const endHour = 22;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const hourLabel = (h: number) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${hour12} ${ampm}`;
  };

  const gridColForDayIdx = (dayIdx: number) => dayIdx + 2;
  const gridRowForHour = (h: number) => (h - startHour) + 2;

  const focusPeakStart = 10;
  const focusPeakEnd = 13;
  const dipStart = 21;

  const fixedEvent = {
    title: "Econometrics Lecture",
    dayIdx: 1, // Tue
    start: 10,
    end: 12,
  };

  const aiEvent = {
    title: "Deep Work: Thesis",
    dayIdx: 2, // Wed
    start: 10,
    end: 13,
  };

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
          prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantMessage.content } : m))
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
              <div className="h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
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
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">This Week</div>
                  <div className="mt-1 text-xs text-slate-500">Mon–Sun · 8 AM–10 PM</div>
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
                </div>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="overflow-x-auto">
                <div
                  className="grid min-w-[900px] rounded-xl border border-slate-200"
                  style={{
                    gridTemplateColumns: "80px repeat(7, minmax(0, 1fr))",
                    gridTemplateRows: `44px repeat(${hours.length}, 48px)`,
                  }}
                >
                  <div className="border-b border-slate-200 bg-slate-50" />

                  {days.map((d) => (
                    <div
                      key={d}
                      className="flex items-center justify-center border-b border-l border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
                    >
                      {d}
                    </div>
                  ))}

                  {hours.map((h) => (
                    <React.Fragment key={h}>
                      <div className="flex items-start justify-end border-b border-slate-200 bg-white pr-3 pt-3 text-[11px] text-slate-500">
                        {hourLabel(h)}
                      </div>
                      {days.map((_, dayIdx) => {
                        const isPeak = h >= focusPeakStart && h < focusPeakEnd;
                        const isDip = h >= dipStart;
                        const baseClass = "border-b border-l border-slate-200";
                        if (isDip) {
                          return (
                            <div
                              key={`${dayIdx}-${h}`}
                              className={`${baseClass} bg-white`}
                              style={{
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
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}

                  <div
                    className="z-10 mx-1 my-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900"
                    style={{
                      gridColumnStart: gridColForDayIdx(fixedEvent.dayIdx),
                      gridColumnEnd: gridColForDayIdx(fixedEvent.dayIdx) + 1,
                      gridRowStart: gridRowForHour(fixedEvent.start),
                      gridRowEnd: gridRowForHour(fixedEvent.end),
                    }}
                  >
                    <div className="font-medium">{fixedEvent.title}</div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      {hourLabel(fixedEvent.start)}–{hourLabel(fixedEvent.end)}
                    </div>
                  </div>

                  <div
                    className="z-10 mx-1 my-1 rounded-lg border border-dashed border-slate-400 bg-white px-3 py-2 text-xs text-slate-900"
                    style={{
                      gridColumnStart: gridColForDayIdx(aiEvent.dayIdx),
                      gridColumnEnd: gridColForDayIdx(aiEvent.dayIdx) + 1,
                      gridRowStart: gridRowForHour(aiEvent.start),
                      gridRowEnd: gridRowForHour(aiEvent.end),
                    }}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <span aria-hidden="true">✨</span>
                      {aiEvent.title}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      {hourLabel(aiEvent.start)}–{hourLabel(aiEvent.end)}
                    </div>
                  </div>
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
