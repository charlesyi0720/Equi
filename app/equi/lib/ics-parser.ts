/**
 * ICS (iCalendar) Parser using ical.js
 * Parses .ics files to extract events with name, date, and time.
 * Supports standard iCalendar format with RRULE expansion.
 */

import { Weekday, CognitiveCategory } from "../types";
import ICAL from "ical.js";

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
  startMinute: number;
  endMinute: number;
  category: CognitiveCategory;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function inferCategory(eventName: string): CognitiveCategory {
  const name = eventName.toLowerCase();
  
  if (name.includes("class") || name.includes("lecture") || name.includes("seminar") || name.includes("course") || name.includes("study") || name.includes("tutorial")) {
    return "DeepWork";
  }
  if (name.includes("meeting") || name.includes("call") || name.includes("sync") || name.includes("discussion")) {
    return "Social";
  }
  if (name.includes("gym") || name.includes("workout") || name.includes("exercise") || name.includes("yoga") || name.includes("sport") || name.includes("training")) {
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

function getWeekdayFromJSDate(date: Date): Weekday {
  const days: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

export function parseICS(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  
  console.log("=== ICS PARSER DEBUG (using ical.js) ===");
  console.log("Content length:", content.length);
  
  try {
    const jcalData = ICAL.parse(content);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");
    
    console.log("Found VEVENT count:", vevents.length);
    
    vevents.forEach((vevent: ICAL.Component) => {
      const event = new ICAL.Event(vevent);
      
      if (!event.summary) {
        console.log("Skipping event without summary");
        return;
      }
      
      const dtstart = event.startDate;
      const dtend = event.endDate;
      
      // Get RRULE directly from the vevent component
      const rruleProp = vevent.getFirstProperty("rrule");
      const rrule = rruleProp ? rruleProp : null;
      
      console.log("--- Processing Event ---");
      console.log("SUMMARY:", event.summary);
      console.log("DTSTART:", dtstart ? dtstart.toString() : "null");
      console.log("DTEND:", dtend ? dtend.toString() : "null");
      console.log("RRULE:", rrule ? rrule.toString() : "none");
      
      if (!dtstart) {
        console.log("Skipping event without DTSTART");
        return;
      }
      
      // Convert to JS Date and extract time in local timezone
      const startJsDate = dtstart.toJSDate();
      const startHour = startJsDate.getHours();
      const startMinute = startJsDate.getMinutes();
      const startDay = getWeekdayFromJSDate(startJsDate);
      
      let endHour = startHour + 1;
      let endMinute = startMinute;
      
      if (dtend) {
        const endJsDate = dtend.toJSDate();
        endHour = endJsDate.getHours();
        endMinute = endJsDate.getMinutes();
        
        // Handle all-day events (end date is exclusive, so subtract 1 day)
        const startDateOnly = new Date(startJsDate.getFullYear(), startJsDate.getMonth(), startJsDate.getDate());
        const endDateOnly = new Date(endJsDate.getFullYear(), endJsDate.getMonth(), endJsDate.getDate());
        
        // If event spans multiple days or is all-day
        if (endDateOnly.getTime() - startDateOnly.getTime() >= 24 * 60 * 60 * 1000) {
          // All-day event - use default 9:00-17:00
          endHour = 17;
          endMinute = 0;
        }
        
        // If end time is before start time (same day), assume 1 hour duration
        if (endHour <= startHour && endDateOnly.getTime() - startDateOnly.getTime() < 24 * 60 * 60 * 1000) {
          endHour = startHour + 1;
        }
      }
      
      console.log("Parsed time:", startDay, `${startHour}:${startMinute.toString().padStart(2, '0')} - ${endHour}:${endMinute.toString().padStart(2, '0')}`);
      
      // Handle recurring events with RRULE
      if (rrule) {
        let byDays: string[] | null = null;
        
        // Try to parse BYDAY from the RRULE property
        const rruleValue = rrule.toString();
        const byDayMatch = rruleValue.match(/BYDAY=([A-Z,]+)/);
        if (byDayMatch) {
          byDays = byDayMatch[1].split(",");
        }
        
        if (byDays && byDays.length > 0) {
          console.log("RRULE BYDAY:", byDays);
          
          byDays.forEach((d: string) => {
            if (WEEKDAY_MAP[d]) {
              events.push({
                id: generateId(),
                label: event.summary!,
                day: WEEKDAY_MAP[d],
                startHour,
                endHour,
                startMinute,
                endMinute,
                category: inferCategory(event.summary!),
              });
            }
          });
        } else {
          // RRULE exists but no BYDAY - use original date's day
          events.push({
            id: generateId(),
            label: event.summary!,
            day: startDay,
            startHour,
            endHour,
            startMinute,
            endMinute,
            category: inferCategory(event.summary!),
          });
        }
      } else {
        // Non-recurring event
        events.push({
          id: generateId(),
          label: event.summary!,
          day: startDay,
          startHour,
          endHour,
          startMinute,
          endMinute,
          category: inferCategory(event.summary!),
        });
      }
    });
  } catch (error) {
    console.error("Error parsing ICS:", error);
    throw new Error(`Failed to parse ICS file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  console.log("Total events before dedup:", events.length);
  
  // Deduplicate events - keep unique by label+day+startHour+startMinute
  const seen = new Map<string, ParsedEvent>();
  events.forEach(event => {
    const key = `${event.label}-${event.day}-${event.startHour}-${event.startMinute}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  });
  
  const deduped = Array.from(seen.values());
  console.log("Total events after dedup:", deduped.length);
  
  // Debug: print first few events
  deduped.slice(0, 5).forEach((e, i) => {
    const startTime = `${e.startHour.toString().padStart(2, '0')}:${e.startMinute.toString().padStart(2, '0')}`;
    const endTime = `${e.endHour.toString().padStart(2, '0')}:${e.endMinute.toString().padStart(2, '0')}`;
    console.log(`Event ${i + 1}:`, e.label, e.day, `${startTime} - ${endTime}`);
  });
  console.log("=== END ICS PARSER ===");
  
  return deduped;
}

export async function parseICSFile(file: File): Promise<ParsedEvent[]> {
  const text = await file.text();
  return parseICS(text);
}
