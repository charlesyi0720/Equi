"use client";

import React, { useState, useEffect, useRef } from "react";
import { EquiUser } from "../types";
import { supabase } from "../lib/supabase";
import { getUser, onAuthStateChange, signOut, getProfile, getSession } from "../lib/auth";
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
// DASHBOARD COMPONENT
// ============================================================================

export default function EquiDashboard() {
  const [userData, setUserData] = useState<EquiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push("/equi/login");
  };

  // Security check + load user data: combined into one effect
  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      console.log('[DEBUG] Dashboard: Starting auth check + data load');
      
      // Step 1: Try to get session from localStorage first (instant)
      let sessionUser = null;
      const savedUserData = localStorage.getItem("EQUI_USER_DATA");
      
      if (savedUserData) {
        try {
          const parsed = JSON.parse(savedUserData);
          setUserData(parsed);
          console.log('[DEBUG] Dashboard: Loaded user data from localStorage');
        } catch (e) {
          console.error("Error parsing saved user data:", e);
        }
      }
      
      // Step 2: Try to get session (fast path with short timeout)
      console.log('[DEBUG] Dashboard: Trying getSession (5s timeout)...');
      try {
        const sessionPromise = getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 5000)
        );
        
        const { session, error } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        console.log('[DEBUG] Dashboard: getSession result:', { hasSession: !!session, error });
        
        if (session?.user) {
          sessionUser = session.user;
        }
      } catch (e: any) {
        console.log('[DEBUG] Dashboard: getSession failed:', e?.message);
        
        // If we have localStorage data, use it - user is likely logged in
        if (savedUserData) {
          console.log('[DEBUG] Dashboard: Using localStorage data, assuming logged in');
          setIsLoading(false);
          return;
        }
      }
      
      // If no session and no localStorage, redirect to login
      if (!sessionUser && !savedUserData) {
        console.log('[DEBUG] Dashboard: No session, redirecting to login');
        router.push("/equi/login");
        return;
      }
      
      // Step 3: If we have session user, check profile
      if (sessionUser) {
        console.log('[DEBUG] Dashboard: Have session user, checking profile:', sessionUser.id);
        
        // Try to get profile with timeout
        try {
          const profilePromise = getProfile(sessionUser.id);
          const profileTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile timeout')), 10000)
          );
          
          const { profile, error } = await Promise.race([profilePromise, profileTimeout]) as any;
          console.log('[DEBUG] Dashboard: getProfile result:', { hasProfile: !!profile, error });
          
          if (profile?.onboarding_completed !== true) {
            console.log('[DEBUG] Dashboard: Onboarding not completed, redirecting');
            router.push("/equi/onboarding");
            return;
          }
        } catch (profileErr: any) {
          console.log('[DEBUG] Dashboard: Profile check failed:', profileErr?.message);
          // If we have localStorage and session, assume profile is OK
        }
      }
      
      console.log('[DEBUG] Dashboard: Auth check passed, showing content');
      setIsLoading(false);
    };
    
    checkAuthAndLoadData();
  }, [router]);

  // Listen for auth changes
    const subscription = onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Reload user data when signed in
        if (!supabase) return;
        const { data } = await supabase.from("profiles").select("user_data").eq("id", session.user.id).single();
        if (data?.user_data) {
          setUserData(data.user_data);
          localStorage.setItem("EQUI_USER_DATA", JSON.stringify(data.user_data));
        }
      }
    });

    return () => {
      if (subscription && 'unsubscribe' in subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Auto-trigger opening message when user data loads
  useEffect(() => {
    if (userData && messages.length === 0) {
      generateOpeningMessage();
    }
  }, [userData]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-[#666]">Loading...</div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg">No user data found</div>
          <a href="/equi/onboarding" className="text-xs underline text-[#666]">
            Go to Onboarding
          </a>
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
