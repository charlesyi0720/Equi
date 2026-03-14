"use client";

import React, { useState, useEffect, useRef } from "react";
import { EquiUser } from "../types";
import { supabase } from "../lib/supabase";
import { getUser, onAuthStateChange, signOut, getProfile } from "../lib/auth";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen bg-[#fff] text-[#111] font-sans">
      {/* Header Skeleton */}
      <header className="border-b border-[#eee] px-6 py-4 animate-pulse">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <div className="h-6 w-16 bg-[#eee] rounded"></div>
            <div className="h-3 w-40 bg-[#eee] rounded mt-1"></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="h-4 w-20 bg-[#eee] rounded"></div>
              <div className="h-3 w-16 bg-[#eee] rounded mt-1"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Skeleton */}
      <div className="max-w-7xl mx-auto grid grid-cols-12 min-h-[calc(100vh-80px)]">
        {/* SECTION A: Profile Skeleton */}
        <section className="col-span-3 border-r border-[#eee] p-6">
          <div className="space-y-8 animate-pulse">
            <div>
              <div className="h-3 w-16 bg-[#eee] rounded mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-[#eee] rounded"></div>
                <div className="h-4 w-3/4 bg-[#eee] rounded"></div>
              </div>
            </div>
            <div>
              <div className="h-3 w-24 bg-[#eee] rounded mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-[#eee] rounded"></div>
                <div className="h-4 w-2/3 bg-[#eee] rounded"></div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B: Chat Skeleton */}
        <section className="col-span-6 flex flex-col border-r border-[#eee]">
          <div className="px-6 py-4 border-b border-[#eee]">
            <div className="h-3 w-24 bg-[#eee] rounded animate-pulse"></div>
          </div>
          <div className="flex-1 p-6 space-y-4">
            <div className="h-16 w-3/4 bg-[#eee] rounded"></div>
            <div className="h-16 w-1/2 bg-[#eee] rounded ml-auto"></div>
            <div className="h-20 w-2/3 bg-[#eee] rounded"></div>
          </div>
          <div className="px-6 py-4 border-t border-[#eee]">
            <div className="h-10 w-full bg-[#eee] rounded"></div>
          </div>
        </section>

        {/* SECTION C: Stats Skeleton */}
        <section className="col-span-3 p-6">
          <div className="space-y-8 animate-pulse">
            <div>
              <div className="h-3 w-12 bg-[#eee] rounded mb-4"></div>
              <div className="space-y-3">
                <div className="h-20 bg-[#eee] rounded"></div>
                <div className="h-20 bg-[#eee] rounded"></div>
              </div>
            </div>
          </div>
        </section>
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
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const authCheckedRef = useRef(false);

  const handleLogout = async () => {
    await signOut();
    router.push("/equi/login");
  };

  // ============================================================================
  // PARALLEL AUTH + PROFILE FETCH
  // Uses Promise.all for parallel requests, Supabase is single source of truth
  // ============================================================================
  useEffect(() => {
    const checkAuth = async () => {
      if (authCheckedRef.current) return;
      authCheckedRef.current = true;

      console.log('[DEBUG] Dashboard: Starting parallel auth check');

      try {
        // PARALLEL REQUEST: Get user and profile simultaneously
        // This is the key optimization - no sequential waiting
        const [userResult, sessionResult] = await Promise.all([
          // Promise 1: getUser (validates with Supabase)
          getUser().catch(err => ({ user: null, error: err.message })),
          // Promise 2: getSession (local cache, faster but may be stale)
          supabase?.auth.getSession().catch(err => ({ data: { session: null }, error: err.message })) || { data: { session: null }, error: 'supabase not initialized' }
        ]);

        console.log('[DEBUG] Dashboard: Parallel results:', {
          getUser: !!userResult.user,
          getSession: !!sessionResult.data?.session
        });

        // Use getUser result as authoritative (validated with Supabase)
        const user = userResult.user || sessionResult.data?.session?.user;

        if (!user) {
          console.log('[DEBUG] Dashboard: No user found, redirecting to login');
          setAuthStatus("unauthenticated");
          router.push("/equi/login");
          return;
        }

        console.log('[DEBUG] Dashboard: User authenticated:', user.id);

        // Get profile from Supabase (single source of truth)
        const { profile, error: profileError } = await getProfile(user.id);

        if (profileError) {
          console.error('[DEBUG] Dashboard: Profile error:', profileError);
        }

        // Check onboarding status
        if (profile?.onboarding_completed !== true) {
          console.log('[DEBUG] Dashboard: Onboarding not completed, redirecting');
          router.push("/equi/onboarding");
          return;
        }

        // Set user data from Supabase profile
        if (profile?.user_data) {
          setUserData(profile.user_data);
        }

        setAuthStatus("authenticated");
        console.log('[DEBUG] Dashboard: Auth check passed');

      } catch (err: any) {
        console.error('[DEBUG] Dashboard: Auth check failed:', err?.message);
        setAuthStatus("unauthenticated");
        router.push("/equi/login");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // ============================================================================
  // REAL-TIME AUTH STATE LISTENER
  // Uses onAuthStateChange for instant login detection
  // ============================================================================
  useEffect(() => {
    if (!supabase) return;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[DEBUG] Dashboard: Auth state changed:', event);

      if (event === "SIGNED_IN" && session) {
        console.log('[DEBUG] Dashboard: User signed in, loading profile...');
        
        // Immediately fetch profile on sign in
        const { profile } = await getProfile(session.user.id);
        if (profile?.user_data) {
          setUserData(profile.user_data);
          setAuthStatus("authenticated");
        }
      } else if (event === "SIGNED_OUT") {
        console.log('[DEBUG] Dashboard: User signed out');
        setAuthStatus("unauthenticated");
        router.push("/equi/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-trigger opening message when user data loads
  useEffect(() => {
    if (userData && messages.length === 0 && authStatus === "authenticated") {
      generateOpeningMessage();
    }
  }, [userData, authStatus]);

  // Generate opening message
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
        content: data.openingMessage || "让我帮你优化今天的时间安排。",
        timestamp: new Date(),
      };
      
      setMessages([openingMessage]);
    } catch (error) {
      console.error("Failed to generate opening message:", error);
      const fallbackMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "你好，我是 Equi。今天有什么我可以帮你的？",
        timestamp: new Date(),
      };
      setMessages([fallbackMessage]);
    }
  };

  // Handle message submission
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

    // Prepare conversation history
    const conversationHistory = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: m.content,
    }));

    // Prepare user data for context
    const userContext = {
      mbti: userData?.understanding?.mbti,
      focusPeaks: userData?.understanding?.biologicalClock?.focusPeaks,
      energyDips: userData?.understanding?.biologicalClock?.energyDips,
    };

    try {
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory,
          userData: userContext,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      // Handle streaming response
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
        
        // Update the last message
        setMessages((prev) => 
          prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantMessage.content } : m)
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "抱歉，我遇到了一些问题。请稍后再试。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
    }
  };

  // ============================================================================
  // RENDER: Show skeleton while loading, then actual content
  // ============================================================================
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (authStatus === "unauthenticated" || !userData) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg">Redirecting...</div>
        </div>
      </div>
    );
  }

  const { name, occupation, mbti, preferredAgentPersona } = userData.understanding || {};
  const personaLabel = preferredAgentPersona === "HardSupervisor" ? "Hard Supervisor" : "Devoted Secretary";

  return (
    <div className="min-h-screen bg-[#fff] text-[#111] font-sans">
      {/* Header */}
      <header className="border-b border-[#eee] px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-light tracking-tight">EQUI</h1>
            <p className="text-xs text-[#666] uppercase tracking-widest">Personal AI Lifestyle Architect</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{name}</div>
              <div className="text-xs text-[#666]">{occupation}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-[#999] hover:text-[#111] transition-colors underline"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid: Section A | Section B | Section C */}
      <div className="max-w-7xl mx-auto grid grid-cols-12 min-h-[calc(100vh-80px)]">
        
        {/* SECTION A: User Profile Card */}
        <section className="col-span-3 border-r border-[#eee] p-6">
          <div className="space-y-8">
            <div>
              <h2 className="text-xs uppercase tracking-widest text-[#666] mb-4">Profile</h2>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">MBTI</span>
                  <span className="font-mono">{mbti || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">Persona</span>
                  <span>{personaLabel}</span>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-widest text-[#666] mb-4">Biological Clock</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-[#666] mb-2">Focus Peaks</div>
                  <div className="space-y-1">
                    {(userData.understanding?.biologicalClock?.focusPeaks || []).slice(0, 3).map((peak, i) => (
                      <div key={i} className="text-xs">
                        {peak.weekday} {peak.start.hour}:00-{peak.end.hour}:00
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#666] mb-2">Energy Dips</div>
                  <div className="space-y-1">
                    {(userData.understanding?.biologicalClock?.energyDips || []).slice(0, 3).map((dip, i) => (
                      <div key={i} className="text-xs">
                        {dip.weekday} {dip.start.hour}:00-{dip.end.hour}:00
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-widest text-[#666] mb-4">Fixed Activities</h2>
              <div className="space-y-2">
                {(userData.lifeStructure?.fixedActivities || []).length === 0 ? (
                  <div className="text-xs text-[#999]">No fixed activities</div>
                ) : (
                  (userData.lifeStructure?.fixedActivities || []).slice(0, 5).map((activity, i) => (
                    <div key={i} className="text-xs flex justify-between">
                      <span className="truncate">{activity.label}</span>
                      <span className="text-[#666]">{activity.slots?.length || 0} slots</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B: AI Chat Interface */}
        <section className="col-span-6 flex flex-col border-r border-[#eee]">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-[#eee]">
            <h2 className="text-xs uppercase tracking-widest text-[#666]">Equi Assistant</h2>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${
                  message.role === "user" ? "ml-12" : "mr-12"
                }`}
              >
                {message.role === "user" ? (
                  <div className="text-sm">{message.content}</div>
                ) : (
                  <div className="text-sm font-serif italic text-[#444] leading-relaxed">
                    {message.content}
                    {isStreaming && message.id === messages[messages.length - 1]?.id && (
                      <span className="animate-pulse">|</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="px-6 py-4 border-t border-[#eee]">
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask Equi..."
                disabled={isStreaming}
                className="w-full py-3 pr-4 text-sm bg-transparent outline-none border-b border-[#ddd] focus:border-[#111] transition-colors placeholder:text-[#ccc]"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isStreaming}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest text-[#666] hover:text-[#111] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          </div>
        </section>

        {/* SECTION C: Quick Stats / Actions */}
        <section className="col-span-3 p-6">
          <div className="space-y-8">
            <div>
              <h2 className="text-xs uppercase tracking-widest text-[#666] mb-4">Today</h2>
              <div className="space-y-4">
                <div className="p-4 border border-[#eee]">
                  <div className="text-xs text-[#666] mb-1">Fixed Slots</div>
                  <div className="text-2xl font-light">
                    {(userData.lifeStructure?.fixedActivities || []).reduce(
                      (count, activity) => count + (activity.slots?.length || 0),
                      0
                    )}
                  </div>
                </div>
                <div className="p-4 border border-[#eee]">
                  <div className="text-xs text-[#666] mb-1">Focus Periods</div>
                  <div className="text-2xl font-light">
                    {userData.understanding?.biologicalClock?.focusPeaks?.length || 0}
                  </div>
                </div>
                <div className="p-4 border border-[#eee]">
                  <div className="text-xs text-[#666] mb-1">Life Mode</div>
                  <div className="text-lg font-light">
                    {userData.understanding?.lifeState?.mode || "Normal"}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xs uppercase tracking-widest text-[#666] mb-4">Actions</h2>
              <div className="space-y-2">
                <button className="w-full text-left px-4 py-3 text-sm border border-[#eee] hover:border-[#111] transition-colors">
                  Export Schedule
                </button>
                <button className="w-full text-left px-4 py-3 text-sm border border-[#eee] hover:border-[#111] transition-colors">
                  Edit Profile
                </button>
                <button 
                  onClick={() => {
                    localStorage.removeItem("EQUI_USER_DATA");
                    localStorage.removeItem("EQUI_FORM_DATA");
                    window.location.href = "/equi/onboarding";
                  }}
                  className="w-full text-left px-4 py-3 text-sm border border-[#eee] hover:border-[#111] transition-colors text-[#666]"
                >
                  Reset Data
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
