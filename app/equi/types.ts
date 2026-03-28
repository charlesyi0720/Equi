/**
 * Equi - Personal AI Lifestyle Architect
 * Core Type Definitions
 */

// ============================================================================
// SHARED ENUMS & PRIMITIVES
// ============================================================================

export enum PlanningStyle {
  Flexible = "Flexible",
  Structured = "Structured"
}

export enum AgentPersona {
  DevotedSecretary = "DevotedSecretary",
  HardSupervisor = "HardSupervisor"
}

export enum LifeMode {
  Normal = "Normal",
  FocusMode = "FocusMode",
  Holiday = "Holiday",
  Travel = "Travel",
  Crisis = "Crisis",
  Recovery = "Recovery"
}

export enum UpdateFrequency {
  Weekly = "Weekly",
  Monthly = "Monthly",
  Quarterly = "Quarterly"
}

export type Weekday = 
  | "Monday" 
  | "Tuesday" 
  | "Wednesday" 
  | "Thursday" 
  | "Friday" 
  | "Saturday" 
  | "Sunday";

export type CognitiveCategory = 
  | "DeepWork" 
  | "ShallowWork" 
  | "Admin" 
  | "Creative" 
  | "Social" 
  | "Recovery";

export type WeekdayPattern = Weekday[] | "Everyday" | "Weekdays" | "Weekends";

export type ActivityType = "strictlyFixed" | "flexibleFloating";

export type PreferredTimeSlot = "focusPeaks" | "anytime";

export interface ActivitySlot {
  day: Weekday;
  startHour: number;
  endHour: number;
  startMinute?: number;
  endMinute?: number;
}

export interface FlexibleQuota {
  dailyMinutes: number;
  preferredSlot: PreferredTimeSlot;
}

// ============================================================================
// TIME REPRESENTATION
// ============================================================================

export interface TimeOfDay {
  hour: number;
  minute: number;
  timezone?: string;
}

// ============================================================================
// UNDERSTANDING SCHEMA (User Profile)
// ============================================================================

export interface BiologicalClock {
  focusPeaks: Array<{
    weekday: Weekday;
    start: TimeOfDay;
    end: TimeOfDay;
    notes?: string;
  }>;
  
  energyDips: Array<{
    weekday: Weekday;
    start: TimeOfDay;
    end: TimeOfDay;
    notes?: string;
  }>;
}

export interface LifeState {
  mode: LifeMode;
  label?: string;
  description?: string;
  expectedEnd: string;
}

export interface UpdatePreferences {
  frequency: UpdateFrequency;
  preferredCheckInTime?: TimeOfDay;
}

export interface Understanding {
  name: string;
  occupation: string;
  preferredTitle: string;
  bio?: string;
  
  mbti: string;
  planningStyle: PlanningStyle;
  procrastinationIndex: number;
  pressureSensitivity: number;
  preferredAgentPersona: AgentPersona;
  
  biologicalClock: BiologicalClock;
  lifeState: LifeState;
  updatePreferences: UpdatePreferences;
}

// ============================================================================
// LIFE STRUCTURE SCHEMA
// ============================================================================

export interface FixedActivity {
  id: string;
  label: string;
  category: CognitiveCategory;
  activityType: ActivityType;
  weekdayPattern: WeekdayPattern;
  slots: ActivitySlot[];
  flexibleQuota?: FlexibleQuota;
  isHardConstraint: boolean;
  location?: string;
  notes?: string;
}

export interface CognitiveLoadWeight {
  category: CognitiveCategory;
  weight: number;
  description?: string;
}

export interface LifeStructure {
  fixedActivities: FixedActivity[];
  cognitiveLoadModel: CognitiveLoadWeight[];
}

// ============================================================================
// AGENT BRAIN SCHEMA
// ============================================================================

export interface PlanningOutcome {
  cycleId: string;
  periodStart: string;
  periodEnd: string;
  goalsPlanned: number;
  goalsCompleted: number;
  selfReportedSatisfaction: number;
  notes?: string;
  tags: string[];
}

export interface BehaviorPattern {
  patternId: string;
  description: string;
  evidence: string[];
  confidence: number;
  lastUpdated: string;
}

export interface LongTermMemory {
  planningOutcomes: PlanningOutcome[];
  behaviorPatterns: BehaviorPattern[];
  /** Increments after each exchange; reset to 0 when memory extraction fires. */
  conversationMessagesSinceLastExtract: number;
  /** ISO timestamp of the last memory extraction run. */
  lastExtractAt?: string;
}

export interface SundaySyncConfig {
  enabled: boolean;
  defaultTime: TimeOfDay;
  timezone: string;
  horizonWeeks: number;
}

export interface SundaySyncState {
  lastRunAt?: string;
  lastPlanSummary?: string;
  nextScheduledAt?: string;
}

export interface AgentBrain {
  longTermMemory: LongTermMemory;
  sundaySync: {
    config: SundaySyncConfig;
    state: SundaySyncState;
  };
}

// ============================================================================
// AGGREGATE ROOT
// ============================================================================

export interface EquiUser {
  id: string;
  createdAt: string;
  updatedAt: string;
  understanding: Understanding;
  lifeStructure: LifeStructure;
  agentBrain: AgentBrain;
  /** One-off events added by the AI copilot or user (e.g. a one-time lecture). */
  calendarAgentEvents?: CalendarAgentEvent[];
  /** All conversation sessions. Each entry is a thread of messages. */
  conversationSessions?: ConversationSession[];
  /** The session currently being shown on the dashboard (if any). */
  activeSessionId?: string;
}

export interface ConversationSession {
  id: string;
  createdAt: string;
  messages: StoredMessage[];
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO string
}

/** A one-off or recurring event added by the AI. */
export interface CalendarAgentEvent {
  id: string;
  title: string;
  dayIdx: number;
  start: number;  // fractional hour
  end: number;    // fractional hour
  /** ISO date string (e.g. "2026-03-25"). If present the event only shows on that date; otherwise it recurs every matching weekday. */
  isoDate?: string;
  createdAt: string; // ISO timestamp
}

// ============================================================================
// ONBOARDING FORM DATA
// ============================================================================

export interface OnboardingFormData {
  name: string;
  occupation: string;
  preferredTitle: string;
  
  procrastinationAnswer: string;
  pressureAnswer: string;
  
  focusPeaks: Array<{ startHour: number; endHour: number; days: Weekday[] }>;
  energyDips: Array<{ startHour: number; endHour: number; days: Weekday[] }>;
  
  fixedActivities: Array<{
    label: string;
    category: CognitiveCategory;
    activityType: ActivityType;
    weekdayPattern: WeekdayPattern;
    slots: ActivitySlot[];
    flexibleQuota?: FlexibleQuota;
    isHardConstraint: boolean;
  }>;
  
  lifeMode: LifeMode;
  lifeModeEndDate: string;
  updateFrequency: UpdateFrequency;
  
  agentPersona: AgentPersona;
}
