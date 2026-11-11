// 「見本の返答」。AIが使えないとき（未設定・無料枠の上限・通信エラー・形の不正）に使う、ルールベースの処理。
// AIと同じ形（GeneratedQuestion / FollowUpInsight）を返すので、画面側はどちらが動いたかを気にしなくてよい。
//
// 問題の作り方は2種類。引用文は資料の文をそのまま切り出すので、必ず資料の中にある。
// ・空欄の問題：大事そうな文の中の語句（数字・カタカナ語・漢字の言葉）を空欄にする。誤答は、資料の別の文に出てくる
//   同じ種類の語句か、正解に近い数字。並べて書かれた言葉など「入れても正しく読めてしまう」誤答は使わない。
// ・きまりの問題：「〜してはいけません」「必ず〜」のような文を選び、ほかのきまりの文を逆の意味に書き換えたものを
//   誤答にして「正しいもの」を選ばせる（または逆に、書き換えた1つを「合わないもの」として選ばせる）。

import { CHOICE_MARKS } from "../quality";
import { LOW_RATE, pct, type TestStats } from "../analytics";
import { normalize } from "../quote";
import { hashString, mulberry32, shuffle } from "../random";
import type { Difficulty, FollowUpInsight, GeneratedQuestion, Person, Test } from "../types";

// ───────── 文に分ける ─────────

export type Sentence = { text: string; start: number };

/** 資料を文に分ける。見出し・「問：」で始まる行・短すぎる文は除く。text は資料の部分文字列そのもの */
export function splitSentences(body: string): Sentence[] {
  const out: Sentence[] = [];
  // 「。」で文を区切る。ただし「」『』（）の中の「。」では区切らない（例：「お電話ありがとうございます。」と名乗る）
  let depth = 0;
  let from = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ("「『（(".includes(ch)) depth++;
    else if ("」』）)".includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === "\n") {
      depth = 0;
      from = i + 1;
    } else if (ch === "。" && depth === 0) {
      pushSentence(out, body.slice(from, i + 1), from);
      from = i + 1;
    }
  }
  return out;
}

function pushSentence(out: Sentence[], raw: string, rawStart: number) {
  let text = raw;
  let start = rawStart;
  // 行頭の「答：」などの前置きは引用に含めない
  const lead = text.match(/^\s*(?:答|A)[：:]\s*/);
  if (lead) {
    text = text.slice(lead[0].length);
    start += lead[0].length;
  }
  const trimmed = text.trimStart();
  start += text.length - trimmed.length;
  text = trimmed;
  if (/^(?:問|Q)[：:]/.test(text)) return;
  const len = normalize(text).text.length;
  if (len < 15 || len > 120) return;
  out.push({ text, start });
}

// ───────── 空欄にする語句を探す ─────────

export type TermKind = "number" | "katakana" | "kanji";
export type Term = {
  text: string;
  kind: TermKind;
  /** 文の中の位置 */
  index: number;
  unit?: string;
  value?: number;
  /** すぐ後ろの1文字（助詞など）。漢字の言葉の誤答を、同じ使われ方の言葉から選ぶのに使う */
  next?: string;
};

const UNITS = [
  "営業日以内", "時間以内", "日以内", "分以内", "秒以内", "文字以上", "種類以上", "か月", "ヶ月", "週間", "分間",
  "文字", "種類", "時間", "年", "日", "分", "秒", "枚", "台", "名", "人", "回", "件", "点", "つ", "時", "%", "％",
];
const NUM_RE = new RegExp(`(?<![-\\d.])(\\d+)(${UNITS.map((u) => u.replace(/[%％]/g, "\\$&")).join("|")})`, "g");
const KATAKANA_RE = /[ァ-ヴ][ァ-ヴー]+/g;
const KANJI_RE = /[一-龠々]+/g;

