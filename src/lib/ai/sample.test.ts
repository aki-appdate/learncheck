import { describe, expect, it } from "vitest";
import { computeTestStats } from "../analytics";
import { MATERIALS } from "../materials";
import { checkQuestion, checkTest } from "../quality";
import { findQuote } from "../quote";
import { questionSchema, followUpSchema } from "../schemas";
import { createSeedData } from "../seed";
import { keepEvidenced } from "./index";
import { extractTerms, sampleFollowUp, sampleQuiz, splitSentences } from "./sample";

describe("splitSentences", () => {
  it("見出しと「問：」の行を除き、「答：」の前置きを外す", () => {
    const body = "1. 見出し\n問：連絡先を教えてもよいですか。\n答：本人の同意がない限り、教えてはいけません。";
    const s = splitSentences(body);
    expect(s.map((x) => x.text)).toEqual(["本人の同意がない限り、教えてはいけません。"]);
    expect(body.slice(s[0].start, s[0].start + s[0].text.length)).toBe(s[0].text);
  });

  it("かぎかっこの中の「。」では区切らない", () => {
    const body = "出るときは「お電話ありがとうございます。」と会社名を名乗ります。相手の名前は必ずメモを取りながら聞いてください。";
    expect(splitSentences(body).map((x) => x.text)).toEqual([
      "出るときは「お電話ありがとうございます。」と会社名を名乗ります。",
      "相手の名前は必ずメモを取りながら聞いてください。",
    ]);
  });
});

describe("extractTerms", () => {
  it("数字と単位をひとまとまりで取り出す（型番の数字は取らない）", () => {
    const t = extractTerms("「LC-3000」は1分間に30枚の印刷ができます。");
    expect(t.filter((x) => x.kind === "number").map((x) => x.text)).toEqual(["1分間", "30枚"]);
  });
});

describe("sampleQuiz（見本の返答で問題を作る）", () => {
  it.each(MATERIALS.map((m) => [m.title, m.body]))("%s：指定の数だけ、AIと同じ形の問題を作る", (_, body) => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const qs = sampleQuiz({ body, count: 8, difficulty });
      expect(qs).toHaveLength(8);
      for (const q of qs) {
        expect(questionSchema.safeParse(q).success).toBe(true);
        // 引用文は必ず資料の中にあり、機械チェックで不備が出ない
        expect(findQuote(body, q.quote).found).toBe(true);
        expect(checkQuestion(q, body).issues).toEqual([]);
        expect(q.difficulty).toBe(difficulty);
      }
      // 正解の位置が偏らない
      expect(checkTest(qs.map((q, i) => ({ ...q, id: `q${i}`, review: "pending" as const, edited: false })))).toEqual([]);
    }
  });

  it("正解は根拠の文の中の語句で、誤答は根拠の文に含まれない", () => {
    const body = MATERIALS[1].body;
    for (const q of sampleQuiz({ body, count: 10, difficulty: "normal" })) {
      expect(q.quote).toContain(q.choices[q.answerIndex]);
      q.choices.forEach((c, i) => i !== q.answerIndex && expect(q.quote).not.toContain(c));
    }
  });

  it("同じ入力なら同じ問題、作り直し番号を変えると別の組み合わせになる", () => {
    const body = MATERIALS[0].body;
    expect(sampleQuiz({ body, count: 5, difficulty: "normal" })).toEqual(sampleQuiz({ body, count: 5, difficulty: "normal" }));
    expect(sampleQuiz({ body, count: 5, difficulty: "normal", variant: 1 })).not.toEqual(sampleQuiz({ body, count: 5, difficulty: "normal" }));
  });

  it("短い資料では作れる数だけ作り、資料が空なら0問", () => {
    const short = "パスワードは12文字以上にしてください。席を離れるときは必ず画面をロックしてください。";
    expect(sampleQuiz({ body: short, count: 10, difficulty: "normal" }).length).toBeLessThanOrEqual(2);
    expect(sampleQuiz({ body: "", count: 5, difficulty: "normal" })).toEqual([]);
  });
});

describe("sampleFollowUp（フォロー研修の提案）", () => {
  const d = createSeedData(new Date(2026, 10, 11, 17, 0));
  const test = d.tests.find((t) => t.id === "test-privacy")!;
  const stats = computeTestStats(test, d.attempts, d.people);

  it("AIと同じ形で、根拠の問題IDはすべて実在する", () => {
    const r = sampleFollowUp(test, stats, d.people);
    expect(followUpSchema.safeParse(r).success).toBe(true);
    const ids = new Set(test.questions.map((q) => q.id));
    r.findings.forEach((f) => f.evidenceQuestionIds.forEach((id) => expect(ids.has(id)).toBe(true)));
  });

  it("正答率の一番低い問題（第8問）を最初に挙げる", () => {
    const r = sampleFollowUp(test, stats, d.people);
    expect(r.findings[0].evidenceQuestionIds).toEqual(["test-privacy-q08"]);
  });
});

describe("keepEvidenced（AIの提案の根拠チェック）", () => {
  const test = createSeedData(new Date(2026, 10, 11)).tests[0];
  it("存在しない問題IDを捨て、根拠のない提案は消す", () => {
    const r = keepEvidenced(
      {
        headline: "x",
        findings: [
          { title: "a", detail: "", evidenceQuestionIds: ["test-privacy-q01", "q-999"] },
          { title: "b", detail: "", evidenceQuestionIds: ["q-999"] },
        ],
        actions: ["y"],
      },
      test,
    );
    expect(r?.value.findings).toEqual([{ title: "a", detail: "", evidenceQuestionIds: ["test-privacy-q01"] }]);
  });

  it("根拠のある提案が1つもなければ null（見本の返答に切り替える）", () => {
    expect(keepEvidenced({ headline: "x", findings: [{ title: "b", detail: "", evidenceQuestionIds: ["nope"] }], actions: ["y"] }, test)).toBeNull();
  });
});
