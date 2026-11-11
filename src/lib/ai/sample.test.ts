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
import { categoryOf, countable, endingKind, extractTerms, flipRule, listedCount, minFor, numberVariants, sampleFollowUp, sampleQuiz, shorten, splitSentences } from "./sample";
import { hashString, mulberry32 } from "../random";
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
  const term = (v: number, unit: string) => ({ text: `${v}${unit}`, kind: "number" as const, index: 0, unit, value: v });

  it("正解に近い数字だけを3つ使い、10倍のような極端な数字や0以下は使わない", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      for (const [v, unit] of [[2, "回"], [3, "年"], [12, "文字以上"], [30, "分以内"], [5, "営業日以内"], [8000, "円"]] as const) {
        for (let seed = 0; seed < 20; seed++) {
          const vs = numberVariants(term(v, unit), d, mulberry32(seed));
          expect(vs).toHaveLength(3);
          for (const x of vs) {
            const n = Number(x.match(/^\d+/)![0]);
            expect(n).toBeGreaterThan(0);
            expect(n).not.toBe(v);
            expect(n / v).toBeLessThanOrEqual(4);
            expect(v / n).toBeLessThanOrEqual(5);
          }
        }
      }
    }
  });

  it("3回目のチェックの指摘：正解が「いつも2番目に小さい数」にならない（並べたときの正解の順位がばらつく）", () => {
    const ranks = [0, 0, 0, 0];
    for (let seed = 0; seed < 200; seed++) {
      const vs = numberVariants(term(50, "分以内"), "normal", mulberry32(hashString(`seed${seed}`))).map((x) => Number(x.match(/^\d+/)![0]));
      ranks[[50, ...vs].sort((a, b) => a - b).indexOf(50)]++;
    }
    // 1位〜4位のどれも、全体の1割以上は出る
    for (const r of ranks) expect(r).toBeGreaterThanOrEqual(20);
  });

  it("小さい数で下に作れないときは、上で補う（0やマイナスを作らない）", () => {
    for (let seed = 0; seed < 20; seed++) {
      const vs = numberVariants(term(2, "回"), "normal", mulberry32(seed));
      expect(vs).toHaveLength(3);
      expect(vs.every((x) => Number(x.match(/^\d+/)![0]) >= 1)).toBe(true);
    }
  });

  it("3回目のチェックの指摘：並べた物の数を超える誤答は出さない（4つのうち「5種類以上」は選べない）", () => {
    expect(listedCount("英字の大文字・小文字・数字・記号のうち")).toBe(4);
    for (let seed = 0; seed < 50; seed++) {
      const vs = numberVariants(term(3, "種類以上"), "normal", mulberry32(seed), { max: 4 });
      expect(vs).toHaveLength(3);
      expect(vs).not.toContain("5種類以上");
    }
    const security = MATERIALS.find((m) => m.id === "mat-security")!;
    for (const d of ["easy", "normal", "hard"] as const) {
      for (let v = 0; v < 4; v++) {
        for (const q of sampleQuiz({ body: security.body, count: 8, difficulty: d, variant: v })) expect(q.choices).not.toContain("5種類以上");
      }
    }
  });
});

