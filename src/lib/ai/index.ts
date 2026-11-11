import { ZodError } from "zod";
import { getFirebaseApp } from "../firebase";
import { toDateKey } from "../dates";
import type { TestStats } from "../analytics";
import { followUpJsonSchema, followUpSchema, quizJsonSchema, quizSchema } from "../schemas";
import type { AiSource, Difficulty, FollowUpInsight, GeneratedQuestion, Person, Test } from "../types";
import { generateStructured } from "./gemini";
import { buildFollowUpPrompt, buildQuizPrompt, FOLLOWUP_SYSTEM, QUIZ_SYSTEM } from "./prompts";
import { sampleFollowUp, sampleQuiz } from "./sample";

// 画面から呼ぶのはこのファイルだけ。
// Geminiが使えれば使い、使えなければ（未設定・回数の上限・エラー・返答の形が不正）見本の返答に切り替える。

export type AiResult<T> = { value: T; source: AiSource; note?: string };

/**
 * 無料枠を一人で使い切らないよう、ブラウザごとに1日の回数の目安を設ける。
 * localStorage に数えるだけなので、消せば数え直しになる（本当の上限ではない）。
 * 利用者ごとの上限は、Firebase AI Logic 側の設定（利用者ごとの回数制限）でかける前提。
 */
const DAILY_LIMIT = 20;
const USAGE_KEY = "learncheck:ai-usage";

function takeQuota(): boolean {
  try {
    const today = toDateKey(new Date());
    const raw = localStorage.getItem(USAGE_KEY);
    const u = raw ? (JSON.parse(raw) as { date: string; count: number }) : { date: today, count: 0 };
    const cur = u.date === today ? u : { date: today, count: 0 };
    if (cur.count >= DAILY_LIMIT) return false;
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: today, count: cur.count + 1 }));
    return true;
  } catch {
    return true;
  }
}

export function aiMode(): AiSource {
  return getFirebaseApp() ? "gemini" : "sample";
}

const LIMIT_NOTE = "今日のAI利用回数の上限に達したため、見本の返答を表示しています";
const ERROR_NOTE = "AIに接続できなかったため、見本の返答を表示しています";
const FORMAT_NOTE = "AIの返答の形が正しくなかったため、見本の返答を表示しています";

/** 返答の形が不正（JSONとして読めない・決めた形と違う）か。通信エラーとは別の案内を出す */
export function isFormatError(e: unknown): boolean {
  return e instanceof SyntaxError || e instanceof ZodError;
}

export async function generateQuiz(input: {
  title: string;
  body: string;
  count: number;
  difficulty: Difficulty;
  /** 見本の返答で「作り直す」ときに別の問題を出すための番号 */
  variant?: number;
}): Promise<AiResult<GeneratedQuestion[]>> {
  const fallback = (note?: string): AiResult<GeneratedQuestion[]> => ({
    value: sampleQuiz(input),
    source: "sample",
    note,
  });

  const app = getFirebaseApp();
  if (!app) return fallback();
  if (!takeQuota()) return fallback(LIMIT_NOTE);

  try {
    const value = await generateStructured({
      app,
      system: QUIZ_SYSTEM,
      prompt: buildQuizPrompt(input),
      schema: quizSchema,
      jsonSchema: quizJsonSchema,
      maxOutputTokens: 6000,
    });
    // 引用文の確認は、ここでは捨てずに画面で「根拠を確認できません」と目立たせ、人に判断してもらう
    return { value: value.questions.slice(0, input.count), source: "gemini" };
  } catch (e) {
    console.warn("[ai] generateQuiz fallback", e);
    return fallback(isFormatError(e) ? FORMAT_NOTE : ERROR_NOTE);
  }
}

export async function suggestFollowUp(test: Test, stats: TestStats, people: Person[]): Promise<AiResult<FollowUpInsight>> {
  const fallback = (note?: string): AiResult<FollowUpInsight> => ({
    value: sampleFollowUp(test, stats, people),
    source: "sample",
    note,
  });
  const app = getFirebaseApp();
  if (!app || stats.learnerCount === 0) return fallback();
  if (!takeQuota()) return fallback(LIMIT_NOTE);

  try {
    const value = await generateStructured({
      app,
      system: FOLLOWUP_SYSTEM,
      prompt: buildFollowUpPrompt(test, stats, people),
      schema: followUpSchema,
      jsonSchema: followUpJsonSchema,
      maxOutputTokens: 1500,
    });
    return keepEvidenced(value, test) ?? fallback("AIの返答に根拠が確認できなかったため、見本の返答を表示しています");
  } catch (e) {
    console.warn("[ai] suggestFollowUp fallback", e);
    return fallback(isFormatError(e) ? FORMAT_NOTE : ERROR_NOTE);
  }
}

/** 根拠の問題IDは実在するものだけ残す。根拠が1つも残らない提案は捨てる。全部捨てたら null */
export function keepEvidenced(value: FollowUpInsight, test: Test): AiResult<FollowUpInsight> | null {
  const ids = new Set(test.questions.map((q) => q.id));
  const findings = value.findings
    .map((f) => ({ ...f, evidenceQuestionIds: [...new Set(f.evidenceQuestionIds)].filter((id) => ids.has(id)) }))
    .filter((f) => f.evidenceQuestionIds.length > 0);
  if (findings.length === 0) return null;
  return { value: { ...value, findings }, source: "gemini" };
}
