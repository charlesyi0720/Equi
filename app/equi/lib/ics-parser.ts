/**
 * ICS (iCalendar) Parser
 * Parses .ics files to extract events with name, date, and time.
 * Supports standard iCalendar format with RRULE expansion.
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

const REVERSE_WEEKDAY_MAP: Record<Weekday, string> = {
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
  Saturday: "SA",
  Sunday: "SU",
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

/**
 * Parse ICS datetime string.
 * Handles formats:
 * - 20240311T090000 (UTC)
 * - 20240311T090000Z (UTC with Z)
 * - 20240311T090000 (with TZID in separate property)
 * Returns hour in 24h format.
 */
function parseICSDateTime(dtstart: string): { date: { year: number; month: number; day: number }; hour: number; minute: number } | null {
  // Remove any VALUE=DATE prefix
  const cleanDtstart = dtstart.replace(/^VALUE=DATE:/, "");
  
  // Match format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = cleanDtstart.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && !isNaN(hour) && !isNaN(minute)) {
      return {
        date: { year, month, day },
        hour,
        minute
      };
    }
  }
  
  // Try date-only format: YYYYMMDD
  const dateOnlyMatch = cleanDtstart.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10);
    const day = parseInt(dateOnlyMatch[3], 10);
    
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return {
        date: { year, month, day },
        hour: 9, // Default to 9 AM for all-day events
        minute: 0
      };
    }
  }
  
  return null;
}

function getWeekdayFromDate(date: { year: number; month: number; day: number }): Weekday {
  const dateObj = new Date(date.year, date.month - 1, date.day);
  const days: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dateObj.getDay()];
}

function inferCategory(eventName: string): CognitiveCategory {
  const name = eventName.toLowerCase();
  
  if (name.includes("class") || name.includes("lecture") || name.includes("seminar") || name.includes("course") || name.includes("study")) {
    return "DeepWork";
  }
  if (name.includes("meeting") || name.includes("call") || name.includes("sync") || name.includes("discussion")) {
    return "Social";
  }
  if (name.includes("gym") || name.includes("workout") || name.includes("exercise") || name.includes("yoga") || name.includes("sport")) {
    return "Recovery";
  }
  if (name.includes("email") || name.includes("admin") || name.includes("organize") || name.includes("planning")) {
    return "Admin";
  }
  if (name.includes("creative") || name.includes("design") || name.includes("write") || name.includes("art")) {
    return "Creative";
  }
  return "ShallowWork";
}

/**
 * Extract timezone from DTSTART line
 * Format: DTSTART;TZID=America/New_York:20240311T090000
 */
function extractTimezone(line: string): string | null {
  const match = line.match(/TZID=([^:]+)/);
  return match ? match[1] : null;
}

/**
 * Parse RRULE to extract BYDAY
 * Format: FREQ=WEEKLY;BYDAY=MO,WE,FR
 */
function parseRRULE(rruleStr: string): string[] | null {
  const byDayMatch = rruleStr.match(/BYDAY=([A-Z,]+)/);
  if (byDayMatch) {
    return byDayMatch[1].split(",");
  }
  return null;
}

/**
 * Deduplicate events based on label, day, startHour, and endHour
 */
