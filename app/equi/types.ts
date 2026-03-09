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
  weekdayPattern: WeekdayPattern;
  start: TimeOfDay;
  durationMinutes: number;
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
    weekdayPattern: WeekdayPattern;
    startHour: number;
    durationMinutes: number;
    isHardConstraint: boolean;
  }>;
  
  lifeMode: LifeMode;
  lifeModeEndDate: string;
  updateFrequency: UpdateFrequency;
  
  agentPersona: AgentPersona;
}