const IS_KANJI = /[一-龠々]/;
const IS_KATAKANA = /[ァ-ヴー]/;
/** 言葉のすぐ後ろに来てよい文字（助詞・句読点・かっこ）。これ以外のひらがなは送りがなとみなす */
const AFTER_OK = /^(?:$|[をにがはでとのもへやか、。・」』）)])/;

/** 空欄にしても問題にならない、ありふれた言葉 */
const STOP = new Set([
  "当社", "場合", "必要", "資料", "自分", "原則", "以下", "一方", "目安", "方法", "対象", "内容", "確認", "相手", "最初",
  "以上", "以内", "一人", "全体", "毎日", "具体的", "時間", "部分", "理由", "客様", "様子", "大丈夫", "言葉", "一言", "気軽",
  "大切", "社内", "社外", "本人", "同意", "仕事", "業務", "会社", "注意",
  // 名詞として空欄にしにくい言葉（副詞・形容詞のように使われる言葉）
  "絶対", "同時", "複数", "時点", "禁止", "今後", "事実", "範囲", "背景", "対応", "個人", "全社員", "長時間", "一切", "最短",
]);
/** 漢字の言葉の前に来てよい文字。これ以外のひらがなが前にあると、「かけ放題」の放題のような言葉の切れ端になりやすい */
const KANJI_BEFORE_OK = /^(?:|[をにがはでとのもへや、。「『（(・])$/;

/** 開いたままのかっこの中にあるか（「（退職後3年）」の3年など） */
function insideParen(text: string, index: number): boolean {
  let depth = 0;
  for (const ch of text.slice(0, index)) {
    if (ch === "（" || ch === "(") depth++;
    else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

function insideQuote(text: string, index: number): boolean {
  const before = text.slice(0, index);
  return before.split("「").length > before.split("」").length;
}

/**
 * 空欄の候補になる語句を取り出す。漢字・カタカナの言葉は「それだけで1つの言葉」になっているものだけにする。
 * ・前後に漢字・カタカナが続かない（「情報システム担当」のシステムは取らない）
 * ・前が「お」「ご」でない（「お電話」の電話は取らない）
 * ・後ろが送りがなでない（「名乗る」の名乗、「ロックします」のロックは取らない）
 * ・かっこの中でない
 */
export function extractTerms(text: string): Term[] {
  const terms: Term[] = [];
  for (const m of text.matchAll(NUM_RE)) terms.push({ text: m[0], kind: "number", index: m.index!, unit: m[2], value: Number(m[1]) });
  const word = (m: RegExpMatchArray, kind: TermKind) => {
    const w = m[0];
    const i = m.index!;
    const before = text[i - 1] ?? "";
    const after = text.slice(i + w.length);
    if (IS_KANJI.test(before) || IS_KATAKANA.test(before) || /\d/.test(before) || /[おご]/.test(before)) return;
    if (IS_KANJI.test(after[0] ?? "") || IS_KATAKANA.test(after[0] ?? "")) return;
    if (!AFTER_OK.test(after)) return;
    if (insideParen(text, i)) return;
    if (kind === "kanji" && !KANJI_BEFORE_OK.test(before)) return;
    terms.push({ text: w, kind, index: i, next: after[0] ?? "" });
  };
  for (const m of text.matchAll(KATAKANA_RE)) if (m[0].length >= 3) word(m, "katakana");
  for (const m of text.matchAll(KANJI_RE)) if (m[0].length >= 2 && m[0].length <= 5 && !STOP.has(m[0])) word(m, "kanji");
  return terms.sort((a, b) => a.index - b.index);
}

/** 「〜してはいけません」「〜は禁止です」のような文。名詞を空欄にすると、ほかの言葉でも正しく読めてしまう */
const PROHIBIT_RE = /いけません|禁止|ないで|ません。$|避けます/;

/** 空欄にしてよい語句か */
function blankable(t: Term, sentence: string): boolean {
  const before = sentence[t.index - 1] ?? "";
  const after = sentence[t.index + t.text.length] ?? "";
  if (insideParen(sentence, t.index)) return false;
  // 同じ文の別の場所に正解が書いてあると、答えが分かってしまう
  if (sentence.indexOf(t.text) !== sentence.lastIndexOf(t.text)) return false;
  if (t.kind === "number") {
    // 「名刺1枚にも」「1台にまとめた」のような1は問題にしにくい（「年に1回」は残す）
    if (t.value === 1 && t.unit !== "回") return false;
    // 「10〜30名」のような範囲の片方は空欄にしない
    if (/[〜～~\-－]/.test(before) || /[〜～~\-－]/.test(after)) return false;
    return true;
  }
  if (PROHIBIT_RE.test(sentence)) return false;
  // 「パソコンやスマートフォン」のように並べた言葉の1つは、ほかの言葉でも正しく読めてしまう
  if (/[や・と]/.test(before) || /[や・と]/.test(after)) return false;
  return true;
}

/** 文の中で、空欄にするのに一番よい語句を選ぶ。numberOk が false なら数字は選ばない */
function pickAnswerTerm(terms: Term[], sentence: string, numberOk: boolean): Term | null {
  const ok = terms.filter((t) => blankable(t, sentence) && (numberOk || t.kind !== "number"));
  const nums = ok.filter((t) => t.kind === "number");
  if (nums.length) return nums[nums.length - 1];
  // カタカナ語→漢字の言葉の順。長い言葉ほど、その文ならではの大事な言葉であることが多い
  for (const kind of ["katakana", "kanji"] as const) {
    const cands = ok.filter((t) => t.kind === kind);
    if (cands.length) return [...cands].sort((a, b) => b.text.length - a.text.length)[0];
  }
  return null;
}

// ───────── 誤答を作る ─────────

/** 数字の誤答：正解に近い、ありえそうな数字にする（10倍のような極端な数字は使わない） */
export function numberVariants(t: Term, difficulty: Difficulty): string[] {
  const v = t.value ?? 1;
  const step = v < 10 ? 1 : v < 20 ? 2 : v < 100 ? 10 : 50;
  const list = difficulty === "easy" ? [v + step * 2, v - step, v + step, v - step * 2, v + step * 3] : [v + step, v - step, v + step * 2, v - step * 2, v + step * 3];
  return [...new Set(list.filter((n) => n > 0 && n !== v))].map((n) => `${n}${t.unit}`);
}

function sameTerm(a: string, b: string): boolean {
  return normalize(a).text === normalize(b).text;
}

/** 資料の中で「AやB」「A・B」のように並べて書かれた言葉の組（どちらを入れても正しく読めてしまう） */
function siblingPairs(sentences: Sentence[]): Set<string> {
  const pairs = new Set<string>();
  for (const s of sentences) {
    const ts = extractTermsLoose(s.text);
    for (let i = 0; i + 1 < ts.length; i++) {
      const a = ts[i];
      const b = ts[i + 1];
      const between = s.text.slice(a.index + a.text.length, b.index);
      if (/^(?:[や・とか、]|の[^、。]{0,6}や)$/.test(between)) {
        pairs.add(`${normalize(a.text).text}|${normalize(b.text).text}`);
        pairs.add(`${normalize(b.text).text}|${normalize(a.text).text}`);
      }
    }
  }
  return pairs;
}

/** 並びを調べるための、境界のゆるい取り出し（漢字・カタカナ・英字のまとまり） */
function extractTermsLoose(text: string): { text: string; index: number }[] {
  return [...text.matchAll(/[一-龠々]{2,}|[ァ-ヴ][ァ-ヴー]+|[A-Za-z]{2,}/g)].map((m) => ({ text: m[0], index: m.index! }));
}

function buildDistractors(
  answer: Term,
  sentence: string,
  ctx: { body: string; pool: Term[]; siblings: Set<string> },
  difficulty: Difficulty,
  rand: () => number,
): string[] | null {
  const picked: string[] = [];
  const left = sentence.slice(Math.max(0, answer.index - 3), answer.index).replace(/^.*[、。「」（）]/, "");
  const right = sentence.slice(answer.index + answer.text.length, answer.index + answer.text.length + 3).replace(/[、。「」（）].*$/, "");
  const ok = (s: string) =>
    s.length > 0 &&
    !sameTerm(s, answer.text) &&
    !sentence.includes(s) &&
    !picked.some((p) => sameTerm(p, s)) &&
    !s.includes(answer.text) &&
    !answer.text.includes(s) &&
    !ctx.siblings.has(`${normalize(answer.text).text}|${normalize(s).text}`) &&
    // 空欄の前後と同じつながりで資料に出てくる言葉は、入れても正しく読めてしまうので使わない
    !(left.length >= 2 && ctx.body.includes(left + s)) &&
    !(right.length >= 2 && ctx.body.includes(s + right)) &&
    // 漢字の言葉で同じ字を含むもの（上長と上司など）は、意味が近く正解にも読めてしまう
    !(answer.kind === "kanji" && [...answer.text].some((ch) => s.includes(ch)));

  let candidates: string[];
  if (answer.kind === "number") {
    const inMaterial = shuffle(
      ctx.pool.filter((t) => t.kind === "number" && t.unit === answer.unit && t.value !== 1),
      rand,
    )
      // 資料の中の別の数字も、正解とかけ離れていなければ使う
      .filter((t) => t.value! <= answer.value! * 3 && t.value! * 3 >= answer.value!)
      .map((t) => t.text);
    const near = numberVariants(answer, difficulty);
    candidates = difficulty === "hard" ? near : [...inMaterial.slice(0, 1), ...near];
  } else {
    // 名詞の空欄には、同じ種類（カタカナ語どうし・漢字の言葉どうし）の言葉だけを使う。
    // 漢字の言葉は、後ろに同じ助詞が続く言葉（同じような使われ方をしている言葉）に限る
    const same = shuffle(
      ctx.pool.filter((t) => t.kind === answer.kind && (answer.kind !== "kanji" || t.next === answer.next)),
      rand,
    ).map((t) => t.text);
    candidates =
      difficulty === "easy" ? same : [...same].sort((a, b) => Math.abs(a.length - answer.text.length) - Math.abs(b.length - answer.text.length));
  }

  for (const c of candidates) {
    if (ok(c)) picked.push(c);
    if (picked.length === 3) return picked;
  }
  return null;
}

// ───────── きまり・手順を問う問題（正しいもの／合わないものを選ぶ） ─────────

/** 資料の文を「逆の意味」に書き換える規則。上から順に、最初に当てはまったものを使う */
const FLIPS: [RegExp, string][] = [
  [/てはいけません。?$/, "てもかまいません"],
  [/ことは禁止です。?$/, "ことは認められています"],
  [/ことは禁止されています。?$/, "ことは認められています"],
  [/ことはありません。?$/, "ことがあります"],
  [/必要はありません。?$/, "必要があります"],
  [/てかまいません。?$/, "てはいけません"],
  [/にはあたりません。?$/, "にあたります"],
  [/事前に/, "事後に"],
  [/その日のうちに/, "1週間以内に"],
  [/必ず/, "できれば"],
  [/ません。?$/, "ます"],
];

const LEAD_RE = /^(?:たとえば|また|一方で|ただし|なお)、/;

function asChoice(sentence: string): string {
  return sentence.replace(LEAD_RE, "").replace(/。$/, "");
}

/** 文を逆の意味に書き換える。書き換えられない文は null */
export function flipRule(sentence: string): string | null {
  const base = sentence.replace(LEAD_RE, "");
  for (const [re, rep] of FLIPS) {
    const m = base.match(re);
    // 「必ず故障しません」のような、かぎかっこの中の言葉は書き換えない
    if (m && !insideQuote(base, m.index!)) {
      const out = base.replace(re, rep).replace(/。$/, "");
      return out === asChoice(sentence) ? null : out;
    }
  }
  return null;
}

// ───────── 大事そうな文の点数 ─────────

const RULE_WORDS = /必ず|禁止|いけません|しません|ません|以内|までに|原則|ください|徹底/;

function scoreSentence(s: Sentence, terms: Term[]): number {
  let score = 0;
  if (terms.some((t) => t.kind === "number")) score += 3;
  if (terms.some((t) => t.kind === "katakana")) score += 1;
  if (RULE_WORDS.test(s.text)) score += 2;
  const len = normalize(s.text).text.length;
  if (len >= 25 && len <= 90) score += 1;
  return score;
}

/** 文が載っている項目の見出し（「4. 保管のルール」など）。解説で「どこに書いてあるか」を示すのに使う */
function headingOf(body: string, at: number): string | null {
  const lines = body.slice(0, at).split("\n").reverse();
  for (const l of lines) {
    const m = l.match(/^\s*(\d+[.．]\s*.+)$/);
    if (m) return m[1].trim();
  }
  return null;
}

function where(heading: string | null): string {
  return heading ? `資料の「${heading}」` : "資料";
}

function fitExplanation(parts: string[]): string {
  // 解説は250字まで。長いときは後ろの補足から削る
  let out = parts.join("");
  for (let n = parts.length - 1; out.length > 250 && n > 0; n--) out = parts.slice(0, n).join("");
  return out.slice(0, 250);
}

// ───────── 問題を作る ─────────

type Draft = { start: number; q: Omit<GeneratedQuestion, "answerIndex" | "choices"> & { answer: string; distractors: string[] }; kind: "number" | "word" | "rule" };

type QuizInput = { body: string; count: number; difficulty: Difficulty; variant?: number };

/**
 * 見本の返答で問題を作る。variant（作り直し番号）を変えると別の組み合わせになる。
 * 作り直しのときは、直前3回までの作り直しで使った文を、新しいものほど強く後回しにする。
 */
export function sampleQuiz(input: QuizInput): GeneratedQuestion[] {
  const v = input.variant ?? 0;
  const history: string[][] = [];
  let out: GeneratedQuestion[] = [];
  for (let k = Math.max(0, v - 3); k <= v; k++) {
    const penalty = new Map<string, number>();
    const recent = history.slice(-3);
    recent.forEach((quotes, i) => {
      const w = [3, 6, 10][i + 3 - recent.length];
      for (const q of quotes) penalty.set(q, Math.max(penalty.get(q) ?? 0, w));
    });
    out = buildQuiz({ ...input, variant: k }, penalty);
    history.push(out.map((q) => q.quote));
  }
  return out;
}

function buildQuiz(input: QuizInput, penalty: Map<string, number>): GeneratedQuestion[] {
  const { body, count, difficulty } = input;
  const rand = mulberry32(hashString(`${body.length}:${body.slice(0, 200)}`) ^ (count * 7919) ^ (DIFF_SEED[difficulty] + (input.variant ?? 0) * 104729));
  const sentences = splitSentences(body);
  const pool: Term[] = [];
  const seenTerm = new Set<string>();
  for (const s of sentences) {
    for (const t of extractTerms(s.text)) {
      const k = `${t.kind}:${normalize(t.text).text}`;
      if (!seenTerm.has(k)) {
        seenTerm.add(k);
        pool.push(t);
      }
    }
  }
  const ctx = { body, pool, siblings: siblingPairs(sentences) };

  // 数字の問題は全体のおよそ半分まで。きまり・手順を問う問題を3割ほど入れる
  const numberCap = Math.max(1, Math.floor(count / 2));
  const ruleTarget = count >= 5 ? Math.max(2, Math.round(count * 0.3)) : count >= 3 ? 1 : 0;

  const drafts: Draft[] = [];
  const usedSentences = new Set<number>();
  const usedAnswers = new Set<string>();

  // きまりの文（逆の意味に書き換えられる、短めの文）
  const rules = shuffle(
    sentences.filter((s) => normalize(s.text).text.length <= 70 && flipRule(s.text) !== null),
    rand,
  );
  const usedPrompts = new Set<string>();
  const addRule = () => {
    if (rules.length < 4) return false;
    const nRule = drafts.filter((d) => d.kind === "rule").length;
    // やさしい＝正しいものを選ぶ、ふつう・むずかしい＝「合わないもの」も混ぜる
    const askWrong = difficulty === "easy" ? false : difficulty === "hard" ? nRule % 2 === 0 : nRule % 2 === 1;
    const promptOf = (s: Sentence) => {
      const topic = (headingOf(body, s.start) ?? "").replace(/^\d+[.．]\s*/, "");
      const about = topic ? `「${topic}」など、` : "";
      return askWrong ? `${about}資料の内容と合わないものはどれですか。` : `${about}資料の内容として正しいものはどれですか。`;
    };
    const free = (s: Sentence) => !usedSentences.has(s.start) && !usedPrompts.has(promptOf(s));
    const target = [...rules].sort((a, b) => (penalty.get(a.text) ?? 0) - (penalty.get(b.text) ?? 0)).find(free);
    if (!target) return false;
    usedSentences.add(target.start);
    const prompt = promptOf(target);
    usedPrompts.add(prompt);
    // 誤答には、資料の近くの項目に書かれたきまりを使う（話題がそろい、消去法で選びにくくなる）
    const others = shuffle(
      rules
        .filter((s) => s !== target)
        .sort((a, b) => Math.abs(a.start - target.start) - Math.abs(b.start - target.start))
        .slice(0, 5),
      rand,
    ).slice(0, 3);
    const heading = headingOf(body, target.start);
    if (askWrong) {
      const flipped = flipRule(target.text)!;
      drafts.push({
        start: target.start,
        kind: "rule",
        q: {
          prompt,
          answer: flipped,
          distractors: others.map((s) => asChoice(s.text)),
          explanation: fitExplanation([
            `${where(heading)}には「${target.text}」とあります。`,
            `「${flipped}」は、これと逆の内容です。ほかの3つは資料のとおりです。`,
          ]),
          quote: target.text,
          difficulty,
        },
      });
    } else {
      drafts.push({
        start: target.start,
        kind: "rule",
        q: {
          prompt,
          answer: asChoice(target.text),
          distractors: others.map((s) => flipRule(s.text)!),
          explanation: fitExplanation([
            `${where(heading)}に「${target.text}」と書かれています。`,
            `ほかの選択肢は、資料のきまりを逆の内容に書き換えたものです（たとえば資料では「${asChoice(others[0].text)}」）。`,
          ]),
          quote: target.text,
          difficulty,
        },
      });
    }
    return true;
  };
  for (let i = 0; i < ruleTarget; i++) if (!addRule()) break;

  // 点数の高い順（同点は少しだけ揺らす）に、空欄と誤答を作れる文を集める。
  const ranked = sentences
    .map((s) => {
      const terms = extractTerms(s.text);
      // 作り直しのときは、前回までに使った文を後回しにする
      return { s, terms, score: scoreSentence(s, terms) + rand() * 0.9 - (penalty.get(s.text) ?? 0) };
    })
    .sort((a, b) => b.score - a.score);

  let wordNo = 0;
  for (const r of ranked) {
    if (drafts.length >= count) break;
    if (usedSentences.has(r.s.start)) continue;
    const numbers = drafts.filter((d) => d.kind === "number").length;
    const answer = pickAnswerTerm(r.terms, r.s.text, numbers < numberCap);
    if (!answer || usedAnswers.has(normalize(answer.text).text)) continue;
    const distractors = buildDistractors(answer, r.s.text, ctx, difficulty, rand);
    if (!distractors) continue;
    usedAnswers.add(normalize(answer.text).text);
    usedSentences.add(r.s.start);
    // 「クリアデスク」のようにかぎかっこで囲まれた言葉は、かっこごと空欄にする（「（　）」が二重にならないように）
    const quoted = r.s.text[answer.index - 1] === "「" && r.s.text[answer.index + answer.text.length] === "」";
    const from = quoted ? answer.index - 1 : answer.index;
    const to = answer.index + answer.text.length + (quoted ? 1 : 0);
    const blanked = `${r.s.text.slice(0, from)}（　　　）${r.s.text.slice(to)}`;
    const heading = headingOf(body, r.s.start);
    const isNumber = answer.kind === "number";
    const explanation = isNumber
      ? fitExplanation([
          `${where(heading)}に「${r.s.text}」とあります。`,
          `正しい数字は「${answer.text}」です。「${distractors[0]}」のような近い数字と取り違えないようにしましょう。`,
        ])
      : wordNo++ % 2 === 0
        ? fitExplanation([`（　　　）に入るのは「${answer.text}」です。`, `${where(heading)}には「${r.s.text}」と書かれています。`])
        : fitExplanation([`${where(heading)}の「${r.s.text}」の部分です。`, `「${answer.text}」の代わりに「${distractors[0]}」などを入れると、資料の内容と合わなくなります。`]);
    drafts.push({
      start: r.s.start,
      kind: isNumber ? "number" : "word",
      q: {
        prompt: `資料の内容として正しくなるように、次の文の（　　　）に入る言葉を選んでください。\n「${blanked}」`,
        answer: answer.text,
        distractors,
        explanation,
        quote: r.s.text,
        difficulty,
      },
    });
  }
  // 空欄の問題が足りなければ、きまりを問う問題で補う
  while (drafts.length < count && addRule()) {
    /* 追加し続ける */
  }

  drafts.sort((a, b) => a.start - b.start);
  const chosen = drafts.slice(0, count);

  // 正解の位置が偏らないよう、A〜Dを順番に割り当ててから並びを混ぜる
  const positions = shuffle(
    chosen.map((_, i) => i % 4),
    rand,
  );

  return chosen.map(({ q }, i) => {
    const answerIndex = positions[i];
    const choices = [...q.distractors];
    choices.splice(answerIndex, 0, q.answer);
    return { prompt: q.prompt, choices, answerIndex, explanation: q.explanation, quote: q.quote, difficulty: q.difficulty };
  });
}

const DIFF_SEED: Record<Difficulty, number> = { easy: 11, normal: 23, hard: 37 };

// ───────── フォロー研修の提案 ─────────

function shorten(s: string, n = 28): string {
  const t = s.replace(/\s+/g, "");
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function sampleFollowUp(test: Test, stats: TestStats, people: Person[]): FollowUpInsight {
  type Finding = FollowUpInsight["findings"][number];
  const qById = new Map(test.questions.map((q) => [q.id, q]));
  const lowFindings: Finding[] = [];
  const lowActions: string[] = [];

  const low = stats.questions
    .filter((q) => q.answered >= 3 && q.correctRate < LOW_RATE)
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 2);

  for (const s of low) {
    const q = qById.get(s.questionId)!;
    const wrong = s.topWrong;
    lowFindings.push({
      title: `第${s.index + 1}問の正答率が${pct(s.correctRate)}と低い`,
      detail: wrong
        ? `${s.answered}人中${wrong.count}人が「${CHOICE_MARKS[wrong.choice]}：${shorten(q.choices[wrong.choice], 24)}」を選んでいます。資料の「${shorten(q.quote)}」の部分が、誤解されたまま覚えられている可能性があります。`
        : `資料の「${shorten(q.quote)}」の部分が、十分に伝わっていない可能性があります。`,
      evidenceQuestionIds: [s.questionId],
    });
    lowActions.push(`第${s.index + 1}問の内容を、${wrong ? `よく選ばれた誤答「${shorten(q.choices[wrong.choice], 16)}」と比べながら、` : ""}具体的な場面の例で説明し直す`);
  }

  // 特定の部署で、全体より大きく正答率が低い問題（例：カスタマーサポートの3人が第10問を全員間違えた）
  const gapFindings: Finding[] = [];
  const gapActions: string[] = [];
  for (const g of stats.departmentGaps.slice(0, 1)) {
    const q = qById.get(g.questionId)!;
    const wrong = g.topWrong;
    gapFindings.push({
      title: `${g.department}は第${g.index + 1}問の正答率が${pct(g.deptRate)}`,
      detail: `全体の正答率${pct(g.overallRate)}に対して、${g.department}（${g.answered}人）は${pct(g.deptRate)}です。${
        wrong ? `${g.answered}人中${wrong.count}人が「${shorten(q.choices[wrong.choice], 24)}」を選んでいます。` : ""
      }この部署の仕事の場面で、資料の「${shorten(q.quote, 24)}」が当てはめにくい可能性があります。`,
      evidenceQuestionIds: [g.questionId],
    });
    gapActions.push(`${g.department}向けに、第${g.index + 1}問の内容を、その部署でよくある場面の例で説明し直す`);
  }

  // 平均より大きく低い部署
  const deptFindings: Finding[] = [];
  const deptActions: string[] = [];
  const worstDept = stats.departments[0];
  if (worstDept && stats.departments.length >= 2 && worstDept.avgScore <= stats.avgScore - 8 && !gapFindings.some((f) => f.title.startsWith(worstDept.department))) {
    const name = worstDept.department;
    const ids = new Set(people.filter((p) => p.department === name).map((p) => p.id));
    const deptLatest = stats.learners.filter((l) => ids.has(l.learnerId)).length;
    const evidence = worstDept.weakest ? [worstDept.weakest.questionId] : stats.questions.slice(0, 1).map((q) => q.questionId);
    const wq = worstDept.weakest && qById.get(worstDept.weakest.questionId);
    deptFindings.push({
      title: `${name}の平均点が低め（${Math.round(worstDept.avgScore)}点）`,
      detail: `全体の平均${Math.round(stats.avgScore)}点に対して、${name}（${deptLatest}人）は${Math.round(worstDept.avgScore)}点です。${
        wq ? `特に第${test.questions.indexOf(wq) + 1}問の正答率が${pct(worstDept.weakest!.correctRate)}でした。` : ""
      }`,
      evidenceQuestionIds: evidence,
    });
    deptActions.push(`${name}向けに、間違いの多かった問題を中心に15分の補足説明を行う`);
  }

  // 一番低い問題 → 部署で特に低い問題 → 2番目に低い問題 → 平均点の低い部署 の順に、最大3つ
  const findings = [...lowFindings.slice(0, 1), ...gapFindings, ...lowFindings.slice(1), ...deptFindings];
  const actions = [...lowActions.slice(0, 1), ...gapActions, ...lowActions.slice(1), ...deptActions];

  if (!findings.length && stats.questions.length) {
    const weakest = [...stats.questions].sort((a, b) => a.correctRate - b.correctRate)[0];
    findings.push({
      title: "大きくつまずいている問題はありません",
      detail: `一番正答率が低いのは第${weakest.index + 1}問（${pct(weakest.correctRate)}）です。受講者が増えたら、もう一度確認しましょう。`,
      evidenceQuestionIds: [weakest.questionId],
    });
  }

  if (low.length) actions.push("正答率が低い問題は、問題文や選択肢が紛らわしくないかも見直す（教え方ではなく問題に原因がある場合もあります）");
  if (stats.notTaken.length) actions.push(`まだ受けていない${stats.notTaken.length}人に、受講をうながす`);
  if (!actions.length) actions.push("この調子で、次の研修テーマに進む");

  return {
    headline:
      stats.avgScore >= 80
        ? "全体の理解度は高め。一部の問題と部署に重点的なフォローを"
        : stats.avgScore >= 60
          ? "おおむね理解できているが、つまずきが集中している問題あり"
          : "理解が十分でない受講者が多く、研修内容の見直しが必要",
    findings: findings.slice(0, 3),
    actions: actions.slice(0, 3),
  };
}
