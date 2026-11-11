import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import type { FirebaseApp } from "firebase/app";
import type { z } from "zod";

// Firebase AI Logic 経由で Gemini を呼ぶ。Sparkプラン（無料）の無料枠で動かす前提。
// 返答は JSON Schema で形を指定し、受け取ったあと zod でもう一度確かめる。

export const GEMINI_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-3.5-flash-lite";

export async function generateStructured<T>(params: {
  app: FirebaseApp;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<T> {
  const ai = getAI(params.app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: GEMINI_MODEL,
    systemInstruction: params.system,
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: params.jsonSchema,
      temperature: 0.3,
      maxOutputTokens: params.maxOutputTokens ?? 1024,
    },
  });
  const result = await model.generateContent(params.prompt);
  const text = result.response.text();
  return params.schema.parse(JSON.parse(text));
}
