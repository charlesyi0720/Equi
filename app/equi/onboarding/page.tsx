"use client";

import { useState } from "react";
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
  ActivityType,
  ActivitySlot,
  FlexibleQuota,
} from "../types";

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
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    occupation: "",
    preferredTitle: "",
    procrastinationAnswer: "",
    pressureAnswer: "",
    focusPeaks: [] as { startHour: number; endHour: number; days: Weekday[] }[],
    energyDips: [] as { startHour: number; endHour: number; days: Weekday[] }[],
    fixedActivities: [] as {
      label: string;
      category: CognitiveCategory;
      activityType: "strictlyFixed" | "flexibleFloating";
      weekdayPattern: Weekday[];
      slots: { day: Weekday; startHour: number; endHour: number }[];
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

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 6));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const buildEquiUser = (): EquiUser => {
    const now = new Date().toISOString();
    const procrastinationIndex = mapProcrastinationToIndex(formData.procrastinationAnswer);
    const pressureSensitivity = mapPressureToIndex(formData.pressureAnswer);
    
    const focusPeaksFormatted = formData.focusPeaks.flatMap((peak) =>
      peak.days.map((day) => ({
        weekday: day,
        start: { hour: peak.startHour, minute: 0 },
        end: { hour: peak.endHour, minute: 0 },
      }))
    );

    const energyDipsFormatted = formData.energyDips.flatMap((dip) =>
      dip.days.map((day) => ({
        weekday: day,
        start: { hour: dip.startHour, minute: 0 },
        end: { hour: dip.endHour, minute: 0 },
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
        mbti: "Unknown",
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
              slots: activity.slots,
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

  const handleSubmit = () => {
    const equiUser = buildEquiUser();
    console.log("EquiUser Created:", equiUser);
    alert("Onboarding complete! Check console for EquiUser object.");
  };

  const steps = [
    { number: 1, label: "Identity" },
    { number: 2, label: "Behavioral" },
    { number: 3, label: "Rhythms" },
    { number: 4, label: "Structure" },
    { number: 5, label: "Life Mode" },
    { number: 6, label: "Persona" },
  ];

  return (
    <div className="min-h-screen bg-[#fff] text-[#111] font-sans">
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
                    currentStep >= step.number
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
            <Step4Structures
              key="step4"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 5 && (
            <Step5LifeMode
              key="step5"
              formData={formData}
              updateFormData={updateFormData}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {currentStep === 6 && (
            <Step6Persona
              key="step6"
              formData={formData}
              updateFormData={updateFormData}
              onBack={prevStep}
              onSubmit={handleSubmit}
            />
          )}
        </AnimatePresence>
      </div>
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
// STEP 2: BEHAVIORAL INQUIRY
// ============================================================================

interface Step2BehavioralProps {
  formData: { procrastinationAnswer: string; pressureAnswer: string };
  updateFormData: (data: Partial<{ procrastinationAnswer: string; pressureAnswer: string }>) => void;
  onNext: () => void;
  onBack: () => void;
}

const PROCRASTINATION_OPTIONS = [
  { value: "immediately", label: "I handle it immediately", description: "No delay, straight to action" },
  { value: "same-day", label: "Same day", description: "Done when the day is young" },
  { value: "within-days", label: "Within a few days", description: "Not urgent, but on my list" },
  { value: "night-before", label: "Night before", description: "Classic approach" },
  { value: "last-minute", label: "Last possible moment", description: "Adrenaline is my fuel" },
];

const PRESSURE_OPTIONS = [
  { value: "paralyzed", label: "I freeze", description: "Deadlines make me unable to act" },
  { value: "uncomfortable", label: "Uncomfortable", description: "I work worse under pressure" },
  { value: "neutral", label: "Neutral", description: "Pressure doesn't affect my output" },
  { value: "motivated", label: "Motivated", description: "It pushes me to deliver" },
  { value: "thrive", label: "I thrive", description: "I do my best work at the last minute" },
];

function Step2Behavioral({ formData, updateFormData, onNext, onBack }: Step2BehavioralProps) {
  const isValid = formData.procrastinationAnswer && formData.pressureAnswer;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Understand your patterns.</h2>
        <p className="text-[#666] text-sm">These answers calibrate how Equi supports you.</p>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
            When faced with a complex administrative task, what is your typical approach?
          </label>
          <div className="grid gap-3">
            {PROCRASTINATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateFormData({ procrastinationAnswer: option.value })}
                className={`text-left p-4 border transition-all ${
                  formData.procrastinationAnswer === option.value
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] hover:border-[#111]"
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className={`text-xs mt-1 ${
                  formData.procrastinationAnswer === option.value ? "text-[#ccc]" : "text-[#666]"
                }`}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-xs uppercase tracking-widest text-[#111] font-medium">
            How does your productivity change as a deadline approaches?
          </label>
          <div className="grid gap-3">
            {PRESSURE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateFormData({ pressureAnswer: option.value })}
                className={`text-left p-4 border transition-all ${
                  formData.pressureAnswer === option.value
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] hover:border-[#111]"
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className={`text-xs mt-1 ${
                  formData.pressureAnswer === option.value ? "text-[#ccc]" : "text-[#666]"
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
    const newDays = block.days.includes(day)
      ? block.days.filter((d) => d !== day)
      : [...block.days, day];
    
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

  const isValid = formData.focusPeaks.length > 0 && formData.focusPeaks.every((p) => p.days.length > 0);

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
                value={peak.startHour}
                onChange={(v) => updateFocusPeak(index, "startHour", v)}
                color="#111"
              />
              <TimeSlider
                label="End"
                value={peak.endHour}
                onChange={(v) => updateFocusPeak(index, "endHour", v)}
                color="#111"
              />
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => (
                  <DayToggle
                    key={day}
                    day={day}
                    selected={peak.days.includes(day)}
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
                value={dip.startHour}
                onChange={(v) => updateEnergyDip(index, "startHour", v)}
                color="#999"
              />
              <TimeSlider
                label="End"
                value={dip.endHour}
                onChange={(v) => updateEnergyDip(index, "endHour", v)}
                color="#999"
              />
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => (
                  <DayToggle
                    key={day}
                    day={day}
                    selected={dip.days.includes(day)}
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
// STEP 4: FIXED STRUCTURES
// ============================================================================

type ActivityType = "strictlyFixed" | "flexibleFloating";
type PreferredTimeSlot = "focusPeaks" | "anytime";

interface ActivitySlot {
  day: Weekday;
  startHour: number;
  endHour: number;
}

interface FlexibleQuota {
  dailyMinutes: number;
  preferredSlot: PreferredTimeSlot;
}

interface ActivityForm {
  label: string;
  category: CognitiveCategory;
  activityType: ActivityType;
  weekdayPattern: Weekday[];
  slots: ActivitySlot[];
  flexibleQuota?: FlexibleQuota;
  isHardConstraint: boolean;
}

interface Step4StructuresProps {
  formData: { fixedActivities: ActivityForm[] };
  updateFormData: (data: Partial<{ fixedActivities: ActivityForm[] }>) => void;
  onNext: () => void;
  onBack: () => void;
}

const CATEGORY_OPTIONS: { value: CognitiveCategory; label: string }[] = [
  { value: "DeepWork", label: "Deep Work" },
  { value: "ShallowWork", label: "Shallow Work" },
  { value: "Admin", label: "Administrative" },
  { value: "Creative", label: "Creative" },
  { value: "Social", label: "Social" },
  { value: "Recovery", label: "Recovery / Rest" },
];

const PATTERN_OPTIONS: { value: string; label: string }[] = [
  { value: "Everyday", label: "Every Day" },
  { value: "Weekdays", label: "Weekdays (Mon-Fri)" },
  { value: "Weekends", label: "Weekends" },
  { value: "Custom", label: "Custom Days" },
];

function Step4Structures({ formData, updateFormData, onNext, onBack }: Step4StructuresProps) {
  const addActivity = () => {
    updateFormData({
      fixedActivities: [
        ...formData.fixedActivities,
        {
          label: "",
          category: "DeepWork",
          activityType: "strictlyFixed",
          weekdayPattern: [],
          slots: [],
          isHardConstraint: false,
        },
      ],
    });
  };

  const updateActivity = (index: number, field: keyof ActivityForm, value: unknown) => {
    const updated = [...formData.fixedActivities];
    updated[index] = { ...updated[index], [field]: value };
    updateFormData({ fixedActivities: updated });
  };

  const removeActivity = (index: number) => {
    updateFormData({ fixedActivities: formData.fixedActivities.filter((_, i) => i !== index) });
  };

  const addSlot = (activityIndex: number, day: Weekday) => {
    const activity = formData.fixedActivities[activityIndex];
    const existingSlot = activity.slots.find((s) => s.day === day);
    if (!existingSlot) {
      const newSlot: ActivitySlot = { day, startHour: 9, endHour: 10 };
      updateActivity(activityIndex, "slots", [...activity.slots, newSlot]);
    }
  };

  const removeSlot = (activityIndex: number, day: Weekday) => {
    const activity = formData.fixedActivities[activityIndex];
    updateActivity(activityIndex, "slots", activity.slots.filter((s) => s.day !== day));
  };

  const updateSlot = (activityIndex: number, day: Weekday, field: "startHour" | "endHour", value: number) => {
    const activity = formData.fixedActivities[activityIndex];
    const updatedSlots = activity.slots.map((s) =>
      s.day === day ? { ...s, [field]: value } : s
    );
    updateActivity(activityIndex, "slots", updatedSlots);
  };

  const toggleDay = (activityIndex: number, day: Weekday) => {
    const activity = formData.fixedActivities[activityIndex];
    const newPattern = activity.weekdayPattern.includes(day)
      ? activity.weekdayPattern.filter((d) => d !== day)
      : [...activity.weekdayPattern, day];
    updateActivity(activityIndex, "weekdayPattern", newPattern);
  };

  const parsePattern = (value: string): Weekday[] => {
    switch (value) {
      case "Everyday":
        return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      case "Weekdays":
        return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      case "Weekends":
        return ["Saturday", "Sunday"];
      default:
        return [];
    }
  };

  const isValid =
    formData.fixedActivities.length > 0 &&
    formData.fixedActivities.every((a) => {
      if (!a.label.trim()) return false;
      if (a.activityType === "strictlyFixed" && a.slots.length === 0) return false;
      if (a.activityType === "flexibleFloating" && (!a.flexibleQuota || a.flexibleQuota.dailyMinutes <= 0)) return false;
      return true;
    });

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Define your structure.</h2>
        <p className="text-[#666] text-sm">Add fixed commitments and flexible quotas.</p>
      </div>

      <div className="space-y-6">
        {formData.fixedActivities.length === 0 && (
          <p className="text-xs text-[#999] py-4">Click "+ Add Activity" to begin</p>
        )}

        {formData.fixedActivities.map((activity, index) => (
          <div key={index} className="border border-[#111] p-5 space-y-5">
            <div className="flex justify-between items-start">
              <span className="text-xs uppercase tracking-widest text-[#666]">Activity {index + 1}</span>
              <button
                onClick={() => removeActivity(index)}
                className="text-xs text-[#666] hover:text-[#111]"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-[#666]">Name</label>
                <input
                  type="text"
                  value={activity.label}
                  onChange={(e) => updateActivity(index, "label", e.target.value)}
                  placeholder="e.g., Economics Class"
                  className="w-full border-b border-[#ddd] py-2 bg-transparent outline-none focus:border-[#111] transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#666]">Category</label>
                <select
                  value={activity.category}
                  onChange={(e) => updateActivity(index, "category", e.target.value as CognitiveCategory)}
                  className="w-full border-b border-[#ddd] py-2 bg-transparent outline-none focus:border-[#111] transition-colors"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => updateActivity(index, "activityType", "strictlyFixed")}
                className={`flex-1 py-3 text-xs uppercase tracking-widest border transition-all ${
                  activity.activityType === "strictlyFixed"
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] text-[#666] hover:border-[#111]"
                }`}
              >
                Strictly Fixed
              </button>
              <button
                onClick={() =>
                  updateActivity(index, "activityType", "flexibleFloating")
                }
                className={`flex-1 py-3 text-xs uppercase tracking-widest border transition-all ${
                  activity.activityType === "flexibleFloating"
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] text-[#666] hover:border-[#111]"
                }`}
              >
                Flexible Floating
              </button>
            </div>

            {activity.activityType === "strictlyFixed" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-[#666]">Quick Select Days</label>
                  <select
                    value={
                      activity.weekdayPattern.length === 7
                        ? "Everyday"
                        : activity.weekdayPattern.length === 5 &&
                          !activity.weekdayPattern.includes("Saturday") &&
                          !activity.weekdayPattern.includes("Sunday")
                        ? "Weekends"
                        : activity.weekdayPattern.length === 2 &&
                          activity.weekdayPattern.includes("Saturday")
                        ? "Weekends"
                        : "Custom"
                    }
                    onChange={(e) => {
                      const days = parsePattern(e.target.value);
                      updateActivity(index, "weekdayPattern", days);
                      const newSlots: ActivitySlot[] = days.map((day) => ({
                        day,
                        startHour: 9,
                        endHour: 10,
                      }));
                      updateActivity(index, "slots", newSlots);
                    }}
                    className="w-full border-b border-[#ddd] py-2 bg-transparent outline-none focus:border-[#111] transition-colors"
                  >
                    {PATTERN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-xs text-[#666]">Configure Time Slots</label>
                  <div className="grid gap-3">
                    {WEEKDAYS.map((day) => {
                      const isSelected = activity.slots.some((s) => s.day === day);
                      const slot = activity.slots.find((s) => s.day === day);
                      return (
                        <div
                          key={day}
                          className={`flex items-center gap-3 p-3 border transition-all ${
                            isSelected ? "border-[#111]" : "border-[#ddd]"
                          }`}
                        >
                          <button
                            onClick={() =>
                              isSelected ? removeSlot(index, day) : addSlot(index, day)
                            }
                            className={`w-12 text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-[#111] text-[#fff]"
                                : "bg-[#fff] border border-[#ddd] text-[#666]"
                            }`}
                          >
                            {day.slice(0, 2)}
                          </button>
                          {isSelected && slot && (
                            <>
                              <select
                                value={slot.startHour}
                                onChange={(e) =>
                                  updateSlot(index, day, "startHour", Number(e.target.value))
                                }
                                className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm"
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <option key={i} value={i}>
                                    {i.toString().padStart(2, "0")}:00
                                  </option>
                                ))}
                              </select>
                              <span className="text-xs text-[#666]">to</span>
                              <select
                                value={slot.endHour}
                                onChange={(e) =>
                                  updateSlot(index, day, "endHour", Number(e.target.value))
                                }
                                className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm"
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <option key={i} value={i}>
                                    {i.toString().padStart(2, "0")}:00
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          {!isSelected && (
                            <span className="text-xs text-[#999]">Not scheduled</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activity.activityType === "flexibleFloating" && (
              <div className="space-y-4 p-4 bg-[#fafafa]">
                <div className="space-y-2">
                  <label className="text-xs text-[#666]">Daily Quota (hours)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.5"
                      max="12"
                      step="0.5"
                      value={(activity.flexibleQuota?.dailyMinutes || 60) / 60}
                      onChange={(e) =>
                        updateActivity(index, "flexibleQuota", {
                          dailyMinutes: Number(e.target.value) * 60,
                          preferredSlot: activity.flexibleQuota?.preferredSlot || "anytime",
                        })
                      }
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-16">
                      {((activity.flexibleQuota?.dailyMinutes || 60) / 60).toFixed(1)}h
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[#666]">Preferred Time Slot</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateActivity(index, "flexibleQuota", {
                          dailyMinutes: activity.flexibleQuota?.dailyMinutes || 60,
                          preferredSlot: "focusPeaks",
                        })
                      }
                      className={`flex-1 py-2 text-xs border transition-all ${
                        activity.flexibleQuota?.preferredSlot === "focusPeaks"
                          ? "border-[#111] bg-[#111] text-[#fff]"
                          : "border-[#ddd] text-[#666]"
                      }`}
                    >
                      Focus Peaks
                    </button>
                    <button
                      onClick={() =>
                        updateActivity(index, "flexibleQuota", {
                          dailyMinutes: activity.flexibleQuota?.dailyMinutes || 60,
                          preferredSlot: "anytime",
                        })
                      }
                      className={`flex-1 py-2 text-xs border transition-all ${
                        activity.flexibleQuota?.preferredSlot === "anytime"
                          ? "border-[#111] bg-[#111] text-[#fff]"
                          : "border-[#ddd] text-[#666]"
                      }`}
                    >
                      Anytime
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() =>
                  updateActivity(index, "isHardConstraint", !activity.isHardConstraint)
                }
                className={`px-4 py-2 text-xs uppercase tracking-widest border transition-all ${
                  activity.isHardConstraint
                    ? "border-[#111] bg-[#111] text-[#fff]"
                    : "border-[#ddd] text-[#666]"
                }`}
              >
                {activity.isHardConstraint ? "Hard Constraint" : "Flexible"}
              </button>
              <span className="text-xs text-[#666]">
                {activity.isHardConstraint ? "Cannot be moved" : "Can be adjusted"}
              </span>
            </div>
          </div>
        ))}

        <button
          onClick={addActivity}
          className="w-full py-4 border border-dashed border-[#ddd] text-[#666] text-sm hover:border-[#111] hover:text-[#111] transition-all"
        >
          + Add Activity
        </button>
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
