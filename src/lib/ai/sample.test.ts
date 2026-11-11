import { describe, expect, it } from "vitest";
import { computeTestStats } from "../analytics";
import { MATERIALS } from "../materials";
import { checkQuestion, checkTest } from "../quality";
import { findQuote } from "../quote";
import { questionSchema, followUpSchema } from "../schemas";
import { createSeedData } from "../seed";
import { isFormatError, keepEvidenced } from "./index";
import { buildFollowUpPrompt, buildQuizPrompt } from "./prompts";
import { z } from "zod";
import { categoryOf, countable, extractTerms, flipRule, numberVariants, sampleFollowUp, sampleQuiz, splitSentences } from "./sample";
import type { GeneratedQuestion } from "../types";

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
  const words = (text: string) => extractTerms(text).filter((x) => x.kind !== "number").map((x) => x.text);

  it("数字と単位をひとまとまりで取り出す（型番の数字は取らない）", () => {
    const t = extractTerms("「LC-3000」は1分間に30枚の印刷ができます。");
    expect(t.filter((x) => x.kind === "number").map((x) => x.text)).toEqual(["1分間", "30枚"]);
  });

  it("前後の漢字・カタカナとつながった言葉の一部は取らない", () => {
    expect(words("情報システム担当に連絡します。")).not.toContain("システム");
    expect(words("保守センターに連絡します。")).not.toContain("センター");
  });

  it("「お」「ご」で始まる言葉、送りがなの付いた漢字は取らない", () => {
    expect(words("お電話をいただいたら、会社名を名乗ります。")).toEqual(["会社名"]);
    expect(words("画面をロックします。")).not.toContain("ロック");
  });

  it("かっこの中の言葉は取らない", () => {
    expect(words("著しい迷惑行為（カスタマーハラスメント）を報告します。")).not.toContain("カスタマーハラスメント");
  });
});

describe("numberVariants（数字の誤答）", () => {
  it("正解に近い数字だけを使い、10倍のような極端な数字は使わない", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      for (const [v, unit] of [[1, "回"], [3, "年"], [12, "文字以上"], [30, "分以内"], [5, "営業日以内"]] as const) {
        const vs = numberVariants({ text: `${v}${unit}`, kind: "number", index: 0, unit, value: v }, d);
        expect(vs.length).toBeGreaterThanOrEqual(3);
        for (const x of vs) {
          const n = Number(x.match(/^\d+/)![0]);
          expect(n).toBeGreaterThan(0);
          expect(n / v).toBeLessThanOrEqual(4);
          expect(Math.abs(n - v)).toBeLessThanOrEqual(v < 10 ? 3 : v < 20 ? 6 : 30);
        }
      }
    }
  });
});

describe("flipRule（きまりの文を逆の意味にする）", () => {
  it("禁止・必ず・〜ません を逆の意味にする", () => {
    expect(flipRule("電車の網棚にかばんを置くことは禁止です。")).toBe("電車の網棚にかばんを置くことは認められています");
    expect(flipRule("飲食店やカフェで、お客様の資料を広げて作業してはいけません。")).toBe("飲食店やカフェで、お客様の資料を広げて作業してもかまいません");
    expect(flipRule("提案書は、お客様に出す前に、必ず上長の確認を受けてください。")).toBe("提案書は、お客様に出す前に、できれば上長の確認を受けてください");
    expect(flipRule("報告した人が責められることはありません。")).toBe("報告した人が責められることがあります");
    expect(flipRule("上長に相談しにくい内容は、直接相談窓口に連絡してかまいません。")).toBe("上長に相談しにくい内容は、直接相談窓口に連絡してはいけません");
    expect(flipRule("「こんなことで連絡していいのか」と迷う必要はありません。")).toBe("「こんなことで連絡していいのか」と迷う必要があります");
    expect(flipRule("適切な言い方で行うことはパワーハラスメントにはあたりません。")).toBe("適切な言い方で行うことはパワーハラスメントにあたります");
  });

  it("4つの資料のどのきまりの文を書き換えても、「かまいます」のような不自然な形にならない", () => {
    for (const m of MATERIALS) {
      for (const sen of splitSentences(m.body)) {
        const f = flipRule(sen.text);
        if (f) expect(f, sen.text).not.toMatch(/かまいます|必要はあります|にはあたります/);
      }
    }
  });

  it("かぎかっこの中の言葉は書き換えない・書き換えられない文は null", () => {
    expect(flipRule("「必ず故障しません」と伝えます。")).toBeNull();
    expect(flipRule("個人情報とは、生きている個人を特定できる情報のことです。")).toBeNull();
  });
});

