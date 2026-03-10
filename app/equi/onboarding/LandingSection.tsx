"use client";

import React from "react";
import { motion } from "framer-motion";

interface LandingSectionProps {
  onStart: () => void;
}

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandingSection({ onStart }: LandingSectionProps) {
  return (
    <div id="landing-section" className="min-h-screen bg-[#fff] text-[#111] font-sans" style={{ transition: 'opacity 300ms ease-out' }}>
      {/* Minimal Header */}
      <header className="absolute top-0 left-0 right-0 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-lg font-light tracking-tight">EQUI</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 pt-40 pb-20">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="space-y-24"
        >
          {/* Hero Section */}
          <motion.section variants={fadeInUp} className="space-y-6 max-w-3xl">
            <h2 className="text-6xl md:text-8xl font-serif font-light tracking-[0.02em] leading-[1.05]">
              Beyond the Checklist.
            </h2>
            <p className="text-lg md:text-xl font-sans font-light text-[#444] max-w-xl leading-relaxed">
              Most tools track your time. Equi understands your intent.
            </p>
          </motion.section>

          {/* The Contrast - Simple Grid */}
          <motion.section variants={fadeInUp}>
            <div className="space-y-0">
              {/* Row 1 */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center py-6 border-t border-[#ddd]">
                <div className="text-left">
                  <span className="text-sm font-medium tracking-wide">Fragmentation</span>
                </div>
                <div className="px-6 text-xs text-[#999] uppercase tracking-widest">vs</div>
                <div className="text-right">
                  <span className="text-sm font-medium tracking-wide">Synthesis</span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center py-6 border-t border-[#ddd]">
                <div className="text-left">
                  <span className="text-sm font-medium tracking-wide">Generic Prompts</span>
                </div>
                <div className="px-6 text-xs text-[#999] uppercase tracking-widest">vs</div>
                <div className="text-right">
                  <span className="text-sm font-medium tracking-wide">Digital Twin</span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center py-6 border-t border-b border-[#ddd]">
                <div className="text-left">
                  <span className="text-sm font-medium tracking-wide">Linear Productivity</span>
                </div>
                <div className="px-6 text-xs text-[#999] uppercase tracking-widest">vs</div>
                <div className="text-right">
                  <span className="text-sm font-medium tracking-wide">Pareto Optimal</span>
                </div>
              </div>
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.section variants={fadeInUp} className="flex flex-col items-start py-8">
            <button
              onClick={onStart}
              className="px-10 py-4 bg-[#111] text-[#fff] text-sm uppercase tracking-[0.12em] hover:bg-[#222] transition-colors duration-300"
              style={{ borderRadius: 0 }}
            >
              Initialize Synthesis
            </button>
          </motion.section>
        </motion.div>
      </main>

      {/* Minimal Footer */}
      <footer className="absolute bottom-0 left-0 right-0 p-8">
        <div className="max-w-6xl mx-auto flex justify-between items-center text-xs text-[#999]">
          <span>Personal AI Lifestyle Architect</span>
          <span className="font-serif italic">Est. 2026</span>
        </div>
      </footer>
    </div>
  );
}
