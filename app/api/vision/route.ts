/**
 * Vision API Route
 * Placeholder for Gemini Pro Vision integration.
 * 
 * ARCHITECTURE:
 * 1. Receives uploaded image/PDF from the frontend
 * 2. Sends to Gemini Pro Vision API with custom prompt
 * 3. Returns parsed schedule data
 * 
 * PROMPT INSTRUCTION (for Gemini):
 * "Parse this schedule image and output JSON format:
 * {
 *   \"activities\": [
 *     {
 *       \"label\": \"Activity Name\",
 *       \"day\": \"Monday|Tuesday|...|Sunday\",
 *       \"startHour\": 0-23,
 *       \"endHour\": 0-23,
 *       \"category\": \"DeepWork|ShallowWork|Admin|Creative|Social|Recovery\"
 *     }
 *   ]
 * }
 * 
 * Only output valid JSON, no explanation."
 */

import { NextRequest, NextResponse } from "next/server";
import { Weekday, CognitiveCategory } from "../../equi/types";

export interface VisionParsedActivity {
  id: string;
  label: string;
  day: Weekday;
  startHour: number;
  endHour: number;
  category: CognitiveCategory;
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

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, PDF" },
        { status: 400 }
      );
    }

    // Convert file to base64 for API call
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type;

    // ========================================================================
    // TODO: Implement actual Gemini Pro Vision API call
    // ========================================================================
    // 
    // Example implementation structure:
    //
    // const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    // const result = await model.generateContent([
    //   {
    //     inlineData: {
    //       data: base64,
    //       mimeType: mimeType
    //     }
    //   },
    //   `Parse this schedule and output JSON:
    //    { activities: [{ label, day, startHour, endHour, category }] }`
    // ]);
    // const response = result.response.text();
    // const parsed = JSON.parse(response);
    //
    // ========================================================================

    // Placeholder response - in production, this would call Gemini
    // Returning empty array to prevent hallucinations
    const placeholderResponse: VisionParsedActivity[] = [];

    return NextResponse.json({
      success: true,
      message: "Vision processing placeholder - implement Gemini Pro Vision API",
      activities: placeholderResponse,
      note: "This is a stub. Implement actual Gemini Pro Vision integration."
    });

  } catch (error) {
    console.error("Vision API error:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
