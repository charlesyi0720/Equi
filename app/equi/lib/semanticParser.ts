/**
 * Semantic Chunking Parser for EquiUser
 * Transforms structured EquiUser data into natural-language string chunks
 * for embedding into Supabase pgvector.
 */

import {
  EquiUser,
  Weekday,
  WeekdayPattern,
  CognitiveCategory,
  ActivityType,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function fmtTime(h: number, m?: number): string {
  return m ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : fmtHour(h);
}

function expandWeekdayPattern(pattern: WeekdayPattern): Weekday[] {
  if (Array.isArray(pattern)) return pattern;
  if (pattern === "Everyday") return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (pattern === "Weekdays") return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  if (pattern === "Weekends") return ["Saturday", "Sunday"];
  return [];
}

const CATEGORY_LABELS: Record<CognitiveCategory, string> = {
  DeepWork: "深度工作",
  ShallowWork: "浅层工作",
  Admin: "行政事务",
  Creative: "创意任务",
  Social: "社交互动",
  Recovery: "精力恢复",
};

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  strictlyFixed: "严格固定",
  flexibleFloating: "弹性浮动",
};

const PLANNING_STYLE_LABELS: Record<string, string> = {
  Structured: "结构化、有固定框架的日程安排",
  Flexible: "弹性、灵活的时间管理方式",
};

const PERSONA_LABELS: Record<string, string> = {
  DevotedSecretary: "温暖鼓励型的私人秘书",
  HardSupervisor: "简洁有力、严格要求成果的督导型",
};

const UPDATE_FREQ_LABELS: Record<string, string> = {
  Weekly: "周",
  Monthly: "月",
  Quarterly: "季度",
};

// MBTI cognitive-function context for work-style interpretation
// Covers all 16 types via dominant-function groupings
function mbtiWorkStyle(mbti: string): string {
  const map: Record<string, string> = {
    ISTJ: "注重细节，严格遵守时间承诺，偏好独立完成任务，不喜欢计划外的突发变更。",
    ISFJ: "忠诚可靠，倾向于维护现有秩序，在熟悉的流程中效率最高，对人际冲突比较敏感。",
    INFJ: "有理想主义倾向，专注于长期意义，对模糊的任务描述感到不适，需要明确的价值观对齐。",
    INTJ: "偏好深度思考和结构化分析，独立工作能力强，突发的打扰会严重消耗精力。",
    ISTP: "灵活务实，擅长解决具体问题，喜欢动手实验而非纯理论，对重复性事务耐心有限。",
    ISFP: "灵活敏感，重视个人空间和情感舒适区，在压力下容易回避冲突。",
    INFP: "富有同理心和创意，偏好自主探索而非严格指令，对批评过于自我批判。",
    INTP: "擅长抽象推理和系统性分析，专注力强但对社交仪式缺乏耐心，需要安静不被打断的工作环境。",
    ESTP: "行动力强，适应快，喜欢多任务和快节奏，但对需要长期专注的深度工作耐心不足。",
    ESFP: "社交活跃，偏好互动式工作，容易分心，需要外在激励来维持长期动力。",
    ENFP: "创意丰富，热爱自由探索而非严格排程，对单调任务容易产生倦怠感。",
    ENTP: "善于辩论和快速切换话题，挑战权威但有时缺乏执行耐力，喜欢高认知刺激。",
    ESTJ: "注重效率和结果，偏好清晰的目标和权威框架，对拖沓或不负责任的行为零容忍。",
    ESFJ: "热心服务型，关注他人感受，在支持性社交环境中表现最佳，对冷落或批评反应强烈。",
    ENFJ: "具有领袖魅力，善于激励他人，渴望被认可和欣赏，在正面鼓励下表现最优。",
    ENTJ: "果断决策，目标导向，喜欢掌控全局，对效率低下和犹豫不决没有耐心。",
  };
  return map[mbti] ?? `性格类型为 ${mbti}，工作风格描述暂无。`;
}

// ---------------------------------------------------------------------------
// Per-dimension parsers
// ---------------------------------------------------------------------------

function parsePersonaSummary(user: EquiUser): string {
  const { name, occupation, preferredTitle, bio } = user.understanding;
  return `${name} 是一位 ${preferredTitle}，职业为 ${occupation}。${bio ? bio : "暂无个人简介。"}`;
}

function parsePersonalityAnalysis(user: EquiUser): string {
  const { name, mbti, planningStyle, procrastinationIndex, pressureSensitivity, preferredAgentPersona } = user.understanding;

  const styleText = PLANNING_STYLE_LABELS[planningStyle] ?? `偏好 ${planningStyle} 方式`;
  const personaText = PERSONA_LABELS[preferredAgentPersona] ?? preferredAgentPersona;
  const mbtiContext = mbtiWorkStyle(mbti ?? "");

  return [
    `${name} 的 MBTI 类型是 ${mbti ?? "未知"}，${styleText}。`,
    `拖延倾向指数为 ${procrastinationIndex ?? 0}/10（数值越高越容易拖延），`,
    `压力敏感指数为 ${pressureSensitivity ?? 0}/10（数值越高对外部压力越敏感）。`,
    `${name} 偏好的 AI 助手风格为 ${personaText}。`,
    `MBTI 工作风格解读：${mbtiContext}`,
  ].join("");
}

