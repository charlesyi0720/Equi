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
  const axes = [0, 0, 0, 0];
  
  // Pressure Answer -> Energy Axis (E/I)
  if (f.pressureAnswer === "thrive" || f.pressureAnswer === "motivated") {
    axes[0] = 1;
  } else if (f.pressureAnswer === "paralyzed") {
    axes[0] = 0;
  }
  
  // Focus Level -> Information Axis (N/S)
  if (f.focusLevel === "deep") {
    axes[1] = 0;
  } else if (f.focusLevel === "flexible") {
    axes[1] = 1;
  }
  
  // Planning Style -> Lifestyle Axis (J/P)
  if (f.planningStyleAnswer === "structured") {
    axes[3] = 0;
  } else if (f.planningStyleAnswer === "spontaneous") {
    axes[3] = 1;
  }
  
  // Procrastination -> Secondary Lifestyle (J/P)
  if (f.procrastinationAnswer === "night-before" || f.procrastinationAnswer === "last-minute") {
    axes[3] = 1;
  } else if (f.procrastinationAnswer === "immediately" || f.procrastinationAnswer === "same-day") {
    axes[3] = 0;
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
  const initialAxes = useMemo(() => {
    return inferMBTIBinary({
      focusLevel: formData.focusLevel || "",
      planningStyleAnswer: formData.planningStyleAnswer || "",
      procrastinationAnswer: formData.procrastinationAnswer || "",
      pressureAnswer: formData.pressureAnswer || "",
    });
  }, [formData.focusLevel, formData.planningStyleAnswer, formData.procrastinationAnswer, formData.pressureAnswer]);
  
  const [axisValues, setAxisValues] = useState<number[]>(initialAxes);
  const [edited, setEdited] = useState(false);
  
  useEffect(() => {
    if (!edited) {
      setAxisValues(initialAxes);
    }
  }, [initialAxes, edited]);

  const mbtiCode = getMBTICode(axisValues);
  const trait = MBTI_DESCRIPTIONS[mbtiCode] || "Unknown";

  useEffect(() => {
    updateFormData({ understanding: { mbti: mbtiCode } });
  }, [mbtiCode, updateFormData]);

  const handleToggle = (i: number, value: number) => {
    setEdited(true);
    const newAxes = [...axisValues];
    newAxes[i] = value;
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

      {/* Segmented Controls for 4 Axes */}
      <div className="space-y-4">
        {AXES.map((axis, i) => {
          const value = axisValues[i];
          const isLeft = value === 0;
          const isRight = value === 1;
          
          return (
            <div key={axis.key} className="space-y-2">
              {/* Axis Label */}
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-widest text-[#111] font-medium">
                  {axis.key === 'energy' && 'Energy'}
                  {axis.key === 'info' && 'Information'}
                  {axis.key === 'decision' && 'Decision'}
                  {axis.key === 'lifestyle' && 'Lifestyle'}
                </span>
              </div>
              
              {/* Segmented Control */}
              <div className="relative w-full h-10 bg-[#f5f5f5] rounded-sm flex overflow-hidden">
                {/* Active Indicator */}
                <motion.div
                  className="absolute top-0 h-full bg-[#111] rounded-sm"
                  initial={false}
                  animate={{
                    left: isLeft ? 0 : "50%",
                    width: "50%",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
                
                {/* Left Segment */}
                <button
                  type="button"
                  onClick={() => handleToggle(i, 0)}
                  className="relative z-10 flex-1 flex flex-col items-center justify-center"
                >
                  <span className={`text-xs font-medium transition-colors ${
                    isLeft ? 'text-[#fff]' : 'text-[#999]'
                  }`}>
                    {axis.leftLetter}
                  </span>
                  <span className={`text-[10px] transition-colors ${
                    isLeft ? 'text-[#ccc]' : 'text-[#bbb]'
                  }`}>
                    {axis.left}
                  </span>
                </button>
                
                {/* Right Segment */}
                <button
                  type="button"
                  onClick={() => handleToggle(i, 1)}
                  className="relative z-10 flex-1 flex flex-col items-center justify-center"
                >
                  <span className={`text-xs font-medium transition-colors ${
                    isRight ? 'text-[#fff]' : 'text-[#999]'
                  }`}>
                    {axis.rightLetter}
                  </span>
                  <span className={`text-[10px] transition-colors ${
                    isRight ? 'text-[#ccc]' : 'text-[#bbb]'
                  }`}>
                    {axis.right}
                  </span>
                </button>
              </div>
              
              {/* Hint */}
              <p className="text-[10px] text-[#999] text-center">
                {isLeft ? axis.leftHint : axis.rightHint}
              </p>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex gap-4">
        <button 
          onClick={onBack} 
          className="px-8 py-3 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all"
        >
          Back
        </button>
        <button 
          onClick={() => { 
            updateFormData({ understanding: { mbti: mbtiCode } }); 
            onNext(); 
          }} 
          className="px-8 py-3 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-all"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}
