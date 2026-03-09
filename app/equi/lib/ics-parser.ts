/**
 * ICS (iCalendar) Parser
 * Parses .ics files to extract events with name, date, and time.
 * Supports standard iCalendar format.
 */

import { Weekday, CognitiveCategory } from "../types";

const WEEKDAY_MAP: Record<string, Weekday> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

export interface ParsedEvent {
  id: string;
  label: string;
  day: Weekday;
  startHour: number;
  endHour: number;
  category: CognitiveCategory;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function parseICSDate(dateStr: string): { year: number; month: number; day: number } | null {
  // Format: YYYYMMDD or YYYY-MM-DD
  const cleaned = dateStr.replace(/-/g, "");
  if (cleaned.length !== 8) return null;
  
  const year = parseInt(cleaned.slice(0, 4), 10);
  const month = parseInt(cleaned.slice(4, 6), 10);
  const day = parseInt(cleaned.slice(6, 8), 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

function parseICSTime(timeStr: string): { hour: number; minute: number } | null {
  // Format: HHMMSS or HH:MM:SS
  const cleaned = timeStr.replace(/:/g, "");
  if (cleaned.length < 4) return null;
  
  const hour = parseInt(cleaned.slice(0, 2), 10);
  const minute = parseInt(cleaned.slice(2, 4), 10);
  
  if (isNaN(hour) || isNaN(minute)) return null;
  return { hour, minute };
}

function getWeekdayFromDate(date: { year: number; month: number; day: number }): Weekday {
  const dateObj = new Date(date.year, date.month - 1, date.day);
  const days: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dateObj.getDay()];
}

function parseByDay(event: string): { byDay: string[] } | null {
  const byDayMatch = event.match(/BYDAY:([A-Z,]+)/i);
  if (byDayMatch) {
    return { byDay: byDayMatch[1].split(",") };
  }
  return null;
}

function inferCategory(eventName: string): CognitiveCategory {
  const name = eventName.toLowerCase();
  
  if (name.includes("class") || name.includes("lecture") || name.includes("seminar") || name.includes("course")) {
    return "DeepWork";
  }
  if (name.includes("meeting") || name.includes("call") || name.includes("sync")) {
    return "Social";
  }
  if (name.includes("gym") || name.includes("workout") || name.includes("exercise") || name.includes("yoga")) {
    return "Recovery";
  }
  if (name.includes("email") || name.includes("admin") || name.includes("organize")) {
    return "Admin";
  }
  if (name.includes("creative") || name.includes("design") || name.includes("write")) {
    return "Creative";
  }
  return "ShallowWork";
}

export function parseICS(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.split(/\r?\n/);
  
  let inEvent = false;
  let currentEvent: {
    summary?: string;
    dtstart?: string;
    dtend?: string;
    rrule?: string;
  } = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      currentEvent = {};
    } else if (line === "END:VEVENT") {
      if (inEvent && currentEvent.summary && currentEvent.dtstart) {
        const startDate = parseICSDate(currentEvent.dtstart);
        if (startDate) {
          const day = getWeekdayFromDate(startDate);
          const startTime = parseICSTime(currentEvent.dtstart) || { hour: 9, minute: 0 };
          const endTime = currentEvent.dtend ? parseICSTime(currentEvent.dtend) : { hour: startTime.hour + 1, minute: 0 };
          
          // Handle recurring events with RRULE
          if (currentEvent.rrule) {
            const byDayMatch = currentEvent.rrule.match(/BYDAY=([A-Z,]+)/);
            if (byDayMatch) {
              const days = byDayMatch[1].split(",");
              days.forEach((d) => {
                if (WEEKDAY_MAP[d]) {
                  events.push({
                    id: generateId(),
                    label: currentEvent.summary!,
                    day: WEEKDAY_MAP[d],
                    startHour: startTime.hour,
                    endHour: endTime?.hour || startTime.hour + 1,
                    category: inferCategory(currentEvent.summary!),
                  });
                }
              });
            }
          } else {
            events.push({
              id: generateId(),
              label: currentEvent.summary,
              day,
              startHour: startTime.hour,
              endHour: endTime?.hour || startTime.hour + 1,
              category: inferCategory(currentEvent.summary),
            });
          }
        }
      }
      inEvent = false;
      currentEvent = {};
    } else if (inEvent) {
      if (line.startsWith("SUMMARY:")) {
        currentEvent.summary = line.slice(8).trim();
      } else if (line.startsWith("DTSTART;")) {
        const match = line.match(/DTSTART;.*?:(\d+|(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}))/);
        if (match) {
          currentEvent.dtstart = match[1]?.replace(/-|:/g, "") || "";
        }
      } else if (line.startsWith("DTSTART:")) {
        currentEvent.dtstart = line.slice(8).trim();
      } else if (line.startsWith("DTEND;")) {
        const match = line.match(/DTEND;.*?:(\d+|(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}))/);
        if (match) {
          currentEvent.dtend = match[1]?.replace(/-|:/g, "") || "";
        }
      } else if (line.startsWith("DTEND:")) {
        currentEvent.dtend = line.slice(6).trim();
      } else if (line.startsWith("RRULE:")) {
        currentEvent.rrule = line.slice(6).trim();
      }
    }
  }
  
  return events;
}

export async function parseICSFile(file: File): Promise<ParsedEvent[]> {
  const text = await file.text();
  return parseICS(text);
}
