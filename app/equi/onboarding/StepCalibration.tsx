"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";

// MBTI trait descriptions
const MBTI_DESCRIPTIONS: Record<string, string> = {
  "INTJ": "The Strategic Architect",
  "INTP": "The Logical Architect",
  "ENTJ": "The Commander",
  "ENTP": "The Debater",
  "INFJ": "The Advocate",
  "INFP": "The Mediator",
  "ENFJ": "The Protagonist",
  "ENFP": "The Campaigner",
  "ISTJ": "The Logistician",
  "ISFJ": "The Defender",
  "ESTJ": "The Executive",
  "ESFJ": "The Consul",
  "ISTP": "The Virtuoso",
  "ISFP": "The Adventurer",
  "ESTP": "The Entrepreneur",
  "ESFP": "The Entertainer",
};

// 4 axes with correct MBTI letters
const AXES = [
  { key: "energy", left: "Introvert", right: "Extrovert", leftLetter: "I", rightLetter: "E", leftHint: "Deep internal focus", rightHint: "Active external interaction" },
  { key: "info", left: "Intuitive", right: "Sensing", leftLetter: "N", rightLetter: "S", leftHint: "Patterns and possibilities", rightHint: "Concrete facts" },
  { key: "decision", left: "Thinking", right: "Feeling", leftLetter: "T", rightLetter: "F", leftHint: "Logic and objectivity", rightHint: "People and values" },
  { key: "lifestyle", left: "Judging", right: "Perceiving", leftLetter: "J", rightLetter: "P", leftHint: "Organized and planned", rightHint: "Flexible and spontaneous" },
];

// Convert binary axis values (0 or 1) to MBTI code
function getMBTICode(axes: number[]): string {
  return AXES.map((axis, i) => axes[i] === 1 ? axis.rightLetter : axis.leftLetter).join("");
}

// Inference data from Step 2
interface InferenceData {
  focusLevel: string;
  planningStyleAnswer: string;
  procrastinationAnswer: string;
  pressureAnswer: string;
}

// Map Step 2 behavioral answers to binary MBTI values (0 or 1)
function inferMBTIBinary(f: InferenceData): number[] {
  const axes = [0, 0, 0, 0]; // Default all to left (0)
  
  // Pressure Answer -> Energy Axis (E/I)
  if (f.pressureAnswer === "thrive" || f.pressureAnswer === "motivated") {
    axes[0] = 1; // Extrovert
  } else if (f.pressureAnswer === "paralyzed") {
    axes[0] = 0; // Introvert
  }
  
  // Focus Level -> Information Axis (N/S)
  if (f.focusLevel === "deep") {
    axes[1] = 0; // Intuitive
  } else if (f.focusLevel === "flexible") {
    axes[1] = 1; // Sensing
  }
  
  // Planning Style -> Lifestyle Axis (J/P)
  if (f.planningStyleAnswer === "structured") {
    axes[3] = 0; // Judging
  } else if (f.planningStyleAnswer === "spontaneous") {
    axes[3] = 1; // Perceiving
  }
  
  // Procrastination -> Secondary Lifestyle (J/P)
  if (f.procrastinationAnswer === "night-before" || f.procrastinationAnswer === "last-minute") {
    axes[3] = 1; // Perceiving
  } else if (f.procrastinationAnswer === "immediately" || f.procrastinationAnswer === "same-day") {
    axes[3] = 0; // Judging
  }
  
  return axes;
}

