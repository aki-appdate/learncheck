import { describe, expect, it } from "vitest";
import { computeTestStats } from "./analytics";
import { findQuote } from "./quote";
import { checkTest } from "./quality";
import { createSeedData, weekdayAt } from "./seed";
import { MATERIALS } from "./materials";
import { sampleFollowUp } from "./ai/sample";
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

  it("公開済みテストの正解は A〜D に散らばっている（どの記号も1問以上・全体の3割まで）", () => {
    const d = createSeedData(NOW);
    for (const t of d.tests.filter((x) => x.status === "published")) {
      const count = [0, 1, 2, 3].map((c) => t.questions.filter((q) => q.answerIndex === c).length);
      for (const n of count) {
        expect(n, `${t.id}: ${count.join(",")}`).toBeGreaterThanOrEqual(1);
        expect(n / t.questions.length, `${t.id}: ${count.join(",")}`).toBeLessThanOrEqual(0.3);
      }
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

describe("デモデータの日時と受講の仕方", () => {
  it("受講日・作成日・公開日はすべて平日の9:00〜18:00で、開いた時刻によって受講時刻が変わらない", () => {
    for (const now of [NOW, new Date(2026, 10, 14, 3, 0), new Date(2026, 10, 16, 23, 59)]) {
      const d = createSeedData(now);
      const all = [...d.attempts.map((a) => a.at), ...d.tests.flatMap((t) => [t.createdAt, t.publishedAt ?? t.createdAt])];
      for (const iso of all) {
        const t = new Date(iso);
        expect([0, 6]).not.toContain(t.getDay());
        const minutes = t.getHours() * 60 + t.getMinutes();
        expect(minutes).toBeGreaterThanOrEqual(9 * 60);
        expect(minutes).toBeLessThanOrEqual(18 * 60);
        expect(t <= now).toBe(true);
      }
    }
    // 同じ日に開けば、朝でも夜でも受講時刻は同じ
    const morning = createSeedData(new Date(2026, 10, 11, 8, 0)).attempts.map((a) => a.at);
    const night = createSeedData(new Date(2026, 10, 11, 23, 0)).attempts.map((a) => a.at);
    expect(morning).toEqual(night);
  });

  it("weekdayAt：土日を飛ばして数える", () => {
    // 2026-11-16 は月曜。1営業日前は金曜（11/13）
    expect(new Date(weekdayAt(new Date(2026, 10, 16, 12, 0), 1, 0)).getDate()).toBe(13);
  });

  it("何人かは2回受けていて、集計には最新の結果を使う。受け直しは公開より後", () => {
    const d = createSeedData(NOW);
    for (const t of d.tests.filter((x) => x.status === "published")) {
      const s = computeTestStats(t, d.attempts, d.people);
      const twice = s.learners.filter((l) => l.attempts === 2);
      expect(twice.length).toBeGreaterThanOrEqual(1);
      for (const l of twice) {
        const mine = d.attempts.filter((a) => a.testId === t.id && a.learnerId === l.learnerId).sort((a, b) => a.at.localeCompare(b.at));
        expect(mine[0].at > t.publishedAt!).toBe(true);
        expect(l.at).toBe(mine[1].at);
      }
    }
  });

  it("公開済みのデモのテストは人が書いたもの（AIの出力ではない）", () => {
    const d = createSeedData(NOW);
    expect(d.tests.every((t) => t.aiSource === null)).toBe(true);
  });

  it("自社商材の資料は、受講の対象が営業の部署だけ", () => {
    const products = MATERIALS.find((m) => m.id === "mat-products")!;
    expect(products.targetDepartments).toEqual(["営業1課", "営業2課"]);
    const d = createSeedData(NOW);
    const sales = d.people.filter((p) => p.department?.startsWith("営業")).length;
    const test = { ...d.tests[0], id: "x", targetDepartments: products.targetDepartments };
    expect(computeTestStats(test, [], d.people).targetCount).toBe(sales);
  });

  it("仕込んだ傾向：カスタマーサポートは個人情報テストの第10問が全体より大きく低く、フォローの提案に出る", () => {
    const d = createSeedData(NOW);
    const t = d.tests.find((x) => x.id === "test-privacy")!;
    const s = computeTestStats(t, d.attempts, d.people);
    const gap = s.departmentGaps.find((g) => g.department === "カスタマーサポート");
    expect(gap).toMatchObject({ questionId: "test-privacy-q10", answered: 3, deptRate: 0 });
    expect(gap!.overallRate).toBeGreaterThanOrEqual(0.5);
    const f = sampleFollowUp(t, s, d.people);
    expect(f.findings.some((x) => x.title.includes("カスタマーサポート") && x.evidenceQuestionIds.includes("test-privacy-q10"))).toBe(true);
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
