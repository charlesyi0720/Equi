"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

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

const AXES = [
  { key: "energy", left: "Introvert (I)", right: "Extrovert (E)", leftHint: "Deep internal focus", rightHint: "Active external interaction" },
  { key: "info", left: "Intuitive (N)", right: "Sensing (S)", leftHint: "Patterns and possibilities", rightHint: "Concrete facts" },
  { key: "decision", left: "Thinking (T)", right: "Feeling (F)", leftHint: "Logic and objectivity", rightHint: "People and values" },
  { key: "lifestyle", left: "Judging (J)", right: "Perceiving (P)", leftHint: "Organized and planned", rightHint: "Flexible and spontaneous" },
];

function getMBTICode(axes: number[]): string {
  const letters = ["I", "E", "N", "S", "T", "F", "J", "P"];
  return axes.map((v, i) => v >= 50 ? letters[i*2+1] : letters[i*2]).join("");
}

interface InferenceData {
  focusLevel: string;
  planningStyleAnswer: string;
  procrastinationAnswer: string;
  pressureAnswer: string;
}

function inferMBTI(f: InferenceData): number[] {
  const axes = [0, 0, 0, 0];
  if (f.pressureAnswer === "thrive" || f.pressureAnswer === "motivated") axes[0] = 100;
  else if (f.pressureAnswer === "paralyzed") axes[0] = 0;
  
  if (f.focusLevel === "deep") axes[1] = 0;
  else if (f.focusLevel === "flexible") axes[1] = 100;
  
  if (f.planningStyleAnswer === "structured") axes[3] = 0;
  else if (f.planningStyleAnswer === "spontaneous") axes[3] = 100;
  
  if (f.procrastinationAnswer === "night-before" || f.procrastinationAnswer === "last-minute") axes[3] = 100;
  
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
  const [axisValues, setAxisValues] = useState<number[]>(() => inferMBTI(formData));
  const [edited, setEdited] = useState(false);

  const mbtiCode = getMBTICode(axisValues);
  const trait = MBTI_DESCRIPTIONS[mbtiCode] || "Unknown";

  useEffect(() => {
    if (edited) updateFormData({ understanding: { mbti: mbtiCode } });
  }, [mbtiCode, edited, updateFormData]);

  const handleChange = (i: number, v: number) => {
    setEdited(true);
    const newAxes = [...axisValues];
    newAxes[i] = v;
    setAxisValues(newAxes);
  };

  const handleEnd = (i: number, v: number) => {
    const snapped = v >= 50 ? 100 : 0;
    const newAxes = [...axisValues];
    newAxes[i] = snapped;
    setAxisValues(newAxes);
    updateFormData({ understanding: { mbti: getMBTICode(newAxes) } });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-3xl font-light text-[#111] tracking-tight">Your Digital Persona</h2>
        <p className="text-[#666] text-sm">Based on your habits, Equi has analyzed your behavioral profile. Fine-tune if needed.</p>
      </div>

      <div className="border border-[#111] p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-widest text-[#666]">Inferred Profile</span>
          <span className="text-4xl font-light tracking-[0.2em]">{mbtiCode}</span>
        </div>
        <p className="text-sm text-[#111] border-t border-[#ddd] pt-4">{trait}</p>
      </div>

      <div className="space-y-8">
        {AXES.map((axis, i) => {
          const v = axisValues[i];
          const leftActive = v < 50, rightActive = v >= 50;
          return (
            <div key={axis.key} className="space-y-3">
              <div className="flex justify-between">
                <span className={`text-xs uppercase tracking-widest ${leftActive ? 'text-[#111] font-semibold' : 'text-[#999]'}`}>{axis.left}</span>
                <span className={`text-xs uppercase tracking-widest ${rightActive ? 'text-[#111] font-semibold' : 'text-[#999]'}`}>{axis.right}</span>
              </div>
              <input type="range" min="0" max="100" step="1" value={v}
                onChange={e => handleChange(i, +e.target.value)}
                onMouseUp={e => handleEnd(i, +(e.target as HTMLInputElement).value)}
                onTouchEnd={e => handleEnd(i, +((e.target as HTMLInputElement).value))}
                className="w-full h-2 cursor-pointer"
                style={{ background: `linear-gradient(to right, #111 ${v}%, #ddd ${v}%, #ddd 100%)` }}
              />
              <div className="flex justify-between">
                <span className={`text-xs ${leftActive ? 'text-[#111]' : 'text-[#ccc]'}`}>{axis.leftHint}</span>
                <span className={`text-xs ${rightActive ? 'text-[#111]' : 'text-[#ccc]'}`}>{axis.rightHint}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4">
        <button onClick={onBack} className="px-8 py-4 text-sm uppercase tracking-widest border border-[#ddd] hover:border-[#111] transition-all">Back</button>
        <button onClick={() => { updateFormData({ understanding: { mbti: mbtiCode } }); onNext(); }} className="px-8 py-4 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-all">Continue</button>
      </div>

      <style jsx global>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #111; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%; background: #111; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer;
        }
      `}</style>
    </motion.div>
  );
}
