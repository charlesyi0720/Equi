"use client";

import React from "react";

interface LandingSectionProps {
  onStart: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandingSection({ onStart }: LandingSectionProps) {
  return (
    <div id="landing-section" className="min-h-screen bg-[#fff] text-[#111] font-sans flex flex-col" style={{ transition: 'opacity 300ms ease-out' }}>
      {/* Minimal Header */}
      <header className="absolute top-0 left-0 right-0 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-lg font-light tracking-tight">EQUI</h1>
        </div>
      </header>

      {/* Centered Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center space-y-16">
          {/* Hero */}
          <div className="space-y-8">
            <h2 className="text-7xl md:text-9xl font-serif font-light tracking-[0.01em] leading-[1]">
              Beyond the Checklist.
            </h2>
            <p className="text-lg md:text-xl font-sans font-light text-[#444] leading-relaxed">
              An AI-native engine that understands your life, not just your tasks.
            </p>
          </div>

          {/* CTA */}
          <div className="pt-8">
            <button
              onClick={onStart}
              className="px-16 py-5 bg-[#111] text-[#fff] text-sm uppercase tracking-[0.12em] hover:bg-[#222] transition-colors duration-300"
              style={{ borderRadius: 0 }}
            >
              Initialize Synthesis
            </button>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="absolute bottom-0 left-0 right-0 p-8">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-xs text-[#999]">
          <span>Personal AI Lifestyle Architect</span>
          <span className="font-serif italic">Est. 2026</span>
        </div>
      </footer>
    </div>
  );
}
