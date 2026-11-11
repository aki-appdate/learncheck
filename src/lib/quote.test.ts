import { describe, expect, it } from "vitest";
import { excerptAround, findQuote } from "./quote";
import { checkQuestion, checkTest, publishBlockers } from "./quality";
import { MATERIALS } from "./materials";
import type { GeneratedQuestion, TestQuestion } from "./types";

const BODY = "1. 保管のルール\n紙の書類は、鍵のかかる書庫に保管します。\nパスワードは12文字以上にします。";

describe("findQuote（引用文が資料の中にあるか）", () => {
  it("そのまま書き写した文は見つかり、位置も正しい", () => {
    const r = findQuote(BODY, "紙の書類は、鍵のかかる書庫に保管します。");
    expect(r.found).toBe(true);
    if (r.found) expect(BODY.slice(r.start, r.end)).toBe("紙の書類は、鍵のかかる書庫に保管します");
  });

  it("空白・改行や全角／半角の違いは同じとみなす", () => {
    expect(findQuote(BODY, "パスワードは１２文字以上にします").found).toBe(true);
    expect(findQuote(BODY, "紙の書類は、 鍵のかかる\n書庫に保管します").found).toBe(true);
    expect(findQuote(BODY, "「紙の書類は、鍵のかかる書庫に保管します。」").found).toBe(true);
  });

  it("言い換え・作り話は見つからない", () => {
    expect(findQuote(BODY, "紙の書類は、鍵のかかる金庫に保管します")).toEqual({ found: false, reason: "not_found" });
    expect(findQuote(BODY, "パスワードは8文字以上にします")).toEqual({ found: false, reason: "not_found" });
  });

  it("短すぎる引用・空の引用は根拠として認めない", () => {
    expect(findQuote(BODY, "書庫")).toEqual({ found: false, reason: "too_short" });
    expect(findQuote(BODY, "  。")).toEqual({ found: false, reason: "empty" });
  });

  it("前後の段落を切り出せる", () => {
    const r = findQuote(BODY, "鍵のかかる書庫に保管");
    if (!r.found) throw new Error("not found");
    const ex = excerptAround(BODY, r.start, r.end);
    expect(ex).toEqual({ before: "紙の書類は、", hit: "鍵のかかる書庫に保管", after: "します。" });
  });
});

const base: GeneratedQuestion = {
  prompt: "書類の保管場所は？",
  choices: ["鍵のかかる書庫", "机の上", "自宅", "車の中"],
  answerIndex: 0,
  explanation: "鍵のかかる書庫に保管します。",
  quote: "紙の書類は、鍵のかかる書庫に保管します。",
  difficulty: "easy",
};
const tq = (p: Partial<TestQuestion>, i = 0): TestQuestion => ({ ...base, id: `q${i}`, review: "approved", edited: false, ...p });

describe("checkQuestion（1問ごとのチェック）", () => {
  it("問題がなければ指摘なし", () => {
    expect(checkQuestion(base, BODY).issues).toEqual([]);
  });

  it("根拠が見つからなければ error", () => {
    const r = checkQuestion({ ...base, quote: "書類は金庫で保管すること。" }, BODY);
    expect(r.quote.found).toBe(false);
    expect(r.issues.find((i) => i.code === "quote")?.level).toBe("error");
  });

  it("選択肢の重複（全角・半角違いも含む）は error", () => {
    const r = checkQuestion({ ...base, choices: ["12文字以上", "１２文字以上", "8文字以上", "16文字以上"] }, BODY);
    expect(r.issues.some((i) => i.code === "duplicate")).toBe(true);
  });

  it("正解の位置が範囲外なら error", () => {
    expect(checkQuestion({ ...base, answerIndex: 4 }, BODY).issues.some((i) => i.code === "answer")).toBe(true);
  });
});

describe("checkTest（テスト全体のチェック）", () => {
  it("正解の位置が半分を超えて偏ると注意を出す", () => {
    const qs = [0, 0, 0, 1].map((a, i) => tq({ answerIndex: a, prompt: `問${i}` }, i));
    expect(checkTest(qs).some((i) => i.code === "answer_bias")).toBe(true);
  });

  it("ちょうど半分なら注意しない・捨てた問題は数えない", () => {
    const qs = [0, 0, 1, 2].map((a, i) => tq({ answerIndex: a, prompt: `問${i}` }, i));
    expect(checkTest(qs)).toEqual([]);
    const withDiscarded = [...qs, tq({ answerIndex: 0, review: "discarded", prompt: "x" }, 9)];
    expect(checkTest(withDiscarded)).toEqual([]);
  });

  it("同じ問題文を見つける", () => {
    const qs = [tq({ prompt: "同じ" }, 0), tq({ prompt: "同じ", answerIndex: 1 }, 1)];
    expect(checkTest(qs).some((i) => i.code === "duplicate_prompt")).toBe(true);
  });
});

describe("publishBlockers（公開できるか）", () => {
  const body = MATERIALS[0].body;
  const good = (i: number) => tq({ quote: "電車の網棚にかばんを置くことは禁止です。", prompt: `問${i}` }, i);

  it("未確認が残っていると公開できない", () => {
    expect(publishBlockers([good(0), good(1), good(2), { ...good(3), review: "pending" }], body)).toHaveLength(1);
  });

  it("採用が3問未満だと公開できない", () => {
    expect(publishBlockers([good(0), good(1), { ...good(2), review: "discarded" }], body)).toEqual(["採用した問題が3問以上必要です"]);
  });

  it("採用した問題の根拠が資料にないと公開できない", () => {
    const bad = { ...good(3), quote: "資料にない文をそれらしく書いたもの。" };
    expect(publishBlockers([good(0), good(1), good(2), bad], body)).toEqual(["採用した問題に、直す必要のある点があります"]);
  });

  it("すべて確認済みで不備がなければ公開できる", () => {
    expect(publishBlockers([good(0), good(1), good(2), { ...good(3), review: "discarded", quote: "" }], body)).toEqual([]);
  });
});
