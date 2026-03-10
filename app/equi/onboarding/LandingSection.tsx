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
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandingSection({ onStart }: LandingSectionProps) {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111] font-sans">
      {/* Minimal Header */}
      <header className="absolute top-0 left-0 right-0 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-lg font-light tracking-tight">EQUI</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 pt-32 pb-20">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="space-y-24"
        >
          {/* Hero Section */}
          <motion.section variants={fadeInUp} className="space-y-8 max-w-4xl">
            <h2 className="text-5xl md:text-7xl font-serif font-light tracking-tight leading-[1.1]">
              Escape the Checklist Treadmill.
            </h2>
            <p className="text-xl md:text-2xl font-sans font-light text-[#444] max-w-2xl leading-relaxed">
              Most tools track your tasks. Equi understands your life. A context-aware decision engine designed to bridge the gap between busyness and meaning.
            </p>
          </motion.section>

          {/* Problem Cards - Three Pillars */}
          <motion.section variants={fadeInUp} className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#ddd]">
              {/* Card 1: Productivity Void */}
              <motion.article
                variants={fadeInUp}
                className="bg-[#fafafa] p-8 md:p-12 space-y-6"
              >
                <div className="w-px h-12 bg-[#111]" />
                <h3 className="text-xs uppercase tracking-[0.2em] text-[#666]">
                  The Productivity Void
                </h3>
                <p className="text-lg font-serif leading-relaxed text-[#333]">
                  Traditional lists reward checking boxes, not making progress. They offer an illusion of success while leaving behind a sense of emptiness.
                </p>
              </motion.article>

              {/* Card 2: Contextual Amnesia */}
              <motion.article
                variants={fadeInUp}
                className="bg-[#fafafa] p-8 md:p-12 space-y-6"
              >
                <div className="w-px h-12 bg-[#111]" />
                <h3 className="text-xs uppercase tracking-[0.2em] text-[#666]">
                  Contextual Amnesia
                </h3>
                <p className="text-lg font-serif leading-relaxed text-[#333]">
                  Current AI assistants treat every prompt as a blank slate. They don't remember your stress, your habits, or your unique cognitive load.
                </p>
              </motion.article>

              {/* Card 3: The Digital Twin */}
              <motion.article
                variants={fadeInUp}
                className="bg-[#fafafa] p-8 md:p-12 space-y-6"
              >
                <div className="w-px h-12 bg-[#111]" />
                <h3 className="text-xs uppercase tracking-[0.2em] text-[#666]">
                  The Digital Twin
                </h3>
                <p className="text-lg font-serif leading-relaxed text-[#333]">
                  Equi builds a persistent model of your persona, biological clock, and long-term goals to achieve Pareto-optimal scheduling.
                </p>
              </motion.article>
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.section variants={fadeInUp} className="flex flex-col items-center justify-center space-y-8 py-12">
            <button
              onClick={onStart}
              className="group relative px-12 py-5 bg-[#111] text-[#fff] text-sm uppercase tracking-[0.15em] transition-all hover:bg-[#333] hover:scale-[1.02]"
            >
              <span className="relative z-10">Start Your Synthesis</span>
              <motion.div
                className="absolute inset-0 bg-[#fff]"
                initial={{ scaleX: 0 }}
                whileHover={{ scaleX: 1 }}
                transition={{ duration: 0.3 }}
                style={{ originX: 0, zIndex: 0 }}
              />
              <span className="relative z-10 group-hover:text-[#111] transition-colors">
                →
              </span>
            </button>
            <p className="text-xs text-[#888] uppercase tracking-widest">
              Takes 3 minutes
            </p>
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
