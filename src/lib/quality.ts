// 問題の「機械で確かめられる点」をチェックする。人の確認の前に、見落としやすい不備を目立たせるため。
// error：このままでは採用できない（直すか捨てる）／ warn：注意して確認してほしい

import { findQuote, normalize, QUOTE_REASON_LABEL, type QuoteMatch } from "./quote";
import type { GeneratedQuestion, TestQuestion } from "./types";

export type Issue = { level: "error" | "warn"; code: string; message: string };

export const CHOICE_MARKS = ["A", "B", "C", "D"];

export function checkQuestion(q: GeneratedQuestion, material: string): { quote: QuoteMatch; issues: Issue[] } {
  const issues: Issue[] = [];
  const quote = findQuote(material, q.quote);
  if (!quote.found) {
    issues.push({ level: "error", code: "quote", message: `根拠を確認できません：${QUOTE_REASON_LABEL[quote.reason]}` });
  }
  if (!q.prompt.trim()) issues.push({ level: "error", code: "prompt", message: "問題文が空です" });
  if (q.choices.length !== 4) {
    issues.push({ level: "error", code: "choices", message: "選択肢は4つ必要です" });
  }
  if (q.choices.some((c) => !c.trim())) {
    issues.push({ level: "error", code: "empty_choice", message: "空の選択肢があります" });
  }
  const keys = q.choices.map((c) => normalize(c).text).filter(Boolean);
  if (new Set(keys).size !== keys.length) {
    issues.push({ level: "error", code: "duplicate", message: "同じ内容の選択肢があります" });
  }
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
    issues.push({ level: "error", code: "answer", message: "正解が選ばれていません" });
  }
  if (!q.explanation.trim()) {
    issues.push({ level: "warn", code: "explanation", message: "解説が空です。受講者が間違えたときに理由が分かりません" });
  }
  return { quote, issues };
}

export function hasError(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}

/** テスト全体のチェック（捨てた問題は数えない） */
export function checkTest(questions: TestQuestion[]): Issue[] {
  const live = questions.filter((q) => q.review !== "discarded");
  const issues: Issue[] = [];

  // 正解の位置の偏り：受講者が「迷ったらA」で正解できてしまうのを防ぐ
  if (live.length >= 4) {
    const counts = [0, 0, 0, 0];
    live.forEach((q) => {
      if (q.answerIndex >= 0 && q.answerIndex < 4) counts[q.answerIndex]++;
    });
    const max = Math.max(...counts);
    const at = counts.indexOf(max);
    if (max / live.length > 0.5) {
      issues.push({
        level: "warn",
        code: "answer_bias",
        message: `正解が「${CHOICE_MARKS[at]}」に偏っています（${live.length}問中${max}問）。選択肢の順番を入れ替えると、当て推量で正解しにくくなります`,
      });
    }
  }

  // 同じ問題文が2つ以上ある
  const seen = new Map<string, number>();
  live.forEach((q, i) => {
    const k = normalize(q.prompt).text;
    if (seen.has(k)) {
      issues.push({ level: "warn", code: "duplicate_prompt", message: `第${seen.get(k)! + 1}問と第${i + 1}問の問題文が同じです` });
    } else {
      seen.set(k, i);
    }
  });
  return issues;
}

/** 公開できるか。未確認の問題が残っていない・採用した問題が3問以上・採用した問題に不備がない */
export function publishBlockers(questions: TestQuestion[], material: string): string[] {
  const reasons: string[] = [];
  const pending = questions.filter((q) => q.review === "pending").length;
  const approved = questions.filter((q) => q.review === "approved");
  if (pending > 0) reasons.push(`まだ確認していない問題が${pending}問あります`);
  if (approved.length < 3) reasons.push("採用した問題が3問以上必要です");
  if (approved.some((q) => hasError(checkQuestion(q, material).issues))) reasons.push("採用した問題に、直す必要のある点があります");
  return reasons;
}
