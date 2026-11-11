// 「見本の返答」。AIが使えないとき（未設定・無料枠の上限・通信エラー・形の不正）に使う、ルールベースの処理。
// AIと同じ形（GeneratedQuestion / FollowUpInsight）を返すので、画面側はどちらが動いたかを気にしなくてよい。
//
// 問題の作り方：資料の中から大事そうな文を選び、その文の中の語句（数字・カタカナ語・漢字の言葉など）を空欄にする。
// 誤答は、資料の別の文に出てくる同じ種類の語句から選ぶ。引用文は資料の文をそのまま切り出すので、必ず資料の中にある。

import { CHOICE_MARKS } from "../quality";
import { LOW_RATE, type TestStats } from "../analytics";
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

export type TermKind = "number" | "quoted" | "katakana" | "kanji";
export type Term = { text: string; kind: TermKind; unit?: string; value?: number };

const UNITS = [
  "営業日以内", "時間以内", "日以内", "分以内", "秒以内", "文字以上", "種類以上", "か月", "ヶ月", "週間", "分間",
  "文字", "種類", "時間", "年", "日", "分", "秒", "枚", "台", "名", "人", "回", "件", "点", "つ", "時", "%", "％",
];
const NUM_RE = new RegExp(`(?<![-\\d.])(\\d+)(${UNITS.map((u) => u.replace(/[%％]/g, "\\$&")).join("|")})`, "g");
const QUOTED_RE = /「([^」「]{2,10})」/g;
const KATAKANA_RE = /[ァ-ヴ][ァ-ヴー]{2,}/g;
const KANJI_RE = /[一-龠々]{2,6}/g;

/** 空欄にしても問題にならない、ありふれた言葉 */
const STOP = new Set([
  "当社", "場合", "必要", "資料", "自分", "原則", "以下", "一方", "目安", "方法", "対象", "内容", "確認", "相手", "最初",
  "以上", "以内", "一人", "全体", "毎日", "具体的", "時間", "部分", "理由", "客様", "様子", "大丈夫",
]);

export function extractTerms(text: string): Term[] {
  const terms: Term[] = [];
  for (const m of text.matchAll(NUM_RE)) terms.push({ text: m[0], kind: "number", unit: m[2], value: Number(m[1]) });
  for (const m of text.matchAll(QUOTED_RE)) terms.push({ text: m[1], kind: "quoted" });
  for (const m of text.matchAll(KATAKANA_RE)) terms.push({ text: m[0], kind: "katakana" });
  for (const m of text.matchAll(KANJI_RE)) {
    // 「30分以内」の「分以内」のように、数字に続く言葉は単独の語句として使わない
    if (STOP.has(m[0]) || /\d/.test(text[m.index! - 1] ?? "")) continue;
    terms.push({ text: m[0], kind: "kanji" });
  }
  return terms;
}

const KIND_PRIORITY: TermKind[] = ["number", "quoted", "katakana", "kanji"];

/** 文の中で、空欄にするのに一番よい語句を選ぶ */
function pickAnswerTerm(terms: Term[]): Term | null {
  for (const kind of KIND_PRIORITY) {
    const cands = terms.filter((t) => t.kind === kind);
    if (!cands.length) continue;
    if (kind === "number") return cands[cands.length - 1];
    // 長い言葉ほど、その文ならではの大事な言葉であることが多い
    return [...cands].sort((a, b) => b.text.length - a.text.length)[0];
  }
  return null;
}

// ───────── 誤答を作る ─────────

/** 数字の誤答：ありえそうな別の数字にする。むずかしいほど正解に近い数字にする */
function numberVariants(t: Term, difficulty: Difficulty): string[] {
  const v = t.value ?? 1;
  const step = v >= 10 ? 10 : 1;
  const near = [v + step, v - step, v + step * 2, v * 2];
  const far = [v * 2, Math.round(v / 2), v * 3, v * 10];
  const mid = [v * 2, Math.round(v / 2), v * 3, v + step, v - step];
  const list = difficulty === "hard" ? near : difficulty === "easy" ? far : mid;
  return [...new Set(list.filter((n) => n > 0 && n !== v))].map((n) => `${n}${t.unit}`);
}

