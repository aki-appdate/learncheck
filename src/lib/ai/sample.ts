// 「見本の返答」。AIが使えないとき（未設定・無料枠の上限・通信エラー・形の不正）に使う、ルールベースの処理。
// AIと同じ形（GeneratedQuestion / FollowUpInsight）を返すので、画面側はどちらが動いたかを気にしなくてよい。
//
// 問題の作り方は2種類。引用文は資料の文をそのまま切り出すので、必ず資料の中にある。
// ・空欄の問題：大事そうな文の中の語句（数字・決まった仲間の言葉）を空欄にする。誤答は、資料の別の文に出てくる
//   同じ仲間の語句か、正解に近い数字。並べて書かれた言葉など「入れても正しく読めてしまう」誤答や、
//   「A・B・Cの（3つ）」のように問題文を数えれば分かる数は使わない。
// ・きまりの問題：「『○○』の項目について、正しいもの（合わないもの）はどれですか」。資料の文を、意味が逆になる
//   自然な言い方（「当日中に」→「翌週中に」、「事前に」→「事後に」、「30分以内」→「60分以内」など）に書き換えたものを、間違いの選択肢にする。
// どちらも、資料の1つの文はテスト全体で1回しか使わない（ある問題の選択肢が、別の問題の答えを教えないように）。
// 資料の前置き（「この資料では…まとめます」）や、前の文を読まないと分からない文は使わない。

import { CHOICE_MARKS } from "../quality";
import { DEPT_MIN_LEARNERS, MIN_LEARNERS, needsFollowUp, pct, type TestStats } from "../analytics";
import { normalize } from "../quote";
import { hashString, mulberry32, shuffle } from "../random";
import { MATERIALS } from "../materials";
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
  "営業日以内", "営業日", "時間以内", "日以内", "分以内", "秒以内", "文字以上", "種類以上", "桁以上", "か月", "ヶ月", "週間", "分間",
  "文字", "種類", "時間", "桁", "年", "日", "分", "秒", "枚", "台", "名", "人", "回", "件", "点", "つ", "時", "円", "%", "％",
];
const FREQ_RE = /(?<![半\d])(?:年|月|週)に(\d+)回/g;
const FREQ_UNIT = "頻度";
const FREQUENCIES = ["週に1回", "月に1回", "半年に1回", "年に1回", "年に2回", "2年に1回"];
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
  // 「年に1回」のような頻度は、ひとまとまりで扱う（誤答は「半年に1回」「2年に1回」など。数字だけを変えると、
  // 「1回」がいつも一番小さい数になり、それだけで答えが分かってしまう）
  for (const m of text.matchAll(FREQ_RE)) terms.push({ text: m[0], kind: "number", index: m.index!, unit: FREQ_UNIT, value: Number(m[1]) });
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

/** 物の数を表す単位（「4つの機能」「2種類」「4点」） */
const COUNT_UNITS = new Set(["つ", "点", "種類", "項目", "個"]);
/** 物の数の単位か（「3種類以上」の「種類以上」も含める） */
const isCountUnit = (unit?: string) => COUNT_UNITS.has((unit ?? "").replace(/(?:以上|以内)$/, ""));

/**
 * 数字のすぐ前に並べて書かれた物の数（「A・B・Cの」「AとBの」「A、B、Cの」）。並べていなければ 0。
 */
/**
 * 誤答に使ってよい一番小さい数。
 * ・「9時から（18時）まで」のように、同じ単位の「N時から」が前にあれば、Nより大きい数だけ
 * ・「（3種類以上）を組み合わせます」のように組み合わせる数なら、2以上（1つでは組み合わせにならない）
 */
export function minFor(answer: Term, sentence: string): number {
  let min = 1;
  const before = sentence.slice(0, answer.index);
  const from = [...before.matchAll(/(\d+)([^\d、。（）]{1,3})から/g)].filter((m) => answer.unit && answer.unit.startsWith(m[2])).pop();
  if (from) min = Math.max(min, Number(from[1]) + 1);
  if (/組み合わせ|組合せ/.test(sentence.slice(answer.index)) && isCountUnit(answer.unit)) min = Math.max(min, 2);
  return min;
}

export function listedCount(before: string): number {
  const head = before.replace(/(?:の|のうち)$/, "");
  const lastClause = head.split("、").pop() ?? "";
  const counts = [
    lastClause.split("・").length,
    lastClause.split("と").filter(Boolean).length,
    head.split("、").filter(Boolean).length,
  ].filter((n) => n >= 2);
  return counts.length ? Math.max(...counts) : 0;
}

/**
 * 数字の前に並べて書かれた物の数が、その数字以上あるか（＝問題文を数えれば答えが分かる）。
 */
export function countable(before: string, value: number): boolean {
  if (value < 2) return false;
  const n = listedCount(before);
  return n >= 2 && n >= value;
}

