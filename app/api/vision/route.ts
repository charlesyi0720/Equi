/**
 * Vision API Route
 * Uses Gemini 1.5 Flash for schedule extraction from images/PDFs.
 */

import { NextRequest, NextResponse } from "next/server";
import { Weekday, CognitiveCategory } from "../../equi/types";

const API_KEY = "AIzaSyDxrlkrGepqu5qxCTAtvQ5fikWDcevUSi0";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

export interface VisionParsedActivity {
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, PDF" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    const mimeType = file.type === "application/pdf" ? "application/pdf" : file.type;

    const prompt = `Parse this schedule (image or PDF) and extract all activities. For each activity, provide:
- label: The name of the activity (e.g., "Math Class", "Team Meeting")
- day: Day of the week (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday)
- startHour: Start hour in 24-hour format (0-23)
- endHour: End hour in 24-hour format (0-23)
- category: One of DeepWork, ShallowWork, Admin, Creative, Social, or Recovery

Output ONLY valid JSON array in this exact format (no other text):
[
  {"label": "Activity Name", "day": "Monday", "startHour": 9, "endHour": 10, "category": "DeepWork"}
]

If no schedule data is found, return an empty array [].`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64,
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    
    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
      console.error("Unexpected Gemini response:", result);
      return NextResponse.json(
        { error: "Failed to parse Gemini response" },
        { status: 500 }
      );
    }

    const textResponse = result.candidates[0].content.parts[0].text;
    
    let activities: VisionParsedActivity[];
    try {
      const cleanedResponse = textResponse.replace(/```json|```/g, "").trim();
      activities = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON response:", textResponse);
      return NextResponse.json(
        { error: "Failed to parse schedule data" },
        { status: 500 }
      );
    }

    const validDays: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const validCategories: CognitiveCategory[] = ["DeepWork", "ShallowWork", "Admin", "Creative", "Social", "Recovery"];

    const sanitizedActivities: VisionParsedActivity[] = activities
      .filter((a): a is VisionParsedActivity => 
        a && 
        typeof a.label === "string" && 
        validDays.includes(a.day) &&
        validCategories.includes(a.category) &&
        typeof a.startHour === "number" &&
        typeof a.endHour === "number"
      )
      .map(a => ({
        id: generateId(),
        label: a.label,
        day: a.day,
        startHour: Math.max(0, Math.min(23, a.startHour)),
        endHour: Math.max(0, Math.min(23, a.endHour)),
        category: a.category
      }));

    return NextResponse.json({
      success: true,
      activities: sanitizedActivities
    });

  } catch (error) {
    console.error("Vision API error:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
