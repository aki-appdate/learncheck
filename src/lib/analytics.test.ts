import { describe, expect, it } from "vitest";
import { computeTestStats, latestByLearner, scoreAttempt } from "./analytics";
import type { Attempt, Person, Test, TestQuestion } from "./types";

const q = (id: string, answerIndex: number): TestQuestion => ({
  id,
  prompt: id,
  choices: ["a", "b", "c", "d"],
  answerIndex,
  explanation: "",
  quote: "",
  difficulty: "normal",
  review: "approved",
  edited: false,
});

const TEST: Test = {
  id: "t1",
  title: "テスト",
  material: { id: null, title: "資料", body: "" },
  status: "published",
  questions: [q("q1", 0), q("q2", 1)],
  createdAt: "2026-11-01T00:00:00.000Z",
  publishedAt: "2026-11-01T00:00:00.000Z",
  aiSource: "sample",
  note: null,
};

const PEOPLE: Person[] = [
  { id: "tr", name: "担当", role: "trainer", department: null },
  { id: "a", name: "A", role: "learner", department: "営業" },
  { id: "b", name: "B", role: "learner", department: "営業" },
  { id: "c", name: "C", role: "learner", department: "総務" },
  { id: "d", name: "D", role: "learner", department: "総務" },
];

const att = (id: string, learnerId: string, choices: number[], at: string): Attempt => ({
  id,
  testId: "t1",
  learnerId,
  answers: choices.map((choice, i) => ({ questionId: `q${i + 1}`, choice })),
  at,
});

describe("scoreAttempt（採点）", () => {
  it("正解数と100点満点の点数を出す", () => {
    expect(scoreAttempt(TEST, att("x", "a", [0, 1], "").answers)).toEqual({ correct: 2, total: 2, score: 100 });
    expect(scoreAttempt(TEST, att("x", "a", [0, 2], "").answers)).toEqual({ correct: 1, total: 2, score: 50 });
  });

  it("答えていない問題は不正解として数える", () => {
    expect(scoreAttempt(TEST, [{ questionId: "q1", choice: 0 }])).toEqual({ correct: 1, total: 2, score: 50 });
  });
});

describe("latestByLearner", () => {
  it("同じ人の結果は最新の1回だけを使い、回数を数える", () => {
    const r = latestByLearner(
      [att("1", "a", [1, 1], "2026-11-02T00:00:00Z"), att("2", "a", [0, 1], "2026-11-03T00:00:00Z")],
      "t1",
    );
    expect(r).toHaveLength(1);
    expect(r[0].latest.id).toBe("2");
    expect(r[0].count).toBe(2);
  });
});

describe("computeTestStats（正答率の集計）", () => {
  const attempts = [
    att("1", "a", [0, 1], "2026-11-02T00:00:00Z"), // 100点
    att("2", "b", [0, 3], "2026-11-02T00:00:00Z"), // 50点
    att("3", "c", [2, 3], "2026-11-02T00:00:00Z"), // 0点
    att("0", "c", [0, 1], "2026-11-01T00:00:00Z"), // cの古い結果（使わない）
  ];
  const s = computeTestStats(TEST, attempts, PEOPLE);

  it("受講人数・平均点・未受講者", () => {
    expect(s.learnerCount).toBe(3);
    expect(s.targetCount).toBe(4);
    expect(s.avgScore).toBe(50);
    expect(s.perfectCount).toBe(1);
    expect(s.notTaken).toEqual(["d"]);
  });

  it("問題ごとの正答率と、一番多い誤答", () => {
    const [s1, s2] = s.questions;
    expect(s1.correctRate).toBeCloseTo(2 / 3);
    expect(s1.choiceCounts).toEqual([2, 0, 1, 0]);
    expect(s2.correctRate).toBeCloseTo(1 / 3);
    expect(s2.topWrong).toEqual({ choice: 3, count: 2, share: 2 / 3 });
  });

  it("よく選ばれた誤答は多い順", () => {
    expect(s.commonWrong[0]).toMatchObject({ questionId: "q2", choice: 3, count: 2 });
  });

  it("部署別は平均点の低い順。部署で一番低い問題も出す", () => {
    expect(s.departments.map((d) => d.department)).toEqual(["総務", "営業"]);
    expect(s.departments[0]).toMatchObject({ learners: 1, avgScore: 0 });
    expect(s.departments[1]).toMatchObject({ learners: 2, avgScore: 75, weakest: { questionId: "q2", correctRate: 0.5 } });
  });

  it("結果がなければ0で、エラーにならない", () => {
    const e = computeTestStats(TEST, [], PEOPLE);
    expect(e.avgScore).toBe(0);
    expect(e.questions[0].correctRate).toBe(0);
    expect(e.departments).toEqual([]);
  });
});
