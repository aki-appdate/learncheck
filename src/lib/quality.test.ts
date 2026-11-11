import { describe, expect, it } from "vitest";
import { checkQuestion, checkTest, choiceWords, isChanged, publishBlockers, sharesWord, staleExplanationQuotes } from "./quality";
import { MATERIALS } from "./materials";
import { createSeedData } from "./seed";
import type { GeneratedQuestion, TestQuestion } from "./types";

const BODY = "1. 保管のルール\n紙の書類は、鍵のかかる書庫に保管します。\nパスワードは12文字以上にします。";

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

  it("正解の言葉が根拠の文に1つも出てこなければ注意を出す（採用は止めない）", () => {
    const r = checkQuestion({ ...base, choices: ["自宅の金庫", "鍵のかかる書庫", "机の上", "車の中"], answerIndex: 0, quote: "パスワードは12文字以上にします。" }, BODY);
    const issue = r.issues.find((i) => i.code === "answer_not_in_quote");
    expect(issue?.level).toBe("warn");
    expect(issue?.message).toContain("正解の根拠になっているか確認してください");
    // 正解の言葉が根拠の文にあれば注意しない
    expect(checkQuestion(base, BODY).issues.some((i) => i.code === "answer_not_in_quote")).toBe(false);
  });

  it("根拠の文が見つからないときは、根拠の error だけを出す（注意は重ねない）", () => {
    const r = checkQuestion({ ...base, quote: "資料にない文をそれらしく書いたもの。" }, BODY);
    expect(r.issues.map((i) => i.code)).toEqual(["quote"]);
  });

  it("正解の位置が範囲外なら error", () => {
    expect(checkQuestion({ ...base, answerIndex: 4 }, BODY).issues.some((i) => i.code === "answer")).toBe(true);
  });
});

