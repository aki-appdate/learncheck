import type { Difficulty, ReviewStatus } from "./types";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "やさしい",
  normal: "ふつう",
  hard: "むずかしい",
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard"];

/** 難しさで何が変わるか（作成画面の説明と、AIへの指示文で同じものを使う） */
export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: "きまりの問題は「正しいもの」を選ぶ形が多め。数字の誤答は正解から離れた数で、見分けやすい",
  normal: "穴埋めと、きまりを問う問題（正しいもの／合わないものを選ぶ）を混ぜる",
  hard: "「資料の内容と合わないもの」を選ぶ問題が多め。誤答は同じ項目の文から選び、数字は資料の別の数字と取り違えやすくする",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: "未確認",
  approved: "採用",
  discarded: "捨てる",
};

export const QUESTION_COUNTS = [5, 8, 10] as const;
