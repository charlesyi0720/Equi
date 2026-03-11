"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { supabase } from "../lib/supabase";
import { getUser, updateProfile } from "../lib/auth";

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

export default function EquiOnboarding() {
  // Global error handler for debugging
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('[DEBUG] Uncaught error:', event.message, 'at', event.filename, 'line', event.lineno);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedUser, setSubmittedUser] = useState<EquiUser | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    occupation: "",
    preferredTitle: "",
    // Step 2: Behavioral Habits
    focusLevel: "",
    planningStyleAnswer: "",
    procrastinationAnswer: "",
    pressureAnswer: "",
    // Step 4: MBTI Calibration
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

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 7));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  // Scroll to top on step transition
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // Hydration: Load data from Supabase on mount
  useEffect(() => {
    const loadUserData = async () => {
      // First try to get email from localStorage
      const savedFormData = localStorage.getItem("EQUI_FORM_DATA");
      let email = "";
      
      if (savedFormData) {
        try {
          const parsed = JSON.parse(savedFormData);
          email = parsed?.email || "";
        } catch (e) {
          console.error("Error parsing saved form data:", e);
        }
      }
      
      // If we have an email, try to load from Supabase
      if (email && supabase) {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_data")
          .eq("email", email)
          .single();
        
        if (error) {
          console.log("No existing profile in Supabase or error:", error.message);
        } else if (data?.user_data) {
          console.log("Loaded user data from Supabase:", data.user_data);
          
          // Restore formData from user_data
          const userData = data.user_data;
          const restoredFormData = {
            email,
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
          
          // Also restore the full user data
          if (userData) {
            setSubmittedUser(userData);
            setIsSubmitted(true);
          }
          
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
    
    // #region agent log
    const fixedActivitiesDebug = formData.fixedActivities.map(fa => ({
      label: fa.label,
      slots: fa.slots?.map(s => ({ day: s?.day, startHour: s?.startHour, endHour: s?.endHour }))
    }));
    console.log('[DEBUG] buildEquiUser - formData state at submit:', {
      focusPeaks: formData.focusPeaks,
      energyDips: formData.energyDips,
      fixedActivities: fixedActivitiesDebug
    });
    // #endregion

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
      const email = formData.email || "anonymous@equi.app";
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
        // Get current auth user
        const { user } = await getUser();
        
        // Prepare profile data
        const profileUpdate: any = {
          email,
          user_data: finalData,
          updated_at: new Date().toISOString(),
          onboarding_completed: true,
        };
        
        // If user is logged in, use their ID
        if (user) {
          profileUpdate.id = user.id;
          
          // Update profile using auth ID
          const { error: updateError } = await supabase
            .from("profiles")
            .update(profileUpdate)
            .eq("id", user.id);
          
          if (updateError) {
            console.error("Failed to update profile:", updateError);
          } else {
            console.log("Profile updated with onboarding_completed=true");
          }
        } else {
          // Fallback: upsert by email (for non-auth users)
          const { data, error: supabaseError } = await supabase
            .from("profiles")
            .upsert(
              profileUpdate,
              { onConflict: "email" }
            );
          
          console.log("Supabase response - data:", data);
          if (supabaseError) {
            console.error("Supabase Sync Error:", supabaseError.message, supabaseError.details, supabaseError);
          } else {
            console.log("Supabase Sync Success! Data:", data);
          }
        }
      }
      
      // Set submitted state to show summary view
      setSubmittedUser(finalData);
      setIsSubmitted(true);
      
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

  return (
    <div className="min-h-screen bg-[#fff] text-[#111] font-sans">
      {/* Landing Section (Step 0) */}
      {currentStep === 0 ? (
        <LandingSection onStart={() => {
          const landingSection = document.getElementById('landing-section');
          if (landingSection) {
            landingSection.style.opacity = '0';
            landingSection.style.transition = 'opacity 300ms ease-out';
          }
          setTimeout(() => setCurrentStep(1), 300);
        }} />
      ) : (
        <>
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
          {isSubmitted && submittedUser ? (
            <SummaryView user={submittedUser} />
          ) : (
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
          )}
        </AnimatePresence>
        </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// STEP 1: IDENTITY
// ============================================================================

interface Step1IdentityProps {
  formData: { email: string; name: string; occupation: string; preferredTitle: string };
  updateFormData: (data: Partial<{ email: string; name: string; occupation: string; preferredTitle: string }>) => void;
  onNext: () => void;
}

function Step1Identity({ formData, updateFormData, onNext }: Step1IdentityProps) {
  const isValid = formData.email.trim() && formData.name.trim() && formData.occupation.trim() && formData.preferredTitle.trim();

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
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => updateFormData({ email: e.target.value })}
            placeholder="your@email.com"
            className="w-full border-b border-[#ddd] py-3 text-lg bg-transparent outline-none focus:border-[#111] transition-colors placeholder:text-[#ccc]"
          />
        </div>

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
}

function SummaryView({ user }: SummaryViewProps) {
  const name = user?.understanding?.name || "User";
  const occupation = user?.understanding?.occupation || "Professional";
  const persona = user?.understanding?.preferredAgentPersona || AgentPersona.DevotedSecretary;
  
  // Safely calculate fixed slots count
  const fixedSlotsCount = (user?.lifeStructure?.fixedActivities || []).reduce((count, activity) => {
    if (activity?.activityType === "strictlyFixed" && activity?.slots && Array.isArray(activity.slots)) {
      return count + activity.slots.length;
    }
    return count;
  }, 0);
  
  // Find flexible activities
  const flexibleActivities = (user?.lifeStructure?.fixedActivities || []).filter(
    activity => activity?.activityType === "flexibleFloating"
  );
  
  const personaInfo = {
    [AgentPersona.DevotedSecretary]: {
      icon: "✦",
      greeting: "Hello! I'm here to support you every step of the way.",
    },
    [AgentPersona.HardSupervisor]: {
      icon: "⚡",
      greeting: "Let's get to work. No excuses, no delays.",
    },
  };
  
  const currentPersona = personaInfo[persona];
  
  // Determine pressure sensitivity label
  const pressureSensitivity = user?.understanding?.pressureSensitivity ?? 5;
  const pressureLabel = pressureSensitivity <= 3 ? "High" : pressureSensitivity <= 6 ? "Medium" : "Low";
  
  // Determine planning style
  const planningStyle = user?.understanding?.planningStyle || "Structured";
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-12"
    >
      {/* Header */}
      <div className="space-y-4">
        <h2 className="text-4xl font-light text-[#111] tracking-tight">
          {name}, your Digital Twin is initialized.
        </h2>
        <p className="text-[#666] text-sm">
          {occupation} • Your personal AI lifestyle architect is ready to help you optimize your time.
        </p>
      </div>
      
      {/* Core Data Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Personality Card */}
        <div className="p-6 border border-[#111] space-y-4">
          <div className="text-xs uppercase tracking-widest text-[#666]">Personality Profile</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-[#666]">MBTI</span>
              <span className="text-sm font-mono">{user?.understanding?.mbti || "Unknown"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#666]">Pressure Sensitivity</span>
              <span className="text-sm font-mono">{pressureLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#666]">Planning Style</span>
              <span className="text-sm font-mono">{planningStyle}</span>
            </div>
          </div>
        </div>
        
        {/* Time Assets Card */}
        <div className="p-6 border border-[#111] space-y-4">
          <div className="text-xs uppercase tracking-widest text-[#666]">Time Assets</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-[#666]">Fixed Slots</span>
              <span className="text-sm font-mono">{fixedSlotsCount} Detected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#666]">Focus Peaks</span>
              <span className="text-sm font-mono">
                {(user?.understanding?.biologicalClock?.focusPeaks || []).length} periods
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#666]">Life Mode</span>
              <span className="text-sm font-mono">{user?.understanding?.lifeState?.mode || "Normal"}</span>
            </div>
          </div>
        </div>
        
        {/* Flexible Tasks Card */}
        <div className="p-6 border border-[#111] space-y-4">
          <div className="text-xs uppercase tracking-widest text-[#666]">Flexible Tasks</div>
          <div className="space-y-2">
            {flexibleActivities.length > 0 ? (
              flexibleActivities.map((activity, index) => {
                const hours = activity?.flexibleQuota?.dailyMinutes 
                  ? (activity.flexibleQuota.dailyMinutes / 60).toFixed(1) 
                  : "0";
                return (
                  <div key={index} className="flex justify-between">
                    <span className="text-sm text-[#666] truncate mr-2">{activity.label || "Activity"}</span>
                    <span className="text-sm font-mono whitespace-nowrap">{hours}h</span>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-[#666]">No flexible quotas set</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Agent Persona Section */}
      <div className="p-6 border border-[#111] space-y-4">
        <div className="text-xs uppercase tracking-widest text-[#666]">Your Agent</div>
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[#111] text-[#fff] flex items-center justify-center text-3xl">
            {currentPersona.icon}
          </div>
          <div className="flex-1">
            <div className="text-lg font-medium mb-1">
              {persona === AgentPersona.DevotedSecretary ? "Devoted Secretary" : "Hard Supervisor"}
            </div>
            <div className="text-sm text-[#666]">{currentPersona.greeting}</div>
          </div>
        </div>
      </div>
      
      {/* Action Button */}
      <div className="pt-6 border-t border-[#eee]">
        <a
          href="/equi/dashboard"
          className="block w-full px-8 py-4 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-colors text-center"
        >
          Go to Dashboard
        </a>
        <p className="text-xs text-[#666] text-center mt-4">
          Your data has been saved. Start using Equi now.
        </p>
      </div>
    </motion.div>
  );
}
