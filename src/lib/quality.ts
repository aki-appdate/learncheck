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
  // 根拠の文が資料にあっても、正解と関係のない文を引いていることがある（ゆるすぎる確認を補う）
  const answer = q.choices[q.answerIndex];
  if (quote.found && answer && !sharesWord(answer, q.quote)) {
    issues.push({
      level: "warn",
      code: "answer_not_in_quote",
      message: "正解の根拠になっているか確認してください（正解の選択肢の言葉が、根拠の文に1つも出てきません）",
    });
  }
  if (!q.explanation.trim()) {
    issues.push({ level: "warn", code: "explanation", message: "解説が空です。受講者が間違えたときに理由が分かりません" });
  }
  return { quote, issues };
}

/**
 * 選択肢の中の「言葉」（2文字以上の漢字・カタカナ、英数字のまとまり）を取り出す。
 * 1文字の漢字（「上」など）はどこにでも出てくるので、ほかに言葉がないときだけ使う。
 * それもなければ、ひらがな2文字以上のまとまりを使う。
 */
export function choiceWords(choice: string): string[] {
  const t = normalize(choice).text;
  const all = t.match(/[一-龠々〆ヶ]+|[ァ-ヴー]{2,}|[A-Za-z0-9]+/g) ?? [];
  const long = all.filter((w) => !/^[一-龠々〆ヶ]$/.test(w));
  if (long.length) return long;
  if (all.length) return all;
  return t.match(/[ぁ-ゖ]{2,}/g) ?? [];
}

/** 正解の選択肢の言葉が、根拠の文に1つでも出てくるか。3文字以上の漢字の言葉は、2文字の部分が出てくればよい */
export function sharesWord(choice: string, quote: string): boolean {
  const q = normalize(quote).text;
  const words = choiceWords(choice);
  if (!words.length) return true;
  return words.some((w) => {
    if (q.includes(w)) return true;
    if (/^[一-龠々〆ヶ]{3,}$/.test(w)) {
      for (let i = 0; i + 2 <= w.length; i++) if (q.includes(w.slice(i, i + 2))) return true;
    }
    return false;
  });
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

/**
 * 「直して採用」で、人が実際に書き換えたか（何も変えずに押した場合は「人が修正」の印を付けない）。
 * 保存のときに前後の空白を取り除くので、空白だけの違いは書き換えとみなさない。
 */
export function isChanged(before: GeneratedQuestion, after: GeneratedQuestion): boolean {
  const same = (a: string, b: string) => a.trim() === b.trim();
  return (
    !same(before.prompt, after.prompt) ||
    !same(before.explanation, after.explanation) ||
    !same(before.quote, after.quote) ||
    before.answerIndex !== after.answerIndex ||
    before.difficulty !== after.difficulty ||
    before.choices.length !== after.choices.length ||
    before.choices.some((c, i) => !same(c, after.choices[i] ?? ""))
  );
}