describe("flipRule（きまりの文を逆の意味にする）", () => {
  it("禁止・必ず・〜ません を逆の意味にする", () => {
    expect(flipRule("電車の網棚にかばんを置くことは禁止です。")).toBe("電車の網棚にかばんを置くことは認められています");
    expect(flipRule("飲食店やカフェで、お客様の資料を広げて作業してはいけません。")).toBe("飲食店やカフェで、お客様の資料を広げて作業します");
    // 汎用の規則だけ（貼り付けた資料と同じ）では「受けずにください」のような不自然な文になるので、書き換えない
    expect(flipRule("提案書は、お客様に出す前に、必ず上長の確認を受けてください。")).toBeNull();
    expect(flipRule("報告した人が責められることはありません。")).toBe("報告した人が責められることがあります");
    expect(flipRule("上長に相談しにくい内容は、直接相談窓口に連絡してかまいません。")).toBe("上長に相談しにくい内容は、直接相談窓口に連絡してはいけません");
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

  it("不自然・弱い書き換えはしない（3回目のチェックの指摘：〜場合はありません／〜できません／できれば／別々の条件で）", () => {
    // 書き換えると不自然になる文は、誤答に使わない（null）
    expect(flipRule("紙づまりなどの簡単なトラブルは、本体の画面に表示される手順で、お客様自身で直せる場合があります。")).toBeNull();
    expect(flipRule("当社の法人携帯には、端末を一か所で管理できる管理サービスを付けられます。")).toBeNull();
    expect(flipRule("紛失したときは、管理画面から遠隔で端末をロックし、データを消去できます。")).toBeNull();
    expect(flipRule("提案書には、今の費用と当社に切り替えたあとの費用を、同じ条件で並べて書きます。")).toBeNull();
    expect(flipRule("「こんなことで連絡していいのか」と迷う必要はありません。")).toBeNull();
    // 「必ず」は「できれば」にせず、はっきり逆の内容に言い換える（見本資料では、資料ごとに用意した誤答の候補を使う）
    const products = MATERIALS.find((m) => m.id === "mat-products")!;
    expect(
      flipRule("どうしても解約する場合は、残りの期間のリース料をまとめて支払う必要があることを、契約の前に必ず説明します。", products.distractorHints),
    ).toBe("どうしても解約する場合は、残りの期間のリース料をまとめて支払う必要があることを、契約のあとで説明します");
    // 汎用の規則だけでは自然に書き換えられないので、誤答に使わない
    expect(flipRule("どうしても解約する場合は、残りの期間のリース料をまとめて支払う必要があることを、契約の前に必ず説明します。")).toBeNull();
    const security = MATERIALS.find((m) => m.id === "mat-security")!;
    expect(flipRule("席を離れるときは、短い時間でも必ず画面をロックします。", security.distractorHints)).toBe("席を離れるときは、10分以上離れる場合だけ画面をロックします");
    // 「〜も、〜です」を打ち消すときは「〜は、〜にはあたりません」にする
    const privacy = MATERIALS.find((m) => m.id === "mat-privacy")!;
    expect(flipRule("お客様の声を録音した通話の記録も、個人情報です。", privacy.distractorHints)).toBe("お客様の声を録音した通話の記録は、個人情報にはあたりません");
    for (const m of MATERIALS) {
      for (const sen of splitSentences(m.body)) {
        const f = flipRule(sen.text);
        if (f) expect(f, sen.text).not.toMatch(/できれば|場合はありません|[^は]できません$|付けられません$|別々の条件|決められた日だけ|でも[^、。]*では[^、。]*ません$|でも、[^。]*伝えます$/);
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
/** 「年に1回」のような頻度は、ひとまとまりの数字の問題として扱う */
const isFreq = (c: string) => /^(?:週|月|半年|年|\d+年)に\d+回$/.test(c);
const isNumber = (c: string) => /^\d/.test(c) || isFreq(c);
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
    // 数字の問題は、実際にできた問題数のおよそ半分まで（README の説明どおり）
    expect(nums.length).toBeLessThanOrEqual(Math.ceil(qs.length / 2));
    expect(count).toBeGreaterThan(0);
    for (const q of nums.filter((x) => !isFreq(answerOf(x)))) {
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
        // 選択肢の項目が4つ以上にまたがるときは「資料全体について、」とする
        expect(q.prompt).toMatch(/^(?:(?:「[^」]+」){1,3}の項目について、|資料全体について、)(?:正しいもの|資料の内容と合わないもの)はどれですか。$/);
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

  it("3回目のチェックの指摘：受講者が3人未満の部署を「平均点が低め」と言い切らない", () => {
    const stats = computeTestStats(test, d.attempts, d.people);
    const r = sampleFollowUp(test, stats, d.people);
    for (const f of r.findings) {
      const m = f.title.match(/^(.+)の平均点が低め/);
      if (m) expect(stats.departments.find((x) => x.department === m[1])!.learners).toBeGreaterThanOrEqual(3);
    }
    // 3人のうち2人が同じ部署で低い点でも、その部署の「平均点が低め」は出さない
    const cs = d.people.filter((p) => p.department === "カスタマーサポート").map((p) => p.id);
    const other = learners.filter((id) => !cs.includes(id));
    const keep = new Set([...cs.filter((id) => learners.includes(id)).slice(0, 2), other[0]]);
    const small = computeTestStats(test, d.attempts.filter((a) => keep.has(a.learnerId)), d.people);
    if (small.learnerCount >= 3) {
      const all = sampleFollowUp(test, small, d.people).findings.map((f) => f.title).join("\n");
      expect(all).not.toMatch(/平均点が低め/);
    }
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

describe("sampleQuiz：3回目のチェックの指摘（答えの目印・貼り付けた資料）", () => {
  // チェック係が貼り付けて試した資料（経費精算）と同じ形の短い資料
  const PASTED = `経費精算のルール

1. 申請の期限
経費は、使った日から2週間以内に精算システムで申請してください。月末をまたぐ場合は、翌月の5営業日までに申請します。期限を過ぎた申請は、部長の承認がないと受け付けません。

2. 領収書
領収書は、宛名を当社の正式名称にしてもらいます。レシートしかもらえない場合は、レシートに用途を手書きで書き添えてください。領収書をなくしたときは、再発行を依頼し、それもできない場合は理由書を提出します。

3. 交通費
電車やバスは、最も安い経路の運賃で申請します。タクシーは、深夜0時を過ぎた場合と、重い荷物を運ぶ場合にだけ使えます。新幹線のグリーン車は使いません。

4. 会食
お客様との会食は、1人あたり8000円までです。事前に上長へ相手の会社名と人数を伝えてください。社内の人だけの飲み会は、経費になりません。
`;
  const PERMIT = /(?:かまいません|認められています|問題ありません|必要はありません)$/;

  it("「〜ないと〜ません」「〜しか〜ません」を「〜ます」にしない（「承認がないと受け付けます」を出さない）", () => {
    expect(flipRule("期限を過ぎた申請は、部長の承認がないと受け付けません。")).toBeNull();
    expect(flipRule("レシートしか受け付けません。")).toBeNull();
    for (const d of ["easy", "normal", "hard"] as const) {
      for (let v = 0; v < 4; v++) {
        for (const q of sampleQuiz({ body: PASTED, count: 8, difficulty: d, variant: v })) expect(q.choices.join("\n")).not.toMatch(/ないと受け付けます/);
      }
    }
  });

  it("数字の問題は、実際にできた問題数のおよそ半分まで（短い資料でも）", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      for (const count of [5, 8, 10]) {
        const qs = sampleQuiz({ body: PASTED, count, difficulty: d });
        expect(qs.length).toBeGreaterThan(0);
        expect(qs.filter((q) => q.prompt.startsWith(FILL) && isNumber(answerOf(q))).length).toBeLessThanOrEqual(Math.ceil(qs.length / 2));
      }
    }
  });

  it("「合わないもの」では、許可の形（〜てもかまいません）の選択肢がそれだけ答えになる問題を、ほぼ作らない", () => {
    let asked = 0;
    let cue = 0;
    for (const { qs } of ALL) {
      for (const q of qs.filter((x) => x.prompt.includes("合わないもの"))) {
        asked++;
        const p = q.choices.map((c) => PERMIT.test(c));
        if (p.filter(Boolean).length === 1 && p[q.answerIndex]) cue++;
      }
    }
    expect(asked).toBeGreaterThan(20);
    expect(cue / asked).toBeLessThanOrEqual(0.05);
  });

  it("「正しいもの」の誤答に、許可の形は1つまで（ほかの問題が作れないときを除く）", () => {
    let many = 0;
    let asked = 0;
    for (const { qs } of ALL) {
      for (const q of qs.filter((x) => x.prompt.endsWith("正しいものはどれですか。"))) {
        asked++;
        if (wrongsOf(q).filter((c) => PERMIT.test(c)).length >= 2) many++;
      }
    }
    expect(many / asked).toBeLessThanOrEqual(0.1);
  });

  it("見本資料ごとの誤答の候補は、見本資料だけに使う（貼り付けた資料では汎用の規則だけ）", () => {
    const products = MATERIALS.find((m) => m.id === "mat-products")!;
    expect(products.distractorHints?.length).toBeGreaterThan(0);
    // 同じ文でも、候補を渡さなければ汎用の規則だけで書き換える
    expect(flipRule("保守センターの電話番号は、本体の正面に貼ってあるシールに書かれています。")).toBeNull();
    expect(flipRule("保守センターの電話番号は、本体の正面に貼ってあるシールに書かれています。", products.distractorHints)).toBe(
      "保守センターの電話番号は、本体の裏側に貼ってあるシールに書かれています",
    );
  });

  it("短い条件で始まる、前の文を受けた文（「10分を超えても話がまとまらない場合は、〜」）を選択肢・空欄に使わない", () => {
    const body = `電話応対の基本

1. クレームの電話
クレームの電話では、相手の話を途中でさえぎらずに最後まで聞きます。その場で約束できないことは、上長に確認してから折り返すと伝えます。10分を超えても話がまとまらない場合は、上長に代わってもらいます。担当者の携帯電話の番号は、相手に教えてはいけません。電話は3回鳴るまでに取ります。相手の会社名とお名前は、必ず復唱して確認します。保留にする時間は30秒までにします。`;
    for (const q of sampleQuiz({ body, count: 8, difficulty: "normal" })) expect([q.prompt, ...q.choices].join("\n")).not.toMatch(/話がまとまらない場合は/);
  });
});

describe("sampleQuiz：4回目のチェックの指摘（語尾の手がかり・難しさ・下限・時間）", () => {
  const RULE = /(?:ください|てはいけません|禁止です)$/;
  const all = MATERIALS.flatMap((m) =>
    (["easy", "normal", "hard"] as const).flatMap((difficulty) =>
      [5, 8, 10].flatMap((count) => [0, 1].map((variant) => ({ difficulty, count, qs: sampleQuiz({ body: m.body, count, difficulty, variant }) }))),
    ),
  );

  it("「正しいもの」で、きまりの言い方で終わる選択肢が1つだけなら、それを選ぶ、で当たらない（外れより多くならない）", () => {
    let hit = 0;
    let miss = 0;
    for (const { qs } of all)
      for (const q of qs.filter((x) => x.prompt.includes("正しいもの"))) {
        const r = q.choices.map((c) => RULE.test(c));
        if (r.filter(Boolean).length !== 1) continue;
        if (r[q.answerIndex]) hit++;
        else miss++;
      }
    expect(hit).toBeLessThanOrEqual(miss);
    expect(hit).toBeLessThanOrEqual(2);
  });

  it("「正しいもの」では、答えの語尾の種類が4つの中で答えだけにならない", () => {
    for (const { qs } of all)
      for (const q of qs.filter((x) => x.prompt.includes("正しいもの"))) {
        const k = endingKind(q.choices[q.answerIndex]);
        expect(q.choices.filter((c, i) => i !== q.answerIndex && endingKind(c) === k).length, q.prompt).toBeGreaterThan(0);
      }
  });

  it("やさしいは、8問でも10問でも「正しいもの」が「合わないもの」より多い", () => {
    for (const count of [8, 10]) {
      const qs = all.filter((x) => x.difficulty === "easy" && x.count === count).flatMap((x) => x.qs);
      const right = qs.filter((q) => q.prompt.includes("正しいもの")).length;
      const wrong = qs.filter((q) => q.prompt.includes("合わないもの")).length;
      expect(right, `${count}問`).toBeGreaterThan(wrong);
    }
  });

  it("「9時から（　）まで」に9時以前・24時より後の誤答を出さない", () => {
    const s = "受付時間は平日の9時から18時までです。";
    const t = extractTerms(s).find((x) => x.text === "18時")!;
    expect(minFor(t, s)).toBe(10);
    for (const d of ["easy", "normal", "hard"] as const) {
      for (let i = 0; i < 20; i++) {
        const vs = numberVariants(t, d, mulberry32(i), { min: minFor(t, s) }).map((x) => Number(x.replace("時", "")));
        expect(vs.every((n) => n > 9 && n <= 24), vs.join(",")).toBe(true);
      }
    }
  });

  it("「（　）を組み合わせます」に1種類を出さない", () => {
    const s = "パスワードは12文字以上にし、英字の大文字・小文字・数字・記号のうち3種類以上を組み合わせます。";
    const t = extractTerms(s).find((x) => x.text.startsWith("3種類"))!;
    expect(minFor(t, s)).toBe(2);
    for (const m of MATERIALS)
      for (const d of ["easy", "normal", "hard"] as const)
        for (const q of sampleQuiz({ body: m.body, count: 10, difficulty: d })) expect(q.choices).not.toContain("1種類以上");
  });

  it("よく似た文がくり返す長い資料でも、時間の上限で打ち切る（画面が固まらない）", () => {
    const base = "電話は3回鳴るまでに取ります。取ったら会社名を名乗ります。相手の会社名とお名前は、必ず復唱して確認します。保留は30秒までにしてください。";
    let body = "電話応対\n\n";
    for (let k = 1; body.length < 5900; k++) body += `${k}. 決まり${k}\n${base.replace("3回", `${k + 2}回`).replace("30秒", `${k + 29}秒`)}\n\n`;
    const t0 = Date.now();
    sampleQuiz({ body, count: 10, difficulty: "normal", timeLimitMs: 300 });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("shorten（フォロー提案の引用を短くする）", () => {
  it("かぎかっこの途中で切らない", () => {
    const out = shorten("より大きな事務所には、1分間に50枚の印刷ができる「LC-5000」をおすすめします");
    expect(out.split("「").length).toBe(out.split("」").length);
    expect(out.endsWith("…")).toBe(true);
  });
  it("短い文はそのまま", () => {
    expect(shorten("短い文です")).toBe("短い文です");
  });
});
