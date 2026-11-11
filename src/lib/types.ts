// アプリ全体で使うデータの形。画面・保存・AIのすべてがこの型を共有する。

export type Role = "trainer" | "learner";

/** 使う人。研修担当は1人、受講者は部署つき */
export type Person = {
  id: string;
  name: string;
  role: Role;
  /** 受講者の部署。研修担当は null */
  department: string | null;
};

/** 研修資料（社内向けの架空の資料） */
export type Material = {
  id: string;
  title: string;
  /** 対象（例：新入社員） */
  audience: string;
  body: string;
};

export type Difficulty = "easy" | "normal" | "hard";

/** AI（または見本の返答）が作る4択問題 */
export type GeneratedQuestion = {
  prompt: string;
  /** 選択肢はいつも4つ */
  choices: string[];
  /** 正解の位置（0〜3） */
  answerIndex: number;
  explanation: string;
  /** 根拠となる資料の引用文。資料の中に本当にあるかをコードで確かめる */
  quote: string;
  difficulty: Difficulty;
};

/** 研修担当の確認状況 */
export type ReviewStatus = "pending" | "approved" | "discarded";

export type TestQuestion = GeneratedQuestion & {
  id: string;
  review: ReviewStatus;
  /** 人が書き換えたか */
  edited: boolean;
};

export type AiSource = "gemini" | "sample";

export type TestStatus = "draft" | "published";

export type Test = {
  id: string;
  title: string;
  /** 元にした資料。貼り付けた資料でも後から根拠を確かめられるよう、本文ごと持つ */
  material: { id: string | null; title: string; body: string };
  status: TestStatus;
  questions: TestQuestion[];
  createdAt: string;
  publishedAt: string | null;
  /** 問題を作ったのがGeminiか見本の返答か（デモ用の例はnull） */
  aiSource: AiSource | null;
  /** 画面に出す補足（デモ用の例であることなど） */
  note: string | null;
};

/** 受講者の1回分の回答 */
export type Attempt = {
  id: string;
  testId: string;
  learnerId: string;
  answers: { questionId: string; choice: number }[];
  /** 受け終わった日時（ISO文字列） */
  at: string;
};

/** 研修担当向け：AIがまとめるフォロー研修の提案 */
export type FollowUpInsight = {
  headline: string;
  findings: {
    title: string;
    detail: string;
    /** 根拠にした問題のID */
    evidenceQuestionIds: string[];
  }[];
  actions: string[];
};