function sameTerm(a: string, b: string): boolean {
  return normalize(a).text === normalize(b).text;
}

function buildDistractors(answer: Term, sentence: string, pool: Term[], difficulty: Difficulty, rand: () => number): string[] | null {
  const picked: string[] = [];
  const ok = (s: string) =>
    s.length > 0 && !sameTerm(s, answer.text) && !sentence.includes(s) && !picked.some((p) => sameTerm(p, s)) && !s.includes(answer.text) && !answer.text.includes(s);

  const fromPool = (kinds: TermKind[], sameUnit: boolean) =>
    shuffle(
      pool.filter((t) => kinds.includes(t.kind) && (!sameUnit || t.unit === answer.unit)),
      rand,
    ).map((t) => t.text);

  let candidates: string[];
  if (answer.kind === "number") {
    candidates = [...fromPool(["number"], true), ...numberVariants(answer, difficulty)];
    // やさしい・ふつうは資料の中の別の数字を優先、むずかしいは近い数字を優先
    if (difficulty === "hard") candidates = [...numberVariants(answer, difficulty), ...fromPool(["number"], true)];
  } else if (answer.kind === "kanji") {
    // むずかしいほど、長さの近い言葉（紛らわしい言葉）を選ぶ
    const same = fromPool(["kanji"], false);
    candidates =
      difficulty === "easy" ? [...fromPool(["katakana", "quoted"], false), ...same] : [...same].sort((a, b) => Math.abs(a.length - answer.text.length) - Math.abs(b.length - answer.text.length));
    if (difficulty === "normal") candidates = same;
  } else {
    candidates = [...fromPool([answer.kind], false), ...fromPool(answer.kind === "quoted" ? ["katakana"] : ["quoted"], false), ...fromPool(["kanji"], false)];
  }

  for (const c of candidates) {
    if (ok(c)) picked.push(c);
    if (picked.length === 3) return picked;
  }
  return null;
}

// ───────── 大事そうな文の点数 ─────────

const RULE_WORDS = /必ず|禁止|いけません|しません|ません|以内|までに|原則|ください|徹底/;

function scoreSentence(s: Sentence, terms: Term[]): number {
  let score = 0;
  if (terms.some((t) => t.kind === "number")) score += 3;
  if (terms.some((t) => t.kind === "quoted" || t.kind === "katakana")) score += 1;
  if (RULE_WORDS.test(s.text)) score += 2;
  const len = normalize(s.text).text.length;
  if (len >= 25 && len <= 90) score += 1;
  return score;
}

// ───────── 問題を作る ─────────

export function sampleQuiz(input: { body: string; count: number; difficulty: Difficulty; variant?: number }): GeneratedQuestion[] {
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

  // 点数の高い順（同点は少しだけ揺らす）に、空欄と誤答を作れる文を集める
  const ranked = sentences
    .map((s) => {
      const terms = extractTerms(s.text);
      return { s, terms, score: scoreSentence(s, terms) + rand() * 0.9 };
    })
    .sort((a, b) => b.score - a.score);

  const chosen: { s: Sentence; answer: Term; distractors: string[] }[] = [];
  const usedAnswers = new Set<string>();
  for (const r of ranked) {
    if (chosen.length >= count) break;
    const answer = pickAnswerTerm(r.terms);
    if (!answer || usedAnswers.has(normalize(answer.text).text)) continue;
    const distractors = buildDistractors(answer, r.s.text, pool, difficulty, rand);
    if (!distractors) continue;
    usedAnswers.add(normalize(answer.text).text);
    chosen.push({ s: r.s, answer, distractors });
  }
  chosen.sort((a, b) => a.s.start - b.s.start);

  // 正解の位置が偏らないよう、A〜Dを順番に割り当ててから並びを混ぜる
  const positions = shuffle(
    chosen.map((_, i) => i % 4),
    rand,
  );

  return chosen.map(({ s, answer, distractors }, i) => {
    const answerIndex = positions[i];
    const choices = [...distractors];
    choices.splice(answerIndex, 0, answer.text);
    const blanked = s.text.replace(answer.text, "（　　　）");
    return {
      prompt: `資料の内容として正しくなるように、次の文の（　　　）に入る言葉を選んでください。\n「${blanked}」`,
      choices,
      answerIndex,
      explanation: `正しくは「${answer.text}」です。${answer.kind === "number" ? "数字は仕事の場面でそのまま使うので、正確に覚えておきましょう。" : "資料の該当箇所を読み直して、前後の内容とあわせて確かめましょう。"}`,
      quote: s.text,
      difficulty,
    };
  });
}

