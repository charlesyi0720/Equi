"use client";

import React, { useState, useEffect, useRef, useMemo, FormEvent } from "react";
import { EquiUser, StoredMessage, ConversationSession } from "../types";
import { supabase } from "../lib/supabase";
import { onAuthStateChange, signOut } from "../lib/auth";
import { generateUserContextChunks } from "../lib/semanticParser";

// SVG Icon Components
const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
  </svg>
);

const BoltIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const LeafIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 22C2 22 5 14 12 10C19 6 22 2 22 2C22 2 18 6 14 12C10 18 6 22 2 22Z" />
    <path d="M2 22C9 20 14 14 14 14" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const LifebuoyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
    <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
  </svg>
);

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ERROR BOUNDARY] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="rounded-2xl bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.07)] text-center space-y-4 max-w-sm mx-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center mx-auto text-rose-500">
              <SparkleIcon />
            </div>
            <div className="text-base font-semibold text-slate-900">Something went wrong</div>
            <div className="text-sm text-slate-500">{this.state.error?.message}</div>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors duration-200 cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ============================================================================
// TYPES
// ============================================================================

/** StoredMessage uses ISO string timestamps (persisted to Supabase). */
type Message = StoredMessage;

interface CalendarGridEvent {
  id: string;
  title: string;
  dayIdx: number;
  start: number;
  end: number;
  isFixed: boolean;
  /** ISO date string for one-off events (e.g. "2026-03-25"). If absent the event recurs every matching weekday. */
  isoDate?: string;
}

/** Matches machine-readable schedule line; supports ASCII and fullwidth pipe. Optional 5th field: YYYY-MM-DD for one-off events.
 *  Canonical API format: 💡 [SCHEDULE_UPDATE]: Title | start | end | day [| date]  (closing ] before :)
 *  Legacy typo: [SCHEDULE_UPDATE: Title | ... (no ] before colon)
 */
const SCHEDULE_UPDATE_LINE_RE =
  /(?:💡\s*)?\[SCHEDULE_UPDATE\]:\s*([^\|\n\r\uFF5C]+?)\s*[\|｜]\s*(\d+)\s*[\|｜]\s*(\d+)\s*[\|｜]\s*([^\[\]\s\n\r]+?)(?:\s*[\|｜]\s*(\d{4}-\d{2}-\d{2}))?/i;