/** 空欄にしてよい語句か */
/** forFlip：きまりの文の数字を書き換えるときの判定（選択肢を並べないので、0や1も使える） */
function blankable(t: Term, sentence: string, forFlip = false): boolean {
  const before = sentence[t.index - 1] ?? "";
  const after = sentence[t.index + t.text.length] ?? "";
  if (insideParen(sentence, t.index)) return false;
  // 同じ文の別の場所に正解が書いてあると、答えが分かってしまう
  if (sentence.indexOf(t.text) !== sentence.lastIndexOf(t.text)) return false;
  if (t.kind === "number") {
    // 「名刺1枚にも」「年に1回」「深夜0時」のような0や1は空欄にしない。0やマイナスの誤答は作れないので、
    // 選択肢を並べると正解がいつも一番小さい数になり、それだけで答えが分かってしまう
    if (t.unit === FREQ_UNIT) return !forFlip && FREQUENCIES.includes(t.text);
    if (!forFlip && (t.value ?? 0) <= 1) return false;
    if (forFlip && t.value === 1 && t.unit !== "回") return false;
    // 「10〜30名」のような範囲の片方は空欄にしない
    if (/[〜～~\-－]/.test(before) || /[〜～~\-－]/.test(after)) return false;
    // 「コピー・プリント・スキャン・ファクスの4つ」のように、すぐ前に並べた物の数は、問題文を数えれば分かってしまう
    if (COUNT_UNITS.has(t.unit ?? "") && countable(sentence.slice(0, t.index), t.value ?? 0)) return false;
    return true;
  }
  if (PROHIBIT_RE.test(sentence)) return false;
  // 何の仲間か分からない言葉は、空欄に入れても文として読める誤答を選べないので空欄にしない
  if (!categoryOf(t.text)) return false;
  // 「パソコンやスマートフォン」のように並べた言葉の1つは、ほかの言葉でも正しく読めてしまう
  if (/[や・と]/.test(before) || /[や・と]/.test(after)) return false;
  return true;
}

/** 文の中で、空欄にするのに一番よい語句を選ぶ。numberOk が false なら数字は選ばない */
/** 空欄にする語句の候補を、よい順に並べる（数字は文の後ろのものから→カタカナ語→漢字の言葉。長い言葉ほど先） */
function answerTermCandidates(terms: Term[], sentence: string, numberOk: boolean): Term[] {
  const ok = terms.filter((t) => blankable(t, sentence) && (numberOk || t.kind !== "number"));
  const nums = ok.filter((t) => t.kind === "number").reverse();
  // カタカナ語→漢字の言葉の順。長い言葉ほど、その文ならではの大事な言葉であることが多い
  const words = (["katakana", "kanji"] as const).flatMap((kind) => ok.filter((t) => t.kind === kind).sort((a, b) => b.text.length - a.text.length));
  return [...nums, ...words];
}

// ───────── 言葉の仲間 ─────────

/**
 * 言葉の空欄の誤答は、正解と同じ仲間の言葉だけにする（人・部署どうし、機器どうし…）。
 * 「新人の（営業担当）が」に「疑問点」「印刷」を入れると文として読めず、消去法で答えが分かってしまうため。
 * どの仲間にも入らない言葉は空欄にしない（その分は、数字やきまりの問題で補う）。
 */
const CATEGORIES: [string, RegExp][] = [
  ["人・部署", /^(?:上長|上司|部下|同僚|新人|家族|本人)$|(?:担当|係|員|者|部|課|窓口|職|センター)$/],
  ["持ち歩く端末", /(?:パソコン|スマートフォン|タブレット|端末|携帯)$/],
  ["事務機器", /(?:シュレッダー|プリンター|ホワイトボード|複合機|ルーター)$/],
  ["記録する所", /(?:メモリ|フォルダ|デスクトップ|ディスク)$/],
  ["書類・データ", /(?:書|簿|名刺|ファイル|データ|写真|メール|フォルダ|記録)$/],
  ["ハラスメント", /ハラスメント$/],
  ["場所", /(?:カフェ|飲食店|駅|書庫|事務所|会議室)$/],
];

export function categoryOf(word: string): string | null {
  return CATEGORIES.find(([, re]) => re.test(word))?.[0] ?? null;
}

// ───────── 誤答を作る ─────────

/**
 * 数字の誤答を3つ作る。正解に近い、ありえそうな数字にする（10倍のような極端な数字は使わない）。
 * ・正解より大きい誤答をいくつにするか（0〜3個）を乱数で決める。誤答をいつも「+1、−1、+2」の順で作ると、
 *   4つを並べたときに正解が必ず2番目に小さい数になり、それだけで答えが分かってしまうため
 * ・0以下の数は作らない。足りない分は反対側（正解より大きい側）で補う
 * ・max があれば、それより大きい数は作らない（「大文字・小文字・数字・記号のうち（ ）」に「5種類以上」を出さない）
 * ・min があれば、それより小さい数は作らない（「9時から（ ）まで」に「6時」、「（ ）を組み合わせます」に「1種類以上」を出さない）
 * ・やさしい＝数字の幅を広く（見分けやすい）、むずかしい＝資料の中の別の数字を1つ混ぜる（取り違えやすい）
 */