const FILL = "資料の内容として正しくなるように";
const BLANK = "（　　　）";
const isNumber = (c: string) => /^\d/.test(c);
const answerOf = (q: GeneratedQuestion) => q.choices[q.answerIndex];
const wrongsOf = (q: GeneratedQuestion) => q.choices.filter((_, i) => i !== q.answerIndex);
const ALL = MATERIALS.flatMap((m) => (["easy", "normal", "hard"] as const).flatMap((d) => [8, 10].map((count) => ({ m, d, count, qs: sampleQuiz({ body: m.body, count, difficulty: d }) }))));
const CASES = ALL.map((c) => [`${c.m.title}・${c.d}・${c.count}問`, c] as const);

describe("sampleQuiz（見本の返答で問題を作る）：4つの資料×3つの難しさ", () => {
  it.each(CASES)("%s：指定の数だけ（10問は、文を使い回さずに作れる数だけ）、AIと同じ形の問題を作り、機械チェックで不備が出ない", (_, { m, d, count, qs }) => {
    // 8問はどの資料・難しさでも作れる。10問は、1つの文をテスト全体で1回しか使わないため、資料によっては8〜9問になる
    if (count === 8) expect(qs).toHaveLength(count);
    else expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(qs.length).toBeLessThanOrEqual(count);
    for (const q of qs) {
      expect(questionSchema.safeParse(q).success).toBe(true);
      // 引用文は必ず資料の中にあり、機械チェックで不備（注意も含む）が出ない
      expect(findQuote(m.body, q.quote).found).toBe(true);
      expect(checkQuestion(q, m.body).issues).toEqual([]);
      expect(q.difficulty).toBe(d);
    }
    // 正解の位置が偏らない・同じ問題文がない
    expect(checkTest(qs.map((q, i) => ({ ...q, id: `q${i}`, review: "pending" as const, edited: false })))).toEqual([]);
  });

  it.each(CASES)("%s：空欄が不自然にならない（お／ご・前後の漢字やカタカナ・送りがな・二重かっこ）", (_, { qs }) => {
    for (const q of qs.filter((x) => x.prompt.startsWith(FILL))) {
      const line = q.prompt.split("\n")[1];
      const at = line.indexOf(BLANK);
      const before = line[at - 1];
      const after = line[at + BLANK.length];
      expect(before, line).not.toMatch(/[（(]/);
      expect(after, line).not.toMatch(/[）)]/);
      // 言葉の空欄は、前後の漢字・カタカナとつながらず、後ろに来るのは助詞・句読点だけ（送りがなではない）。
      // 数字（「原則（5営業日以内）に」「年に（1回）受講します」）は前後に漢字があってもよい
      if (!isNumber(answerOf(q))) {
        expect(before, line).not.toMatch(/[おご一-龠々ァ-ヴー]/);
        expect(after, line).toMatch(/[をにがはでとのもへやか、。・」』]/);
      }
      expect(line).not.toContain("（（");
      // 正解の言葉が、同じ文のほかの場所に書かれていない
      expect(line.includes(answerOf(q)), line).toBe(false);
    }
  });

  it.each(CASES)("%s：数字の誤答は正解に近い数字で、数字の問題は半分まで", (_, { qs, count }) => {
    const nums = qs.filter((q) => q.prompt.startsWith(FILL) && isNumber(answerOf(q)));
    // 数字の問題はおよそ半分まで（ほかの問題が作れないときだけ、6割まで許す）
    expect(nums.length).toBeLessThanOrEqual(Math.ceil(count * 0.6));
    for (const q of nums) {
      const v = Number(answerOf(q).match(/^\d+/)![0]);
      for (const w of wrongsOf(q)) {
        const n = Number(w.match(/^\d+/)![0]);
        // 10倍のような極端な数字を使わない（1や2のような小さな数は、差が3までならよい）
        expect(n / v <= 3 || Math.abs(n - v) <= 3, `${answerOf(q)} → ${w}`).toBe(true);
        expect(v / n, `${answerOf(q)} → ${w}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it.each(CASES)("%s：言葉の空欄の誤答は、同じ種類の言葉（会話の言い回しをまぜない）", (_, { qs }) => {
    for (const q of qs.filter((x) => x.prompt.startsWith(FILL) && !isNumber(answerOf(x)))) {
      const kata = /^[ァ-ヴー]+$/.test(answerOf(q));
      for (const w of wrongsOf(q)) {
        expect(w, `${answerOf(q)} / ${w}`).not.toMatch(/[ぁ-ゖ]/);
        expect(/^[ァ-ヴー]+$/.test(w), `${answerOf(q)} / ${w}`).toBe(kata);
      }
    }
  });

  it.each(CASES)("%s：誤答を入れても正しく読めてしまう問題を作らない", (_, { m, qs }) => {
    for (const q of qs.filter((x) => x.prompt.startsWith(FILL) && !isNumber(answerOf(x)))) {
      const line = q.prompt.split("\n")[1].slice(1, -1);
      const at = line.indexOf(BLANK);
      const left = line.slice(Math.max(0, at - 3), at);
      const right = line.slice(at + BLANK.length, at + BLANK.length + 3);
      // 「〜してはいけません」の文の名詞を空欄にすると、ほかの言葉でも正しく読めてしまう
      expect(line, line).not.toMatch(/いけません|禁止/);
      for (const w of wrongsOf(q)) {
        // 空欄の前後と同じつながりで、誤答の言葉が資料に出てこない
        if (/^[^、。「」（）]{3}$/.test(left)) expect(m.body.includes(left + w), `${left}${w}`).toBe(false);
        if (/^[^、。「」（）]{3}$/.test(right)) expect(m.body.includes(w + right), `${w}${right}`).toBe(false);
        // 「AやB」のように資料で並べて書かれている言葉を誤答にしない
        for (const sep of ["や", "・"]) {
          expect(m.body.includes(answerOf(q) + sep + w) || m.body.includes(w + sep + answerOf(q)), `${answerOf(q)}${sep}${w}`).toBe(false);
        }
      }
    }
  });

  it("例：パソコンが正解のとき、スマートフォンのような並べて書かれた言葉を誤答にしない", () => {
    for (const { qs } of ALL) {
      for (const q of qs) {
        if (answerOf(q) === "パソコン") expect(q.choices).not.toContain("スマートフォン");
        if (answerOf(q) === "スマートフォン") expect(q.choices).not.toContain("パソコン");
      }
    }
  });

  it.each(CASES)("%s：きまり・手順を問う問題を入れ、解説は根拠の文を引いて問題ごとに変える", (_, { qs, count }) => {
    const rules = qs.filter((q) => !q.prompt.startsWith(FILL));
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.length).toBeLessThan(count);
    expect(new Set(qs.map((q) => q.explanation)).size).toBe(qs.length);
    for (const q of qs) expect(q.explanation).toContain(q.quote.replace(/。$/, ""));
  });

  it("正しいものを選ぶ問題では、誤答は資料の文を逆の意味に書き換えたもので、資料の中にない", () => {
    for (const { m, qs } of ALL) {
      for (const q of qs.filter((x) => x.prompt.endsWith("正しいものはどれですか。"))) {
        expect(findQuote(m.body, answerOf(q)).found).toBe(true);
        for (const w of wrongsOf(q)) expect(findQuote(m.body, w).found, w).toBe(false);
      }
      for (const q of qs.filter((x) => x.prompt.endsWith("資料の内容と合わないものはどれですか。"))) {
        expect(findQuote(m.body, answerOf(q)).found).toBe(false);
        for (const w of wrongsOf(q)) expect(findQuote(m.body, w).found, w).toBe(true);
      }
    }
  });

  it("空欄の問題では、正解は根拠の文の中の語句で、誤答は根拠の文に含まれない", () => {
    for (const { qs } of ALL) {
      for (const q of qs.filter((x) => x.prompt.startsWith(FILL))) {
        expect(q.quote).toContain(answerOf(q));
        wrongsOf(q).forEach((c) => expect(q.quote).not.toContain(c));
      }
    }
  });

  it("同じ入力なら同じ問題、作り直し番号を変えると別の組み合わせになる", () => {
    const body = MATERIALS[0].body;
    expect(sampleQuiz({ body, count: 5, difficulty: "normal" })).toEqual(sampleQuiz({ body, count: 5, difficulty: "normal" }));
    expect(sampleQuiz({ body, count: 5, difficulty: "normal", variant: 1 })).not.toEqual(sampleQuiz({ body, count: 5, difficulty: "normal" }));
  });

  it("作り直すと、前回と半分以上は別の文から問題を作る（どの資料でも）", () => {
    for (const m of MATERIALS) {
      for (const difficulty of ["easy", "normal", "hard"] as const) {
        for (let v = 1; v <= 3; v++) {
          const a = sampleQuiz({ body: m.body, count: 8, difficulty, variant: v - 1 }).map((q) => q.quote);
          const b = sampleQuiz({ body: m.body, count: 8, difficulty, variant: v });
          expect(b).toHaveLength(8);
          expect(b.filter((q) => a.includes(q.quote)).length, `${m.title} ${difficulty} ${v}`).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it("短い資料では作れる数だけ作り、資料が空なら0問", () => {
    const short = "パスワードは12文字以上にしてください。席を離れるときは必ず画面をロックしてください。";
    expect(sampleQuiz({ body: short, count: 10, difficulty: "normal" }).length).toBeLessThanOrEqual(2);
    expect(sampleQuiz({ body: "", count: 5, difficulty: "normal" })).toEqual([]);
  });
});

describe("sampleQuiz：不自然な問題を作らない（2回目のチェックの指摘）", () => {
  const products = MATERIALS.find((m) => m.id === "mat-products")!;
  const qs = sampleQuiz({ body: products.body, count: 8, difficulty: "normal" });
  const blankLine = (q: GeneratedQuestion) => q.prompt.split("\n")[1] ?? "";

  it("countable：すぐ前に並べた物の数は、問題文を数えれば分かるので空欄にしない", () => {
    expect(countable("複合機は、コピー・プリント・スキャン・ファクスの", 4)).toBe(true);
    expect(countable("通話がかけ放題になるプランと、データ通信の量で選べるプランの", 2)).toBe(true);
    expect(countable("最初の電話や訪問では、今使っている機器の台数、1か月の印刷枚数、リースや契約の満了時期、困っていることの", 4)).toBe(true);
    expect(countable("本体のリース料とカウンター料金の", 2)).toBe(true);
    // 並べた物がなければ、数は数えられない
    expect(countable("リース契約の期間は、原則として", 5)).toBe(false);
  });

  it("自社商材・8問・ふつう：数を数えれば分かる空欄・資料の前置きの文がない", () => {
    expect(qs).toHaveLength(8);
    for (const q of qs) {
      const text = [q.prompt, ...q.choices].join("\n");
      expect(text).not.toMatch(/ファクスの（|プランの（|困っていることの（|料金の（/);
      expect(text).not.toMatch(/この資料では|できるよう、|新人の営業担当/);
    }
  });

  it("どの資料でも、資料の前置きの文（この資料では…まとめます）を問題にも選択肢にもしない", () => {
    for (const { qs: list } of ALL) for (const q of list) expect([q.prompt, ...q.choices, q.quote].join("\n")).not.toMatch(/この資料では|まとめます|研修用の架空/);
  });

  it("言葉の空欄の誤答は、正解と同じ仲間の言葉（入れても文として読める）", () => {
    for (const { qs: list } of ALL) {
      for (const q of list.filter((x) => x.prompt.startsWith(FILL) && !isNumber(answerOf(x)))) {
        expect(categoryOf(answerOf(q)), blankLine(q)).not.toBeNull();
        for (const w of wrongsOf(q)) expect(categoryOf(w), `${blankLine(q)} / ${w}`).toBe(categoryOf(answerOf(q)));
      }
    }
    // 仲間の分からない言葉（疑問点など）は空欄にしない
    expect(categoryOf("疑問点")).toBeNull();
    expect(categoryOf("営業担当")).toBe(categoryOf("技術員"));
    expect(categoryOf("パワーハラスメント")).not.toBe(categoryOf("チャット"));
  });

  it("「〜も〜ません」を「〜も〜ます」にしない", () => {
    expect(flipRule("他社の商品の悪口も言いません。")).toBeNull();
    for (const { qs: list } of ALL) for (const q of list) for (const c of q.choices) expect(c).not.toMatch(/悪口も言います/);
  });

  it("きまりの問題の問題文は「『○○』の項目について、正しいもの（合わないもの）はどれですか」", () => {
    for (const { qs: list } of ALL) {
      for (const q of list.filter((x) => !x.prompt.startsWith(FILL))) {
        expect(q.prompt).toMatch(/^(?:「[^」]+」){1,3}の項目について、(?:正しいもの|資料の内容と合わないもの)はどれですか。$/);
        expect(q.prompt).not.toContain("など、");
      }
    }
  });

  it("きまりの問題の選択肢は長さがそろっている（長さで答えが分からない）", () => {
    for (const { qs: list } of ALL) {
      for (const q of list.filter((x) => !x.prompt.startsWith(FILL))) {
        const lens = q.choices.map((c) => c.length);
        expect(Math.max(...lens) / Math.min(...lens), q.choices.join(" / ")).toBeLessThanOrEqual(2.2);
      }
    }
  });

  it("どの文も、テスト全体で1回しか使わない（ある問題の選択肢が、別の問題の答えを教えない）", () => {
    for (const { m, d, qs: list } of ALL) {
      const seen = new Map<string, number>();
      list.forEach((q, i) => {
        // 問題ごとに、その問題が使った資料の文（根拠と、資料のとおりの選択肢）
        const used = new Set([q.quote, ...q.choices.filter((c) => findQuote(m.body, c).found && c.length >= 10)].map((t) => t.replace(/。$/, "")));
        for (const t of used) {
          expect(seen.has(t), `${m.title} ${d}：第${(seen.get(t) ?? 0) + 1}問と第${i + 1}問「${t}」`).toBe(false);
          seen.set(t, i);
        }
      });
    }
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

  it("全体では目立たなくても、特定の部署で大きく低い問題（カスタマーサポート×第10問）を挙げる", () => {
    const r = sampleFollowUp(test, stats, d.people);
    const f = r.findings.find((x) => x.title.startsWith("カスタマーサポート"))!;
    expect(f.title).toBe("カスタマーサポートは第10問の正答率が0%");
    expect(f.detail).toContain("全体の正答率54%");
    expect(f.evidenceQuestionIds).toEqual(["test-privacy-q10"]);
    expect(r.actions.some((a) => a.startsWith("カスタマーサポート向けに、第10問"))).toBe(true);
  });

  it("AIへの指示文に、部署×問題の正答率と、全体より大きく低い組み合わせを渡す", () => {
    const p = buildFollowUpPrompt(test, stats, d.people);
    expect(p).toContain("部署×問題の正答率");
    expect(p).toMatch(/- カスタマーサポート: 第1問 \d+% .*第10問 0%/);
    expect(p).toContain("- カスタマーサポート [test-privacy-q10] 第10問: 部署0%（3人）/ 全体54%");
  });
});

describe("sampleFollowUp：受講者が少ないとき・同じ問題の重複", () => {
  const d = createSeedData(new Date(2026, 10, 11, 17, 0));
  const test = d.tests.find((t) => t.id === "test-privacy")!;
  const learners = [...new Set(d.attempts.filter((a) => a.testId === test.id).map((a) => a.learnerId))];

  it.each([1, 2])("受講者が%i人なら、見出しも含めて「まだ結論は出せない」だけを返す（矛盾した気づきを出さない）", (n) => {
    const keep = new Set(learners.slice(0, n));
    const stats = computeTestStats(test, d.attempts.filter((a) => keep.has(a.learnerId)), d.people);
    expect(stats.learnerCount).toBe(n);
    const r = sampleFollowUp(test, stats, d.people);
    expect(r.headline).toBe("まだ受講者が少ないため、結論は出せません");
    // 根拠の問題も挙げない（挙げると、その問題に何かあるように読めてしまう）
    expect(r.findings[0].evidenceQuestionIds).toEqual([]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].title).toBe(`受講したのは、まだ${n}人です`);
    const all = [r.headline, ...r.findings.flatMap((f) => [f.title, f.detail]), ...r.actions].join("\n");
    // 理解度の良し悪し・問題ごとの正答率・部署の話は出さない
    expect(all).not.toMatch(/理解が十分でない|理解度は高め|つまずいている問題はありません|第\d+問|%|平均点/);
  });

  it("受講者が3人なら、ふつうの分析をする", () => {
    const keep = new Set(learners.slice(0, 3));
    const stats = computeTestStats(test, d.attempts.filter((a) => keep.has(a.learnerId)), d.people);
    expect(sampleFollowUp(test, stats, d.people).headline).not.toContain("結論は出せません");
  });

  it("部署の気づきで取り上げた問題（第10問）を、全体の気づき・フォローで重ねて取り上げない", () => {
    const stats = computeTestStats(test, d.attempts, d.people);
    const r = sampleFollowUp(test, stats, d.people);
    const ids = r.findings.flatMap((f) => f.evidenceQuestionIds);
    expect(ids.filter((id) => id === "test-privacy-q10")).toHaveLength(1);
    expect(r.actions.filter((a) => a.includes("第10問"))).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
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

describe("isFormatError（返答の形の不正と通信エラーを分ける）", () => {
  it("JSONとして読めない・決めた形と違うときは true、通信エラーなどは false", () => {
    expect(isFormatError(new SyntaxError("Unexpected token"))).toBe(true);
    expect(isFormatError(z.object({ a: z.string() }).safeParse({}).error)).toBe(true);
    expect(isFormatError(new Error("network"))).toBe(false);
  });
});

describe("buildQuizPrompt", () => {
  it("作り直しのときは、前と別の箇所・聞き方で作るよう伝える", () => {
    const base = { title: "t", body: "b", count: 5, difficulty: "normal" as const };
    expect(buildQuizPrompt(base)).not.toContain("作り直し");
    expect(buildQuizPrompt({ ...base, variant: 2 })).toContain("作り直し: 2回目");
  });
});