const SCHEDULE_UPDATE_LINE_RE_LEGACY =
  /(?:💡\s*)?\[SCHEDULE_UPDATE:\s*([^\|\n\r\uFF5C]+?)\s*[\|｜]\s*(\d+)\s*[\|｜]\s*(\d+)\s*[\|｜]\s*([^\[\]\s\n\r]+?)(?:\s*[\|｜]\s*(\d{4}-\d{2}-\d{2}))?/i;

/** Matches reschedule trigger: [RESCHEDULE_TRIGGER]: startHour | endHour | taskTitle | suggestedDay | suggestedStart | suggestedEnd */
const RESCHEDULE_TRIGGER_RE =
  /\[RESCHEDULE_TRIGGER\]:\s*(\d+)\s*[\|｜]\s*(\d+)\s*[\|｜]\s*([^\|｜\n\r]+?)\s*[\|｜]\s*([a-z]{3})\s*[\|｜]\s*(\d+)\s*[\|｜]\s*(\d+)/i;

/** Strip machine-readable schedule lines from chat display (canonical + legacy bracket typo). */
function stripScheduleUpdateLines(text: string): string {
  return text
    .replace(/\s*💡?\s*\[SCHEDULE_UPDATE\]?:[^\n]+/g, "")
    .replace(/\s*\[RESCHEDULE_TRIGGER\]:[^\n]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRescheduleTrigger(text: string): { start: number; end: number; taskTitle: string; suggestedDay: string; suggestedStart: number; suggestedEnd: number } | null {
  const match = text.match(RESCHEDULE_TRIGGER_RE);
  if (!match) return null;
  const [, startStr, endStr, taskTitle, suggestedDay, suggestedStartStr, suggestedEndStr] = match;
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  const suggestedStart = parseInt(suggestedStartStr, 10);
  const suggestedEnd = parseInt(suggestedEndStr, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (!Number.isFinite(suggestedStart) || !Number.isFinite(suggestedEnd) || suggestedEnd <= suggestedStart) return null;
  return { start, end, taskTitle: taskTitle.trim(), suggestedDay: suggestedDay.toLowerCase(), suggestedStart, suggestedEnd };
}

function parseScheduleUpdateFromText(
  text: string
): { title: string; dayIdx: number; start: number; end: number; isoDate?: string } | null {
  const match = text.match(SCHEDULE_UPDATE_LINE_RE) ?? text.match(SCHEDULE_UPDATE_LINE_RE_LEGACY);
  if (!match) return null;
  const [, titleRaw, startStr, endStr, dayRaw, isoDate] = match;
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const dayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  const key = dayRaw.trim().toLowerCase().substring(0, 3);
  const dayIdx = dayMap[key];
  if (dayIdx === undefined) return null;
  return { title: titleRaw.trim(), dayIdx, start, end, isoDate: isoDate ?? undefined };
}

/** Parse ALL [SCHEDULE_UPDATE] tags from a message (handles multiple tasks in one reply). */
function parseAllScheduleUpdatesFromText(
  text: string
): Array<{ title: string; dayIdx: number; start: number; end: number; isoDate?: string }> {
  const dayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  const results: Array<{ title: string; dayIdx: number; start: number; end: number; isoDate?: string }> = [];

  const reGlobal = /(?:💡\s*)?\[SCHEDULE_UPDATE\]?:\s*([^\|\n\r\uFF5C]+?)\s*[\|｜]\s*([\d.]+)\s*[\|｜]\s*([\d.]+)\s*[\|｜]\s*([^\[\]\s\n\r]+?)(?:\s*[\|｜]\s*(\d{4}-\d{2}-\d{2}))?(?=\s*$|\s*\n|\s*💡|\s*\[)/gim;

  let match;
  while ((match = reGlobal.exec(text)) !== null) {
    const [, titleRaw, startStr, endStr, dayRaw, isoDate] = match;
    const start = parseFloat(startStr);
    const end = parseFloat(endStr);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const key = dayRaw.trim().toLowerCase().substring(0, 3);
    const dayIdx = dayMap[key];
    if (dayIdx === undefined) continue;
    results.push({ title: titleRaw.trim(), dayIdx, start, end, isoDate: isoDate ?? undefined });
  }

  return results;
}

function mondayBasedDayIndex(d: Date): number {
  const dow = d.getDay();
  return dow === 0 ? 6 : dow - 1;
}

function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDigitsForParse(s: string): string {
  return s.replace(/\u3000/g, " ").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function pmHour(h: number): number {
  if (h >= 1 && h <= 11) return h + 12;
  if (h === 12) return 12;
  return h;
}

/** 12-hour label with minutes when needed (e.g. 12.5 → "12:30 PM"). Avoids Math.ceil(12.5) → "1 PM". */
function formatDecimalHourForDisplay(decimal: number): string {
  const totalMinutes = Math.round(decimal * 60) % (24 * 60);
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const isPm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  return `${h12}${mm} ${isPm ? "PM" : "AM"}`;
}

/** Parse Chinese / plain time ranges when the model omits [SCHEDULE_UPDATE]: line. */
function extractCnEnTimeRange(text: string): { start: number; end: number } | null {
  // Avoid matching 下午好 — require a digit soon after 下午/上午.
  const pmHead = /下午\s*\d/.exec(text);
  if (pmHead) {
    const pmIdx = pmHead.index;
    const slice = text.slice(pmIdx, Math.min(text.length, pmIdx + 56));
    let m = slice.match(/(\d{1,2})\s*[-–至到～~]\s*(\d{1,2})\s*点/);
    if (m) {
      return { start: pmHour(parseInt(m[1], 10)), end: pmHour(parseInt(m[2], 10)) };
    }
    m = slice.match(/(\d{1,2})\s*点\s*至\s*(\d{1,2})\s*点/);
    if (m) {
      return { start: pmHour(parseInt(m[1], 10)), end: pmHour(parseInt(m[2], 10)) };
    }
  }
  const amHead = /(?:上午|早上)\s*\d/.exec(text);
  if (amHead) {
    const amIdx = amHead.index;
    const slice = text.slice(amIdx, Math.min(text.length, amIdx + 56));
    const m =
      slice.match(/(\d{1,2})\s*[-–至到～~]\s*(\d{1,2})\s*点/) ??
      slice.match(/(\d{1,2})\s*点\s*至\s*(\d{1,2})\s*点/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      return { start: a, end: b };
    }
  }
  let m = text.match(/\b(\d{1,2}):00\s*[-–]\s*(\d{1,2}):00\b/);
  if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  // "10:00 to 12:30" / "from 10:00 to 12:30" (must run before single-time "at 10:00" patterns)
  m = text.match(
    /\b(?:from\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:to|until|through|–|-|—|~)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i
  );
  if (m) {
    let sh = parseInt(m[1], 10);
    const sm = parseInt(m[2], 10);
    let eh = parseInt(m[4], 10);
    const em = parseInt(m[5], 10);
    const sSuf = m[3]?.toUpperCase();
    const eSuf = m[6]?.toUpperCase();
    if (sSuf === "PM" && sh < 12) sh += 12;
    if (sSuf === "AM" && sh === 12) sh = 0;
    if (eSuf === "PM" && eh < 12) eh += 12;
    if (eSuf === "AM" && eh === 12) eh = 0;
    if (!sSuf && !eSuf && /morning|早上|上午/i.test(text) && sh >= 1 && sh <= 11 && eh >= 1 && eh <= 12) {
      // both morning hours, no suffix → AM
    } else if (!sSuf && sh >= 1 && sh <= 11 && /afternoon|下午/i.test(text)) {
      sh = pmHour(sh);
      if (!eSuf && eh >= 1 && eh <= 11) eh = pmHour(eh);
    } else if (!eSuf && eh >= 1 && eh <= 11 && /afternoon|下午/i.test(text)) {
      eh = pmHour(eh);
    }
    const start = sh + sm / 60;
    const end = eh + em / 60;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return { start, end };
    }
  }
  m = text.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*点\b/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a >= 8 && b <= 23 && b > a) return { start: a, end: b };
    if (a >= 1 && a <= 11 && b >= 1 && b <= 12 && b > a) {
      return { start: pmHour(a), end: pmHour(b) };
    }
  }
  // "tomorrow morning at 10:00" / "at 10:00 AM"
  m = text.match(/\bat\s+(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) || 0;
    const suf = m[3]?.toUpperCase();
    if (suf === "PM" && h < 12) h += 12;
    if (suf === "AM" && h === 12) h = 0;
    if (!suf && /morning|早上|上午/i.test(text) && h >= 1 && h <= 11) {
      // bare "10:00" after "morning" → AM
    } else if (!suf && h >= 1 && h <= 11 && /afternoon|下午/i.test(text)) {
      h = pmHour(h);
    } else if (!suf && h >= 1 && h <= 11 && /evening|晚上|night/i.test(text)) {
      h = pmHour(h);
    }
    const start = h + mm / 60;
    return { start, end: start + 1 };
  }
  m = text.match(/\bmorning\s+at\s+(\d{1,2})(?::00)?\b/i);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 1 && h <= 11) return { start: h, end: h + 1 };
  }
  // "10am", "10 am", "10pm", "10 pm", "10am–12pm", "10 – 12pm"
  m = text.match(/\bat\s+(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const suf = m[2].toLowerCase();
    if (suf === "pm" && h < 12) h += 12;
    if (suf === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) {
      // Check if there's an end time nearby: "10am–12pm" or "10am - 12pm"
      const after = text.slice(text.indexOf(m[0]) + m[0].length, text.indexOf(m[0]) + m[0].length + 20);
      const endM = after.match(/^\s*[-–]\s*(\d{1,2})\s*(am|pm)?\b/i);
      if (endM) {
        let eh = parseInt(endM[1], 10);
        const esuf = (endM[2] ?? suf).toLowerCase();
        if (esuf === "pm" && eh < 12) eh += 12;
        if (esuf === "am" && eh === 12) eh = 0;
        if (eh > h) return { start: h, end: eh };
      }
      return { start: h, end: h + 1 };
    }
  }
  // "10 – 12pm" (no "at")
  m = text.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let sh = parseInt(m[1], 10);
    let eh = parseInt(m[2], 10);
    const suf = m[3].toLowerCase();
    if (suf === "pm" && eh < 12) eh += 12;
    if (suf === "am" && eh === 12) eh = 0;
    if (suf === "pm" && sh < 12) sh += 12;
    if (suf === "am" && sh === 12) sh = 0;
    if (eh > sh) return { start: sh, end: eh };
  }
  return null;
}

const COLON_RANGE_RE_GLOBAL =
  /(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?\s*[-–至到～~]\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/g;

function parseColonRangeMatch(
  m: RegExpMatchArray,
  text: string,
  matchIndex: number
): { start: number; end: number } | null {
  let sh = parseInt(m[1], 10);
  const sm = parseInt(m[2], 10);
  let eh = parseInt(m[4], 10);
  const em = parseInt(m[5], 10);
  const sSuf = m[3]?.toUpperCase();
  const eSuf = m[6]?.toUpperCase();
  if (sSuf === "PM" && sh < 12) sh += 12;
  if (sSuf === "AM" && sh === 12) sh = 0;
  if (eSuf === "PM" && eh < 12) eh += 12;
  if (eSuf === "AM" && eh === 12) eh = 0;
  const winStart = Math.max(0, matchIndex - 120);
  const beforeSlice = text.slice(winStart, matchIndex);
  if (!sSuf && !eSuf) {
    if (/下午|afternoon/i.test(beforeSlice) && sh >= 1 && sh <= 11) sh = pmHour(sh);
    if (/下午|afternoon/i.test(beforeSlice) && eh >= 1 && eh <= 11) eh = pmHour(eh);
  }
  const start = sh + sm / 60;
  const end = eh + em / 60;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (start < 4 || end > 25) return null;
  return { start, end };
}

function dedupeTimeRanges(
  ranges: Array<{ start: number; end: number; index: number }>
): Array<{ start: number; end: number; index: number }> {
  const seen = new Set<string>();
  const res: Array<{ start: number; end: number; index: number }> = [];
  for (const r of [...ranges].sort((a, b) => a.index - b.index)) {
    const key = `${r.start.toFixed(3)}-${r.end.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(r);
  }
  return res;
}

function extractAllColonTimeRanges(text: string): Array<{ start: number; end: number; index: number }> {
  const re = new RegExp(COLON_RANGE_RE_GLOBAL.source, "g");
  const out: Array<{ start: number; end: number; index: number }> = [];
  let m: RegExpMatchArray | null;
  while ((m = re.exec(text)) !== null) {
    const idx = m.index;
    if (idx === undefined) continue;
    const before = text.slice(Math.max(0, idx - 6), idx);
    if (/\d{4}-$/.test(before)) continue;
    const parsed = parseColonRangeMatch(m, text, idx);
    if (parsed) out.push({ ...parsed, index: idx });
  }
  return dedupeTimeRanges(out);
}

function cnWeekCharToIdx(c: string): number | undefined {
  const map: Record<string, number> = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  return map[c];
}

/** ISO date for column `targetDayIdx` (Mon=0) within the same calendar week as `ref` (local). */
function isoDateForWeekdayInDisplayedWeek(ref: Date, targetDayIdx: number): string {
  const dow = ref.getDay();
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + monOffset);
  monday.setHours(12, 0, 0, 0);
  const d = new Date(monday);
  d.setDate(monday.getDate() + targetDayIdx);
  return formatLocalIsoDate(d);
}

function englishWeekdayToMondayIdx(word: string): number | undefined {
  const w = word.toLowerCase();
  const map: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };
  return map[w];
}

/**
 * Named weekdays must win over "tomorrow" when history + current message are merged:
 * older replies may still say 明天 while the latest suggestion says 周五.
 */
function resolveDayFromText(text: string, ref: Date): { dayIdx: number; isoDate?: string } {
  const en = text.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  if (en) {
    const idx = englishWeekdayToMondayIdx(en[1]);
    if (idx !== undefined) {
      return { dayIdx: idx, isoDate: isoDateForWeekdayInDisplayedWeek(ref, idx) };
    }
  }
  const wm = text.match(/星期([一二三四五六日天])|周([一二三四五六日天])/);
  if (wm) {
    const ch = wm[1] ?? wm[2];
    const idx = cnWeekCharToIdx(ch);
    if (idx !== undefined) {
      return { dayIdx: idx, isoDate: isoDateForWeekdayInDisplayedWeek(ref, idx) };
    }
  }
  if (/\btoday\b/i.test(text) || /\btonight\b/i.test(text) || /\b今[天日]\b/.test(text)) {
    return { dayIdx: mondayBasedDayIndex(ref), isoDate: formatLocalIsoDate(ref) };
  }
  if (/后天/.test(text)) {
    const d = new Date(ref);
    d.setDate(d.getDate() + 2);
    return { dayIdx: mondayBasedDayIndex(d), isoDate: formatLocalIsoDate(d) };
  }
  if (/明天|翌日/.test(text)) {
    const d = new Date(ref);
    d.setDate(d.getDate() + 1);
    return { dayIdx: mondayBasedDayIndex(d), isoDate: formatLocalIsoDate(d) };
  }
  if (/\bday\s+after\s+tomorrow\b/i.test(text)) {
    const d = new Date(ref);
    d.setDate(d.getDate() + 2);
    return { dayIdx: mondayBasedDayIndex(d), isoDate: formatLocalIsoDate(d) };
  }
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(ref);
    d.setDate(d.getDate() + 1);
    return { dayIdx: mondayBasedDayIndex(d), isoDate: formatLocalIsoDate(d) };
  }
  return { dayIdx: mondayBasedDayIndex(ref), isoDate: formatLocalIsoDate(ref) };
}

/** Prefer explicit weekday in the latest assistant message over relative words in merged history. */
function resolveDayForSchedule(
  assistantMessage: string,
  combinedForFallback: string,
  ref: Date
): { dayIdx: number; isoDate?: string } {
  const a = assistantMessage.trim();
  if (
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(a) ||
    /星期[一二三四五六日天]/.test(a) ||
    /周[一二三四五六日天]/.test(a)
  ) {
    return resolveDayFromText(a, ref);
  }
  return resolveDayFromText(combinedForFallback, ref);
}

function isMetaScheduleTitle(s: string): boolean {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return true;
  return (
    /^(这两个|以下|上述|建议|安排一下?|深度工作|工作任务|两个深度|此类|以下两)/.test(t) ||
    (t.length <= 40 && /深度工作|工作任务/.test(t))
  );
}

function extractSessionTitle(user: string, assistant: string): string | null {
  const u = user.replace(/\s+/g, " ");
  let m = u.match(/focus\s+on\s+(.+?)$/i);
  if (m) {
    const t = m[1].trim();
    if (!isMetaScheduleTitle(t)) return t;
  }
  m = u.match(/(?:关于|做|完成)\s*([^\n，。！？]{2,40})/);
  if (m) {
    const t = m[1].trim();
    if (!isMetaScheduleTitle(t)) return t;
  }
  // "schedule your gym session" / "put your gym" / "reserve your morning run"
  m = assistant.match(/(?:schedule|put|reserve|block)\s+your\s+([a-zA-Z][^.!?\n]{2,40}?)\s+(?:session|block|time)/i);
  if (m) return m[1].trim();
  // "set your gym session" / "registered your gym session"
  m = assistant.match(
    /\b(?:set|placed|added|booked|registered)\s+your\s+([a-zA-Z][^.!?\n]{1,40}?)\s+(?:session|block|time)\b/i
  );
  if (m) return m[1].trim();
  // "your gym session" — require session/block to avoid "your morning from 10"
  m = assistant.match(/\byour\s+([a-zA-Z][^.!?\n]{1,40}?)\s+(?:session|block)\b/i);
  if (m) return m[1].trim();
  m = assistant.match(/(?:将|把)([^，,]{2,32}?)(?:安排|放在)/);
  if (m) {
    const t = m[1].trim();
    if (!isMetaScheduleTitle(t)) return t;
  }
  m = assistant.match(/(?:registered|booked|scheduled|placed)\s+(?:your\s+)?([a-zA-Z][^.!?\n]{1,48}?)(?:\s+for|\s+tom|\s+on|\.)/i);
  if (m) return m[1].trim();
  return null;
}

/** Use profile casing when chat matches an activity label (e.g. gym → Gym). */
function canonicalizeActivityLabel(raw: string, activityLabels: string[]): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const low = t.toLowerCase();
  for (const label of activityLabels) {
    const L = label.trim();
    if (L.length < 2) continue;
    if (low === L.toLowerCase()) return L;
  }
  return t;
}

/**
 * Titles the model states explicitly in the latest assistant turn (e.g. 《Advanced Microeconomics》Assignment).
 * Must run before profile-label matching on merged history, or "Economics Research" from old chat wins wrongly.
 */
function extractExplicitTitleFromAssistant(assistantMessage: string): string | null {
  const a = normalizeDigitsForParse(assistantMessage);

  let m = a.match(/《([^》]{2,80})》\s*(Assignment|作业)/i);
  if (m) {
    const title = m[1].replace(/\s+/g, " ").trim();
    if (!isMetaScheduleTitle(title)) {
      return (/作业/i.test(m[2]) ? `${title} 作业` : `${title} Assignment`).slice(0, 80);
    }
  }

  m = a.match(/[更已新改].{0,56}?为[《「]([^》」]{2,80})[》」]/);
  if (m) {
    const title = m[1].replace(/\s+/g, " ").trim();
    if (!isMetaScheduleTitle(title)) {
      const tail = a.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 28);
      if (/^\s*(Assignment|作业)\b/i.test(tail)) {
        return (/作业/.test(tail) ? `${title} 作业` : `${title} Assignment`).slice(0, 80);
      }
      return title.slice(0, 80);
    }
  }

  m = a.match(/「([^」]{2,80})」\s*(?:Assignment|作业)?/);
  if (m) {
    const title = m[1].replace(/\s+/g, " ").trim();
    if (!isMetaScheduleTitle(title)) return title.slice(0, 80);
  }

  m = a.match(/\bto\s+["'「]([^"'」]{2,80})["'」]/i);
  if (m) {
    const title = m[1].replace(/\s+/g, " ").trim();
    if (!isMetaScheduleTitle(title)) return title.slice(0, 80);
  }

  m = a.match(/\b(Advanced\s+(?:Micro|Macro)economics\s+Assignment)\b/i);
  if (m) return m[1].replace(/\s+/g, " ").trim().slice(0, 80);

  return null;
}

function longestMatchingActivityLabels(text: string, activityLabels: string[]): string[] {
  return Array.from(new Set(activityLabels.map((l) => l.trim()).filter((l) => l.length >= 2))).filter((L) => {
    try {
      const esc = L.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (/\s/.test(L)) {
        return text.toLowerCase().includes(L.toLowerCase());
      }
      return new RegExp(`\\b${esc}\\b`, "i").test(text);
    } catch {
      return text.toLowerCase().includes(L.toLowerCase());
    }
  });
}

/** Pick a concrete calendar title from conversation + user's saved activity labels. */
function extractBestScheduleTitle(
  userMessage: string,
  assistantMessage: string,
  broaderHistory: string | undefined,
  activityLabels: string[]
): string {
  const explicit = extractExplicitTitleFromAssistant(assistantMessage);
  if (explicit) return explicit;

  const fromPair = extractSessionTitle(userMessage, assistantMessage);
  if (fromPair && !isMetaScheduleTitle(fromPair)) {
    return canonicalizeActivityLabel(fromPair.replace(/\s+/g, " ").trim(), activityLabels).slice(0, 80);
  }

  const narrow = normalizeDigitsForParse(`${userMessage}\n${assistantMessage}`);
  const combined = normalizeDigitsForParse(`${userMessage}\n${assistantMessage}\n${broaderHistory ?? ""}`);

  // Profile labels: only match in current user + assistant turn (not broaderHistory).
  const matchingNarrow = longestMatchingActivityLabels(narrow, activityLabels);
  if (matchingNarrow.length > 0) {
    return matchingNarrow.sort((a, b) => b.length - a.length)[0].slice(0, 80);
  }

  const keywordTitles: [RegExp, string][] = [
    [/\b(gym|workout|lifting|lift\b|exercise|training)\b/i, "Gym"],
    [/\b(run|running|jog(?:ging)?)\b/i, "Run"],
    [/\b(swim|swimming)\b/i, "Swim"],
    [/\b(thesis|dissertation)\b/i, "Thesis"],
    [/\b(meeting|stand-?up|sync)\b/i, "Meeting"],
    [/\b(class|lecture|seminar)\b/i, "Class"],
    [/\b(homework|assignment|problem set|p-?set)\b/i, "Homework"],
    [/\b(macro|macroeconomics)\b/i, "Macroeconomics"],
    [/\b(microeconomics|microecon)\b/i, "Microeconomics"],
    [/\b(econometrics|econometric)\b/i, "Econometrics"],
    [/微观(?:经济)?(?:学)?/, "Microeconomics"],
    [/计量(?:经济)?(?:学)?/, "Econometrics"],
    [/健身|健身房|锻炼/, "Gym"],
    [/跑步/, "Run"],
    [/会议|开会/, "Meeting"],
  ];
  const keywordSorted = [...keywordTitles].sort((a, b) => b[1].length - a[1].length);
  for (const [re, title] of keywordSorted) {
    if (re.test(narrow)) return title;
  }
  for (const [re, title] of keywordSorted) {
    if (re.test(combined)) return title;
  }

  return "Scheduled block";
}

function extractTitleForProseRange(
  assistantMessage: string,
  range: { start: number; end: number; index: number },
  activityLabels: string[],
  userMessage: string,
  broaderHistory: string | undefined
): string {
  const explicit = extractExplicitTitleFromAssistant(assistantMessage);
  if (explicit) return explicit;

  const narrow = normalizeDigitsForParse(`${userMessage}\n${assistantMessage}`);
  const matchingNarrow = longestMatchingActivityLabels(narrow, activityLabels);
  if (matchingNarrow.length > 0) {
    return matchingNarrow.sort((a, b) => b.length - a.length)[0].slice(0, 80);
  }

  const sliceFrom = range.index;
  const segment = assistantMessage.slice(sliceFrom, sliceFrom + 220);
  const headMatch = segment.match(
    /^(\d{1,2}):(\d{2})(?:\s*(?:AM|PM|am|pm))?\s*[-–至到～~]\s*(\d{1,2}):(\d{2})(?:\s*(?:AM|PM|am|pm))?/
  );
  const consumed = headMatch?.[0].length ?? 0;
  const after = segment.slice(consumed, consumed + 130);
  const forEn = after.match(
    /^\s*(?:for|用于|：|:|，|,)?\s*([A-Za-z][A-Za-z\s\-]{2,52}?)(?=\s*[,.，。、和及\n]|$)/i
  );
  if (forEn) {
    const raw = forEn[1].trim();
    if (!isMetaScheduleTitle(raw)) {
      return canonicalizeActivityLabel(raw, activityLabels).slice(0, 80);
    }
  }
  const im = after.search(/(?:微观(?:经济)?(?:学)?|Microeconomics)/i);
  const ie = after.search(/(?:计量(?:经济)?(?:学)?|Econometrics)/i);
  if (im >= 0 && (ie < 0 || im <= ie)) return "Microeconomics";
  if (ie >= 0 && (im < 0 || ie < im)) return "Econometrics";
  const micro = segment.match(/\b(Microeconomics|Econometrics|Macroeconomics)\b/i);
  if (micro) return micro[1];
  const zhCourse = after.match(/^[\s，,]*([\u4e00-\u9fff]{2,18}(?:学|论)?)(?=\s*[,.，。、和及\n]|$)/);
  if (zhCourse && !isMetaScheduleTitle(zhCourse[1])) return zhCourse[1].trim().slice(0, 80);
  return extractBestScheduleTitle(userMessage, assistantMessage, broaderHistory, activityLabels);
}

/** Returns true when text contains a recognizable clock time. */
function containsAnyTime(text: string): boolean {
  return /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b|点|上午|下午|晚上|早上|早晨|\d{1,2}\s*[-–]\s*\d{1,2}\s*点/i.test(text);
}

/** Returns true when either side of the conversation shows scheduling intent. */
function hasSchedulingIntent(userText: string, assistantText: string): boolean {
  return /要|帮我|添加|安排|建议|空出|focus|block|schedule|assignment|作业|学习|专注|apply\s*to\s*calendar|应用到日历|put\s+your|schedule\s+your|reserve\s+your|should\s+i|would\s+you\s+like|要不要|可以吗|调度|时段/i.test(
    `${userText}\n${assistantText}`
  );
}

function hasRemoveIntent(text: string): boolean {
  return /删[除掉]|[把那]个\s*(去掉?|删了?)|移除|cancel|delete|remove|别加|不要\s*(加|安排|添加)|不必\s*(加|安排)|停止|不\s*(要|加).*(gym|健身|计量|微观|宏观|作业|assignment|focus|block)|不要了/i.test(text);
}

function findAgentEventToRemove(
  userText: string,
  existingEvents: Array<{ id: string; title: string; dayIdx: number; start: number; end: number; isoDate?: string }>
): string | null {
  if (existingEvents.length === 0) return null;

  const lower = userText.toLowerCase();

  // Keyword-level match
  const keywordMap: [RegExp, RegExp][] = [
    [/\b(gym|workout)\b/i, /\b(gym|workout)\b/i],
    [/\b(microeconomics|微观)\b/i, /\b(micro|微观)\b/i],
    [/\b(econometrics|计量)\b/i, /\b(econometrics|计量)\b/i],
    [/\b(macroeconomics|宏观)\b/i, /\b(macro|宏观)\b/i],
  ];
  for (const [evRe, textRe] of keywordMap) {
    for (const ev of existingEvents) {
      if (evRe.test(ev.title) && textRe.test(lower)) return ev.id;
    }
  }

  // "this" / "that" → most recent agent event
  if (/这|那|那个|它/i.test(userText) && !/\b(周|星期)\b/.test(userText)) {
    return existingEvents[existingEvents.length - 1].id;
  }

  return null;
}

function inferScheduleFromConversation(
  userMessage: string,
  assistantMessage: string,
  now: Date,
  broaderHistory: string | undefined,
  activityLabels: string[]
): { title: string; dayIdx: number; start: number; end: number; isoDate?: string } | null {
  const combined = normalizeDigitsForParse(`${userMessage}\n${assistantMessage}\n${broaderHistory ?? ""}`);

  // Show button whenever assistant mentions a time AND either side has scheduling intent
  if (!containsAnyTime(combined)) return null;
  if (!hasSchedulingIntent(userMessage, assistantMessage)) return null;

  const hours = extractCnEnTimeRange(combined);
  if (!hours) {
    console.debug("[schedule] inferScheduleFromConversation: no time found in:", combined.slice(0, 120));
    return null;
  }
  const { start, end } = hours;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const { dayIdx, isoDate } = resolveDayForSchedule(assistantMessage, combined, now);
  const cleanTitle = extractBestScheduleTitle(userMessage, assistantMessage, broaderHistory, activityLabels);
  console.debug("[schedule] inferScheduleFromConversation: parsed:", { title: cleanTitle, start, end, dayIdx });
  return { title: cleanTitle, dayIdx, start, end, isoDate };
}

/** Prefer prose "10:00 to 12:30" over coarse SCHEDULE_UPDATE integers when they describe the same block. */
function mergeTagWithProseTimes(
  tag: { start: number; end: number },
  combined: string
): { start: number; end: number } {
  const prose = extractCnEnTimeRange(combined);
  if (!prose || prose.end <= prose.start) return { start: tag.start, end: tag.end };
  if (Math.abs(prose.start - tag.start) > 1.25) return { start: tag.start, end: tag.end };
  const proseHasSubHourPrecision =
    Math.abs((prose.start * 60) % 60) > 0.25 || Math.abs((prose.end * 60) % 60) > 0.25;
  if (
    proseHasSubHourPrecision &&
    Math.abs(prose.start - tag.start) <= 1 + 1e-6 &&
    prose.end <= tag.end + 1 / 60 &&
    prose.end > prose.start
  ) {
    return { start: prose.start, end: prose.end };
  }
  if (prose.end > tag.end + 0.05 || prose.start < tag.start - 0.05) {
    return { start: prose.start, end: prose.end };
  }
  if (prose.end - prose.start > tag.end - tag.start + 0.2) {
    return { start: prose.start, end: prose.end };
  }
  return { start: tag.start, end: tag.end };
}

type ParsedSchedule = { title: string; dayIdx: number; start: number; end: number; isoDate?: string };

function resolveAllSchedulesFromReply(
  userMessage: string,
  assistantMessage: string,
  now: Date,
  broaderHistory?: string,
  activityLabels: string[] = []
): ParsedSchedule[] {
  const combined = normalizeDigitsForParse(`${userMessage}\n${assistantMessage}\n${broaderHistory ?? ""}`);

  // Try parsing ALL [SCHEDULE_UPDATE] tags first (multi-task replies)
  const allTags = parseAllScheduleUpdatesFromText(assistantMessage);
  console.log('[DEBUG] parseAllScheduleUpdatesFromText found:', allTags.length, 'tags');
  console.log('[DEBUG] Assistant message:', assistantMessage);
  if (allTags.length > 0) {
    return allTags.map((parsedTag) => {
      const { start, end } = mergeTagWithProseTimes(parsedTag, combined);
      const generic = /^(focus\s*block|deep\s*work(\s*block)?|calendar\s*(block|event)?|scheduled\s*block)$/i.test(
        parsedTag.title.trim()
      );
      const title = generic
        ? extractBestScheduleTitle(userMessage, assistantMessage, broaderHistory, activityLabels)
        : canonicalizeActivityLabel(parsedTag.title.trim(), activityLabels);
      return { ...parsedTag, start, end, title };
    });
  }

  if (!containsAnyTime(combined) || !hasSchedulingIntent(userMessage, assistantMessage)) return [];

  const assistantNorm = normalizeDigitsForParse(assistantMessage);
  const { dayIdx, isoDate } = resolveDayForSchedule(assistantMessage, combined, now);
  const ranges = extractAllColonTimeRanges(assistantNorm);

  if (ranges.length >= 2) {
    return ranges.map((r) => ({
      title: extractTitleForProseRange(assistantMessage, r, activityLabels, userMessage, broaderHistory),
      dayIdx,
      start: r.start,
      end: r.end,
      isoDate,
    }));
  }
  if (ranges.length === 1) {
    return [
      {
        title: extractTitleForProseRange(assistantMessage, ranges[0], activityLabels, userMessage, broaderHistory),
        dayIdx,
        start: ranges[0].start,
        end: ranges[0].end,
        isoDate,
      },
    ];
  }

  const one = inferScheduleFromConversation(userMessage, assistantMessage, now, broaderHistory, activityLabels);
  return one ? [one] : [];
}

function resolveScheduleFromReply(
  userMessage: string,
  assistantMessage: string,
  now: Date,
  broaderHistory?: string,
  activityLabels: string[] = []
): ParsedSchedule | null {
  const all = resolveAllSchedulesFromReply(userMessage, assistantMessage, now, broaderHistory, activityLabels);
  return all[0] ?? null;
}

function normalizeTitleForMerge(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function titlesLikelySame(a: string, b: string): boolean {
  const na = normalizeTitleForMerge(a);
  const nb = normalizeTitleForMerge(b);
  if (!na || !nb) return na === nb;
  if (na === nb) return true;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length > nb.length ? na : nb;
  if (short.length >= 6 && long.includes(short)) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen < 6) return false;
  const prefixLen = Math.min(12, minLen);
  return na.slice(0, prefixLen) === nb.slice(0, prefixLen);
}

/** True only when intervals overlap with positive duration (not merely back-to-back, e.g. 12–1 and 1–3 stay separate). */
function intervalsStrictlyOverlap(a: CalendarGridEvent, b: CalendarGridEvent): boolean {
  const lo = Math.max(a.start, b.start);
  const hi = Math.min(a.end, b.end);
  return lo < hi - 1e-6;
}

/** Connected components by strict time overlap: events in different components never overlap, so each can use full column width. */
function clusterEventsByTimeOverlap(dayEvs: CalendarGridEvent[]): CalendarGridEvent[][] {
  const n = dayEvs.length;
  if (n === 0) return [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (intervalsStrictlyOverlap(dayEvs[i], dayEvs[j])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const visited = new Array(n).fill(false);
  const clusters: CalendarGridEvent[][] = [];
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const comp: CalendarGridEvent[] = [];
    const stack = [i];
    visited[i] = true;
    while (stack.length > 0) {
      const u = stack.pop()!;
      comp.push(dayEvs[u]);
      for (const v of adj[u]) {
        if (!visited[v]) {
          visited[v] = true;
          stack.push(v);
        }
      }
    }
    clusters.push(comp);
  }
  return clusters;
}

/** Greedy lane packing within one overlap cluster only (laneCount is never inflated by unrelated events on the same day). */
function assignLanesInCluster(comp: CalendarGridEvent[]): Map<string, { laneIndex: number; laneCount: number }> {
  const sorted = [...comp].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const map = new Map<string, { laneIndex: number; laneCount: number }>();
  for (const ev of sorted) {
    const occupied = laneEnds.findIndex((end) => end <= ev.start);
    const lane = occupied >= 0 ? occupied : laneEnds.length;
    laneEnds[lane] = ev.end;
    map.set(ev.id, { laneIndex: lane, laneCount: 0 });
  }
  const total = laneEnds.length;
  for (const ev of sorted) {
    const prev = map.get(ev.id)!;
    map.set(ev.id, { ...prev, laneCount: total });
  }
  return map;
}

/** Merge duplicate overlapping slots for the same course on the same day (e.g. two ICS rows for 12–2 and 13–15). Adjacent slots are not merged. */
function mergeCalendarEventsForDisplay(events: CalendarGridEvent[]): CalendarGridEvent[] {
  const byDay = new Map<number, CalendarGridEvent[]>();
  for (const ev of events) {
    const list = byDay.get(ev.dayIdx) ?? [];
    list.push(ev);
    byDay.set(ev.dayIdx, list);
  }
  const out: CalendarGridEvent[] = [];
  for (const [, dayEvs] of Array.from(byDay)) {
    const sorted = [...dayEvs].sort((a, b) => a.start - b.start || a.end - b.end);
    const stack: CalendarGridEvent[] = [];
    for (const ev of sorted) {
      const last = stack[stack.length - 1];
      if (last && titlesLikelySame(last.title, ev.title) && intervalsStrictlyOverlap(last, ev)) {
        last.start = Math.min(last.start, ev.start);
        last.end = Math.max(last.end, ev.end);
        if (normalizeTitleForMerge(ev.title).length > normalizeTitleForMerge(last.title).length) {
          last.title = ev.title;
        }
        last.id = `${last.id}~${ev.id}`;
        last.isFixed = last.isFixed && ev.isFixed;
      } else {
        stack.push({ ...ev });
      }
    }
    out.push(...stack);
  }
  return out;
}

// ============================================================================
// SKELETON LOADER COMPONENTS
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans">
      <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:py-8">
        <div className="rounded-2xl bg-white px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] animate-pulse">
          <div className="h-3.5 w-96 bg-gray-100 rounded-lg" />
          <div className="mt-2.5 h-3.5 w-[560px] bg-gray-100 rounded-lg" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_7fr]">
          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] animate-pulse">
            <div className="rounded-t-2xl border-b border-gray-100 px-6 py-5">
              <div className="h-3.5 w-40 bg-gray-100 rounded-lg" />
            </div>
            <div className="px-6 py-5">
              <div className="h-[440px] rounded-2xl border border-gray-100 bg-gray-50" />
              <div className="mt-4 h-12 rounded-2xl border border-gray-100 bg-white" />
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] animate-pulse">
            <div className="rounded-t-2xl border-b border-gray-100 px-6 py-5">
              <div className="h-3.5 w-32 bg-gray-100 rounded-lg" />
            </div>
            <div className="px-6 py-5">
              <div className="h-[560px] rounded-2xl border border-gray-100 bg-gray-50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ERROR COMPONENT
// ============================================================================

function ErrorDisplay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="rounded-2xl bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.07)] text-center space-y-4 max-w-sm mx-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto text-rose-500">
          <SparkleIcon />
        </div>
        <div className="text-base font-semibold text-slate-900">Connection Error</div>
        <div className="text-sm text-slate-500 leading-relaxed">{message}</div>
        <button
          onClick={onRetry}
          className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// DASHBOARD COMPONENT
// ============================================================================

function DashboardContent() {
  const [userData, setUserData] = useState<EquiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  /** Agent/AI-added events (persisted to user_data.calendarAgentEvents). */
  const [agentCalendarEvents, setAgentCalendarEvents] = useState<Array<{
    id: string;
    title: string;
    dayIdx: number;
    start: number;
    end: number;
    isoDate?: string;
  }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const messagesSnapshotRef = useRef<Message[]>([]);
  const [calendarDetail, setCalendarDetail] = useState<CalendarGridEvent | null>(null);
  /** While non-null, a calendar apply is in progress (Gemini title + persist). */
  const [calendarApplyLoadingId, setCalendarApplyLoadingId] = useState<string | null>(null);
  /** Auto-healing state */
  const [isHealing, setIsHealing] = useState(false);

  // ---------------------------------------------------------------------------
  // Delete an agent event by id from all state + Supabase.
  // ---------------------------------------------------------------------------
  const deleteAgentEvent = async (eventId: string) => {
    setAgentCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
    setCalendarDetail(null);
    if (!userData) return;
    const updated: EquiUser = {
      ...userData,
      calendarAgentEvents: (userData.calendarAgentEvents ?? []).filter((e) => e.id !== eventId),
    };
    setUserData(updated);
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_data: updated }),
    });
  };

  // ---------------------------------------------------------------------------
  // Auto-Healing: Liquid Schedule Reorganization
  // ---------------------------------------------------------------------------
  const handleAutoHeal = async () => {
    if (!userData || isHealing || !supabase) return;

    setIsHealing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 提取未完成的任务
      const tasks = agentCalendarEvents
        .filter(e => !e.isoDate || new Date(e.isoDate) >= new Date())
        .map(e => ({
          id: e.id,
          title: e.title,
          duration: e.end - e.start,
          priority: 3,
          cognitiveLoad: "medium" as const
        }));

      const response = await fetch("/api/auto-heal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, tasks })
      });

      if (response.ok) {
        const { healed } = await response.json();

        // 更新日历事件
        const newEvents = healed.map((h: any) => ({
          id: generateId(),
          title: h.task.title,
          dayIdx: h.slot.dayIdx,
          start: h.slot.start,
          end: h.slot.end,
          isoDate: h.slot.isoDate
        }));

        setAgentCalendarEvents(newEvents);

        // 显示成功提示
        const toast = document.createElement("div");
        toast.innerHTML = `<div class="flex items-center gap-2"><span>🛟</span><span>日程已重组</span></div>`;
        toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold shadow-lg";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
      }
    } catch (error) {
      console.error("Auto-heal error:", error);
    } finally {
      setIsHealing(false);
    }
  };

  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingSession, setPendingSession] = useState<ConversationSession | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const userDataRef = useRef<EquiUser | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/equi/login";
  };

  // ============================================================================
  // Persist the active session's messages to Supabase via server API.
  const persistSession = async (sessionId: string, msgs: Message[]) => {
    if (!userData || !supabase) return;
    const sessions: ConversationSession[] = [
      ...(userData.conversationSessions ?? []).filter((s) => s.id !== sessionId),
      { id: sessionId, createdAt: new Date().toISOString(), messages: msgs },
    ];
    const merged: EquiUser = {
      ...userData,
      conversationSessions: sessions,
      activeSessionId: sessionId,
    };
    setUserData(merged);
    currentSessionIdRef.current = sessionId;

    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) return;
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_data: merged }),
    }).catch(() => {});
  };

  /** Insert a single message into conversation_messages (Layer 1). */
  const persistMessage = async (msg: Message, sessionId: string) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId, role: msg.role, content: msg.content }),
    }).catch(() => {});
  };

  /**
   * Load recent messages for a session from conversation_messages table.
   * Falls back to the JSONB session.messages if the table row is empty (migration period).
   */
  const loadSessionMessages = async (sessionId: string, jsonMessages?: Message[]): Promise<Message[]> => {
    const session = await supabase?.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return jsonMessages ?? [];
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/conversation?sessionId=${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return jsonMessages ?? [];
      const json = await res.json();
      if (Array.isArray(json.messages) && json.messages.length > 0) {
        return json.messages as Message[];
      }
    } catch {
      // fall through
    }
    return jsonMessages ?? [];
  };

  // Start a brand-new conversation session.
  const startNewSession = async () => {
    const newId = Math.random().toString(36).substring(2, 11);
    currentSessionIdRef.current = newId;
    setActiveSessionId(newId);
    setMessages([]);
    setShowResumeDialog(false);
    await generateOpeningMessage(newId);
  };

  // Resume a previous session.
  const continueSession = async (session: ConversationSession) => {
    currentSessionIdRef.current = session.id;
    setActiveSessionId(session.id);
    const msgs = await loadSessionMessages(session.id, session.messages);
    setMessages(msgs);
    setShowResumeDialog(false);
  };

  // CLEAN FETCH: Pure Supabase calls without localStorage hacks
  // ============================================================================
  const initializeDashboard = async (retryCount = 0) => {
    const MAX_RETRIES = 2;
    
    try {
      // 1. Lightweight auth check using getUser (not getSession - avoids polling deadlock)
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        throw new Error(`Authentication failed: ${authError.message}`);
      }

      if (!user) {
        window.location.href = "/equi/login";
        return;
      }

      // 2. Precise profile fetch using maybeSingle
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(`Failed to load profile: ${profileError.message}`);
      }

      // 3. Check onboarding status
      if (!profile || !profile.onboarding_completed) {
        window.location.href = "/equi/onboarding";
        return;
      }

      // 4. Success - set user data from cloud
      if (isMountedRef.current) {
        const ud = profile.user_data as EquiUser;
        setUserData(ud);

        // Check if there's a previous session to offer resume
        const activeId = ud.activeSessionId;
        if (activeId) {
          const prevSession = (ud.conversationSessions ?? []).find((s) => s.id === activeId);
          if (prevSession && prevSession.messages.length > 0) {
            setPendingSession(prevSession);
            setShowResumeDialog(true);
          }

          // Load messages from conversation_messages table (Layer 1)
          const msgs = await loadSessionMessages(activeId, prevSession?.messages);
          if (msgs.length > 0) {
            setMessages(msgs);
          }
        }
        setIsLoading(false);
      }

    } catch (err: any) {
      // Retry logic
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        if (isMountedRef.current) {
          initializeDashboard(retryCount + 1);
        }
        return;
      }
      
      // Show real error after all retries failed
      if (isMountedRef.current) {
        setError(err?.message || "Failed to connect to database");
        setIsLoading(false);
      }
    }
  };

  // Mount effect
  useEffect(() => {
    initializeDashboard();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Real-time auth listener
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        initializeDashboard();
      } else if (event === "SIGNED_OUT") {
        window.location.href = "/equi/login";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Scroll to bottom when messages change or load
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      console.log('[DEBUG] Scrolling chat to bottom, messages:', messages.length);
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Initial scroll to bottom after loading completes
  useEffect(() => {
    if (!isLoading && messages.length > 0 && messagesContainerRef.current) {
      console.log('[DEBUG] Initial scroll after loading, messages:', messages.length);
      setTimeout(() => {
        if (messagesContainerRef.current) {
          console.log('[DEBUG] Executing scroll, scrollHeight:', messagesContainerRef.current.scrollHeight);
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [isLoading]);

  // Keep snapshot ref in sync so async persistSession reads fresh messages.
  useEffect(() => {
    messagesSnapshotRef.current = messages;
    userDataRef.current = userData;
  }, [messages]);

  // Auto-trigger opening message (only when no resume dialog is pending)
  useEffect(() => {
    if (userData && messages.length === 0 && !showResumeDialog) {
      startNewSession();
    }
  }, [userData, showResumeDialog]);

  // Derive fixed events from userData (memoised so agent events are never clobbered).
  const fixedCalendarEvents = useMemo(() => {
    if (!userData) return [];
    const weekdayToShort: Record<string, string> = {
      Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
      Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
    };
    const events: Array<{ id: string; title: string; dayIdx: number; start: number; end: number; isFixed: boolean }> = [];
    const seen = new Set<string>();
    const fixedActivities = userData.lifeStructure?.fixedActivities || [];
    for (const activity of Array.isArray(fixedActivities) ? fixedActivities : []) {
      if (activity?.activityType === "strictlyFixed" && Array.isArray(activity?.slots)) {
        for (const slot of activity.slots) {
          if (slot?.day == null || slot?.startHour == null || slot?.endHour == null) continue;
          const uid = `${slot.day}|${slot.startHour}|${slot.startMinute}|${slot.endHour}`;
          if (seen.has(uid)) continue;
          seen.add(uid);
          const shortDay = weekdayToShort[slot.day] || slot.day;
          const dayIdx = DAYS.indexOf(shortDay as typeof DAYS[number]);
          if (dayIdx < 0) continue;
          const start = (slot.startHour ?? 0) + ((slot.startMinute ?? 0) / 60);
          const end   = (slot.endHour   ?? 0) + ((slot.endMinute   ?? 0) / 60);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
          events.push({ id: uid, title: activity.label || "Untitled", dayIdx, start, end, isFixed: true });
        }
      }
    }
    return events;
  }, [userData]);

  // Initialise agent events from persisted profile data.
  useEffect(() => {
    if (!userData) return;
    const saved = userData.calendarAgentEvents ?? [];
    if (saved.length > 0) {
      setAgentCalendarEvents(saved.map((e) => ({
        id: e.id,
        title: e.title,
        dayIdx: e.dayIdx,
        start: e.start,
        end: e.end,
        isoDate: e.isoDate,
      })));
    }
  }, [userData]);

  // ---------------------------------------------------------------------------
  // Persist a new agent event to Supabase via server route (bypasses RLS).
  // ---------------------------------------------------------------------------
  const persistAgentEvent = async (newEvent: { id: string; title: string; dayIdx: number; start: number; end: number; isoDate?: string }) => {
    console.log('[DEBUG] persistAgentEvent called with:', newEvent);
    const overlapsSlot = (a: { dayIdx: number; start: number; end: number; isoDate?: string }) => {
      if (a.dayIdx !== newEvent.dayIdx) return false;
      // isoDate: if both set they must match; if either unset (recurring) treat as same day
      if (a.isoDate && newEvent.isoDate && a.isoDate !== newEvent.isoDate) return false;
      const lo = Math.max(a.start, newEvent.start);
      const hi = Math.min(a.end, newEvent.end);
      const overlaps = lo < hi - 1e-6;
      if (overlaps) console.log('[DEBUG] Overlap detected between new event', newEvent.title);
      return overlaps;
    };

    // 1. Replace any overlapping agent blocks on the same day/date (avoid stale "Focus block" under new "Gym").
    setAgentCalendarEvents((prev) => {
      const filtered = prev.filter((e) => !overlapsSlot(e));
      console.log('[DEBUG] After filtering, remaining events:', filtered.length, 'Adding:', newEvent.title);
      return [...filtered, newEvent];
    });

    if (!userData) return;

    const newAgentEvents = [
      ...(userData.calendarAgentEvents ?? []).filter((e) => !overlapsSlot(e)),
      { ...newEvent, createdAt: new Date().toISOString() },
    ];

    const merged: EquiUser = { ...userData, calendarAgentEvents: newAgentEvents };

    // 2. Update local React state so the useMemo re-derives the calendar display.
    setUserData(merged);

    // 3. Persist through server-side API (uses service role key, no RLS issues).
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_data: merged }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[persistAgentEvent] Server write failed:", err.error);
    }
  };

  const generateOpeningMessage = async (sessionId?: string) => {
    if (!userData) return;

    const { name, mbti, biologicalClock, preferredAgentPersona } = userData.understanding || {};
    const sid = sessionId ?? currentSessionIdRef.current;
    const allChunks = generateUserContextChunks(userData);
    const fixedActivitiesSummary = allChunks[3] ?? "";
    const flexibleActivitiesSummary = allChunks[4] ?? "";

    try {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localTimeStr = new Date().toLocaleString("en-US", {
        timeZone: userTimezone,
        dateStyle: "full",
        timeStyle: "short",
      });
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          isGreeting: true,
          timezone: userTimezone,
          localTimeStr,
          userData: {
            name,
            mbti,
            focusPeaks: biologicalClock?.focusPeaks,
            energyDips: biologicalClock?.energyDips,
            preferredAgentPersona,
            fixedActivitiesSummary,
            flexibleActivitiesSummary,
          },
        }),
      });
      const data = await response.json();

      const browserHour = new Date().getHours();
      const browserGreeting =
        browserHour < 12 ? "Good morning" : browserHour < 17 ? "Good afternoon" : "Good evening";
      const fallbackMsg = `${browserGreeting}. What would you like to accomplish today?`;

      const openingMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: data.openingMessage || fallbackMsg,
        timestamp: new Date().toISOString(),
      };

      const msgs = [openingMessage];
      setMessages(msgs);
      if (sid) persistSession(sid, msgs);
    } catch (error) {
      console.error("Failed to generate opening message:", error);
      const browserHour = new Date().getHours();
      const browserGreeting =
        browserHour < 12 ? "Good morning" : browserHour < 17 ? "Good afternoon" : "Good evening";
      const fallbackMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: `${browserGreeting}. What would you like to accomplish today?`,
        timestamp: new Date().toISOString(),
      };
      const msgs = [fallbackMessage];
      setMessages(msgs);
      if (sid) persistSession(sid, msgs);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);

    // Layer 1: persist user message to conversation_messages table
    const sid = currentSessionIdRef.current;
    persistMessage(userMessage, sid ?? "");

    // Use snapshot to avoid stale closure.
    const currentMsgs = messagesSnapshotRef.current;
    const conversationHistory = [...currentMsgs, userMessage].map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: m.content,
    }));

    const allChunks = userData ? generateUserContextChunks(userData) : [];
    const fixedActivitiesSummary = allChunks[3] ?? "";
    const flexibleActivitiesSummary = allChunks[4] ?? "";

    const userContext = {
      name: userData?.understanding?.name,
      mbti: userData?.understanding?.mbti,
      focusPeaks: userData?.understanding?.biologicalClock?.focusPeaks,
      energyDips: userData?.understanding?.biologicalClock?.energyDips,
      preferredAgentPersona: userData?.understanding?.preferredAgentPersona,
      fixedActivitiesSummary,
      flexibleActivitiesSummary,
      existingEvents: agentCalendarEvents.map(e => ({
        title: e.title,
        day: DAYS[e.dayIdx],
        start: e.start,
        end: e.end
      }))
    };

    try {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localTimeStr = new Date().toLocaleString("en-US", {
        timeZone: userTimezone,
        dateStyle: "full",
        timeStyle: "short",
      });
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory,
          timezone: userTimezone,
          localTimeStr,
          userData: userContext,
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage.content += chunk;

        setMessages((prev) =>
          prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantMessage.content } : m)
        );
      }

      const broaderHistory = (messagesSnapshotRef.current ?? [])
        .slice(0, -2) // exclude the new user message + just-added assistant message
        .slice(-6)    // last 6 messages for context
        .map((m) => m.content)
        .join("\n");

      const activityLabelHints = (userData?.lifeStructure?.fixedActivities ?? [])
        .map((a) => a.label?.trim())
        .filter((s): s is string => !!s && s.length > 0);

      // Remove intent: auto-delete instead of add
      if (hasRemoveIntent(userMessage.content)) {
        const toRemove = findAgentEventToRemove(userMessage.content, userData?.calendarAgentEvents ?? []);
        if (toRemove) {
          await deleteAgentEvent(toRemove);
        }
      } else {
        const schedules = resolveAllSchedulesFromReply(
          userMessage.content,
          assistantMessage.content,
          new Date(),
          broaderHistory,
          activityLabelHints
        );
        console.log('[DEBUG] schedules to persist:', schedules.length, schedules);

        if (schedules.length > 0) {
          // Batch add all schedules at once to avoid state race condition
          const newEvents = schedules.map((s, i) => ({
            id: `auto-${assistantMessage.id}-${Date.now()}-${i}`,
            title: s.title,
            dayIdx: s.dayIdx,
            start: s.start,
            end: s.end,
            isoDate: s.isoDate,
            createdAt: new Date().toISOString(),
          }));

          setAgentCalendarEvents((prev) => [...prev, ...newEvents]);

          if (userData && supabase) {
            const merged: EquiUser = {
              ...userData,
              calendarAgentEvents: [...(userData.calendarAgentEvents ?? []), ...newEvents],
            };
            setUserData(merged);

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ user_data: merged }),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "Sorry — I hit a snag. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
      const sid = currentSessionIdRef.current;
      if (!sid) return;

      const finalMessages = messagesSnapshotRef.current;
      persistSession(sid, finalMessages);

      // Layer 1: persist assistant message (only available if try block succeeded)
      if (finalMessages.length > 0) {
        const lastMsg = finalMessages[finalMessages.length - 1];
        if (lastMsg?.role === "assistant") persistMessage(lastMsg, sid);
      }

      // Layer 2: Memory counter — trigger extraction every N exchanges
      const currentCount = finalMessages.length;
      const EXTRACT_EVERY = 10;
      if (currentCount > 0 && currentCount % EXTRACT_EVERY === 0) {
        const ud = userDataRef.current;
        const session = await supabase?.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (token && ud?.id) {
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/memory-extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId: ud.id, sessionId: sid }),
          }).catch(() => {});
        }
      } else {
        const ud = userDataRef.current;
        const session = await supabase?.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (token && ud?.id) {
          const ltm = ud.agentBrain?.longTermMemory ?? {};
          fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              user_data: {
                ...ud,
                agentBrain: {
                  ...(ud.agentBrain ?? {}),
                  longTermMemory: {
                    ...ltm,
                    conversationMessagesSinceLastExtract: (ltm.conversationMessagesSinceLastExtract ?? 0) + 1,
                  },
                },
              },
            }),
          }).catch(() => {});
        }
      }
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Calendar time calculations - must be BEFORE early returns
  const headerHeight = 44;
  const hourRowHeight = 96; // h-24 = 96px per hour (50% more vertical space)

  // Get current time for the red line
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeTop = headerHeight + (currentHour * hourRowHeight) + (currentMinute / 60) * hourRowHeight;

  // Auto-scroll to current time on mount - must be BEFORE early returns
  useEffect(() => {
    // Scroll to 8:30 AM after loading completes
    if (!isLoading && calendarScrollRef.current) {
      // Scroll to 8am (8 hours * 60px per hour = 480px)
      const timer = setTimeout(() => {
        calendarScrollRef.current!.scrollTop = 480;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!calendarDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calendarDetail]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={() => { setError(null); setIsLoading(true); initializeDashboard(); }} />;
  }

  if (showResumeDialog && pendingSession) {
    const preview = pendingSession.messages[pendingSession.messages.length - 1];
    const dateStr = new Date(pendingSession.createdAt).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.10)] p-8 text-center animate-[fade-up_0.3s_ease-out]">
          {/* Avatar / icon */}
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-500 mb-5">
            <SparkleIcon />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Continue where you left off?</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            You have an unfinished conversation from {dateStr}.
          </p>

          {/* Last message preview */}
          {preview && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 mb-6 text-left">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Last message
              </div>
              <div className="text-sm text-slate-600 line-clamp-2 italic">
                &ldquo;{preview.content}&rdquo;
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => continueSession(pendingSession)}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Continue conversation
            </button>
            <button
              onClick={startNewSession}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Start fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-2xl bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.07)] text-center space-y-4 max-w-sm mx-4">
          <div className="text-base font-semibold text-slate-900">No user data found</div>
          <a href="/equi/onboarding" className="text-sm underline text-slate-500 mt-2 block hover:text-slate-700 transition-colors duration-200">
            Go to Onboarding
          </a>
        </div>
      </div>
    );
  }

  const name = userData?.understanding?.name || "User";

  const scheduleActivityLabelHints = (userData.lifeStructure?.fixedActivities ?? [])
    .map((a) => a.label?.trim())
    .filter((s): s is string => !!s && s.length > 0);

  // Week column dates: Monday of the current week (using local time) as ISO strings.
  const userTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const monOffset = dow === 0 ? -6 : 1 - dow; // Mon-based offset
  const monday = new Date(today);
  monday.setDate(today.getDate() + monOffset);
  monday.setHours(0, 0, 0, 0);
  const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toLocaleDateString("en-US", { timeZone: userTz, month: "short", day: "numeric" });
  });
  // ISO date strings for each column, for one-off event filtering (e.g. "2026-03-23").
  const columnIsoDates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const weekRangeLabel = `${weekDates[0]} – ${weekDates[6]}`;
  const startHour = 0;
  const endHour = 23;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const hourLabel = (h: number) => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    if (h < 12) return `${h} AM`;
    return `${h - 12} PM`;
  };

  const gridColForDayIdx = (dayIdx: number) => dayIdx + 2; // +2 because col 1 is time labels, col 2+ are days
  const gridRowForHour = (h: number) => h + 2; // +2 because row 1 is header, row 2 = hour 0

  const focusPeakStart = 10;
  const focusPeakEnd = 13;
  const dipStart = 21;

  let greetingTime = "Good evening";
  if (currentHour < 12) {
    greetingTime = "Good morning";
  } else if (currentHour < 18) {
    greetingTime = "Good afternoon";
  }

  const submitQuickAction = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    // Use snapshot to avoid stale closure.
    const currentMsgs = messagesSnapshotRef.current;
    const conversationHistory = [...currentMsgs, userMessage].map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: m.content,
    }));

    const allChunks = userData ? generateUserContextChunks(userData) : [];
    const fixedActivitiesSummary = allChunks[3] ?? "";
    const flexibleActivitiesSummary = allChunks[4] ?? "";

    const userContext = {
      name: userData?.understanding?.name,
      mbti: userData?.understanding?.mbti,
      focusPeaks: userData?.understanding?.biologicalClock?.focusPeaks,
      energyDips: userData?.understanding?.biologicalClock?.energyDips,
      preferredAgentPersona: userData?.understanding?.preferredAgentPersona,
      fixedActivitiesSummary,
      flexibleActivitiesSummary,
      existingEvents: agentCalendarEvents.map(e => ({
        title: e.title,
        day: DAYS[e.dayIdx],
        start: e.start,
        end: e.end
      }))
    };

    try {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localTimeStr = new Date().toLocaleString("en-US", {
        timeZone: userTimezone,
        dateStyle: "full",
        timeStyle: "short",
      });
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory,
          timezone: userTimezone,
          localTimeStr,
          userData: userContext,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Chat API error:", response.status, errorText);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage.content += chunk;

        setMessages((prev) =>
          prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantMessage.content } : m))
        );
      }

      const broaderHistory = (messagesSnapshotRef.current ?? [])
        .slice(0, -2)
        .slice(-6)
        .map((m) => m.content)
        .join("\n");

      const activityLabelHints = (userData?.lifeStructure?.fixedActivities ?? [])
        .map((a) => a.label?.trim())
        .filter((s): s is string => !!s && s.length > 0);

      // Remove intent: auto-delete instead of add
      if (hasRemoveIntent(userMessage.content)) {
        const toRemove = findAgentEventToRemove(userMessage.content, userData?.calendarAgentEvents ?? []);
        if (toRemove) {
          await deleteAgentEvent(toRemove);
        }
      } else {
        const schedules = resolveAllSchedulesFromReply(
          userMessage.content,
          assistantMessage.content,
          new Date(),
          broaderHistory,
          activityLabelHints
        );
        console.log('[DEBUG] schedules to persist:', schedules.length, schedules);

        if (schedules.length > 0) {
          // Batch add all schedules at once to avoid state race condition
          const newEvents = schedules.map((s, i) => ({
            id: `auto-${assistantMessage.id}-${Date.now()}-${i}`,
            title: s.title,
            dayIdx: s.dayIdx,
            start: s.start,
            end: s.end,
            isoDate: s.isoDate,
            createdAt: new Date().toISOString(),
          }));

          setAgentCalendarEvents((prev) => [...prev, ...newEvents]);

          if (userData && supabase) {
            const merged: EquiUser = {
              ...userData,
              calendarAgentEvents: [...(userData.calendarAgentEvents ?? []), ...newEvents],
            };
            setUserData(merged);

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ user_data: merged }),
              });
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Error sending message:", error?.message || error);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: `Sorry — I hit a snag: ${error?.message || "Unknown error"}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
      const sid = currentSessionIdRef.current;
      if (sid) persistSession(sid, messagesSnapshotRef.current);
    }
  };

  // Combine fixed (from onboarding) and agent (AI-added) events for display.
  const allCalendarEvents: CalendarGridEvent[] = [
    ...fixedCalendarEvents,
    ...agentCalendarEvents.map((e) => ({ ...e, isFixed: false })),
  ];

  const uniqueVisualEvents = mergeCalendarEventsForDisplay(
    Array.from(new Map(allCalendarEvents.map((e) => [e.id, e])).values())
  );

  // Lanes only among events that overlap in time (same connected component). Non-overlapping events stay full width.
  const eventLaneMap: Map<string, { laneIndex: number; laneCount: number }> = new Map();
  {
    const byDay: Map<number, CalendarGridEvent[]> = new Map();
    for (const ev of uniqueVisualEvents) {
      if (!Number.isFinite(ev.dayIdx)) continue;
      const list = byDay.get(ev.dayIdx) ?? [];
      list.push(ev);
      byDay.set(ev.dayIdx, list);
    }
    for (const [, evs] of Array.from(byDay)) {
      for (const comp of clusterEventsByTimeOverlap(evs)) {
        const local = assignLanesInCluster(comp);
        for (const [id, info] of Array.from(local)) {
          eventLaneMap.set(id, info);
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans">
      <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:py-8">
        {/* Top: Executive Briefing */}
        <div className="w-full rounded-2xl bg-white px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0" aria-hidden="true">
              <SparkleIcon />
            </div>
            <div className="text-sm leading-relaxed text-slate-700">
              <span className="font-semibold text-slate-900">{greetingTime}, {name}.</span>{" "}
              Your focus peaks at 10 AM today. I&apos;ve optimized your deep-work blocks accordingly.
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <div className="font-medium tracking-wide uppercase text-[11px] text-slate-400 letter-spacing-wider">
              Executive Copilot &middot; Weekly view
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/equi/settings"
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-gray-50 hover:text-slate-900 transition-colors duration-200 cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Settings
              </a>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-gray-50 hover:text-slate-900 transition-colors duration-200 cursor-pointer"
              >
                <LogoutIcon />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Bottom: 30/70 split */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_7fr]">
          {/* Left Panel: Copilot Chat */}
          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="rounded-t-2xl border-b border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900 tracking-tight">Executive Copilot</div>
                <div className="text-xs text-slate-400 font-medium">
                  {isStreaming ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Thinking&hellip;
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Ready
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div ref={messagesContainerRef} className="overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50/60 p-4 text-sm text-slate-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: "calc(100vh - 360px)" }}>
                <div className="space-y-3.5">
                  {messages.map((m, i) => {
                    const prev = i > 0 ? messages[i - 1] : null;
                    // Build broader context: previous messages (excluding current assistant msg itself)
                    const broaderHistory = messages.slice(Math.max(0, i - 6), i).map((x) => x.content).join("\n");
                    const pairedUserContent =
                      m.role === "assistant" && prev?.role === "user" ? prev.content : "";
                    const scheduleForUi =
                      m.role === "assistant"
                        ? resolveAllSchedulesFromReply(
                            pairedUserContent,
                            m.content,
                            new Date(),
                            broaderHistory,
                            scheduleActivityLabelHints
                          ).length > 0
                        : false;
                    return (
                    <div
                      key={m.id}
                      className={
                        m.role === "user"
                          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-gray-200 bg-white px-4 py-3 text-slate-700 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                          : "max-w-[85%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 text-slate-800 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                      }
                    >
                      {stripScheduleUpdateLines(m.content)}
                      {scheduleForUi && !isStreaming && (
                        <button
                          type="button"
                          disabled={calendarApplyLoadingId !== null || isStreaming}
                          onClick={async () => {
                            const list = resolveAllSchedulesFromReply(
                              pairedUserContent,
                              m.content,
                              new Date(),
                              broaderHistory,
                              scheduleActivityLabelHints
                            );
                            if (list.length === 0) return alert("Failed to parse schedule from this message.");
                            setCalendarApplyLoadingId(m.id);
                            try {
                              let titles = list.map((p) => p.title);
                              try {
                                const auth = await supabase?.auth.getSession();
                                const token = auth?.data?.session?.access_token;
                                if (token) {
                                  const slots = list.map((parsed) => ({
                                    slotLabel: `${DAYS[parsed.dayIdx]} ${formatDecimalHourForDisplay(parsed.start)}–${formatDecimalHourForDisplay(parsed.end)}${parsed.isoDate ? ` · ${parsed.isoDate}` : ""}`,
                                    fallbackTitle: parsed.title,
                                  }));
                                  const res = await fetch("/api/calendar-title", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      userMessage: pairedUserContent,
                                      assistantMessage: m.content,
                                      broaderHistory,
                                      activityLabels: scheduleActivityLabelHints,
                                      slots,
                                    }),
                                  });
                                  if (res.ok) {
                                    const data = (await res.json()) as { titles?: unknown };
                                    if (Array.isArray(data.titles) && data.titles.length === list.length) {
                                      titles = data.titles.map((t, i) => {
                                        const s = typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, 80) : "";
                                        return s || list[i].title;
                                      });
                                    }
                                  }
                                }
                              } catch (e) {
                                console.warn("[calendar] title API failed, using heuristic titles", e);
                              }
                              const t0 = Date.now();
                              const newEvents = list.map((parsed, i) => ({
                                id: `dynamic-${t0}-${i}`,
                                title: titles[i] ?? parsed.title,
                                dayIdx: parsed.dayIdx,
                                start: parsed.start,
                                end: parsed.end,
                                isoDate: parsed.isoDate,
                                createdAt: new Date().toISOString(),
                              }));

                              // Batch add all events at once
                              setAgentCalendarEvents((prev) => [...prev, ...newEvents]);

                              if (userData && supabase) {
                                const merged: EquiUser = {
                                  ...userData,
                                  calendarAgentEvents: [...(userData.calendarAgentEvents ?? []), ...newEvents],
                                };
                                setUserData(merged);

                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token;
                                if (token) {
                                  await fetch("/api/profile", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ user_data: merged }),
                                  });
                                }
                              }
                              const toast = document.createElement("div");
                              toast.textContent = "Schedule updated!";
                              toast.className =
                                "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold shadow-lg animate-[fade-up_0.3s_ease-out]";
                              document.body.appendChild(toast);
                              setTimeout(() => {
                                toast.style.opacity = "0";
                                toast.style.transition = "opacity 0.3s";
                                setTimeout(() => toast.remove(), 300);
                              }, 2800);
                            } finally {
                              setCalendarApplyLoadingId(null);
                            }
                          }}
                          className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-4 py-2.5 text-xs font-semibold text-amber-700 hover:from-amber-100 hover:to-orange-100 hover:border-amber-300 transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-50 disabled:hover:to-orange-50"
                        >
                          <SparkleIcon />
                          {calendarApplyLoadingId === m.id ? "Naming…" : "Apply to Calendar"}
                        </button>
                      )}
                      {m.role === "assistant" && !isStreaming && parseRescheduleTrigger(m.content) && (() => {
                        const trigger = parseRescheduleTrigger(m.content);
                        if (!trigger) return null;

                        const dayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
                        const suggestedDayIdx = dayMap[trigger.suggestedDay];

                        return (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={isHealing || isStreaming}
                              onClick={async () => {
                                const affectedTask = agentCalendarEvents.find(e =>
                                  e.title.toLowerCase().includes(trigger.taskTitle.toLowerCase()) ||
                                  trigger.taskTitle.toLowerCase().includes(e.title.toLowerCase())
                                );
                                if (affectedTask) {
                                  setAgentCalendarEvents(prev => prev.filter(e => e.id !== affectedTask.id));
                                  const toast = document.createElement("div");
                                  toast.textContent = "Task Cancelled";
                                  toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-rose-600 text-white px-5 py-2.5 text-sm font-semibold shadow-lg";
                                  document.body.appendChild(toast);
                                  setTimeout(() => toast.remove(), 2500);
                                }
                              }}
                              className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Cancel Task
                            </button>
                            <button
                              type="button"
                              disabled={isHealing || isStreaming}
                              onClick={async () => {
                                const affectedTask = agentCalendarEvents.find(e =>
                                  e.title.toLowerCase().includes(trigger.taskTitle.toLowerCase()) ||
                                  trigger.taskTitle.toLowerCase().includes(e.title.toLowerCase())
                                );
                                if (affectedTask) {
                                  setAgentCalendarEvents(prev => [
                                    ...prev.filter(e => e.id !== affectedTask.id),
                                    {
                                      ...affectedTask,
                                      dayIdx: suggestedDayIdx,
                                      start: trigger.suggestedStart,
                                      end: trigger.suggestedEnd
                                    }
                                  ]);
                                  const toast = document.createElement("div");
                                  toast.innerHTML = `<div class="flex items-center gap-2"><span>🛟</span><span>Rescheduled to ${DAYS[suggestedDayIdx]} ${trigger.suggestedStart}:00-${trigger.suggestedEnd}:00</span></div>`;
                                  toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold shadow-lg";
                                  document.body.appendChild(toast);
                                  setTimeout(() => toast.remove(), 2500);
                                }
                              }}
                              className="flex-1 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 px-4 py-2.5 text-xs font-semibold text-blue-700 hover:from-blue-100 hover:to-cyan-100 hover:border-blue-300 transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <LifebuoyIcon />
                              Reschedule to {DAYS[suggestedDayIdx]} {trigger.suggestedStart}:00
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => submitQuickAction("Optimize my day around my focus peaks.")}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-700 disabled:opacity-50 transition-colors duration-200 cursor-pointer"
                    disabled={isStreaming}
                  >
                    <BoltIcon />
                    Optimize Today
                  </button>
                  <button
                    onClick={() => submitQuickAction("I'm exhausted. Make today lighter and protect recovery time.")}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:border-teal-200 hover:bg-teal-50/50 hover:text-teal-700 disabled:opacity-50 transition-colors duration-200 cursor-pointer"
                    disabled={isStreaming}
                  >
                    <LeafIcon />
                    I&apos;m exhausted
                  </button>
                  <button
                    onClick={() => submitQuickAction("Export my plan for today to my calendar.")}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:border-violet-200 hover:bg-violet-50/50 hover:text-violet-700 disabled:opacity-50 transition-colors duration-200 cursor-pointer"
                    disabled={isStreaming}
                  >
                    <CalendarIcon />
                    Export
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Message your copilot&hellip;"
                    disabled={isStreaming}
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200/70 focus:border-emerald-300 disabled:opacity-60 transition-colors duration-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isStreaming}
                    className="h-11 shrink-0 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-gray-50 hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50 transition-colors duration-200 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  >
                    <SendIcon />
                  </button>
                </form>

                <div className="text-xs text-slate-400 leading-relaxed pl-0.5">
                  Try: &ldquo;Protect a 90-minute deep-work block.&rdquo;
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Energy-Aware Weekly Calendar */}
          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="sticky top-0 z-10 rounded-t-2xl border-b border-gray-100 bg-white px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 tracking-tight">This Week</div>
                  <div className="mt-1 text-xs text-slate-400 font-medium">{weekRangeLabel} &middot; 12 AM&ndash;11 PM</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAutoHeal}
                    disabled={isHealing}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <LifebuoyIcon />
                    {isHealing ? "Rescheduling..." : "Liquid Schedule"}
                  </button>
                  <div className="flex items-center gap-5 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded border border-emerald-200 bg-emerald-50/70" />
                      <span>Focus peak</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded border border-amber-200"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(135deg, rgba(251,191,36,0.25) 0px, rgba(251,191,36,0.25) 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 9px)",
                        }}
                      />
                      <span>Energy dip</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded border border-rose-300 border-dashed" />
                      <span>Now</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div ref={calendarScrollRef} className="overflow-x-auto overflow-y-auto" style={{ height: "calc(100vh - 190px)" }}>
              <div className="w-full min-w-[700px]">
                <div
                  className="grid relative"
                  style={{
                    gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))",
                    gridTemplateRows: `44px repeat(${hours.length}, ${hourRowHeight}px)`,
                  }}
                >
                  {/* Header row corner */}
                  <div className="border-b border-r border-gray-100 bg-gray-50/40 sticky top-0 z-10" />

                  {/* Day headers - sticky */}
                  {DAYS.map((d, idx) => (
                    <div
                      key={d}
                      className="sticky top-0 z-10 flex flex-col items-center justify-center border-b border-r border-gray-100 bg-white text-[11px] font-semibold text-slate-600 tracking-wide"
                      style={{ left: idx === 0 ? 0 : undefined }}
                    >
                      <span>{d}</span>
                      <span className="text-[10px] font-medium text-slate-400">{weekDates[idx]}</span>
                    </div>
                  ))}

                  {/* Time column and day cells */}
                  {hours.map((h) => (
                    <React.Fragment key={h}>
                      {/* Time label */}
                      <div
                        className="flex items-start justify-end border-b border-r border-gray-100 bg-white pr-2 pt-2 text-[11px] text-slate-400 sticky left-0 z-10 font-medium"
                        style={{ gridColumn: 1, gridRow: gridRowForHour(h) }}
                      >
                        {hourLabel(h)}
                      </div>
                      {DAYS.map((_, dayIdx) => {
                        const isPeak = h >= focusPeakStart && h < focusPeakEnd;
                        const isDip = h >= dipStart;
                        const baseClass = "border-b border-r border-gray-100";
                        if (isDip) {
                          return (
                            <div
                              key={`${dayIdx}-${h}`}
                              className={baseClass}
                              style={{
                                gridColumn: gridColForDayIdx(dayIdx),
                                gridRow: gridRowForHour(h),
                                backgroundImage:
                                  "repeating-linear-gradient(135deg, rgba(251,191,36,0.22) 0px, rgba(251,191,36,0.22) 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 11px)",
                                backgroundColor: "rgba(251,246,233,0.55)",
                              }}
                            />
                          );
                        }
                        return (
                          <div
                            key={`${dayIdx}-${h}`}
                            className={`${baseClass} ${isPeak ? "bg-emerald-50/60 border-emerald-100/50" : "bg-white"}`}
                            style={{ gridColumn: gridColForDayIdx(dayIdx), gridRow: gridRowForHour(h) }}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* Current time rose line */}
                  <div
                    className="absolute z-20 border-t-2 border-rose-300 pointer-events-none"
                    style={{
                      top: `${currentTimeTop}px`,
                      left: "64px",
                      right: 0,
                    }}
                  >
                    <div className="absolute -left-1.5 -top-[5px] h-2.5 w-2.5 rounded-full bg-rose-300 shadow-[0_0_6px_rgba(251,113,133,0.5)]" />
                  </div>

                  {/* Render real events */}
                  {uniqueVisualEvents.map((event) => {
                    if (!Number.isFinite(event.dayIdx) || !Number.isFinite(event.start) || !Number.isFinite(event.end)) {
                      return null;
                    }
                    // One-off events: only show on the column whose ISO date matches.
                    if (event.isoDate && event.isoDate !== columnIsoDates[event.dayIdx]) {
                      return null;
                    }
                    const colStart = gridColForDayIdx(event.dayIdx);
                    if (!Number.isFinite(colStart)) {
                      return null;
                    }
                    const lane = eventLaneMap.get(event.id);
                    const laneIndex = lane?.laneIndex ?? 0;
                    const laneCount = lane?.laneCount ?? 1;
                    const isNarrow = laneCount > 1;
                    return (
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setCalendarDetail(event)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setCalendarDetail(event);
                        }
                      }}
                      className={`z-10 rounded-2xl px-2 py-1.5 text-xs text-slate-900 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.12)] cursor-pointer transition-transform duration-200 ease-out hover:z-[15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 ${
                        isNarrow ? "hover:scale-[1.03] active:scale-[0.99]" : "hover:scale-[1.01]"
                      } ${
                        event.isFixed
                          ? "border border-gray-200 bg-white"
                          : "border border-dashed border-gray-300 bg-white"
                      }`}
                      style={
                        laneCount > 1
                          ? {
                              gridColumnStart: colStart,
                              gridColumnEnd: colStart + 1,
                              gridRowStart: Math.floor(event.start) + 2,
                              gridRowEnd: Math.floor(event.end) + 2,
                              width: `calc(${100 / laneCount}% - 6px)`,
                              marginLeft: `calc(${(laneIndex / laneCount) * 100}% + 3px)`,
                            }
                          : {
                              gridColumnStart: colStart,
                              gridColumnEnd: colStart + 1,
                              gridRowStart: Math.floor(event.start) + 2,
                              gridRowEnd: Math.floor(event.end) + 2,
                              justifySelf: "center",
                              width: "calc(100% - 16px)",
                              maxWidth: "100%",
                            }
                      }
                    >
                      <div className={`font-semibold line-clamp-2 leading-tight ${!event.isFixed ? "flex items-center gap-1.5 text-slate-800" : "text-slate-700"}`}>
                        {!event.isFixed && (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-amber-50 text-amber-500 shrink-0" aria-hidden="true">
                            <SparkleIcon />
                          </span>
                        )}
                        {event.title}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        {formatDecimalHourForDisplay(event.start)}&ndash;{formatDecimalHourForDisplay(event.end)}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {calendarDetail && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 px-4 py-8 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setCalendarDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-detail-title"
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl animate-[fade-up_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="cal-detail-title" className="text-lg font-semibold text-slate-900 leading-snug">
              {calendarDetail.title}
            </div>
            <div className="mt-3 text-sm text-slate-500">
              {DAYS[calendarDetail.dayIdx] ?? "Day"} &middot;{" "}
              {formatDecimalHourForDisplay(calendarDetail.start)} &ndash;{" "}
              {formatDecimalHourForDisplay(calendarDetail.end)}
            </div>
            {!calendarDetail.isFixed && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                <SparkleIcon />
                Copilot suggestion
              </div>
            )}
            <div className="mt-6 flex gap-3">
              {!calendarDetail.isFixed && (
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  onClick={() => {
                    deleteAgentEvent(calendarDetail.id);
                    const toast = document.createElement("div");
                    toast.textContent = "Removed";
                    toast.className =
                      "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-rose-600 text-white px-5 py-2.5 text-sm font-semibold shadow-lg animate-[fade-up_0.3s_ease-out]";
                    document.body.appendChild(toast);
                    setTimeout(() => {
                      toast.style.opacity = "0";
                      toast.style.transition = "opacity 0.3s";
                      setTimeout(() => toast.remove(), 300);
                    }, 2800);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                  Remove
                </button>
              )}
              <button
                type="button"
                className={`rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer ${calendarDetail.isFixed ? "w-full" : "flex-1"}`}
                onClick={() => setCalendarDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Wrapper component with Error Boundary
export default function EquiDashboard() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