export function numberVariants(
  t: Term,
  difficulty: Difficulty,
  rand: () => number = mulberry32(hashString(t.text)),
  opts: { max?: number; min?: number; others?: number[] } = {},
): string[] {
  if (t.unit === FREQ_UNIT) return shuffle(FREQUENCIES.filter((f) => f !== t.text), rand).slice(0, 3);
  const v = t.value ?? 1;
  const base = v < 10 ? 1 : v < 20 ? 2 : v < 100 ? 10 : v < 1000 ? 50 : 1000;
  const step = difficulty === "easy" ? (v < 10 ? 1 : base * 2) : base;
  // 時刻は24時まで（「26時」のような誤答は常識だけで外せるため）
  const max = Math.min(opts.max ?? Infinity, t.unit === "時" ? 24 : Infinity);
  const min = opts.min ?? 1;
  const below = [1, 2, 3].map((i) => v - step * i).filter((n) => n >= min);
  const above = [1, 2, 3].map((i) => v + step * i).filter((n) => n <= max);
  const wantAbove = Math.floor(rand() * 4);
  let nb = Math.min(3 - wantAbove, below.length);
  const na = Math.min(3 - nb, above.length);
  nb = Math.min(3 - na, below.length);
  const lo = below.slice(0, nb);
  const hi = above.slice(0, na);
  // むずかしい：資料に出てくる同じ単位の別の数字を、同じ側の1つと入れ替える（正解の順位は変わらない）
  if (difficulty === "hard") {
    for (const o of opts.others ?? []) {
      if (o === v || o < min || o > max || lo.includes(o) || hi.includes(o)) continue;
      if (o < v && lo.length && o >= v / 3) {
        lo[lo.length - 1] = o;
        break;
      }
      if (o > v && hi.length && o <= v * 3) {
        hi[hi.length - 1] = o;
        break;
      }
    }
  }
  return [...lo, ...hi].map((n) => `${n}${t.unit}`);
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
    // 資料の中の同じ単位の別の数字（むずかしいでは、これと取り違えやすくする）
    const others = shuffle(
      ctx.pool.filter((t) => t.kind === "number" && t.unit === answer.unit),
      rand,
    ).map((t) => t.value!);
    // 「大文字・小文字・数字・記号のうち（ ）」のように並べた物の数があれば、それを超える数は誤答にしない
    const listed = isCountUnit(answer.unit) ? listedCount(sentence.slice(0, answer.index)) : 0;
    candidates = numberVariants(answer, difficulty, rand, { max: listed || undefined, min: minFor(answer, sentence), others });
  } else {
    // 名詞の空欄には、同じ種類（カタカナ語どうし・漢字の言葉どうし）の言葉だけを使う。
    // 漢字の言葉は、後ろに同じ助詞が続く言葉（同じような使われ方をしている言葉）に限る
    const cat = categoryOf(answer.text);
    const same = shuffle(
      ctx.pool.filter((t) => t.kind === answer.kind && categoryOf(t.text) === cat && (answer.kind !== "kanji" || t.next === answer.next)),
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
/** [当てはまる形, 書き換え後, この形の文には使わない（不自然になる）] */
const FLIPS: [RegExp, string, RegExp?][] = [
  // どの資料にも使える、汎用の書き換え規則。見本資料4本だけに用意した誤答の候補は materials.ts の distractorHints にあり、こちらより先に使う。
  // 書き換えは「研修担当がそのまま出題してよいと思える、自然な日本語」になるものだけを置く。
  // 「〜できます→できません」「〜場合があります→場合はありません」「必ず→できれば」のように、
  // 機械的に打ち消すと不自然・弱い文になる型は使わない（書き換えられない文は誤答に使わず、ほかの文や数字の問題にまわす）。
  // ── 文の形ごと言い換えるもの（先に当てる） ──
  [/も、([^。]+)と同じように扱います。?$/, "は、$1とは区別して扱います"],
  // 「聞かれても、答えてはいけません」→「聞かれたら、答えてかまいません」（「聞かれても、答えてもかまいません」は読みにくい）
  [/([かさたなまらがばわ])れても、([^、。]+)てはいけません。?$/, "$1れたら、$2てかまいません"],
  // ── 文末の決まった言い方 ──
  // 「〜してはいけません」は、まず「〜します」と言い切る形にする。「〜てもかまいません」ばかりだと、
  // 許可の形の選択肢がいつも誤答（または「合わないもの」の答え）になり、言い回しだけで答えが分かるため。
  // 動詞の形が確実に分かるもの（〜して／〜えて・〜けて…／〜いて）だけ。「〜って」「〜んで」は元の動詞が分からないので許可の形にする
  // 「たとえ〜の依頼でも教えてはいけません」→「依頼でも教えます」は意味が通らないので、「でも」「ても」の文は許可の形にする
  [/してはいけません。?$/, "します", /でも|ても、/],
  [/([えけせてねへめれげぜでべ])てはいけません。?$/, "$1ます", /でも|ても、/],
  [/いてはいけません。?$/, "きます", /でも|ても、/],
  [/てはいけません。?$/, "てもかまいません"],
  [/ことは禁止です。?$/, "ことは認められています"],
  [/ことは禁止されています。?$/, "ことは認められています"],
  [/ことはありません。?$/, "ことがあります"],
  [/てかまいません。?$/, "てはいけません"],
  [/にはあたりません。?$/, "にあたります"],
  [/は使いません。?$/, "を使ってもかまいません"],
  [/ことも避けます。?$/, "ことは問題ありません"],
  [/守ります。?$/, "守らなくてもかまいません"],
  [/として扱います。?$/, "としては扱いません"],
  // 「氏名だけでなく、〜なども個人情報にあたります」を打ち消すと、前半と食い違って読みにくい
  [/にあたります。?$/, "にはあたりません", /だけでなく/],
  [/ことがあります。?$/, "ことはありません"],
  [/が含まれています。?$/, "は含まれていません"],
  [/減ります。?$/, "増えます"],
  [/増えます。?$/, "減ります"],
  [/やすくなります。?$/, "にくくなります"],
  [/を付けて([^、。]*)ます。?$/, "を付けずに$1ます"],
  // 「〜ません」→「〜ます」は、ただ打ち消すと意味が通らなくなる文を除く。
  // ・「共有フォルダにだけ保存し、USBメモリには保存しません」（「にだけ」）→「保存します」だと前半と食い違う
  // ・「〜でも〜しません」→「〜でも〜します」
  // ・「迷う必要はありません」→「迷う必要はあります」
  // ・「部長の承認がないと受け付けません」→「承認がないと受け付けます」のような、条件つきの打ち消し
  //   （〜ないと／〜なければ／〜ない限り／〜しか／〜以外）
  [/ません。?$/, "ます", /にだけ|でだけ|だけを|だけに|だけで|でも|必要はありません|ないと|なければ|ない限り|しか|以外/],
  // ── 文の途中の言葉 ──
  [/の(確認|承認|許可)を受けてから/, "の$1を受けずに"],
  // 「確認を受けてください」は「受けずにください」となり不自然なので除く
  [/の(確認|承認|許可)を受けて(?!ください)/, "の$1を受けずに"],
  [/(確認|本人確認)をしてから/, "$1をせずに"],
  [/事前に/, "事後に"],
  [/その日のうちに/, "1週間以内に"],
  [/当日中に/, "翌週中に"],
  [/別の手段で/, "同じ手段で"],
  [/([一-龠々]+)ではなく([一-龠々]+)/, "$2ではなく$1"],
];

const LEAD_RE = /^(?:たとえば|また|一方で|ただし|なお)、/;

function asChoice(sentence: string): string {
  return sentence.replace(LEAD_RE, "").replace(/。$/, "");
}

/**
 * 文を逆の意味に書き換える。書き換えられない文は null。
 * hints（見本資料ごとの誤答の候補）があれば、汎用の規則より先に使う
 */
export function flipRule(sentence: string, hints: [string, string][] = []): string | null {
  const base = sentence.replace(LEAD_RE, "");
  const plain = base.replace(/。$/, "");
  for (const [from, to] of hints) {
    if (plain.includes(from)) return plain.replace(from, to);
  }
  // 「悪口も言いません」を「悪口も言います」にすると日本語として不自然なので、書き換えない
  if (/も[^、。]*ません。?$/.test(base) && !/てはいけません。?$|必要はありません。?$/.test(base)) return null;
  for (const [re, rep, skip] of FLIPS) {
    if (skip?.test(base)) continue;
    const m = base.match(re);
    // 「必ず故障しません」のような、かぎかっこの中の言葉は書き換えない
    if (m && !insideQuote(base, m.index!)) {
      const out = base.replace(re, rep).replace(/。$/, "");
      return out === asChoice(sentence) ? null : out;
    }
  }
  return flipNumber(base);
}

/**
 * 文の中の数字を、資料と違う数字に書き換える（「30分以内が目安です」→「60分以内が目安です」）。
 * 「以上」は小さく、「以内」は大きくして、書き換えた文が資料のきまりを満たしてしまわないようにする
 * （「12文字以上」を「16文字以上」にすると、16文字のパスワードはきまりどおりなので、間違いと言えない）。
 */
function flipNumber(base: string): string | null {
  const t = extractTerms(base)
    .filter((x) => x.kind === "number" && blankable(x, base, true) && !insideQuote(base, x.index))
    .pop();
  if (!t) return null;
  const v = t.value!;
  const step = v < 10 ? 1 : v < 20 ? 4 : v < 100 ? 30 : v < 1000 ? 100 : 2000;
  const n = t.unit!.endsWith("以上") ? v - step : t.unit!.endsWith("以内") ? v + step : v + step;
  if (n <= 0) return null;
  return `${base.slice(0, t.index)}${n}${t.unit}${base.slice(t.index + t.text.length)}`.replace(/。$/, "");
}

// ───────── 大事そうな文の点数 ─────────

/** 「〜てもかまいません」のような、許可・容認の形で終わる文 */
const PERMIT_RE = /(?:かまいません|認められています|問題ありません|必要はありません)$/;
/** 選択肢の語尾の種類。きまりの言い方（〜ください・〜てはいけません・〜禁止です）・許可の形・ふつうの言い方の3つに分ける */
const RULE_ENDING_RE = /(?:ください|てはいけません|禁止です|禁止されています)$/;
export function endingKind(text: string): "rule" | "permit" | "plain" {
  const t = text.replace(/。$/, "");
  return RULE_ENDING_RE.test(t) ? "rule" : PERMIT_RE.test(t) ? "permit" : "plain";
}
/**
 * 語尾で答えが絞れないか。答えと同じ語尾の種類の誤答が1つ以上あり、きまりの言い方で終わる選択肢がちょうど1つだけ、
 * という形にもならないこと（その1つがいつも誤答だと、今度は「浮いた1つは外す」で絞れてしまうため）
 */
export function endingShared(answer: string, others: string[], strict = true): boolean {
  const k = endingKind(answer);
  const kinds = [answer, ...others].map(endingKind);
  return others.some((o) => endingKind(o) === k) && (!strict || kinds.filter((x) => x === "rule").length !== 1);
}

/**
 * 難しさで変えるもの（見本の返答）。
 * ・やさしい：空欄の問題を多めに、きまりの問題は「正しいもの」を選ぶ形。数字の誤答は幅を広く（numberVariants）
 * ・ふつう：きまりの問題を3割ほど、「正しいもの」と「合わないもの」を交互に
 * ・むずかしい：きまりの問題を半分ほど、「合わないもの」を多めに。誤答の文は同じ項目から選び、数字の誤答に資料の別の数字を混ぜる
 */
type Plan = { ruleShare: number; askWrong: (nRule: number) => boolean; nears: number[]; sameSectionFirst: boolean };
const DIFFICULTY_PLAN: Record<Difficulty, Plan> = {
  easy: { ruleShare: 0.25, askWrong: () => false, nears: [1, 2, 3], sameSectionFirst: false },
  normal: { ruleShare: 0.35, askWrong: (n) => n % 2 === 1, nears: [1, 2, 3], sameSectionFirst: false },
  hard: { ruleShare: 0.5, askWrong: (n) => n % 3 !== 2, nears: [0, 1, 2, 3], sameSectionFirst: true },
};

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

/** 文が載っている項目の番号（資料の頭から数えた見出しの数） */
function sectionIndex(body: string, at: number): number {
  return body
    .slice(0, at)
    .split("\n")
    .filter((l) => /^\s*\d+[.．]\s*.+$/.test(l)).length;
}

/** 資料そのものについての前置きの文（「この資料では、新人の営業担当が説明できるよう…まとめます」） */
const META_RE = /この資料|まとめます|できるよう、|研修用の架空|架空のもの/;

/** 前の文を読まないと何の話か分からない文（「その場で〜」「出したあとは〜」「〜ためです」） */
// 「上司から部下だけでなく、〜でも起こります」「本人の同意がない限り、〜教えてはいけません」のように、
// 何が起こるのか・何を教えないのかが前の文にしか書かれていない文も除く。
// 「他社の商品の悪口も言いません」のような、「も」で前の文に続く短い文も、1文だけでは何の話か分からない。
// 「覚えきれない場合は、〜」「10分を超えても話がまとまらない場合は、〜」のように、短い条件で始まる文も、何の場合かが前の文にしか書かれていない
const CONTEXTLESS_RE = /^(?:その|それ|これ|この|あの|次は|出したあと|同じ|各部署|本人の同意がない限り)|これに加えて|そのままにしておいて|当てはまります。$|ためです。$|でも起こります。$|^[^、。は]+も[^、。]*ません。$|^[^、。]{0,18}場合は、/;

/**
 * 1文だけ取り出しても意味が通じるか。よくある質問の答え（「答：各部署で写しを持たないでください。」）は、
 * 問いを読まないと何の話か分からないことが多いので、「〜は、」と話題が書かれた文だけを使う。
 */
function hasContext(body: string, s: Sentence): boolean {
  if (CONTEXTLESS_RE.test(s.text)) return false;
  const lineStart = body.lastIndexOf("\n", s.start - 1) + 1;
  const isAnswer = /^\s*(?:答|A)[：:]/.test(body.slice(lineStart, s.start + 1));
  return !isAnswer || s.text.includes("は、");
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

type QuizInput = {
  body: string;
  count: number;
  difficulty: Difficulty;
  variant?: number;
  /**
   * 作り直しにかける時間の上限（ミリ秒）。よく似た文がくり返す長い資料では、文の組み合わせを探すのに時間がかかり、
   * 画面が固まるため、上限を過ぎたらそれまでに作れた一番多いものを使う。ふつうの資料は数ミリ秒で終わるので、上限には届かない
   */
  timeLimitMs?: number;
};
const DEFAULT_TIME_LIMIT_MS = 2000;

/**
 * 見本の返答で問題を作る。variant（作り直し番号）を変えると別の組み合わせになる。
 * 作り直しのときは、直前3回までの作り直しで使った文を、新しいものほど強く後回しにする。
 */
export function sampleQuiz(input: QuizInput): GeneratedQuestion[] {
  const v = input.variant ?? 0;
  const deadline = Date.now() + (input.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS);
  const history: string[][] = [];
  let out: GeneratedQuestion[] = [];
  // 1回目から順にたどる（途中から始めると、画面で見た「前回」と違う案を前回として扱ってしまうため）
  for (let k = 0; k <= v; k++) {
    const penalty = new Map<string, number>();
    const recent = history.slice(-3);
    recent.forEach((quotes, i) => {
      const w = [3, 6, 10][i + 3 - recent.length];
      for (const q of quotes) penalty.set(q, Math.max(penalty.get(q) ?? 0, w));
    });
    const prev = new Set(history.at(-1) ?? []);
    const overlap = (qs: GeneratedQuestion[]) => qs.filter((q) => prev.has(q.quote)).length;
    // 前回と半分を超えて同じ文から作ってしまったら、選ぶ順番を変えてあと3回まで試し、重なりの一番少ないものを使う
    out = buildQuiz({ ...input, variant: k }, penalty, deadline);
    for (let j = 1; j <= 3 && k > 0 && overlap(out) > out.length / 2 && Date.now() <= deadline; j++) {
      const alt = buildQuiz({ ...input, variant: k + j * 1009 }, penalty, deadline);
      if (alt.length > out.length || (alt.length === out.length && overlap(alt) < overlap(out))) out = alt;
    }
    history.push(out.map((q) => q.quote));
  }
  return out;
}

/**
 * 文はテスト全体で1回しか使わないので、選び方の順番しだいで、資料の文が足りなくなることがある。
 * 指定の数に届かなければ、選ぶ順番を変えて何度か作り直し、一番多く作れたものを使う（同じ入力なら同じ結果）
 */
function buildQuiz(input: QuizInput, penalty: Map<string, number>, deadline: number): GeneratedQuestion[] {
  let best: GeneratedQuestion[] = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const qs = buildQuizOnce(input, penalty, attempt);
    if (qs.length > best.length) best = qs;
    if (best.length >= input.count || Date.now() > deadline) return best;
  }
  // 難しさの組み立て方では文が足りないときは、「ふつう」の組み立て方で、文が残り少なければ「合わないもの」を先にして作る
  // （数字の誤答の作り方など、ほかは元の難しさのまま）
  for (let attempt = 0; attempt < 30; attempt++) {
    const qs = buildQuizOnce(input, penalty, attempt, DIFFICULTY_PLAN.normal);
    if (qs.length > best.length) best = qs;
    if (best.length >= input.count || Date.now() > deadline) break;
  }
  return best;
}

function buildQuizOnce(input: QuizInput, penalty: Map<string, number>, attempt: number, planOverride?: Plan): GeneratedQuestion[] {
  const { body, count, difficulty } = input;
  const rand = mulberry32(
    hashString(`${body.length}:${body.slice(0, 200)}`) ^ (count * 7919) ^ (DIFF_SEED[difficulty] + (input.variant ?? 0) * 104729) ^ (attempt * 7777),
  );
  const all = splitSentences(body);
  // 見本資料なら、資料ごとに用意した誤答の候補と、選択肢に使わない文を使う（貼り付けた資料では汎用の規則だけ）
  const sampleMaterial = MATERIALS.find((m) => m.body === body);
  const hints = sampleMaterial?.distractorHints ?? [];
  const skipStarts = sampleMaterial?.contextlessSentences ?? [];
  const flipCache = new Map<string, string | null>();
  const flip = (text: string) => {
    if (!flipCache.has(text)) flipCache.set(text, flipRule(text, hints));
    return flipCache.get(text)!;
  };
  const plan = planOverride ?? DIFFICULTY_PLAN[difficulty];
  // 「この資料では…まとめます」のような資料の前置きは、問題にも選択肢にもしない
  const sentences = all.filter((x) => !META_RE.test(x.text) && hasContext(body, x) && !skipStarts.some((p) => x.text.startsWith(p)));
  const pool: Term[] = [];
  const seenTerm = new Set<string>();
  for (const s of all) {
    for (const t of extractTerms(s.text)) {
      const k = `${t.kind}:${normalize(t.text).text}`;
      if (!seenTerm.has(k)) {
        seenTerm.add(k);
        pool.push(t);
      }
    }
  }
  const ctx = { body, pool, siblings: siblingPairs(all) };

  // 数字の問題は全体のおよそ半分まで（最後に、実際にできた問題数でもう一度確かめる）。
  // きまり・手順を問う問題の割合は難しさで変える（やさしい＝少なめ、むずかしい＝多め）
  const numberCap = Math.max(1, Math.ceil(count / 2));
  // きまりの問題は1問で文を4つ使うので、資料の文が足りず指定の数に届かないときは、後半の作り直しでは割合を少し下げる
  const share = attempt >= 30 ? Math.max(0.25, plan.ruleShare - 0.15) : plan.ruleShare;
  const ruleTarget = count >= 3 ? Math.max(1, Math.round(count * share)) : 0;

  const drafts: Draft[] = [];
  const usedSentences = new Set<number>();
  const usedAnswers = new Set<string>();

  // 選択肢にできる文（短めで、資料の前置きではない文）。文ごとに、載っている項目の番号と見出しを覚えておく
  // 並べ替えの中で何度も呼ぶので、文の位置ごとに覚えておく（長い資料で画面が固まらないように）
  const secCache = new Map<number, number>();
  const sectionOf = (st: number) => {
    if (!secCache.has(st)) secCache.set(st, sectionIndex(body, st));
    return secCache.get(st)!;
  };
  const choiceable = sentences.filter((s) => normalize(s.text).text.length <= 80);
  // きまりの文（逆の意味に書き換えられる文）
  const rules = shuffle(
    choiceable.filter((s) => flip(s.text) !== null),
    rand,
  );
  const usedPrompts = new Set<string>();
  /** 選択肢の長さがそろっているか（一番長いものが一番短いものの2倍まで）。長さで答えが分からないように */
  const balanced = (texts: string[]) => {
    const lens = texts.map((t) => normalize(t).text.length);
    return Math.max(...lens) <= Math.min(...lens) * 2;
  };
  const addRule = () => {
    const nRule = drafts.filter((d) => d.kind === "rule").length;
    // やさしい＝正しいものを選ぶ、ふつう・むずかしい＝「合わないもの」も混ぜる。
    // 作れなかったときは、もう一方の聞き方で作る（「合わないもの」は書き換えた文が1つあれば作れるので作りやすい）
    // 「正しいもの」は書き換えた文を3つ使うので、書き換えられる文が残り少ないときは「合わないもの」で作る
    const rulesLeft = rules.filter((s) => !usedSentences.has(s.start)).length;
    // やさしい・ふつうでは「正しいもの」を作れるだけ先に作る（説明どおり「正しいもの」が多め／混ざるように）。
    // それで数が足りないときだけ、作り直しの最後で「合わないもの」を先にする組み立て方に切り替える（buildQuiz）
    const scarce = (difficulty === "hard" || planOverride !== undefined) && rulesLeft < 3 * (count - drafts.length);
    const first = scarce || plan.askWrong(nRule);
    // それでも作れないときだけ、許可の形の答えだけが浮く「合わないもの」も認める（問題数が足りなくなるのを防ぐ）
    return addRuleAs(first) || addRuleAs(!first) || addRuleAs(true, true) || addRuleAs(false, true);
  };
  // それでも足りないときの最後の手段：離れた項目の文どうしでも組み合わせる（項目が4つ以上になるときは、問題文に項目名を出さない）
  const addRuleWide = () => addRuleAs(true, true, true) || addRuleAs(false, true, true);
  const addRuleAs = (askWrong: boolean, allowLonePermit = false, wide = false) => {
    // 問う文は「必ず」「〜してはいけません」のような、きまりらしい文を先にする
    // 「正しいもの」を選ぶ問題の答えは資料のとおりの文なので、書き換えられない文でもよい
    // 「合わないもの」の答え（書き換えた文）は、「〜てもかまいません」のような許可の形より、
    // 数字・期限・担当の取り違えを先に使う（許可の形の選択肢がいつも答えだと、言い回しだけで答えが分かるため）
    const targets = (askWrong ? rules : shuffle(choiceable, rand))
      .filter((s) => !usedSentences.has(s.start))
      .sort(
        (a, b) =>
          (penalty.get(a.text) ?? 0) - (penalty.get(b.text) ?? 0) ||
          (askWrong ? Number(PERMIT_RE.test(flip(a.text)!)) - Number(PERMIT_RE.test(flip(b.text)!)) : 0) ||
          Number(RULE_WORDS.test(b.text)) - Number(RULE_WORDS.test(a.text)),
      );
    // むずかしいでは、誤答を同じ項目の文に限る（同じ項目で作れなかった問題だけ、となりの項目まで広げる）
    const nears = wide ? [99] : plan.nears;
    const pairs = plan.sameSectionFirst ? nears.flatMap((n) => targets.map((t) => [t, n] as const)) : targets.flatMap((t) => nears.map((n) => [t, n] as const));
    // 資料どおりの文に許可の形が1つもないのに、答えだけが許可の形になる「合わないもの」は作らない
    const permitTrue = choiceable.some((s) => !usedSentences.has(s.start) && PERMIT_RE.test(asChoice(s.text)));
    for (const [target, near] of pairs) {
      const answer = askWrong ? flip(target.text)! : asChoice(target.text);
      if (askWrong && PERMIT_RE.test(answer) && !permitTrue && !allowLonePermit) continue;
      // 誤答には、同じ項目か、となりの項目の文を使う（話題がそろい、消去法で選びにくくなる）。
      // 「正しいもの」を選ぶ問題では、誤答は逆の意味に書き換えた文。「合わないもの」を選ぶ問題では、資料のとおりの文。
      // どの文も、テスト全体で1回しか使わない（ある問題の選択肢が、別の問題の答えを教えてしまわないように）
      const sec = sectionOf(target.start);
      const pool = (askWrong ? choiceable : rules)
        .filter((s) => s !== target && !usedSentences.has(s.start) && Math.abs(sectionOf(s.start) - sec) <= near)
        .map((s) => ({ s, text: askWrong ? asChoice(s.text) : flip(s.text)! }))
        .sort(
          (x, y) =>
            // 答えが許可の形なら、資料どおりの選択肢にも許可の形の文を先に混ぜる
            (askWrong && PERMIT_RE.test(answer) ? Number(PERMIT_RE.test(y.text)) - Number(PERMIT_RE.test(x.text)) : 0) ||
            Math.abs(sectionOf(x.s.start) - sec) - Math.abs(sectionOf(y.s.start) - sec) ||
            Math.abs(x.text.length - answer.length) - Math.abs(y.text.length - answer.length),
        );
      const picked: typeof pool = [];
      for (const c of pool) {
        if (picked.length === 3) break;
        // 「正しいもの」の誤答に許可の形（〜てもかまいません）は1つまで。並ぶと、許可の形を消すだけで答えが絞れてしまう
        if (!askWrong && !allowLonePermit && PERMIT_RE.test(c.text) && picked.some((p) => PERMIT_RE.test(p.text))) continue;
        if (!balanced([answer, ...picked.map((p) => p.text), c.text])) continue;
        // 最後の1つを選ぶときは、答えの語尾の種類（「〜ください／てはいけません」などのきまりの言い方・許可の形・ふつうの言い方）が
        // 4つの中で答えだけにならないようにする。答えだけが「〜してください」で終わると、語尾だけで答えが分かってしまうため
        if (picked.length === 2 && !endingShared(answer, [...picked.map((p) => p.text), c.text], !allowLonePermit)) continue;
        picked.push(c);
      }
      if (picked.length < 3) continue;
      const others = shuffle(picked, rand);
      // 問題文には、選択肢が載っている項目の見出しを、資料の順に並べる
      const headings = [...new Set([target, ...others.map((o) => o.s)].sort((x, y) => x.start - y.start).map((x) => headingOf(body, x.start)))]
        .filter((h): h is string => !!h)
        .map((h) => `「${h.replace(/^\d+[.．]\s*/, "")}」`);
      if (headings.length > 3 && !wide) continue;
      const about = headings.length > 3 ? "資料全体について、" : headings.length ? `${headings.join("")}の項目について、` : "";
      const prompt = askWrong ? `${about}資料の内容と合わないものはどれですか。` : `${about}正しいものはどれですか。`;
      if (usedPrompts.has(prompt)) continue;
      usedPrompts.add(prompt);
      usedSentences.add(target.start);
      others.forEach((o) => usedSentences.add(o.s.start));
      const heading = headingOf(body, target.start);
      drafts.push({
        start: target.start,
        kind: "rule",
        q: askWrong
          ? {
              prompt,
              answer,
              distractors: others.map((o) => o.text),
              explanation: fitExplanation([
                `${where(heading)}には「${target.text}」とあります。`,
                `「${answer}」は、これと逆の内容です。ほかの3つは資料のとおりです。`,
              ]),
              quote: target.text,
              difficulty,
            }
          : {
              prompt,
              answer,
              distractors: others.map((o) => o.text),
              explanation: fitExplanation([
                `${where(heading)}に「${target.text}」と書かれています。`,
                `ほかの選択肢は、資料の内容を逆の意味や違う数字に書き換えたものです（たとえば資料では「${asChoice(others[0].s.text)}」）。`,
              ]),
              quote: target.text,
              difficulty,
            },
      });
      return true;
    }
    return false;
  };
  // 点数の高い順（同点は少しだけ揺らす）に、空欄と誤答を作れる文を集める。
  const ranked = sentences
    .map((s) => {
      const terms = extractTerms(s.text);
      // 作り直しのときは、前回までに使った文を後回しにする
      return { s, terms, score: scoreSentence(s, terms) + rand() * 0.9 - (penalty.get(s.text) ?? 0) };
    })
    .sort((a, b) => b.score - a.score);

  let wordNo = 0;
  const usedUnits = new Set<string>();
  const addBlanks = (limit: number, cap: number) => {
    for (const r of ranked) {
      if (drafts.length >= limit) break;
      if (usedSentences.has(r.s.start)) continue;
      const numbers = drafts.filter((d) => d.kind === "number").length;
      // 1つ目の語句で誤答を作れない（「（3種類以上）を組み合わせます」は2・4種類しか使えない、など）ときは、同じ文の次の語句で作る
      let answer: Term | null = null;
      let distractors: string[] | null = null;
      for (const t of answerTermCandidates(r.terms, r.s.text, numbers < cap)) {
        if (usedAnswers.has(normalize(t.text).text)) continue;
        // 「1分間に（30枚）」「1分間に（50枚）」のように、同じ単位の数字の問題が続くと単調になるので、単位ごとに1問まで
        if (t.kind === "number" && usedUnits.has(t.unit!)) continue;
        distractors = buildDistractors(t, r.s.text, ctx, difficulty, rand);
        if (distractors) {
          answer = t;
          break;
        }
      }
      if (!answer || !distractors) continue;
      usedAnswers.add(normalize(answer.text).text);
      if (answer.kind === "number") usedUnits.add(answer.unit!);
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
  };

  // 先に空欄の問題を作り（その文を、きまりの問題の選択肢に使われないように）、残りをきまりの問題にする。
  // それでも足りなければ、数字の空欄を少しだけ多めに許して補う
  addBlanks(count - ruleTarget, numberCap);
  while (drafts.length < count && addRule()) {
    /* 追加し続ける */
  }
  addBlanks(count, numberCap);
  while (drafts.length < count && addRuleWide()) {
    /* 追加し続ける */
  }

  drafts.sort((a, b) => a.start - b.start);
  let chosen = drafts.slice(0, count);
  // 数字の問題は、実際にできた問題数のおよそ半分まで（短い資料で4問しかできないときに、3問が数字にならないように）
  while (chosen.filter((d) => d.kind === "number").length > Math.ceil(chosen.length / 2)) {
    const lastNumber = chosen.map((d) => d.kind).lastIndexOf("number");
    chosen = chosen.filter((_, i) => i !== lastNumber);
  }

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

export function shorten(s: string, n = 28): string {
  const t = s.replace(/\s+/g, "");
  if (t.length <= n) return t;
  // かぎかっこの途中で切らない（「…「LC…」の部分」のように、かっこが閉じなくなるため）。
  // 切る位置が「」の中なら、その「の手前で切る。手前が短すぎるときは、」のあとまで含める
  let cut = n;
  const opens: number[] = [];
  for (let i = 0; i < n; i++) {
    if (t[i] === "「") opens.push(i);
    else if (t[i] === "」") opens.pop();
  }
  if (opens.length) {
    const open = opens[0];
    if (open >= 8) cut = open;
    else {
      let depth = 0;
      for (let i = open; i < t.length; i++) {
        if (t[i] === "「") depth++;
        else if (t[i] === "」" && --depth === 0) {
          cut = i + 1;
          break;
        }
      }
    }
  }
  return cut >= t.length ? t : `${t.slice(0, cut)}…`;
}

/** 傾向を言うのに必要な受講者の数（決めているのは analytics.ts） */
export { MIN_LEARNERS };

/** 受講者が少ないときの返答。見出しも含めて「まだ結論は出せない」だけを伝え、問題や部署の良し悪しは言わない */
export function thinFollowUp(stats: TestStats): FollowUpInsight {
  const n = stats.learnerCount;
  return {
    headline: "まだ受講者が少ないため、結論は出せません",
    findings: [
      {
        title: `受講したのは、まだ${n}人です`,
        detail: `傾向を見る目安（${MIN_LEARNERS}人）に届いていません。${n}人の答えだけで「伝わっていない」と決めないよう、問題や部署ごとの気づきは出していません。`,
        // 特定の問題を根拠に挙げると、その問題に何かあるように読めてしまうので挙げない
        evidenceQuestionIds: [],
      },
    ],
    actions: [
      stats.notTaken.length
        ? `まだ受けていない${stats.notTaken.length}人に受講をうながし、${MIN_LEARNERS}人以上になってから、もう一度分析する`
        : `受講者が${MIN_LEARNERS}人以上になってから、もう一度分析する`,
    ],
  };
}

export function sampleFollowUp(test: Test, stats: TestStats, people: Person[]): FollowUpInsight {
  if (stats.learnerCount < MIN_LEARNERS) return thinFollowUp(stats);
  type Finding = FollowUpInsight["findings"][number];
  const qById = new Map(test.questions.map((q) => [q.id, q]));
  const lowFindings: Finding[] = [];
  const lowActions: string[] = [];

  // 部署の気づきで取り上げる問題は、全体の気づきでは重ねて取り上げない（同じ問題が2回出ないように）
  const gaps = stats.departmentGaps.slice(0, 1);
  const gapIds = new Set(gaps.map((g) => g.questionId));
  const low = stats.questions
    .filter((q) => needsFollowUp(q) && !gapIds.has(q.questionId))
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
  for (const g of gaps) {
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
  // 受講者が DEPT_MIN_LEARNERS 人（3人）に満たない部署は、1〜2人の点数だけで「低め」と言い切らない
  const worstDept = stats.departments.find((d) => d.learners >= DEPT_MIN_LEARNERS);
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