function parseBiologicalClock(user: EquiUser): string {
  const { name, biologicalClock } = user.understanding;
  const { focusPeaks = [], energyDips = [] } = biologicalClock;

  const peakLines: string[] = [];
  for (const peak of focusPeaks) {
    const start = fmtTime(peak.start.hour, peak.start.minute);
    const end = fmtTime(peak.end.hour, peak.end.minute);
    peakLines.push(
      `在 ${peak.weekday} 的 ${start}–${end}，${name} 的专注力处于高峰期，${
        peak.notes
          ? peak.notes
          : "这段时间适合安排深度思考、创意写作或复杂问题解决等高认知负荷任务。"
      }`
    );
  }

  const dipLines: string[] = [];
  for (const dip of energyDips) {
    const start = fmtTime(dip.start.hour, dip.start.minute);
    const end = fmtTime(dip.end.hour, dip.end.minute);
    dipLines.push(
      `在 ${dip.weekday} 的 ${start}–${end}，${name} 的精力进入低谷，${
        dip.notes
          ? dip.notes
          : "此时适合处理邮件回复、文档整理、行政杂务等低认知负荷任务，或主动安排休息恢复。"
      }`
    );
  }

  if (peakLines.length === 0 && dipLines.length === 0) {
    return `${name} 尚未设置专注力高峰和精力低谷的时间段。`;
  }

  return [
    `${name} 的生物钟特征如下。`,
    ...peakLines,
    ...dipLines,
  ].join(" ");
}

function parseFixedActivities(user: EquiUser): string {
  const { name } = user.understanding;
  const activities = user.lifeStructure?.fixedActivities ?? [];

  if (activities.length === 0) {
    return `${name} 尚未设置任何固定日程。`;
  }

  const lines: string[] = [`${name} 每周的固定日程如下：`];

  for (const activity of activities) {
    if (activity.activityType === "flexibleFloating") continue; // handled separately

    const categoryText = CATEGORY_LABELS[activity.category] ?? activity.category;
    const typeText = ACTIVITY_TYPE_LABELS[activity.activityType] ?? activity.activityType;
    const constraintText = activity.isHardConstraint ? "不可调整的硬约束" : "建议保护但可协商";

    const days = expandWeekdayPattern(activity.weekdayPattern);
    if (days.length === 0 || activity.slots.length === 0) continue;

    // Group slots by day for cleaner output
    const slotDescs = activity.slots
      .map((slot) => {
        const s = fmtTime(slot.startHour, slot.startMinute);
        const e = fmtTime(slot.endHour, slot.endMinute);
        return `${slot.day} 的 ${s}–${e}`;
      })
      .join("、");

    const locationNote = activity.location ? `，地点为 ${activity.location}` : "";
    const notesNote = activity.notes ? `。备注：${activity.notes}` : "";

    lines.push(
      `${activity.label} 在 ${slotDescs}（${typeText}，${constraintText}），属于「${categoryText}」类活动${locationNote}。${notesNote}`
    );
  }

  return lines.join(" ");
}

function parseFlexibleActivities(user: EquiUser): string {
  const { name } = user.understanding;
  const flexible = (user.lifeStructure?.fixedActivities ?? []).filter(
    (a) => a.activityType === "flexibleFloating"
  );

  if (flexible.length === 0) {
    return `${name} 尚未设置任何弹性浮动活动。`;
  }

  const lines: string[] = [`${name} 的弹性浮动活动（灵活安排，无需固定时段）如下：`];

  for (const activity of flexible) {
    const quota = activity.flexibleQuota;
    const minsPerDay = quota?.dailyMinutes ?? 0;
    const preferred = quota?.preferredSlot ?? "anytime";
    const slotLabel = preferred === "focusPeaks" ? "优先安排在专注力高峰期" : preferred === "anytime" ? "任意时段均可" : preferred;

    const categoryText = CATEGORY_LABELS[activity.category] ?? activity.category;
    const dailyStr = minsPerDay > 0 ? `每天目标 ${Math.round(minsPerDay / 60 * 10) / 10} 小时` : "";
    const locationNote = activity.location ? `，地点为 ${activity.location}` : "";

    lines.push(
      `【${activity.label}】${dailyStr}（${slotLabel}），属于「${categoryText}」类${locationNote}。`
    );
  }

  return lines.join(" ");
}

function parseLifeModeContext(user: EquiUser): string {
  const { name, lifeState, updatePreferences } = user.understanding;
  const { mode, label, description, expectedEnd } = lifeState;

  const modeText = label ?? mode;
  const descText = description ? `状态描述为：${description}。` : "";
  const endText = expectedEnd ? `预计于 ${expectedEnd} 结束。` : "预计结束时间未设置。";

  const freqText = UPDATE_FREQ_LABELS[updatePreferences.frequency] ?? updatePreferences.frequency;
  const checkInText = updatePreferences.preferredCheckInTime
    ? `偏好更新检查时间为 ${fmtTime(updatePreferences.preferredCheckInTime.hour, updatePreferences.preferredCheckInTime.minute)}`
    : "偏好更新检查时间未设置";

  return [
    `${name} 当前处于「${modeText}」模式，${descText}${endText}`,
    `${name} 偏好每${freqText}回顾一次日程，${checkInText}。`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Transforms an EquiUser into an array of semantically rich, natural-language
 * strings suitable for pgvector embedding.
 *
 * Chunk order is intentionally stable so callers can use chunk index as
 * a rough semantic category identifier.
 */
export function generateUserContextChunks(userData: EquiUser): string[] {
  if (!userData?.understanding?.name) {
    return ["用户数据不完整，无法生成语义上下文。"];
  }

  const chunks: string[] = [];

  chunks.push(parsePersonaSummary(userData));
  chunks.push(parsePersonalityAnalysis(userData));
  chunks.push(parseBiologicalClock(userData));
  chunks.push(parseFixedActivities(userData));
  chunks.push(parseFlexibleActivities(userData));
  chunks.push(parseLifeModeContext(userData));

  return chunks.filter((c) => c.length > 0);
}