describe("choiceWords・sharesWord（正解の言葉が根拠の文にあるか）", () => {
  it("漢字・カタカナ・英数字のまとまりを言葉として取り出す", () => {
    expect(choiceWords("ＬＡＮケーブルを抜く")).toEqual(["LAN", "ケーブル"]);
    expect(choiceWords("机の上")).toEqual(["机", "上"]);
    expect(choiceWords("30分以内")).toEqual(["30", "分以内"]);
    expect(choiceWords("すぐにやめる")).toEqual(["すぐにやめる"]);
  });

  it("全角・半角の違いがあっても同じ言葉とみなし、長い漢字の言葉は一部が出てくればよい", () => {
    expect(sharesWord("１２文字以上", "パスワードは12文字以上にします。")).toBe(true);
    expect(sharesWord("情報管理窓口", "まず上長と情報管理部に報告します。")).toBe(true);
    expect(sharesWord("懲戒解雇", "相談窓口は秘密を守ります。")).toBe(false);
  });

  it("デモデータの公開済みテストでは、注意が出ない", () => {
    const d = createSeedData(new Date(2026, 10, 11, 17, 0));
    for (const t of d.tests.filter((x) => x.status === "published")) {
      for (const q of t.questions) expect(checkQuestion(q, t.material.body).issues, q.id).toEqual([]);
    }
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

  it("4問未満では、正解の位置の偏りを数えない", () => {
    const qs = [0, 0, 0].map((a, i) => tq({ answerIndex: a, prompt: `問${i}` }, i));
    expect(checkTest(qs)).toEqual([]);
  });

  it("同じ問題文を見つける（空白・全角半角の違いも同じとみなす）", () => {
    const qs = [tq({ prompt: "同じ 問題" }, 0), tq({ prompt: "同じ問題", answerIndex: 1 }, 1)];
    expect(checkTest(qs).find((i) => i.code === "duplicate_prompt")?.message).toBe("第1問と第2問の問題文が同じです");
  });

  it("別の問題と同じ文を選択肢に使っていると注意を出す（片方が、もう片方の答えを教えてしまう）", () => {
    const rule = "提案書は、お客様に出す前に、必ず上長の確認を受けてください";
    const q6 = tq({ prompt: "合わないものは", choices: [rule, "リース契約は、原則として途中で解約できます", "x1", "x2"], answerIndex: 1 }, 0);
    const q7 = tq({ prompt: "正しいものは", choices: ["a1", rule, "a3", "a4"], answerIndex: 1, quote: `${rule}。` }, 1);
    const issue = checkTest([q6, q7]).find((i) => i.code === "shared_choice");
    expect(issue?.level).toBe("warn");
    expect(issue?.message).toContain("第1問と第2問");
    // 選択肢が、別の問題の根拠の文（空欄の問題の元の文）と同じ場合も
    const blank = tq({ prompt: "空欄", choices: ["上長", "人事部", "同僚", "部下"], answerIndex: 0, quote: `${rule}。` }, 2);
    expect(checkTest([q6, blank]).some((i) => i.code === "shared_choice")).toBe(true);
    // 短い選択肢（「5年」など）や、根拠の文どうしが同じなのは注意しない
    const a = tq({ prompt: "p1", choices: ["5年", "4年", "6年", "7年"] }, 3);
    const b = tq({ prompt: "p2", choices: ["5年", "3年", "6年", "8年"] }, 4);
    expect(checkTest([a, b]).some((i) => i.code === "shared_choice")).toBe(false);
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

  it("注意（warn）だけなら公開を止めない", () => {
    const warnOnly = { ...good(3), explanation: "" };
    expect(checkQuestion(warnOnly, body).issues.every((i) => i.level === "warn")).toBe(true);
    expect(publishBlockers([good(0), good(1), good(2), warnOnly], body)).toEqual([]);
  });

  it("理由が複数あれば全部返す", () => {
    expect(publishBlockers([good(0), { ...good(1), review: "pending" }], body)).toEqual(["まだ確認していない問題が1問あります", "採用した問題が3問以上必要です"]);
  });

  it("すべて確認済みで不備がなければ公開できる", () => {
    expect(publishBlockers([good(0), good(1), good(2), { ...good(3), review: "discarded", quote: "" }], body)).toEqual([]);
  });
});

describe("isChanged（人が書き換えたか）", () => {
  it("何も変えていなければ false（前後の空白だけの違いも変えていないとみなす）", () => {
    expect(isChanged(base, structuredClone(base))).toBe(false);
    expect(isChanged({ ...base, prompt: ` ${base.prompt} ` }, base)).toBe(false);
  });

  it("問題文・選択肢・正解・解説・根拠・難しさのどれかを変えたら true", () => {
    expect(isChanged(base, { ...base, prompt: "別の問題文" })).toBe(true);
    expect(isChanged(base, { ...base, choices: ["鍵のかかる書庫", "机の上", "自宅", "金庫"] })).toBe(true);
    expect(isChanged(base, { ...base, answerIndex: 1 })).toBe(true);
    expect(isChanged(base, { ...base, explanation: "x" })).toBe(true);
    expect(isChanged(base, { ...base, quote: "パスワードは12文字以上にします。" })).toBe(true);
    expect(isChanged(base, { ...base, difficulty: "hard" })).toBe(true);
  });
});

describe("staleExplanationQuotes（選択肢を直したのに解説が古い文言のまま：3回目のチェックの指摘）", () => {
  const before = { choices: ["期限を過ぎた申請は、部長の承認がないと受け付けます", "A", "B", "C"] };
  it("直す前の選択肢を「」で引いたまま、選択肢だけ書き換えたら知らせる", () => {
    const after = {
      choices: ["期限を過ぎた申請は、部長の承認があれば受け付けます", "A", "B", "C"],
      explanation: "「期限を過ぎた申請は、部長の承認がないと受け付けます」は、資料と逆の内容です。",
    };
    expect(staleExplanationQuotes(before, after)).toEqual(["期限を過ぎた申請は、部長の承認がないと受け付けます"]);
  });
  it("解説も合わせて直したとき・選択肢を変えていないときは知らせない", () => {
    expect(staleExplanationQuotes(before, { choices: ["新しい文", "A", "B", "C"], explanation: "「新しい文」は資料と逆です。" })).toEqual([]);
    expect(staleExplanationQuotes(before, { ...before, explanation: "「期限を過ぎた申請は、部長の承認がないと受け付けます」は逆です。" })).toEqual([]);
  });
  it("選択肢の中に「LC-5000」のような入れ子のかっこがあっても見つける", () => {
    const b = { choices: ["1分間に80枚の印刷ができる「LC-5000」をおすすめします", "A", "B", "C"] };
    const after = {
      choices: ["1分間に70枚の印刷ができる「LC-5000」をおすすめします", "A", "B", "C"],
      explanation: "資料には「1分間に50枚の印刷ができる「LC-5000」をおすすめします。」とあります。「1分間に80枚の印刷ができる「LC-5000」をおすすめします」は、これと逆の内容です。",
    };
    expect(staleExplanationQuotes(b, after)).toEqual(["1分間に80枚の印刷ができる「LC-5000」をおすすめします"]);
  });
});
