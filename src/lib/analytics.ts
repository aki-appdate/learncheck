// 結果ダッシュボードの数字はすべてここで計算する。画面から計算式を追い出し、テストで確かめられるようにする。
// 同じ人が何度か受けた場合は、その人の「最新の結果」だけで集計する。

import type { Attempt, Person, Test } from "./types";

/** これより正答率が低い問題は「間違いが多い」とみなす */
export const LOW_RATE = 0.6;

export type QuestionStat = {
  questionId: string;
  index: number;
  answered: number;
  correct: number;
  correctRate: number;
  /** 選択肢ごとに選ばれた回数（A〜D） */
  choiceCounts: number[];
  /** 一番多く選ばれた誤答 */
  topWrong: { choice: number; count: number; share: number } | null;
};

export type LearnerResult = {
  learnerId: string;
  correct: number;
  total: number;
  score: number;
  at: string;
  attempts: number;
};

export type DepartmentStat = {
  department: string;
  learners: number;
  avgScore: number;
  /** その部署で正答率が一番低い問題 */
  weakest: { questionId: string; correctRate: number } | null;
};

export type TestStats = {
  testId: string;
  /** 受講対象（受講者全員）の人数 */
  targetCount: number;
  learnerCount: number;
  avgScore: number;
  perfectCount: number;
  questions: QuestionStat[];
  learners: LearnerResult[];
  /** まだ受けていない受講者のID */
  notTaken: string[];
  departments: DepartmentStat[];
  /** よく選ばれた誤答（多い順） */
  commonWrong: { questionId: string; choice: number; count: number; share: number }[];
};

function rate(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function scoreAttempt(test: Test, answers: Attempt["answers"]): { correct: number; total: number; score: number } {
  const byId = new Map(answers.map((a) => [a.questionId, a.choice]));
  const total = test.questions.length;
  const correct = test.questions.filter((q) => byId.get(q.id) === q.answerIndex).length;
  return { correct, total, score: total === 0 ? 0 : Math.round((correct / total) * 100) };
}

/** 受講者ごとの最新の回答と、受けた回数 */
export function latestByLearner(attempts: Attempt[], testId: string): { latest: Attempt; count: number }[] {
  const map = new Map<string, { latest: Attempt; count: number }>();
  for (const a of attempts) {
    if (a.testId !== testId) continue;
    const cur = map.get(a.learnerId);
    if (!cur) map.set(a.learnerId, { latest: a, count: 1 });
    else map.set(a.learnerId, { latest: a.at > cur.latest.at ? a : cur.latest, count: cur.count + 1 });
  }
  return [...map.values()];
}

function questionStats(test: Test, attempts: Attempt[]): QuestionStat[] {
  return test.questions.map((q, index) => {
    const choiceCounts = [0, 0, 0, 0];
    let answered = 0;
    for (const a of attempts) {
      const ans = a.answers.find((x) => x.questionId === q.id);
      if (!ans) continue;
      answered++;
      if (ans.choice >= 0 && ans.choice < 4) choiceCounts[ans.choice]++;
    }
    const correct = choiceCounts[q.answerIndex] ?? 0;
    let topWrong: QuestionStat["topWrong"] = null;
    choiceCounts.forEach((count, choice) => {
      if (choice === q.answerIndex || count === 0) return;
      if (!topWrong || count > topWrong.count) topWrong = { choice, count, share: rate(count, answered) };
    });
    return { questionId: q.id, index, answered, correct, correctRate: rate(correct, answered), choiceCounts, topWrong };
  });
}

export function computeTestStats(test: Test, attempts: Attempt[], people: Person[]): TestStats {
  const learnersAll = people.filter((p) => p.role === "learner");
  const latest = latestByLearner(attempts, test.id).filter((x) => learnersAll.some((p) => p.id === x.latest.learnerId));
  const latestAttempts = latest.map((x) => x.latest);

  const learners: LearnerResult[] = latest
    .map(({ latest: a, count }) => ({ learnerId: a.learnerId, ...scoreAttempt(test, a.answers), at: a.at, attempts: count }))
    .sort((a, b) => b.score - a.score || a.learnerId.localeCompare(b.learnerId));

  const questions = questionStats(test, latestAttempts);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

  const deptNames = [...new Set(learnersAll.map((p) => p.department ?? "部署なし"))];
  const departments: DepartmentStat[] = deptNames
    .map((department) => {
      const ids = new Set(learnersAll.filter((p) => (p.department ?? "部署なし") === department).map((p) => p.id));
      const deptAttempts = latestAttempts.filter((a) => ids.has(a.learnerId));
      const deptQuestions = questionStats(test, deptAttempts);
      const weakestQ = [...deptQuestions].filter((q) => q.answered > 0).sort((a, b) => a.correctRate - b.correctRate || a.index - b.index)[0];
      return {
        department,
        learners: deptAttempts.length,
        avgScore: avg(learners.filter((l) => ids.has(l.learnerId)).map((l) => l.score)),
        weakest: weakestQ ? { questionId: weakestQ.questionId, correctRate: weakestQ.correctRate } : null,
      };
    })
    .filter((d) => d.learners > 0)
    .sort((a, b) => a.avgScore - b.avgScore);

  const commonWrong = questions
    .flatMap((q) =>
      q.choiceCounts
        .map((count, choice) => ({ questionId: q.questionId, choice, count, share: rate(count, q.answered) }))
        .filter((w) => w.choice !== test.questions[q.index].answerIndex && w.count > 0),
    )
    .sort((a, b) => b.count - a.count || b.share - a.share)
    .slice(0, 5);

  const taken = new Set(learners.map((l) => l.learnerId));
  return {
    testId: test.id,
    targetCount: learnersAll.length,
    learnerCount: learners.length,
    avgScore: avg(learners.map((l) => l.score)),
    perfectCount: learners.filter((l) => l.score === 100).length,
    questions,
    learners,
    notTaken: learnersAll.filter((p) => !taken.has(p.id)).map((p) => p.id),
    departments,
    commonWrong,
  };
}
