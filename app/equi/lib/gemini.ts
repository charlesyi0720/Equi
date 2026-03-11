/**
 * Gemini API Configuration
 * Shared utilities for Gemini integration
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDxrlkrGepqu5qxCTAtvQ5fikWDcevUSi0";
const GEMINI_MODEL = "gemini-2.0-pro-exp-02-05";

export const geminiConfig = {
  apiKey: GEMINI_API_KEY,
  model: GEMINI_MODEL,
  baseUrl: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
  
  // Build full URL with API key
  getUrl: () => `${geminiConfig.baseUrl}?key=${GEMINI_API_KEY}`,
};

/**
 * System prompt for Equi AI assistant
 */
export const EQUI_SYSTEM_PROMPT = `你是 Equi，一个冷静、专业的决策引擎。

你正在协助一个人格为 {MBTI} 的用户。
用户的生物钟高峰在 {PeakHours}，低谷在 {TroughHours}。
用户今天的日程表是：{ICS_Data}。

请基于以上数据，提供帕累托最优（Pareto-optimal）的时间分配建议。
语气要极简、专业、避免废话。

重要约束：
- 永远不要重复用户已经告诉你的信息
- 直接给出可执行的建议，不要问"你想怎么做？"
- 如果用户没有提供日程数据，直接说"我需要你的日程数据才能提供建议"
- 保持简洁，每条建议不超过 20 字
- 使用中文回复，除非用户用英文提问`;

/**
 * Build system prompt with user data
 */
export function buildSystemPrompt(userData: {
  mbti?: string;
  focusPeaks?: Array<{ weekday: string; start: { hour: number }; end: { hour: number } }>;
  energyDips?: Array<{ weekday: string; start: { hour: number }; end: { hour: number } }>;
  todaySchedule?: string;
}): string {
  const mbti = userData.mbti || "未知";
  
  const peakHours = userData.focusPeaks?.length 
    ? userData.focusPeaks.map(p => `${p.weekday} ${p.start.hour}:00-${p.end.hour}:00`).join(", ")
    : "未设置";
    
  const troughHours = userData.energyDips?.length
    ? userData.energyDips.map(d => `${d.weekday} ${d.start.hour}:00-${d.end.hour}:00`).join(", ")
    : "未设置";
    
  const icsData = userData.todaySchedule || "无";
  
  return EQUI_SYSTEM_PROMPT
    .replace("{MBTI}", mbti)
    .replace("{PeakHours}", peakHours)
    .replace("{TroughHours}", troughHours)
    .replace("{ICS_Data}", icsData);
}

/**
 * Format conversation history for Gemini API
 */
export function formatConversationHistory(
  messages: Array<{ role: "user" | "model"; content: string }>
) {
  return messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
}
