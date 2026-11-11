import { describe, expect, it } from "vitest";
import { computeTestStats, latestByLearner, LOW_RATE, MIN_LEARNERS, needsFollowUp, pct, scoreAttempt, targetLearners } from "./analytics";
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
  targetDepartments: null,
  generation: null,
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

describe("departmentGaps（部署×問題で、全体より大きく低い問題）", () => {
  // 営業3人・総務3人。q1 は営業が全員正解、総務が全員不正解（全体50%・総務0%）
  const people: Person[] = [
    ...PEOPLE.slice(0, 3),
    { id: "e", name: "E", role: "learner", department: "営業" },
    { id: "c", name: "C", role: "learner", department: "総務" },
    { id: "d", name: "D", role: "learner", department: "総務" },
    { id: "f", name: "F", role: "learner", department: "総務" },
  ];
  const attempts = [
    att("1", "a", [0, 1], "2026-11-02T00:00:00Z"),
    att("2", "b", [0, 1], "2026-11-02T00:00:00Z"),
    att("3", "e", [0, 1], "2026-11-02T00:00:00Z"),
    att("4", "c", [3, 1], "2026-11-02T00:00:00Z"),
    att("5", "d", [3, 1], "2026-11-02T00:00:00Z"),
    att("6", "f", [2, 1], "2026-11-02T00:00:00Z"),
  ];
  const s = computeTestStats(TEST, attempts, people);

  it("部署の正答率が全体より大きく低い問題を、部署・人数・よく選ばれた誤答つきで返す", () => {
    expect(s.departmentGaps).toEqual([
      { department: "総務", questionId: "q1", index: 0, answered: 3, deptRate: 0, overallRate: 0.5, topWrong: { choice: 3, count: 2 } },
    ]);
  });

  it("部署×問題の正答率の表も返す（AIへの指示文に使う）", () => {
    expect(s.departmentQuestions.map((d) => [d.department, d.questions.map((q) => q.correctRate)])).toEqual([
      ["営業", [1, 1]],
      ["総務", [0, 1]],
    ]);
  });

  it("答えた人が少ない部署（2人以下）は、偶然の可能性があるので挙げない", () => {
    const few = computeTestStats(TEST, attempts.filter((a) => a.learnerId !== "f"), people);
    expect(few.departmentGaps).toEqual([]);
  });
});

describe("needsFollowUp（要フォローの問題か：3回目のチェックの指摘）", () => {
  it("受講者が3人未満のうちは、正答率が0%でも要フォローにしない", () => {
    // 1人：q2を間違えて正答率0%
    const one = computeTestStats(TEST, [att("1", "a", [0, 3], "2026-11-02T00:00:00Z")], PEOPLE);
    expect(one.questions[1].correctRate).toBe(0);
    expect(one.questions.filter(needsFollowUp)).toEqual([]);
    // 2人：2人ともq2を間違えても、まだ判断しない
    const two = computeTestStats(
      TEST,
      [att("1", "a", [0, 3], "2026-11-02T00:00:00Z"), att("2", "b", [0, 3], "2026-11-02T00:00:00Z")],
      PEOPLE,
    );
    expect(two.learnerCount).toBeLessThan(MIN_LEARNERS);
    expect(two.questions.filter(needsFollowUp)).toEqual([]);
  });

  it("3人以上になったら、正答率60%未満の問題を要フォローにする（60%ちょうどは含めない）", () => {
    const three = computeTestStats(
      TEST,
      [att("1", "a", [0, 1], "2026-11-02T00:00:00Z"), att("2", "b", [0, 3], "2026-11-02T00:00:00Z"), att("3", "c", [2, 3], "2026-11-02T00:00:00Z")],
      PEOPLE,
    );
    expect(three.questions.filter(needsFollowUp).map((q) => q.questionId)).toEqual(["q2"]);
    expect(needsFollowUp({ answered: 5, correctRate: LOW_RATE })).toBe(false);
    expect(needsFollowUp({ answered: 5, correctRate: 0.59 })).toBe(true);
    expect(needsFollowUp({ answered: 0, correctRate: 0 })).toBe(false);
  });
});

describe("targetLearners（受講の対象）", () => {
  it("対象の部署が決まっていればその部署の受講者だけ、なければ受講者全員", () => {
    expect(targetLearners({ targetDepartments: null }, PEOPLE).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(targetLearners({ targetDepartments: ["営業"] }, PEOPLE).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("対象外の部署の人は、未受講者にも数えない", () => {
    const s = computeTestStats({ ...TEST, targetDepartments: ["営業"] }, [att("1", "a", [0, 1], "2026-11-02T00:00:00Z")], PEOPLE);
    expect(s.targetCount).toBe(2);
    expect(s.notTaken).toEqual(["b"]);
  });
});

describe("pct", () => {
  it("割合を整数の%で書く", () => {
    expect(pct(0)).toBe("0%");
    expect(pct(2 / 3)).toBe("67%");
    expect(pct(1)).toBe("100%");
  });
});

describe("少人数のときの言い方（3回目のチェックの指摘）", () => {
  it("全員が正解した部署には「一番間違いが多い問題」を出さない", () => {
    const s = computeTestStats(TEST, [att("1", "a", [0, 1], "2026-11-02T00:00:00Z")], PEOPLE);
    expect(s.departments[0]).toMatchObject({ department: "営業", avgScore: 100, weakest: null });
  });

  it("1人しか選んでいない誤答は「よく選ばれた誤答」に入れず、同じ人数で並んだ誤答は一番にしない", () => {
    // q1：b と c を1人ずつ（同じ人数）。q2：d を2人
    const s = computeTestStats(
      TEST,
      [att("1", "a", [1, 3], "2026-11-02T00:00:00Z"), att("2", "b", [2, 3], "2026-11-02T00:00:00Z"), att("3", "c", [0, 1], "2026-11-02T00:00:00Z")],
      PEOPLE,
    );
    expect(s.questions[0].topWrong).toBeNull();
    expect(s.questions[1].topWrong).toMatchObject({ choice: 3, count: 2 });
    expect(s.commonWrong.map((w) => `${w.questionId}:${w.choice}`)).toEqual(["q2:3"]);
  });
});