function deduplicateEvents(events: ParsedEvent[]): ParsedEvent[] {
  const seen = new Map<string, ParsedEvent>();
  
  events.forEach(event => {
    const key = `${event.label}-${event.day}-${event.startHour}-${event.endHour}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  });
  
  return Array.from(seen.values());
}

export function parseICS(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.split(/\r?\n/);
  
  console.log("=== ICS PARSER DEBUG ===");
  console.log("Total lines:", lines.length);
  
  let inEvent = false;
  let currentEvent: {
    summary?: string;
    dtstart?: string;
    dtstartLine?: string;
    dtend?: string;
    dtendLine?: string;
    rrule?: string;
  } = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine === "BEGIN:VEVENT") {
      inEvent = true;
      currentEvent = {};
    } else if (trimmedLine === "END:VEVENT") {
      if (inEvent && currentEvent.summary && currentEvent.dtstart) {
        console.log("--- Processing Event ---");
        console.log("SUMMARY:", currentEvent.summary);
        console.log("DTSTART raw:", currentEvent.dtstart);
        console.log("DTEND raw:", currentEvent.dtend);
        console.log("RRULE:", currentEvent.rrule);
        
        const parsedStart = parseICSDateTime(currentEvent.dtstart);
        
        if (parsedStart) {
          const day = getWeekdayFromDate(parsedStart.date);
          const startHour = parsedStart.hour;
          const startMinute = parsedStart.minute;
          
          // Calculate end hour
          let endHour = startHour + 1; // Default 1 hour duration
          if (currentEvent.dtend) {
            const parsedEnd = parseICSDateTime(currentEvent.dtend);
            if (parsedEnd) {
              endHour = parsedEnd.hour;
              // If end is before start (same day, multi-hour), assume it's end of day
              if (endHour <= startHour) {
                endHour = startHour + 1;
              }
            }
          }
          
          console.log("Parsed day:", day, "start:", startHour, "end:", endHour);
          
          // Handle recurring events with RRULE
          if (currentEvent.rrule) {
            const byDays = parseRRULE(currentEvent.rrule);
            if (byDays && byDays.length > 0) {
              byDays.forEach((d) => {
                if (WEEKDAY_MAP[d]) {
                  events.push({
                    id: generateId(),
                    label: currentEvent.summary!,
                    day: WEEKDAY_MAP[d],
                    startHour,
                    endHour,
                    category: inferCategory(currentEvent.summary!),
                  });
                }
              });
            } else {
              // No BYDAY in RRULE, use the original date's day
              events.push({
                id: generateId(),
                label: currentEvent.summary!,
                day,
                startHour,
                endHour,
                category: inferCategory(currentEvent.summary!),
              });
            }
          } else {
            // Non-recurring event
            events.push({
              id: generateId(),
              label: currentEvent.summary!,
              day,
              startHour,
              endHour,
              category: inferCategory(currentEvent.summary!),
            });
          }
        } else {
          console.log("Failed to parse DTSTART:", currentEvent.dtstart);
        }
      }
      inEvent = false;
      currentEvent = {};
    } else if (inEvent) {
      // Handle SUMMARY
      if (trimmedLine.startsWith("SUMMARY:")) {
        currentEvent.summary = trimmedLine.slice(8).trim();
        // Handle multi-line SUMMARY (can be folded)
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith(" ")) {
          currentEvent.summary += lines[j].trim();
          j++;
        }
      }
      // Handle DTSTART
      else if (trimmedLine.startsWith("DTSTART;")) {
        currentEvent.dtstartLine = trimmedLine;
        // Extract timezone if present
        extractTimezone(trimmedLine);
        // Extract the datetime value after colon
        const match = trimmedLine.match(/DTSTART;.*?:(.+)$/);
        if (match) {
          currentEvent.dtstart = match[1].trim();
        }
      } else if (trimmedLine.startsWith("DTSTART:")) {
        currentEvent.dtstartLine = trimmedLine;
        currentEvent.dtstart = trimmedLine.slice(8).trim();
      }
      // Handle DTEND
      else if (trimmedLine.startsWith("DTEND;")) {
        currentEvent.dtendLine = trimmedLine;
        const match = trimmedLine.match(/DTEND;.*?:(.+)$/);
        if (match) {
          currentEvent.dtend = match[1].trim();
        }
      } else if (trimmedLine.startsWith("DTEND:")) {
        currentEvent.dtendLine = trimmedLine;
        currentEvent.dtend = trimmedLine.slice(6).trim();
      }
      // Handle RRULE
      else if (trimmedLine.startsWith("RRULE:")) {
        currentEvent.rrule = trimmedLine.slice(6).trim();
      }
    }
  }
  
  console.log("Total events before dedup:", events.length);
  
  // Deduplicate
  const deduped = deduplicateEvents(events);
  console.log("Total events after dedup:", deduped.length);
  
  // Debug: print first few events
  deduped.slice(0, 5).forEach((e, i) => {
    console.log(`Event ${i + 1}:`, e.label, e.day, `${e.startHour}:00 - ${e.endHour}:00`);
  });
  console.log("=== END ICS PARSER ===");
  
  return deduped;
}

export async function parseICSFile(file: File): Promise<ParsedEvent[]> {
  const text = await file.text();
  return parseICS(text);
}
