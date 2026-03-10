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

// 4 axes with behavioral-friendly labels
const AXES = [
  { key: "energy", left: "Introvert", right: "Extrovert", leftHint: "Deep internal focus", rightHint: "Active external interaction" },
  { key: "info", left: "Intuitive", right: "Sensing", leftHint: "Patterns and possibilities", rightHint: "Concrete facts" },
  { key: "decision", left: "Thinking", right: "Feeling", leftHint: "Logic and objectivity", rightHint: "People and values" },
  { key: "lifestyle", left: "Judging", right: "Perceiving", leftHint: "Organized and planned", rightHint: "Flexible and spontaneous" },
];

// Convert axis values (0-100) to MBTI code
// 0-49 = left letter (I, N, T, J)
// 50-100 = right letter (E, S, F, P)
function getMBTICode(axes: number[]): string {
  const letters = ["I", "E", "N", "S", "T", "F", "J", "P"];
  return axes.map((v, i) => v >= 50 ? letters[i*2+1] : letters[i*2]).join("");
}

// Inference data from Step 2
interface InferenceData {
  focusLevel: string;
  planningStyleAnswer: string;
  procrastinationAnswer: string;
  pressureAnswer: string;
}

// Map Step 2 behavioral answers to MBTI axis values (0-100)
function inferMBTIAxes(f: InferenceData): number[] {
  // Default to middle values
  const axes = [50, 50, 50, 50];
  
  // Pressure Answer -> Energy Axis (E/I)
  // "thrive" or "motivated" under pressure = Extrovert (more external energy)
  // "paralyzed" by pressure = Introvert (internal focus, overwhelmed)
  if (f.pressureAnswer === "thrive" || f.pressureAnswer === "motivated") {
    axes[0] = 80; // Strong Extrovert
  } else if (f.pressureAnswer === "paralyzed") {
    axes[0] = 20; // Strong Introvert
  } else if (f.pressureAnswer === "uncomfortable") {
    axes[0] = 35; // Mild Introvert
  }
  
  // Focus Level -> Information Axis (N/S)
  // "deep" focus = Intuitive (abstract, patterns)
  // "flexible" = Sensing (concrete, practical)
  // "varied" = balanced
  if (f.focusLevel === "deep") {
    axes[1] = 25; // Mild Intuitive
  } else if (f.focusLevel === "flexible") {
    axes[1] = 75; // Mild Sensing
  }
  
  // Planning Style -> Lifestyle Axis (J/P)
  // "structured" = Judging (planned, organized)
  // "spontaneous" = Perceiving (flexible, spontaneous)
  if (f.planningStyleAnswer === "structured") {
    axes[3] = 20; // Strong Judging
  } else if (f.planningStyleAnswer === "spontaneous") {
    axes[3] = 80; // Strong Perceiving
  }
  
  // Procrastination -> Secondary Lifestyle (J/P)
  // Procrastinators tend toward Perceiving
  if (f.procrastinationAnswer === "night-before" || f.procrastinationAnswer === "last-minute") {
    axes[3] = Math.max(axes[3], 65); // Push toward Perceiving
  } else if (f.procrastinationAnswer === "immediately" || f.procrastinationAnswer === "same-day") {
    axes[3] = Math.min(axes[3], 35); // Push toward Judging
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
    return inferMBTIAxes({
      focusLevel: formData.focusLevel || "",
      planningStyleAnswer: formData.planningStyleAnswer || "",
      procrastinationAnswer: formData.procrastinationAnswer || "",
      pressureAnswer: formData.pressureAnswer || "",
    });
  }, [formData.focusLevel, formData.planningStyleAnswer, formData.procrastinationAnswer, formData.pressureAnswer]);
  
  // Use initial axes as default, but allow user to override
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

  const handleChange = (i: number, v: number) => {
    setEdited(true);
    const newAxes = [...axisValues];
    newAxes[i] = v;
    setAxisValues(newAxes);
  };

  const handleEnd = (i: number, v: number) => {
    // Keep the value as-is (allows smooth sliding), just update formData
    const newAxes = [...axisValues];
    newAxes[i] = v;
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
          Fine-tune the sliders to match your self-perception.
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

      {/* 4 Axis Sliders with improved styling */}
      <div className="space-y-8">
        {AXES.map((axis, i) => {
          const v = axisValues[i];
          const leftActive = v < 50;
          const rightActive = v >= 50;
          
          return (
            <div key={axis.key} className="space-y-3">
              {/* Labels */}
              <div className="flex justify-between items-center">
                <span className={`text-xs uppercase tracking-widest transition-colors ${
                  leftActive ? 'text-[#111] font-semibold' : 'text-[#999]'
                }`}>
                  {axis.left} (I)
                </span>
                <span className={`text-xs uppercase tracking-widest transition-colors ${
                  rightActive ? 'text-[#111] font-semibold' : 'text-[#999]'
                }`}>
                  {axis.right} (E)
                </span>
              </div>
              
              {/* Slider - Full width with proper thumb */}
              <div className="relative">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="1" 
                  value={v}
                  onChange={e => handleChange(i, +e.target.value)}
                  onMouseUp={e => handleEnd(i, +(e.target as HTMLInputElement).value)}
                  onTouchEnd={e => handleEnd(i, +((e.target as HTMLInputElement).value))}
                  className="w-full h-2 cursor-pointer"
                  style={{ 
                    background: `linear-gradient(to right, #111 ${v}%, #ddd ${v}%, #ddd 100%)`,
                  }} 
                />
              </div>
              
              {/* Hints */}
              <div className="flex justify-between">
                <span className={`text-xs transition-colors ${leftActive ? 'text-[#111]' : 'text-[#ccc]'}`}>
                  {axis.leftHint}
                </span>
                <span className={`text-xs transition-colors ${rightActive ? 'text-[#111]' : 'text-[#ccc]'}`}>
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
          className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
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

      {/* Global slider styles */}
      <style jsx global>{`
        input[type=range] {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          outline: none;
          width: 100%;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #111;
          border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          cursor: pointer;
          transition: transform 0.1s ease;
        }
        input[type=range]::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        input[type=range]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #111;
          border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          cursor: pointer;
        }
      `}</style>
    </motion.div>
  );
}
