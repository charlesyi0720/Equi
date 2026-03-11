/**
 * Synthesis API Route
 * Uses Gemini 2.0 Pro for conversational AI assistant.
 * Receives user question + Supabase profile data, returns streaming response.
 */

import { NextRequest, NextResponse } from "next/server";
import { geminiConfig, buildSystemPrompt } from "../../equi/lib/gemini";

export interface SynthesisRequest {
  message: string;
  conversationHistory: Array<{ role: "user" | "model"; content: string }>;
  userData: {
    mbti?: string;
    name?: string;
    focusPeaks?: Array<{ weekday: string; start: { hour: number; minute?: number }; end: { hour: number; minute?: number } }>;
    energyDips?: Array<{ weekday: string; start: { hour: number; minute?: number }; end: { hour: number; minute?: number } }>;
    todaySchedule?: string;
    preferredAgentPersona?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: SynthesisRequest = await request.json();
    const { message, conversationHistory, userData } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Build system prompt with user data
    const systemPrompt = buildSystemPrompt({
      mbti: userData?.mbti,
      focusPeaks: userData?.focusPeaks,
      energyDips: userData?.energyDips,
      todaySchedule: userData?.todaySchedule,
    });

    // Format conversation history
    const historyParts = conversationHistory?.slice(-10).map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    })) || [];

    // Build request to Gemini API
    const requestBody = {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      contents: [
        ...historyParts,
        {
          role: "user",
          parts: [{ text: message }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
        stream: true,
      },
    };

    // Call Gemini API with streaming
    const response = await fetch(geminiConfig.getUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Gemini API failed", details: errorText },
        { status: 500 }
      );
    }

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode and parse the stream data
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split("\n").filter((line) => line.trim() !== "");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    controller.enqueue(encoder.encode(text));
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                }
              }
            }
          }
        } catch (e) {
          console.error("Stream error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Synthesis API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * Generate opening message (proactive insight)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userDataParam = searchParams.get("userData");
    
    if (!userDataParam) {
      return NextResponse.json(
        { error: "userData is required" },
        { status: 400 }
      );
    }

    let userData;
    try {
      userData = JSON.parse(decodeURIComponent(userDataParam));
    } catch {
      return NextResponse.json(
        { error: "Invalid userData format" },
        { status: 400 }
      );
    }

    const { name, mbti, focusPeaks, energyDips, preferredAgentPersona } = userData;

    // Build opening message prompt
    const systemPrompt = buildSystemPrompt({
      mbti,
      focusPeaks,
      energyDips,
    });

    const openingMessage = `${name || "用户"}，你好。我是 Equi，你的个人 AI 生活架构师。`;

    // Build request to Gemini API
    const requestBody = {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt + "\n\n请用 1-2 句话作为开场白，语气根据人格设定调整（DevotedSecretary 要温暖鼓励，HardSupervisor 要简洁有力）。" }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: openingMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.95,
        topK: 40,
      },
    };

    const response = await fetch(geminiConfig.getUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Gemini API failed", details: errorText },
        { status: 500 }
      );
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "让我帮你优化今天的时间安排。";

    return NextResponse.json({ openingMessage: text });
  } catch (error) {
    console.error("Opening message API error:", error);
    return NextResponse.json(
      { error: "Failed to generate opening message" },
      { status: 500 }
    );
  }
}
