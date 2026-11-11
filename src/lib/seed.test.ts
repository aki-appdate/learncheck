import { describe, expect, it } from "vitest";
import { computeTestStats } from "./analytics";
import { findQuote } from "./quote";
import { checkTest } from "./quality";
import { createSeedData } from "./seed";
import { mergeWorkspace } from "./store/types";

const NOW = new Date(2026, 10, 11, 17, 0);

describe("createSeedData（デモデータ）", () => {
  it("同じ日時なら同じデータになる", () => {
    expect(createSeedData(NOW)).toEqual(createSeedData(NOW));
  });

  it("日時が変わっても、回答の中身は同じ（日付だけずれる）", () => {
    const a = createSeedData(NOW);
    const b = createSeedData(new Date(2026, 11, 1, 9, 0));
    expect(a.attempts.map((x) => x.answers)).toEqual(b.attempts.map((x) => x.answers));
  });

  it("未来の受講結果は作らない", () => {
    const d = createSeedData(NOW);
    expect(d.attempts.every((a) => new Date(a.at) <= NOW)).toBe(true);
  });

  it("受講者は12〜15名、公開済みテストは2本で各8〜10問", () => {
    const d = createSeedData(NOW);
    const learners = d.people.filter((p) => p.role === "learner");
    expect(learners.length).toBeGreaterThanOrEqual(12);
    expect(learners.length).toBeLessThanOrEqual(15);
    const published = d.tests.filter((t) => t.status === "published");
    expect(published).toHaveLength(2);
    published.forEach((t) => {
      expect(t.questions.length).toBeGreaterThanOrEqual(8);
      expect(t.questions.length).toBeLessThanOrEqual(10);
    });
  });

  it("公開済みテストの引用文は、すべて資料の中に実在する", () => {
    const d = createSeedData(NOW);
    for (const t of d.tests.filter((x) => x.status === "published")) {
      for (const q of t.questions) expect(findQuote(t.material.body, q.quote).found, `${q.id}: ${q.quote}`).toBe(true);
      expect(checkTest(t.questions)).toEqual([]);
    }
  });

  it("下書きの例には、根拠が資料にない問題がちょうど1問ある", () => {
    const draft = createSeedData(NOW).tests.find((t) => t.status === "draft")!;
    expect(draft.questions.filter((q) => !findQuote(draft.material.body, q.quote).found)).toHaveLength(1);
  });

  it("仕込んだ傾向：個人情報テストの第8問は正答率が低く、一番多い誤答はA", () => {
    const d = createSeedData(NOW);
    const t = d.tests.find((x) => x.id === "test-privacy")!;
    const s = computeTestStats(t, d.attempts, d.people);
    const q8 = s.questions[7];
    expect(q8.correctRate).toBeLessThan(0.6);
    expect(q8.topWrong?.choice).toBe(0);
    expect(s.learnerCount).toBe(13);
  });
});

describe("mergeWorkspace", () => {
  it("保存したテストは同じIDのデモデータを置き換え、新しいテストは足す", () => {
    const seed = createSeedData(NOW);
    const edited = { ...seed.tests[2], title: "直した" };
    const added = { ...seed.tests[2], id: "new", title: "新しい", createdAt: NOW.toISOString() };
    const m = mergeWorkspace(seed, [edited, added], []);
    expect(m.tests).toHaveLength(seed.tests.length + 1);
    expect(m.tests.find((t) => t.id === seed.tests[2].id)?.title).toBe("直した");
    expect(m.tests.at(-1)?.id).toBe("new");
  });
});
