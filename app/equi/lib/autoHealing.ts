/**
 * 液态日程 (Auto-Healing) 算法
 * 当计划被打乱时，自动重组剩余任务
 */

import { CalendarAgentEvent, FixedActivity, BiologicalClock } from "../types";

export interface FluidTask {
  id: string;
  title: string;
  duration: number; // hours
  priority: number; // 1-5
  deadline?: string; // ISO date
  cognitiveLoad: "high" | "medium" | "low";
}

export interface TimeSlot {
  dayIdx: number;
  start: number;
  end: number;
  isoDate: string;
}

export interface HealedSchedule {
  task: FluidTask;
  slot: TimeSlot;
}

/**
 * 核心算法：重新计算剩余任务的最优时间分配
 */
export function healSchedule(
  tasks: FluidTask[],
  currentTime: Date,
  fixedActivities: FixedActivity[],
  biologicalClock: BiologicalClock,
  existingEvents: CalendarAgentEvent[],
  disruptionSlot?: { start: number; end: number }
): HealedSchedule[] {
  const healed: HealedSchedule[] = [];
  const availableSlots = findAvailableSlots(currentTime, fixedActivities, existingEvents, disruptionSlot);

  // 按优先级和截止日期排序
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.deadline && b.deadline) {
      const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (diff !== 0) return diff;
    }
    return b.priority - a.priority;
  });

  // 为每个任务分配最佳时间段
  for (const task of sortedTasks) {
    const bestSlot = findBestSlot(task, availableSlots, biologicalClock, currentTime);
    if (bestSlot) {
      healed.push({ task, slot: bestSlot });
      // 标记该时段已被占用
      removeSlot(availableSlots, bestSlot);
    }
  }

  return healed;
}

function findAvailableSlots(
  currentTime: Date,
  fixedActivities: FixedActivity[],
  existingEvents: CalendarAgentEvent[],
  disruptionSlot?: { start: number; end: number }
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const now = currentTime.getTime();

  // 生成未来7天的可用时段
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(currentTime);
    date.setDate(date.getDate() + dayOffset);
    const dayIdx = (date.getDay() + 6) % 7; // Monday = 0
    const isoDate = formatIsoDate(date);

    // 工作时段：8:00 - 22:00
    const daySlots = generateDaySlots(dayIdx, isoDate, 8, 22);

    // 排除固定活动
    const filtered = filterByFixedActivities(daySlots, fixedActivities, dayIdx);

    // 排除已有事件
    const available = filterByExistingEvents(filtered, existingEvents, isoDate);

    slots.push(...available);
  }

  // 排除 disruption 时段
  if (disruptionSlot) {
    return slots.filter(slot => {
      // 如果时段与 disruption 重叠，则排除
      return !(slot.start < disruptionSlot.end && slot.end > disruptionSlot.start);
    });
  }

  return slots;
}

function findBestSlot(
  task: FluidTask,
  availableSlots: TimeSlot[],
  biologicalClock: BiologicalClock,
  currentTime: Date
): TimeSlot | null {
  let bestSlot: TimeSlot | null = null;
  let bestScore = -Infinity;

  for (const slot of availableSlots) {
    if (slot.end - slot.start < task.duration) continue;

    const score = calculateSlotScore(task, slot, biologicalClock, currentTime);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = {
        ...slot,
        end: slot.start + task.duration
      };
    }
  }

  return bestSlot;
}

function calculateSlotScore(
  task: FluidTask,
  slot: TimeSlot,
  biologicalClock: BiologicalClock,
  currentTime: Date
): number {
  let score = 0;

  // 高认知负荷任务优先安排在专注高峰期
  if (task.cognitiveLoad === "high") {
    const isPeakTime = biologicalClock.focusPeaks?.some(peak => {
      const peakStart = peak.start.hour + (peak.start.minute || 0) / 60;
      const peakEnd = peak.end.hour + (peak.end.minute || 0) / 60;
      return slot.start >= peakStart && slot.end <= peakEnd;
    });
    if (isPeakTime) score += 50;
  }

  // 避开精力低谷期
  const isDipTime = biologicalClock.energyDips?.some(dip => {
    const dipStart = dip.start.hour + (dip.start.minute || 0) / 60;
    const dipEnd = dip.end.hour + (dip.end.minute || 0) / 60;
    return slot.start < dipEnd && slot.end > dipStart;
  });
  if (isDipTime) score -= 30;

  // 优先安排今天和明天
  const slotDate = new Date(slot.isoDate);
  const daysFromNow = Math.floor((slotDate.getTime() - currentTime.getTime()) / (24 * 60 * 60 * 1000));
  score -= daysFromNow * 5;

  return score;
}

function generateDaySlots(dayIdx: number, isoDate: string, startHour: number, endHour: number): TimeSlot[] {
  return [{
    dayIdx,
    start: startHour,
    end: endHour,
    isoDate
  }];
}

function filterByFixedActivities(slots: TimeSlot[], activities: FixedActivity[], dayIdx: number): TimeSlot[] {
  // 简化实现：返回原始slots
  return slots;
}

function filterByExistingEvents(slots: TimeSlot[], events: CalendarAgentEvent[], isoDate: string): TimeSlot[] {
  // 简化实现：返回原始slots
  return slots;
}

function removeSlot(slots: TimeSlot[], usedSlot: TimeSlot): void {
  const idx = slots.findIndex(s =>
    s.isoDate === usedSlot.isoDate &&
    s.start === usedSlot.start
  );
  if (idx >= 0) slots.splice(idx, 1);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