interface StepCalibrationProps {
  formData: {
    understanding: { mbti: string };
    focusLevel: string;
    planningStyleAnswer: string;
    procrastinationAnswer: string;
    pressureAnswer: string;
  };
  updateFormData: (data: Partial<{
    understanding: { mbti: string };
    focusLevel: string;
    planningStyleAnswer: string;
    procrastinationAnswer: string;
    pressureAnswer: string;
  }>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepCalibration({ formData, updateFormData, onNext, onBack }: StepCalibrationProps) {
  // Compute initial axis values from Step 2 data (inference)
  const initialAxes = useMemo(() => {
    return inferMBTIBinary({
      focusLevel: formData.focusLevel || "",
      planningStyleAnswer: formData.planningStyleAnswer || "",
      procrastinationAnswer: formData.procrastinationAnswer || "",
      pressureAnswer: formData.pressureAnswer || "",
    });
  }, [formData.focusLevel, formData.planningStyleAnswer, formData.procrastinationAnswer, formData.pressureAnswer]);
  
  // Binary values: 0 = left, 1 = right
  const [axisValues, setAxisValues] = useState<number[]>(initialAxes);
  const [edited, setEdited] = useState(false);
  
  // Recalculate when Step 2 data changes (if not yet edited)
  useEffect(() => {
    if (!edited) {
      setAxisValues(initialAxes);
    }
  }, [initialAxes, edited]);

  const mbtiCode = getMBTICode(axisValues);
  const trait = MBTI_DESCRIPTIONS[mbtiCode] || "Unknown";

  // Update formData when MBTI changes
  useEffect(() => {
    updateFormData({ understanding: { mbti: mbtiCode } });
  }, [mbtiCode, updateFormData]);

  // Toggle between 0 and 1
  const handleToggle = (i: number) => {
    setEdited(true);
    const newAxes = [...axisValues];
    newAxes[i] = axisValues[i] === 0 ? 1 : 0;
    setAxisValues(newAxes);
    updateFormData({ understanding: { mbti: getMBTICode(newAxes) } });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }} 
      className="space-y-10"
    >
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Digital Persona Reveal</h2>
        <p className="text-[#666] text-sm">
          Based on your behavioral patterns, Equi has inferred your digital persona. 
          Toggle to adjust if needed.
        </p>
      </div>

      {/* Inferred Profile Display */}
      <div className="border border-[#111] p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-widest text-[#666]">Inferred Persona</span>
          <span className="text-4xl font-light tracking-[0.2em]">{mbtiCode}</span>
        </div>
        <p className="text-sm text-[#111] border-t border-[#ddd] pt-4">{trait}</p>
      </div>

      {/* Binary Toggles for 4 Axes */}
      <div className="space-y-6">
        {AXES.map((axis, i) => {
          const value = axisValues[i];
          const isLeft = value === 0;
          const isRight = value === 1;
          
          return (
            <div key={axis.key} className="space-y-3">
              {/* Labels */}
              <div className="flex justify-between items-center">
                <span className={`text-xs uppercase tracking-widest transition-colors ${
                  isLeft ? 'text-[#111] font-semibold' : 'text-[#999]'
                }`}>
                  {axis.left} ({axis.leftLetter})
                </span>
                <span className={`text-xs uppercase tracking-widest transition-colors ${
                  isRight ? 'text-[#111] font-semibold' : 'text-[#999]'
                }`}>
                  {axis.right} ({axis.rightLetter})
                </span>
              </div>
              
              {/* Binary Toggle Button */}
              <button
                type="button"
                onClick={() => handleToggle(i)}
                className="w-full h-12 relative cursor-pointer"
              >
                <div 
                  className="w-full h-2 rounded-full transition-colors"
                  style={{
                    background: isRight ? '#111' : '#ddd',
                  }}
                />
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#111] border-2 border-[#fff] shadow-md transition-all"
                  style={{
                    left: isRight ? 'calc(100% - 16px)' : '4px',
                  }}
                />
              </button>
              
              {/* Hints */}
              <div className="flex justify-between">
                <span className={`text-xs transition-colors ${isLeft ? 'text-[#111]' : 'text-[#ccc]'}`}>
                  {axis.leftHint}
                </span>
                <span className={`text-xs transition-colors ${isRight ? 'text-[#111]' : 'text-[#ccc]'}`}>
                  {axis.rightHint}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex gap-4">
        <button 
          onClick={onBack} 
          className="px-8 py- tracking-widest4 text-sm uppercase border border-[#ddd] hover:border-[#111] transition-all"
        >
          Back
        </button>
        <button 
          onClick={() => { 
            updateFormData({ understanding: { mbti: mbtiCode } }); 
            onNext(); 
          }} 
          className="px-8 py-4 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-all"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}