const DIFF_SEED: Record<Difficulty, number> = { easy: 11, normal: 23, hard: 37 };

// ───────── フォロー研修の提案 ─────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function shorten(s: string, n = 28): string {
  const t = s.replace(/\s+/g, "");
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function sampleFollowUp(test: Test, stats: TestStats, people: Person[]): FollowUpInsight {
  const findings: FollowUpInsight["findings"] = [];
  const actions: string[] = [];
  const qById = new Map(test.questions.map((q) => [q.id, q]));

  const low = stats.questions
    .filter((q) => q.answered >= 3 && q.correctRate < LOW_RATE)
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 2);

  for (const s of low) {
    const q = qById.get(s.questionId)!;
    const wrong = s.topWrong;
    findings.push({
      title: `第${s.index + 1}問の正答率が${pct(s.correctRate)}と低い`,
      detail: wrong
        ? `${s.answered}人中${wrong.count}人が「${CHOICE_MARKS[wrong.choice]}：${shorten(q.choices[wrong.choice], 24)}」を選んでいます。資料の「${shorten(q.quote)}」の部分が、誤解されたまま覚えられている可能性があります。`
        : `資料の「${shorten(q.quote)}」の部分が、十分に伝わっていない可能性があります。`,
      evidenceQuestionIds: [s.questionId],
    });
    actions.push(`第${s.index + 1}問の内容を、${wrong ? `よく選ばれた誤答「${shorten(q.choices[wrong.choice], 16)}」と比べながら、` : ""}具体的な場面の例で説明し直す`);
  }

  // 平均より大きく低い部署
  const worstDept = stats.departments[0];
  if (worstDept && stats.departments.length >= 2 && worstDept.avgScore <= stats.avgScore - 8) {
    const name = worstDept.department;
    const ids = new Set(people.filter((p) => p.department === name).map((p) => p.id));
    const deptLatest = stats.learners.filter((l) => ids.has(l.learnerId)).length;
    const evidence = worstDept.weakest ? [worstDept.weakest.questionId] : stats.questions.slice(0, 1).map((q) => q.questionId);
    const wq = worstDept.weakest && qById.get(worstDept.weakest.questionId);
    findings.push({
      title: `${name}の平均点が低め（${Math.round(worstDept.avgScore)}点）`,
      detail: `全体の平均${Math.round(stats.avgScore)}点に対して、${name}（${deptLatest}人）は${Math.round(worstDept.avgScore)}点です。${
        wq ? `特に第${test.questions.indexOf(wq) + 1}問の正答率が${pct(worstDept.weakest!.correctRate)}でした。` : ""
      }`,
      evidenceQuestionIds: evidence,
    });
    actions.push(`${name}向けに、間違いの多かった問題を中心に15分の補足説明を行う`);
  }

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
        ? "全体の理解度は高め。一部の問題に重点的なフォローを"
        : stats.avgScore >= 60
          ? "おおむね理解できているが、つまずきが集中している問題あり"
          : "理解が十分でない受講者が多く、研修内容の見直しが必要",
    findings: findings.slice(0, 3),
    actions: actions.slice(0, 3),
  };
}
