import { z } from "zod";

// AIの返答は必ずこの形で受け取り、形が合わなければ使わない（見本の返答に切り替える）。
// 同じ定義から「AIに渡す返答形式（JSON Schema）」も作るので、ずれが起きない。

export const questionSchema = z.object({
  prompt: z.string().min(1).max(300).describe("問題文。資料を読めば答えられる内容にする"),
  choices: z.array(z.string().min(1).max(100)).length(4).describe("選択肢を4つ。正解は1つだけ。同じ内容の選択肢を作らない"),
  answerIndex: z.number().int().min(0).max(3).describe("正解の選択肢の位置（0〜3）"),
  explanation: z.string().min(1).max(250).describe("なぜその答えが正しいかの解説。資料の内容に沿って書く"),
  quote: z
    .string()
    .min(1)
    .max(200)
    .describe("正解の根拠となる資料の文。資料から一字一句そのまま書き写す。要約・言い換えはしない"),
  difficulty: z.enum(["easy", "normal", "hard"]).describe("難しさ。easy=資料を読めばすぐ分かる, normal=内容の理解が必要, hard=紛らわしい選択肢あり"),
});

export const quizSchema = z.object({
  questions: z.array(questionSchema).min(1).max(10),
});

export const followUpSchema = z.object({
  headline: z.string().max(80).describe("受講者の理解度を一言で"),
  findings: z
    .array(
      z.object({
        title: z.string().max(40),
        detail: z.string().max(220),
        evidenceQuestionIds: z
          .array(z.string())
          .min(1)
          .max(4)
          .describe("根拠にした問題のid。渡されたidだけを使う"),
      }),
    )
    .min(1)
    .max(3),
  actions: z.array(z.string().max(100)).min(1).max(3).describe("研修担当が次にできる具体的なフォロー"),
});

export const quizJsonSchema = z.toJSONSchema(quizSchema);
export const followUpJsonSchema = z.toJSONSchema(followUpSchema);
