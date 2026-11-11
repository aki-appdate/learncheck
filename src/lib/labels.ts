import type { Difficulty, ReviewStatus } from "./types";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "やさしい",
  normal: "ふつう",
  hard: "むずかしい",
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard"];

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: "未確認",
  approved: "採用",
  discarded: "捨てる",
};

export const QUESTION_COUNTS = [5, 8, 10] as const;
