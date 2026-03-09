"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Weekday,
  CognitiveCategory,
  ActivitySlot,
  FlexibleQuota,
} from "../types";
import { parseICSFile, ParsedEvent } from "../lib/ics-parser";

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

const WEEKDAYS: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const CATEGORY_OPTIONS: { value: CognitiveCategory; label: string }[] = [
  { value: "DeepWork", label: "Deep Work" },
  { value: "ShallowWork", label: "Shallow Work" },
  { value: "Admin", label: "Administrative" },
  { value: "Creative", label: "Creative" },
  { value: "Social", label: "Social" },
  { value: "Recovery", label: "Recovery / Rest" },
];

// STEP 4: FIXED STRUCTURES - Complete Rewrite
// ============================================================================

interface ActivityForm {
  id?: string;
  label: string;
  category: CognitiveCategory;
  activityType: "strictlyFixed" | "flexibleFloating";
  weekdayPattern: Weekday[];
  slots: ActivitySlot[];
  flexibleQuota?: FlexibleQuota;
  isHardConstraint: boolean;
}

interface ImportedSchedule {
  id: string;
  label: string;
  day: Weekday;
  startHour: number;
  endHour: number;
  category: CognitiveCategory;
}

interface Step4StructuresProps {
  formData: { fixedActivities: ActivityForm[] };
  updateFormData: (data: Partial<{ fixedActivities: ActivityForm[] }>) => void;
  onNext: () => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// TIME SLOT COMPONENT
// ---------------------------------------------------------------------------

function TimeSlotSelector({
  slot,
  day,
  onUpdate,
  onRemove,
}: {
  slot: ActivitySlot;
  day: Weekday;
  onUpdate: (field: "startHour" | "endHour", value: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-3 border border-[#111] bg-[#fff]">
      <span className="text-xs font-medium w-8">{day.slice(0, 2)}</span>
      <select
        value={slot.startHour}
        onChange={(e) => onUpdate("startHour", Number(e.target.value))}
        className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm font-mono"
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
        onChange={(e) => onUpdate("endHour", Number(e.target.value))}
        className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm font-mono"
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>
            {i.toString().padStart(2, "0")}:00
          </option>
        ))}
      </select>
      <button
        onClick={onRemove}
        className="ml-auto text-xs text-[#666] hover:text-[#111] transition-colors"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function Step4Structures({ formData, updateFormData, onNext, onBack }: Step4StructuresProps) {
  // View states: 'choose' | 'upload' | 'manual' | 'verify'
  const [view, setView] = useState<'choose' | 'upload' | 'manual' | 'verify'>('choose');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importedSchedules, setImportedSchedules] = useState<ImportedSchedule[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------
  // FILE HANDLING - REAL PARSING
  // ---------------------------------------------------------------------

  const handleICSFile = async (file: File) => {
    try {
      setIsAnalyzing(true);
      const events = await parseICSFile(file);
      
      if (events.length === 0) {
        alert("No events found in the ICS file. Please check the file format.");
        setIsAnalyzing(false);
        return;
      }

      const schedules: ImportedSchedule[] = events.map((e) => ({
        id: e.id,
        label: e.label,
        day: e.day,
        startHour: e.startHour,
        endHour: e.endHour,
        category: e.category,
      }));

      setImportedSchedules(schedules);
      setIsAnalyzing(false);
      setView('verify');
    } catch (error) {
      console.error("ICS parsing error:", error);
      alert("Failed to parse ICS file. Please ensure it's a valid iCalendar file.");
      setIsAnalyzing(false);
    }
  };

  const handleVisionFile = async (file: File) => {
    try {
      setIsAnalyzing(true);

      const formDataFile = new FormData();
      formDataFile.append("file", file);

      const response = await fetch("/api/vision", {
        method: "POST",
        body: formDataFile,
      });

      if (!response.ok) {
        throw new Error("Vision API failed");
      }

      const result = await response.json();

      if (result.activities && result.activities.length > 0) {
        const schedules: ImportedSchedule[] = result.activities.map((a: ImportedSchedule) => ({
          id: a.id || generateId(),
          label: a.label,
          day: a.day,
          startHour: a.startHour,
          endHour: a.endHour,
          category: a.category,
        }));
        setImportedSchedules(schedules);
        setView('verify');
      } else {
        alert("No schedule data extracted. Please try manual entry or a different file.");
      }
    } catch (error) {
      console.error("Vision processing error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to process image: ${errorMessage}. Please use manual entry.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (file: File) => {
    if (file.name.endsWith('.ics')) {
      handleICSFile(file);
    } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      handleVisionFile(file);
    } else {
      alert("Unsupported file type. Please upload .ics, image, or PDF files.");
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // ---------------------------------------------------------------------
  // VERIFICATION & CONFIRMATION
  // ---------------------------------------------------------------------

  const updateImportedSchedule = (id: string, field: keyof ImportedSchedule, value: unknown) => {
    setImportedSchedules(prev => 
      prev.map(s => s.id === id ? { ...s, [field]: value } : s)
    );
  };

  const removeImportedSchedule = (id: string) => {
    setImportedSchedules(prev => prev.filter(s => s.id !== id));
  };

  const confirmImport = () => {
    // Group by label to create activities
    const activityMap = new Map<string, ActivityForm>();
    
    importedSchedules.forEach((schedule) => {
      const key = schedule.label;
      if (!activityMap.has(key)) {
        activityMap.set(key, {
          id: generateId(),
          label: schedule.label,
          category: schedule.category,
          activityType: "strictlyFixed",
          weekdayPattern: [],
          slots: [],
          isHardConstraint: true,
        });
      }
      const activity = activityMap.get(key)!;
      if (!activity.weekdayPattern.includes(schedule.day)) {
        activity.weekdayPattern.push(schedule.day);
      }
      activity.slots.push({
        day: schedule.day,
        startHour: schedule.startHour,
        endHour: schedule.endHour,
      });
    });

    updateFormData({ fixedActivities: Array.from(activityMap.values()) });
    setView('manual');
    setImportedSchedules([]);
  };

  // ---------------------------------------------------------------------
  // MANUAL ENTRY
  // ---------------------------------------------------------------------

  const addActivity = () => {
    updateFormData({
      fixedActivities: [
        ...formData.fixedActivities,
        {
          id: generateId(),
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
    const newSlot: ActivitySlot = { day, startHour: 9, endHour: 10 };
    updateActivity(activityIndex, "slots", [...activity.slots, newSlot]);
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

  const isValid =
    formData.fixedActivities.length > 0 &&
    formData.fixedActivities.every((a) => {
      if (!a.label.trim()) return false;
      if (a.activityType === "strictlyFixed" && a.slots.length === 0) return false;
      if (a.activityType === "flexibleFloating" && (!a.flexibleQuota || a.flexibleQuota.dailyMinutes <= 0)) return false;
      return true;
    });

  // ---------------------------------------------------------------------
  // VIEW: VERIFY (Import confirmation)
  // ---------------------------------------------------------------------

  if (view === 'verify') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-8"
      >
        <div className="space-y-2">
          <h2 className="text-3xl font-light text-[#111] tracking-tight">Review extracted schedule</h2>
          <p className="text-[#666] text-sm">Verify the data before confirming. Edit if needed.</p>
        </div>

        {importedSchedules.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[#666]">No schedule data found.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {importedSchedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center gap-3 p-4 border border-[#111]"
              >
                <input
                  type="text"
                  value={schedule.label}
                  onChange={(e) => updateImportedSchedule(schedule.id, "label", e.target.value)}
                  className="flex-1 border-b border-[#ddd] py-1 bg-transparent outline-none focus:border-[#111] text-sm"
                />
                <select
                  value={schedule.day}
                  onChange={(e) => updateImportedSchedule(schedule.id, "day", e.target.value as Weekday)}
                  className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm"
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>{d.slice(0, 2)}</option>
                  ))}
                </select>
                <select
                  value={schedule.startHour}
                  onChange={(e) => updateImportedSchedule(schedule.id, "startHour", Number(e.target.value))}
                  className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm font-mono w-16"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
                  ))}
                </select>
                <span className="text-xs text-[#666]">→</span>
                <select
                  value={schedule.endHour}
                  onChange={(e) => updateImportedSchedule(schedule.id, "endHour", Number(e.target.value))}
                  className="border-b border-[#ddd] py-1 bg-transparent outline-none text-sm font-mono w-16"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
                  ))}
                </select>
                <button
                  onClick={() => removeImportedSchedule(schedule.id)}
                  className="text-lg text-[#666] hover:text-[#111] ml-2"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => {
              setView('choose');
              setImportedSchedules([]);
            }}
            className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={confirmImport}
            className="px-8 py-4 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-all"
          >
            Confirm All
          </button>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW: CHOOSE (Entry method selection)
  // ---------------------------------------------------------------------

  if (view === 'choose') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-10"
      >
        <div className="space-y-2">
          <h2 className="text-3xl font-light text-[#111] tracking-tight">Import your schedule</h2>
          <p className="text-[#666] text-sm">Choose how you'd like to set up your fixed activities</p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => setView('upload')}
            className="p-6 border border-[#111] text-left hover:bg-[#fafafa] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#111] text-[#fff] flex items-center justify-center text-xl">
                ↑
              </div>
              <div>
                <div className="font-medium text-lg">Upload Schedule</div>
                <div className="text-xs text-[#666]">.ics / Image / PDF</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setView('manual')}
            className="p-6 border border-[#ddd] text-left hover:border-[#111] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#fff] border border-[#ddd] flex items-center justify-center text-xl">
                +
              </div>
              <div>
                <div className="font-medium text-lg">Manual Entry</div>
                <div className="text-xs text-[#666]">Add activities one by one</div>
              </div>
            </div>
          </button>
        </div>

        {formData.fixedActivities.length > 0 && (
          <div className="pt-4 border-t border-[#eee]">
            <p className="text-xs text-[#666] mb-3">
              Already have {formData.fixedActivities.length} activity(ies). Continue below to review.
            </p>
            <button
              onClick={() => setView('manual')}
              className="text-xs underline text-[#111]"
            >
              View existing activities →
            </button>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={onBack}
            className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
          >
            Back
          </button>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW: UPLOAD (File upload)
  // ---------------------------------------------------------------------

  if (view === 'upload') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-8"
      >
        <div className="space-y-2">
          <h2 className="text-3xl font-light text-[#111] tracking-tight">Upload schedule file</h2>
          <p className="text-[#666] text-sm">
            .ics files are parsed locally. Images/PDFs are sent to AI for extraction.
          </p>
        </div>

        <div
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`border-2 border-dashed p-12 text-center transition-all ${
            dragActive ? "border-[#111] bg-[#fafafa]" : "border-[#ddd]"
          }`}
        >
          {isAnalyzing ? (
            <div className="space-y-4">
              <div className="text-4xl animate-spin">⟳</div>
              <div className="text-[#111]">Analyzing schedule...</div>
              <div className="text-xs text-[#666]">
                {isAnalyzing ? "Extracting events from your file" : "Ready"}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-4xl">↑</div>
              <div className="text-[#111]">Drag & drop your file here</div>
              <div className="text-xs text-[#666]">or click to browse</div>
              <input
                type="file"
                accept=".ics,image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                ref={fileInputRef}
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-block px-6 py-3 border border-[#111] text-xs uppercase tracking-widest cursor-pointer hover:bg-[#111] hover:text-[#fff] transition-all"
              >
                Choose File
              </label>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setView('choose')}
            className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
          >
            Back
          </button>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW: MANUAL (Manual entry)
  // ---------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Define your structure.</h2>
        <p className="text-[#666] text-sm">Add fixed commitments or flexible quotas.</p>
      </div>

      <div className="space-y-6">
        {formData.fixedActivities.length === 0 && (
          <p className="text-xs text-[#999] py-4">Click "+ Add Activity" to begin</p>
        )}

        {formData.fixedActivities.map((activity, index) => (
          <div key={activity.id} className="border border-[#111] p-5 space-y-5">
            <div className="flex justify-between items-start">
              <span className="text-xs uppercase tracking-widest text-[#666]">
                Activity {index + 1}
              </span>
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
                Fixed Time
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
                Flexible Quota
              </button>
            </div>

            {/* FIXED TIME MODE */}
            {activity.activityType === "strictlyFixed" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-xs text-[#666]">Time Slots (one per day)</label>
                  <div className="grid gap-2">
                    {WEEKDAYS.map((day) => {
                      const isSelected = activity.slots.some((s) => s.day === day);
                      const slot = activity.slots.find((s) => s.day === day);
                      return (
                        <TimeSlotSelector
                          key={day}
                          slot={slot!}
                          day={day}
                          onUpdate={(field, value) => updateSlot(index, day, field, value)}
                          onRemove={() => removeSlot(index, day)}
                        />
                      );
                    })}
                  </div>
                  <button
                    onClick={() => {
                      const availableDays = WEEKDAYS.filter(
                        (d) => !activity.slots.some((s) => s.day === d)
                      );
                      if (availableDays.length > 0) {
                        addSlot(index, availableDays[0]);
                      }
                    }}
                    className="text-xs text-[#666] hover:text-[#111] underline"
                  >
                    + Add time slot for a day
                  </button>
                </div>
              </div>
            )}

            {/* FLEXIBLE QUOTA MODE */}
            {activity.activityType === "flexibleFloating" && (
              <div className="space-y-4 p-4 bg-[#fafafa]">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs text-[#666]">Daily Quota</label>
                    <span className="text-xs font-mono">
                      {((activity.flexibleQuota?.dailyMinutes || 60) / 60).toFixed(1)}h
                    </span>
                  </div>
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
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[#666]">Preferred Time</label>
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
          onClick={() => setView('choose')}
          className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
        >
          Import More
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
