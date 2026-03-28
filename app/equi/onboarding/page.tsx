"use client";

import React, { useState, useEffect, Component } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { generateUserContextChunks } from "../lib/semanticParser";
import { embedUser } from "../lib/embedUser";

// Error Boundary for catching React errors
class ErrorBoundary extends Component<
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
    console.error("[ONBOARDING ERROR BOUNDARY] Caught error:", error, errorInfo);
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
import {
  AgentPersona,
  LifeMode,
  UpdateFrequency,
  Weekday,
  CognitiveCategory,
  WeekdayPattern,
  EquiUser,
  PlanningStyle,
} from "../types";
import { Step4Structures } from "./Step4";
import { StepCalibration } from "./StepCalibration";
import { LandingSection } from "./LandingSection";
import { supabase, supabaseAdmin } from "../lib/supabase";
import { getUser, updateProfile, hasCompletedOnboarding, getProfile, getSession } from "../lib/auth";
import { useRouter } from "next/navigation";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const WEEKDAYS: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mapProcrastinationToIndex(answer: string): number {
  const mapping: Record<string, number> = {
    "immediately": 1,
    "same-day": 3,
    "within-days": 5,
    "night-before": 8,
    "last-minute": 10,
  };
  return mapping[answer] || 5;
}

function mapPressureToIndex(answer: string): number {
  const mapping: Record<string, number> = {
    "paralyzed": 2,
    "uncomfortable": 4,
    "neutral": 5,
    "motivated": 7,
    "thrive": 9,
  };
  return mapping[answer] || 5;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function OnboardingContent() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedUser, setSubmittedUser] = useState<EquiUser | null>(null);
  const [embedStatus, setEmbedStatus] = useState<"idle" | "embedding" | "done" | "error">("idle");
  const [embedError, setEmbedError] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    occupation: "",
    preferredTitle: "",
    focusLevel: "",
    planningStyleAnswer: "",
    procrastinationAnswer: "",
    pressureAnswer: "",
    understanding: {
      mbti: "INTJ",
    },
    focusPeaks: [] as { startHour: number; endHour: number; days: Weekday[] }[],
    energyDips: [] as { startHour: number; endHour: number; days: Weekday[] }[],
    fixedActivities: [] as {
      id?: string;
      label: string;
      category: CognitiveCategory;
      activityType: "strictlyFixed" | "flexibleFloating";
      weekdayPattern: Weekday[];
      slots: { day: Weekday; startHour: number; endHour: number; startMinute?: number; endMinute?: number }[];
      flexibleQuota?: { dailyMinutes: number; preferredSlot: "focusPeaks" | "anytime" };
      isHardConstraint: boolean;
    }[],
    lifeMode: LifeMode.Normal,
    lifeModeEndDate: "",
    updateFrequency: UpdateFrequency.Weekly,
    agentPersona: AgentPersona.DevotedSecretary,
  });

  // Auth check: redirect to dashboard if onboarding is already completed
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      console.log('[ONBOARDING] checkOnboardingStatus started');
      
      // Step 1: Get user
      console.log('[ONBOARDING] Calling getUser...');
      const { user, error: userError } = await getUser();
      console.log('[ONBOARDING] getUser result:', { hasUser: !!user, error: userError });

      if (userError) {
        console.error("[ONBOARDING] User error:", userError);
        // If it's a timeout error, still try to proceed - user might be logged in
        if (userError.includes('Timeout')) {
          console.log("[ONBOARDING] Timeout fetching user, checking localStorage for session...");
          // Try to get session directly
          const { session } = await getSession();
          console.log('[ONBOARDING] getSession result:', { hasSession: !!session });
          if (session?.user) {
            console.log("[ONBOARDING] Found user from session:", session.user);
            // Continue with session user
            const { profile, error: profileError } = await getProfile(session.user.id);
            if (profileError) {
              console.error("[ONBOARDING] Profile error:", profileError);
            }
            const completed = profile?.onboarding_completed === true;
            console.log('[ONBOARDING] Profile check:', { completed, profile });
            if (completed) {
              console.log('[ONBOARDING] Redirecting to dashboard (session path)');
              window.location.href = "/equi/dashboard";
              return;
            }
            setIsLoading(false);
            return;
          }
        }
      }

      if (!user) {
        console.log('[ONBOARDING] No user found, showing landing section');
        setIsLoading(false);
        return;
      }

      // Step 2: Get profile directly from DB (authoritative source)
      console.log('[ONBOARDING] Getting profile for user:', user.id);
      const { profile, error: profileError } = await getProfile(user.id);
      console.log('[ONBOARDING] Profile result:', { profile, error: profileError });

      if (profileError) {
        console.error("[ONBOARDING] Profile error:", profileError);
      }

      // Step 3: Check completion status
      const completed = profile?.onboarding_completed === true;

      if (completed) {
        window.location.href = "/equi/dashboard";
        return;
      }

      setIsLoading(false);
      console.log('[ONBOARDING] Onboarding not completed, showing form');
    };

    checkOnboardingStatus();
  }, [router]);

  // Global error handler
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught error:', event.message, 'at', event.filename, 'line', event.lineno);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Scroll to top on step transition
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // Form update helper
  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 7));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  // Hydration: Load data from Supabase on mount
  useEffect(() => {
    const loadUserData = async () => {
      // Get user from Supabase auth
      const { user } = await getUser();
      const email = user?.email || "";
      
      // If we have an email, try to load from Supabase
      if (email && supabase) {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_data, onboarding_completed")
          .eq("email", email)
          .single();
        
        if (error) {
          console.log("No existing profile in Supabase or error:", error.message);
        } else if (data?.onboarding_completed === true && data?.user_data && Object.keys(data.user_data).length > 0) {
          // Only restore and show Summary when user has actually completed onboarding
          console.log("Loaded user data from Supabase:", data.user_data);
          
          const userData = data.user_data;
          
          const restoredFormData = {
            name: userData?.understanding?.name || "",
            occupation: userData?.understanding?.occupation || "",
            preferredTitle: userData?.understanding?.preferredTitle || "",
            focusLevel: "",
            planningStyleAnswer: "",
            procrastinationAnswer: "",
            pressureAnswer: "",
            understanding: {
              mbti: userData?.understanding?.mbti || "INTJ",
            },
            focusPeaks: (userData?.understanding?.biologicalClock?.focusPeaks || []).map((peak: any) => ({
              startHour: peak?.start?.hour ?? 9,
              endHour: peak?.end?.hour ?? 12,
              days: peak?.weekday ? [peak.weekday] : [],
            })),
            energyDips: (userData?.understanding?.biologicalClock?.energyDips || []).map((dip: any) => ({
              startHour: dip?.start?.hour ?? 14,
              endHour: dip?.end?.hour ?? 15,
              days: dip?.weekday ? [dip.weekday] : [],
            })),
            fixedActivities: (userData?.lifeStructure?.fixedActivities || []).map((activity: any) => ({
              id: activity.id,
              label: activity.label,
              category: activity.category,
              activityType: activity.activityType,
              weekdayPattern: Array.isArray(activity.weekdayPattern) 
                ? activity.weekdayPattern 
                : activity.weekdayPattern === "Everyday" 
                  ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                  : [],
              slots: activity.slots || [],
              flexibleQuota: activity.flexibleQuota,
              isHardConstraint: activity.isHardConstraint,
            })),
            lifeMode: userData?.understanding?.lifeState?.mode || "Normal",
            lifeModeEndDate: "",
            updateFrequency: userData?.understanding?.updatePreferences?.frequency || "Weekly",
            agentPersona: userData?.understanding?.preferredAgentPersona || "DevotedSecretary",
          };
          
          setFormData(restoredFormData);
          setSubmittedUser(userData);
          setIsSubmitted(true);
          console.log("Form data restored from Supabase");
        }
      }
    };
    
    loadUserData();
  }, []);

  const buildEquiUser = (): EquiUser => {
    const now = new Date().toISOString();
    const procrastinationIndex = mapProcrastinationToIndex(formData.procrastinationAnswer);
    const pressureSensitivity = mapPressureToIndex(formData.pressureAnswer);
    
    const focusPeaksFormatted = formData.focusPeaks.flatMap((peak) =>
      (peak?.days || []).map((day) => ({
        weekday: day,
        start: { hour: peak?.startHour ?? 9, minute: 0 },
        end: { hour: peak?.endHour ?? 12, minute: 0 },
      }))
    );

    const energyDipsFormatted = formData.energyDips.flatMap((dip) =>
      (dip?.days || []).map((day) => ({
        weekday: day,
        start: { hour: dip?.startHour ?? 14, minute: 0 },
        end: { hour: dip?.endHour ?? 15, minute: 0 },
      }))
    );

    return {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      understanding: {
        name: formData.name,
        occupation: formData.occupation,
        preferredTitle: formData.preferredTitle,
        mbti: formData.understanding?.mbti || "INTJ",
        planningStyle: procrastinationIndex <= 5 ? PlanningStyle.Structured : PlanningStyle.Flexible,
        procrastinationIndex,
        pressureSensitivity,
        preferredAgentPersona: formData.agentPersona,
        biologicalClock: {
          focusPeaks: focusPeaksFormatted,
          energyDips: energyDipsFormatted,
        },
        lifeState: {
          mode: formData.lifeMode,
          expectedEnd: formData.lifeModeEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        updatePreferences: {
          frequency: formData.updateFrequency,
        },
      },
      lifeStructure: {
        fixedActivities: formData.fixedActivities.map((activity) => {
          if (activity.activityType === "strictlyFixed") {
            return {
              id: generateId(),
              label: activity.label,
              category: activity.category,
              activityType: activity.activityType,
              weekdayPattern: activity.weekdayPattern.length > 0 ? activity.weekdayPattern : "Everyday",
              slots: activity.slots || [],
              isHardConstraint: activity.isHardConstraint,
            };
          } else {
            return {
              id: generateId(),
              label: activity.label,
              category: activity.category,
              activityType: activity.activityType,
              weekdayPattern: activity.weekdayPattern.length > 0 ? activity.weekdayPattern : "Everyday",
              slots: [],
              flexibleQuota: activity.flexibleQuota,
              isHardConstraint: activity.isHardConstraint,
            };
          }
        }),
        cognitiveLoadModel: [
          { category: "DeepWork", weight: 9, description: "Most demanding" },
          { category: "Creative", weight: 7, description: "High cognitive demand" },
          { category: "ShallowWork", weight: 4, description: "Routine tasks" },
          { category: "Admin", weight: 3, description: "Low mental load" },
          { category: "Social", weight: 5, description: "Moderate load" },
          { category: "Recovery", weight: 1, description: "Restorative" },
        ],
      },
      agentBrain: {
        longTermMemory: {
          planningOutcomes: [],
          behaviorPatterns: [],
          conversationMessagesSinceLastExtract: 0,
        },
        sundaySync: {
          config: {
            enabled: true,
            defaultTime: { hour: 20, minute: 0 },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            horizonWeeks: 2,
          },
          state: {},
        },
      },
    };
  };

  const handleSubmit = async () => {
    try {
      const equiUser = buildEquiUser();
      
      // PATCH: Ensure biologicalClock has default values if missing
      const finalData = {
        ...equiUser,
        understanding: {
          ...equiUser.understanding,
          biologicalClock: {
            focusPeaks: equiUser.understanding?.biologicalClock?.focusPeaks ?? [],
            energyDips: equiUser.understanding?.biologicalClock?.energyDips ?? [],
          }
        }
      };
      
      console.log("FINAL DATA TO BE SAVED:", finalData);
      
      // Save EquiUser to localStorage
      localStorage.setItem("EQUI_USER_DATA", JSON.stringify(finalData));
      console.log("User data saved to localStorage");
      
      // Also save the raw formData for future edits
      localStorage.setItem("EQUI_FORM_DATA", JSON.stringify(formData));
      console.log("Form data saved to localStorage for edits");
      
// Sync to Supabase profiles table
      // Get current auth user
      const { user } = await getUser();
      const email = user?.email || "anonymous@equi.app";
      console.log("Attempting to sync data:", formData);
      console.log("Email being used:", email);

      // Add a small delay and more detailed logging
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const profileData = {
        email,
        user_data: finalData,
        updated_at: new Date().toISOString(),
      };
      console.log("Profile data to upsert:", JSON.stringify(profileData, null, 2));

      if (!supabase) {
        console.log("Supabase not configured, skipping sync to database");
      } else {
        // Prepare profile data
        const profileUpdate: any = {
          email,
          user_data: finalData,
          updated_at: new Date().toISOString(),
          onboarding_completed: true,
        };
        
        // If user is logged in, use upsert to ensure profile exists and is updated
        if (user) {
          profileUpdate.id = user.id;
          
          // Use upsert instead of update to handle both insert and update cases
          const { error: upsertError } = await (supabaseAdmin || supabase)
            .from("profiles")
            .upsert(profileUpdate, { onConflict: "id" });

          if (upsertError) {
            console.error("Failed to upsert profile:", upsertError);
          } else {
            console.log("Supabase Sync Success! Profile saved.");
          }
        }
      }

      // Trigger knowledge embedding (RAG vectorization) after profile is saved
      setEmbedStatus("embedding");
      try {
        console.log("Starting data embedding...");

        const userChunks = generateUserContextChunks(finalData as any);

        const embedRes = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            chunks: userChunks,
          }),
        });

        if (!embedRes.ok) {
          const errText = await embedRes.text();
          console.error("Embedding API failed:", embedRes.status, errText);
          setEmbedError(`${embedRes.status}: ${errText}`);
          setEmbedStatus("error");
          // Do NOT redirect on embed failure — stay so user can see the error banner
          return;
        } else {
          console.log("Embedding successful! Data written to Supabase pgvector.", await embedRes.json());
          setEmbedStatus("done");
          // Only navigate after confirmed success
          window.location.href = "/equi/dashboard";
        }
      } catch (embedErr) {
        console.error("Network error during embedding:", embedErr);
        setEmbedError(String(embedErr));
        setEmbedStatus("error");
        // Stay on page so user can retry
      }
      // alert("Onboarding complete! Check console for EquiUser object.");
    } catch (error) {
      console.error("Error during submission:", error);
      alert("Failed to complete onboarding. Check console for details.");
    }
  };

  const steps = [
    { number: 1, label: "Identity" },
    { number: 2, label: "Behavioral" },
    { number: 3, label: "Rhythms" },
    { number: 4, label: "Reveal" },
    { number: 5, label: "Structure" },
    { number: 6, label: "Life Mode" },
    { number: 7, label: "Persona" },
  ];

  const handleRetryEmbed = async () => {
    const stored = localStorage.getItem("EQUI_USER_DATA");
    if (!stored) {
      setEmbedError("No user data found in localStorage.");
      setEmbedStatus("error");
      return;
    }
    const { user } = await getUser();
    if (!user) {
      setEmbedError("Not authenticated. Please log in again.");
      setEmbedStatus("error");
      return;
    }
    setEmbedStatus("embedding");
    setEmbedError("");
    const result = await embedUser({ ...JSON.parse(stored), id: user.id } as any);
    if (result.ok) {
      setEmbedStatus("done");
      window.location.href = "/equi/dashboard";
    } else {
      setEmbedError(result.error ?? "Unknown error");
      setEmbedStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {isLoading ? (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-xs uppercase tracking-widest text-slate-500">Loading...</div>
        </div>
      ) : (
      <>
      {/* Landing Section (Step 0) */}
      {currentStep === 0 ? (
        <LandingSection onStart={async () => {
          // Check if user is authenticated
          const { user } = await getUser();
          
          if (!user) {
            // Not authenticated - redirect to signup
            window.location.href = "/equi/login?mode=signup";
            return;
          }
          
          // User is authenticated - proceed to onboarding
          const landingSection = document.getElementById('landing-section');
          if (landingSection) {
            landingSection.style.opacity = '0';
            landingSection.style.transition = 'opacity 300ms ease-out';
          }
          setTimeout(() => setCurrentStep(1), 300);
        }} />
      ) : (
        <>
        {isSubmitted && submittedUser ? (
          <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:py-8">
            <SummaryView user={submittedUser} embedStatus={embedStatus} embedError={embedError} onRetryEmbed={handleRetryEmbed} />
          </div>
        ) : (
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="mb-12">
            <h1 className="text-2xl font-light tracking-tight mb-2">EQUI</h1>
            <p className="text-xs text-[#666] uppercase tracking-widest">Personal AI Lifestyle Architect</p>
          </div>

          <div className="mb-12">
            <div className="flex items-center gap-2">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center">
                  <div
                    className={`w-8 h-8 flex items-center justify-center text-xs font-medium transition-all ${
                      currentStep > step.number
                        ? "bg-[#111] text-[#fff]"
                        : currentStep === step.number
                        ? "bg-[#111] text-[#fff]"
                        : "bg-[#eee] text-[#999]"
                    }`}
                  >
                    {step.number}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-12 h-px transition-all ${
                        currentStep > step.number ? "bg-[#111]" : "bg-[#eee]"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[#666] uppercase tracking-widest">
              Step {currentStep}: {steps[currentStep - 1].label}
            </p>
          </div>

        <AnimatePresence mode="wait">
          <>
          {currentStep === 1 && (
            <Step1Identity
              key="step1"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
            />
          )}
          {currentStep === 2 && (
            <Step2Behavioral
              key="step2"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 3 && (
            <Step3Rhythms
              key="step3"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 4 && (
            <StepCalibration
              key="step4"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 5 && (
            <Step4Structures
              key="step5"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 6 && (
            <Step5LifeMode
              key="step6"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 7 && (
            <Step6Persona
              key="step7"
              formData={formData}
              updateFormData={updateFormData}
              onBack={prevStep}
              onSubmit={handleSubmit}
            />
          )}
          </>
        </AnimatePresence>
        </div>
        )}
        </>
      )}
      </>
      )}
    </div>
  );
}

// ============================================================================
// STEP 1: IDENTITY
// ============================================================================

interface Step1IdentityProps {
  formData: { name: string; occupation: string; preferredTitle: string };
  updateFormData: (data: Partial<{ name: string; occupation: string; preferredTitle: string }>) => void;
  onNext: () => void;
}

function Step1Identity({ formData, updateFormData, onNext }: Step1IdentityProps) {
  const isValid = formData.name.trim() && formData.occupation.trim() && formData.preferredTitle.trim();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Let us begin with the basics.</h2>
        <p className="text-[#666] text-sm">Tell Equi who you are.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Your Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            placeholder="Enter your name"
            className="w-full border-b border-[#ddd] py-3 text-lg bg-transparent outline-none focus:border-[#111] transition-colors placeholder:text-[#ccc]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Occupation</label>
          <input
            type="text"
            value={formData.occupation}
            onChange={(e) => updateFormData({ occupation: e.target.value })}
            placeholder="e.g., AI Researcher, Product Designer"
            className="w-full border-b border-[#ddd] py-3 text-lg bg-transparent outline-none focus:border-[#111] transition-colors placeholder:text-[#ccc]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Preferred Title</label>
          <p className="text-xs text-[#666] mb-2">How should Equi address you?</p>
          <input
            type="text"
            value={formData.preferredTitle}
            onChange={(e) => updateFormData({ preferredTitle: e.target.value })}
            placeholder="e.g., Boss, Captain, Professor"
            className="w-full border-b border-[#ddd] py-3 text-lg bg-transparent outline-none focus:border-[#111] transition-colors placeholder:text-[#ccc]"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!isValid}
        className={`px-8 py-4 text-sm uppercase tracking-widest transition-all ${
          isValid 
            ? "bg-[#111] text-[#fff] hover:bg-[#333]" 
            : "bg-[#eee] text-[#999] cursor-not-allowed"
        }`}
      >
        Continue
      </button>
    </motion.div>
  );
}

// ============================================================================
// STEP 2: BEHAVIORAL HABITS (No MBTI terms)
// ============================================================================

interface Step2BehavioralProps {
  formData: {
    focusLevel: string;
    planningStyleAnswer: string;
    procrastinationAnswer: string;
    pressureAnswer: string;
  };
  updateFormData: (data: Partial<{
    focusLevel: string;
    planningStyleAnswer: string;
    procrastinationAnswer: string;
    pressureAnswer: string;
  }>) => void;
  onNext: () => void;
  onBack: () => void;
}

function Step2Behavioral({ formData, updateFormData, onNext, onBack }: Step2BehavioralProps) {
  const isValid = formData.procrastinationAnswer && formData.pressureAnswer && formData.focusLevel && formData.planningStyleAnswer;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Understand your work style.</h2>
        <p className="text-[#666] text-sm">These behavioral signals help Equi adapt to you.</p>
      </div>

      {/* Question 1: Focus Level */}
      <div className="space-y-4">
        <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
          When do you do your best thinking?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {[
            { value: "deep", label: "Deep in concentration", description: "Long uninterrupted blocks of focus" },
            { value: "flexible", label: "In bursts", description: "Short sprints with frequent breaks" },
            { value: "varied", label: "It varies", description: "Depends on the task and energy" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateFormData({ focusLevel: option.value })}
              className={`text-left p-4 border transition-all ${
                formData.focusLevel === option.value
                  ? "border-[#111] bg-[#111] text-[#fff]"
                  : "border-[#ddd] hover:border-[#111]"
              }`}
            >
              <div className="font-medium">{option.label}</div>
              <div className={`text-xs mt-1 ${
                formData.focusLevel === option.value ? "text-[#ccc]" : "text-[#666]"
              }`}>
                {option.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Question 2: Planning Style */}
      <div className="space-y-4">
        <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
          How do you prefer to plan your tasks?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {[
            { value: "structured", label: "Plan ahead", description: "Schedule everything in advance" },
            { value: "spontaneous", label: "Go with the flow", description: "Decide as I go" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateFormData({ planningStyleAnswer: option.value })}
              className={`text-left p-4 border transition-all ${
                formData.planningStyleAnswer === option.value
                  ? "border-[#111] bg-[#111] text-[#fff]"
                  : "border-[#ddd] hover:border-[#111]"
              }`}
            >
              <div className="font-medium">{option.label}</div>
              <div className={`text-xs mt-1 ${
                formData.planningStyleAnswer === option.value ? "text-[#ccc]" : "text-[#666]"
              }`}>
                {option.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Question 3: Procrastination */}
      <div className="space-y-4">
        <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
          When faced with a complex administrative task, what is your typical approach?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {[
            { value: "immediately", label: "Get it done immediately" },
            { value: "same-day", label: "Same day" },
            { value: "within-days", label: "Within a few days" },
            { value: "night-before", label: "Night before deadline" },
            { value: "last-minute", label: "Last possible moment" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateFormData({ procrastinationAnswer: option.value })}
              className={`text-left p-3 text-sm border transition-all ${
                formData.procrastinationAnswer === option.value
                  ? "border-[#111] bg-[#111] text-[#fff]"
                  : "border-[#ddd] hover:border-[#111]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Question 4: Pressure Response */}
      <div className="space-y-4">
        <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
          How does your productivity change as a deadline approaches?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {[
            { value: "paralyzed", label: "I freeze up", description: "Pressure makes it harder" },
            { value: "uncomfortable", label: "Uncomfortable", description: "Still functional but stressed" },
            { value: "neutral", label: "Neutral", description: "No significant change" },
            { value: "motivated", label: "Motivated", description: "Pressure helps me focus" },
            { value: "thrive", label: "I thrive", description: "Deadlines are my fuel" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateFormData({ pressureAnswer: option.value })}
              className={`text-left p-3 text-sm border transition-all ${
                formData.pressureAnswer === option.value
                  ? "border-[#111] bg-[#111] text-[#fff]"
                  : "border-[#ddd] hover:border-[#111]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`px-8 py-4 text-sm uppercase tracking-widest transition-all ${
            isValid 
              ? "bg-[#111] text-[#fff] hover:bg-[#333]" 
              : "bg-[#eee] text-[#999] cursor-not-allowed"
          }`}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// STEP 3: BIOLOGICAL RHYTHMS
// ============================================================================

interface TimeBlock {
  startHour: number;
  endHour: number;
  days: Weekday[];
}

interface Step3RhythmsProps {
  formData: {
    focusPeaks: TimeBlock[];
    energyDips: TimeBlock[];
  };
  updateFormData: (data: Partial<{
    focusPeaks: TimeBlock[];
    energyDips: TimeBlock[];
  }>) => void;
  onNext: () => void;
  onBack: () => void;
}

function TimeSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs uppercase tracking-widest">
        <span>{label}</span>
        <span className="font-mono">{value.toString().padStart(2, "0")}:00</span>
      </div>
      <input
        type="range"
        min="0"
        max="23"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-[#eee] appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${(value / 23) * 100}%, #eee ${(value / 23) * 100}%, #eee 100%)`,
        }}
      />
    </div>
  );
}

function DayToggle({
  day,
  selected,
  onToggle,
}: {
  day: Weekday;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-10 text-xs font-medium transition-all ${
        selected
          ? "bg-[#111] text-[#fff]"
          : "bg-[#fff] border border-[#ddd] text-[#666] hover:border-[#111]"
      }`}
    >
      {day.slice(0, 2)}
    </button>
  );
}

function Step3Rhythms({ formData, updateFormData, onNext, onBack }: Step3RhythmsProps) {
  const addFocusPeak = () => {
    updateFormData({
      focusPeaks: [...formData.focusPeaks, { startHour: 9, endHour: 12, days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] }],
    });
  };

  const addEnergyDip = () => {
    updateFormData({
      energyDips: [...formData.energyDips, { startHour: 14, endHour: 15, days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] }],
    });
  };

  const updateFocusPeak = (index: number, field: keyof TimeBlock, value: number | Weekday[]) => {
    const updated = [...formData.focusPeaks];
    updated[index] = { ...updated[index], [field]: value };
    updateFormData({ focusPeaks: updated });
  };

  const updateEnergyDip = (index: number, field: keyof TimeBlock, value: number | Weekday[]) => {
    const updated = [...formData.energyDips];
    updated[index] = { ...updated[index], [field]: value };
    updateFormData({ energyDips: updated });
  };

  const toggleDay = (blockIndex: number, type: "focusPeaks" | "energyDips", day: Weekday) => {
    const blocks = type === "focusPeaks" ? formData.focusPeaks : formData.energyDips;
    const block = blocks[blockIndex];
    const blockDays = block?.days || [];
    const newDays = blockDays.includes(day)
      ? blockDays.filter((d) => d !== day)
      : [...blockDays, day];
    
    if (type === "focusPeaks") {
      updateFocusPeak(blockIndex, "days", newDays);
    } else {
      updateEnergyDip(blockIndex, "days", newDays);
    }
  };

  const removeBlock = (type: "focusPeaks" | "energyDips", index: number) => {
    if (type === "focusPeaks") {
      updateFormData({ focusPeaks: formData.focusPeaks.filter((_, i) => i !== index) });
    } else {
      updateFormData({ energyDips: formData.energyDips.filter((_, i) => i !== index) });
    }
  };

  const isValid = formData.focusPeaks.length > 0 && formData.focusPeaks.every((p) => (p?.days || []).length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Map your energy.</h2>
        <p className="text-[#666] text-sm">When are you sharpest? When do you need rest?</p>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Focus Peaks</label>
            <button onClick={addFocusPeak} className="text-xs underline">+ Add Peak</button>
          </div>
          {formData.focusPeaks.length === 0 && (
            <p className="text-xs text-[#999] py-4">Click "+ Add Peak" to define your peak focus hours</p>
          )}
          {formData.focusPeaks.map((peak, index) => (
            <div key={index} className="p-4 border border-[#111] space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#666]">Peak {index + 1}</span>
                <button onClick={() => removeBlock("focusPeaks", index)} className="text-xs text-[#666] hover:text-[#111]">Remove</button>
              </div>
              <TimeSlider
                label="Start"
                value={peak?.startHour ?? 9}
                onChange={(v) => updateFocusPeak(index, "startHour", v)}
                color="#111"
              />
              <TimeSlider
                label="End"
                value={peak?.endHour ?? 12}
                onChange={(v) => updateFocusPeak(index, "endHour", v)}
                color="#111"
              />
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => (
                  <DayToggle
                    key={day}
                    day={day}
                    selected={(peak?.days || []).includes(day)}
                    onToggle={() => toggleDay(index, "focusPeaks", day)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Energy Dips</label>
            <button onClick={addEnergyDip} className="text-xs underline">+ Add Dip</button>
          </div>
          {formData.energyDips.length === 0 && (
            <p className="text-xs text-[#999] py-4">Click "+ Add Dip" to define your low energy periods</p>
          )}
          {formData.energyDips.map((dip, index) => (
            <div key={index} className="p-4 border border-[#ddd] space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#666]">Dip {index + 1}</span>
                <button onClick={() => removeBlock("energyDips", index)} className="text-xs text-[#666] hover:text-[#111]">Remove</button>
              </div>
              <TimeSlider
                label="Start"
                value={dip?.startHour ?? 14}
                onChange={(v) => updateEnergyDip(index, "startHour", v)}
                color="#999"
              />
              <TimeSlider
                label="End"
                value={dip?.endHour ?? 15}
                onChange={(v) => updateEnergyDip(index, "endHour", v)}
                color="#999"
              />
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => (
                  <DayToggle
                    key={day}
                    day={day}
                    selected={(dip?.days || []).includes(day)}
                    onToggle={() => toggleDay(index, "energyDips", day)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`px-8 py-4 text-sm uppercase tracking-widest transition-all ${
            isValid 
              ? "bg-[#111] text-[#fff] hover:bg-[#333]" 
              : "bg-[#eee] text-[#999] cursor-not-allowed"
          }`}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// STEP 5: LIFE MODE
// ============================================================================

interface Step5LifeModeProps {
  formData: {
    lifeMode: LifeMode;
    lifeModeEndDate: string;
    updateFrequency: UpdateFrequency;
  };
  updateFormData: (data: Partial<{
    lifeMode: LifeMode;
    lifeModeEndDate: string;
    updateFrequency: UpdateFrequency;
  }>) => void;
  onNext: () => void;
  onBack: () => void;
}

const LIFE_MODE_OPTIONS = [
  { value: LifeMode.Normal, label: "Normal", description: "Steady state, business as usual" },
  { value: LifeMode.FocusMode, label: "Focus Mode", description: "Deep work sprint, minimal distractions" },
  { value: LifeMode.Holiday, label: "Holiday", description: "Taking time off to recharge" },
  { value: LifeMode.Travel, label: "Travel", description: "On the road, irregular schedule" },
  { value: LifeMode.Crisis, label: "Crisis", description: "Emergency mode, handling urgent matters" },
  { value: LifeMode.Recovery, label: "Recovery", description: "Recovering from illness or burnout" },
];

const UPDATE_FREQUENCY_OPTIONS = [
  { value: UpdateFrequency.Weekly, label: "Weekly", description: "Check in every week" },
  { value: UpdateFrequency.Monthly, label: "Monthly", description: "Check in once a month" },
  { value: UpdateFrequency.Quarterly, label: "Quarterly", description: "Check in every 3 months" },
];

function Step5LifeMode({ formData, updateFormData, onNext, onBack }: Step5LifeModeProps) {
  const isValid = formData.lifeMode && formData.updateFrequency;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">What is your current mode?</h2>
        <p className="text-[#666] text-sm">Tell Equi: Is your life static or dynamic over the next few months?</p>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Current Life Mode</label>
          <div className="grid grid-cols-2 gap-3">
            {LIFE_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateFormData({ lifeMode: option.value })}
                className={`text-left p-4 border transition-all ${
                  formData.lifeMode === option.value
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] hover:border-[#111]"
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className={`text-xs mt-1 ${
                  formData.lifeMode === option.value ? "text-[#ccc]" : "text-[#666]"
                }`}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
            When does this mode end? (Optional)
          </label>
          <input
            type="date"
            value={formData.lifeModeEndDate}
            onChange={(e) => updateFormData({ lifeModeEndDate: e.target.value })}
            className="w-full border-b border-[#ddd] py-3 bg-transparent outline-none focus:border-[#111] transition-colors"
          />
          <p className="text-xs text-[#666]">Leave blank if indefinite</p>
        </div>

        <div className="space-y-4">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
            How often should Equi check in with you?
          </label>
          <div className="grid gap-3">
            {UPDATE_FREQUENCY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateFormData({ updateFrequency: option.value })}
                className={`text-left p-4 border transition-all ${
                  formData.updateFrequency === option.value
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] hover:border-[#111]"
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className={`text-xs mt-1 ${
                  formData.updateFrequency === option.value ? "text-[#ccc]" : "text-[#666]"
                }`}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`px-8 py-4 text-sm uppercase tracking-widest transition-all ${
            isValid 
              ? "bg-[#111] text-[#fff] hover:bg-[#333]" 
              : "bg-[#eee] text-[#999] cursor-not-allowed"
          }`}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// STEP 6: AGENT PERSONA (THE CONTRACT)
// ============================================================================

interface Step6PersonaProps {
  formData: { agentPersona: AgentPersona };
  updateFormData: (data: Partial<{ agentPersona: AgentPersona }>) => void;
  onBack: () => void;
  onSubmit: () => void;
}

function Step6Persona({ formData, updateFormData, onBack, onSubmit }: Step6PersonaProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Hire your digital twin.</h2>
        <p className="text-[#666] text-sm">This is the contract. Choose who will hold you accountable.</p>
      </div>

      <div className="space-y-6">
        <button
          onClick={() => updateFormData({ agentPersona: AgentPersona.DevotedSecretary })}
          className={`w-full text-left p-6 border transition-all ${
            formData.agentPersona === AgentPersona.DevotedSecretary
              ? "border-[#111] bg-[#111] text-[#fff]"
              : "border-[#ddd] hover:border-[#111]"
          }`}
        >
          <div className="flex items-center gap-4 mb-3">
            <div className={`w-12 h-12 flex items-center justify-center text-2xl ${
              formData.agentPersona === AgentPersona.DevotedSecretary ? "bg-[#fff] text-[#111]" : "bg-[#111] text-[#fff]"
            }`}>
              ✦
            </div>
            <div>
              <h3 className="font-medium text-lg">The Devoted Secretary</h3>
              <p className={`text-xs ${
                formData.agentPersona === AgentPersona.DevotedSecretary ? "text-[#ccc]" : "text-[#666]"
              }`}>Gentle, supportive, encouraging</p>
            </div>
          </div>
          <ul className={`text-sm space-y-1 ${
            formData.agentPersona === AgentPersona.DevotedSecretary ? "text-[#ccc]" : "text-[#666]"
          }`}>
            <li>• Reminds you gently when you drift off track</li>
            <li>• Celebrates small wins with enthusiasm</li>
            <li>• Adjusts plans gracefully when life happens</li>
            <li>• Uses positive reinforcement as primary tool</li>
          </ul>
        </button>

        <button
          onClick={() => updateFormData({ agentPersona: AgentPersona.HardSupervisor })}
          className={`w-full text-left p-6 border transition-all ${
            formData.agentPersona === AgentPersona.HardSupervisor
              ? "border-[#111] bg-[#111] text-[#fff]"
              : "border-[#ddd] hover:border-[#111]"
          }`}
        >
          <div className="flex items-center gap-4 mb-3">
            <div className={`w-12 h-12 flex items-center justify-center text-2xl ${
              formData.agentPersona === AgentPersona.HardSupervisor ? "bg-[#fff] text-[#111]" : "bg-[#111] text-[#fff]"
            }`}>
              ⚡
            </div>
            <div>
              <h3 className="font-medium text-lg">The Hard Supervisor</h3>
              <p className={`text-xs ${
                formData.agentPersona === AgentPersona.HardSupervisor ? "text-[#ccc]" : "text-[#666]"
              }`}>Strict, demanding, no excuses</p>
            </div>
          </div>
          <ul className={`text-sm space-y-1 ${
            formData.agentPersona === AgentPersona.HardSupervisor ? "text-[#ccc]" : "text-[#666]"
          }`}>
            <li>• Holds you to exacting standards</li>
            <li>• Calls out procrastination without sugarcoating</li>
            <li>• Insists on accountability before flexibility</li>
            <li>• Uses direct feedback as primary tool</li>
          </ul>
        </button>
      </div>

      <div className="pt-6 border-t border-[#eee]">
        <p className="text-xs text-[#666] text-center mb-6">
          You can change this later, but your first choice sets the tone.
        </p>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          className="flex-1 px-8 py-4 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-all"
        >
          Complete Setup
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// SUMMARY VIEW: DIGITAL TWIN INITIALIZED
// ============================================================================

interface SummaryViewProps {
  user: EquiUser;
  embedStatus: "idle" | "embedding" | "done" | "error";
  embedError: string;
  onRetryEmbed?: () => void;
}

function SummaryView({ user, embedStatus, embedError, onRetryEmbed }: SummaryViewProps) {
  const name = user?.understanding?.name || "User";

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  const startHour = 8;
  const endHour = 22;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const hourLabel = (h: number) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${hour12} ${ampm}`;
  };

  const gridColForDayIdx = (dayIdx: number) => dayIdx + 2; // col 1 is time labels
  const gridRowForHour = (h: number) => (h - startHour) + 2; // row 1 is header

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
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Top Bar: Executive Briefing */}
      <div className="w-full rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-slate-700" aria-hidden="true">✨</div>
          <div className="text-sm leading-relaxed text-slate-700">
            <span className="font-medium text-slate-900">Good morning, {name}.</span>{" "}
            Your focus peaks at 10 AM today. I&apos;ve optimized your deep-work blocks accordingly.
          </div>
        </div>
      </div>

      {/* Embed / Knowledge Vector Status Banner */}
      {embedStatus === "embedding" && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-700">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span>Building your knowledge graph — indexing your schedule &amp; preferences…</span>
        </div>
      )}
      {embedStatus === "done" && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span>Knowledge graph ready. Your copilot is fully initialized.</span>
        </div>
      )}
      {embedStatus === "error" && (
        <div className="flex flex-col gap-1 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          <div className="flex items-center gap-2 font-medium">
            <span>⚠</span>
            <span>Knowledge embedding failed. RAG features may be limited.</span>
          </div>
          <div className="text-xs text-rose-500 font-mono">{embedError}</div>
          <div className="mt-2 flex items-center gap-3">
            {onRetryEmbed && (
              <button
                onClick={onRetryEmbed}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                Retry Sync
              </button>
            )}
            <a
              href="/equi/dashboard"
              className="text-xs text-rose-400 hover:text-rose-600 underline transition-colors"
            >
              Go to Dashboard anyway
            </a>
          </div>
        </div>
      )}

      {/* Bottom: 30/70 split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_7fr]">
        {/* Left Panel: Copilot Chat */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-900">Executive Copilot</div>
              <div className="text-xs text-slate-500">Online</div>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="h-[420px] rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="space-y-3">
                <div className="max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2">
                  Good morning. Want me to shape today around your 10 AM–1 PM peak?
                </div>
                <div className="ml-auto max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
                  Yes—prioritize thesis work and keep meetings light.
                </div>
                <div className="max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2">
                  Done. I&apos;ve placed a deep-work block during your peak and kept the evening low-friction.
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                  ⚡ Optimize Today
                </button>
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                  🧘 I&apos;m exhausted
                </button>
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                  📅 Export
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Message your copilot…"
                />
                <button className="h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">
                  Send
                </button>
              </div>
              <div className="text-xs text-slate-500">
                Tip: try “Protect a 90-minute deep-work block.”
              </div>
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
                {/* Header corner */}
                <div className="border-b border-slate-200 bg-slate-50" />

                {/* Day headers */}
                {days.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-center border-b border-l border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
                  >
                    {d}
                  </div>
                ))}

                {/* Time labels + grid cells */}
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

                {/* Fixed event */}
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
                  <div className="mt-1 text-[11px] text-slate-600">{hourLabel(fixedEvent.start)}–{hourLabel(fixedEvent.end)}</div>
                </div>

                {/* AI suggested event */}
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
                  <div className="mt-1 text-[11px] text-slate-600">{hourLabel(aiEvent.start)}–{hourLabel(aiEvent.end)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Wrapper with Error Boundary
export default function EquiOnboarding() {
  return (
    <ErrorBoundary>
      <OnboardingContent />
    </ErrorBoundary>
  );
}
