import { describe, expect, it } from "vitest";
import { excerptAround, findQuote } from "./quote";
import { MATERIALS } from "./materials";

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

  it("『』と「」、数字の範囲の記号（〜・～・-・－・ー）の違いは同じとみなす", () => {
    const body = "従業員10〜30名の事務所には「LC-3000」をすすめます。";
    expect(findQuote(body, "従業員10～30名の事務所には『LC-3000』をすすめます").found).toBe(true);
    expect(findQuote(body, "従業員10-30名の事務所には「LC-3000」").found).toBe(true);
    expect(findQuote(body, "従業員１０－３０名の事務所には「ＬＣ-３０００」").found).toBe(true);
    expect(findQuote(body, "従業員10ー30名の事務所には").found).toBe(true);
    // 数字にはさまれていない「ー」「-」は範囲の記号とみなさない
    expect(findQuote("データはサーバーに保存します。", "データはサ〜バ〜に保存します").found).toBe(false);
    expect(findQuote(body, "には「LC〜3000」をすすめます").found).toBe(false);
  });

  it("書き方の揺れをそろえても、数字や言葉の違いは見逃さない", () => {
    const body = "従業員10〜30名の事務所に向いています。";
    expect(findQuote(body, "従業員10〜50名の事務所に向いています").found).toBe(false);
    expect(findQuote(body, "従業員10〜30人の事務所に向いています").found).toBe(false);
  });

  it("見つかった位置は、元の資料の文字位置で返す（全角や記号の揺れがあっても）", () => {
    const body = "前置き。従業員１０〜３０名の事務所に向いています。";
    const r = findQuote(body, "従業員10-30名の事務所");
    if (!r.found) throw new Error("not found");
    expect(body.slice(r.start, r.end)).toBe("従業員１０〜３０名の事務所");
  });

  it("前後の段落を切り出せる", () => {
    const r = findQuote(BODY, "鍵のかかる書庫に保管");
    if (!r.found) throw new Error("not found");
    const ex = excerptAround(BODY, r.start, r.end);
    expect(ex).toEqual({ before: "紙の書類は、", hit: "鍵のかかる書庫に保管", after: "します。" });
  });
});

describe("デモ用の資料", () => {
  it("資料の文をそのまま引用すれば必ず見つかる", () => {
    for (const m of MATERIALS) {
      for (const line of m.body.split("\n").filter((l) => l.length >= 12)) expect(findQuote(m.body, line).found, line).toBe(true);
    }
  });
});
