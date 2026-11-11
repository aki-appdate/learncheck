// 「根拠となる資料の引用文」が、資料の中に本当にあるかを確かめる。
// AIは資料にない文をそれらしく作ってしまうことがあるため、ここで機械的に照らし合わせる。
//
// 比べるときは、空白・改行の有無と、全角／半角の違い（ＡとA、１と1 など）だけを同じものとみなす。
// 言い回しが少しでも違えば「見つからない」とする（言い換えを許すと、作り話を見逃すため）。

/** 根拠として認める引用文の最小の長さ（空白を除いた文字数） */
export const MIN_QUOTE_LENGTH = 8;

type Normalized = { text: string; /** text の各文字が元の文字列の何文字目から来たか */ map: number[] };

const EDGE_PUNCT = /^[「」『』（）()。、・：:\s]+|[「」『』（）()。、・：:\s]+$/g;

export function normalize(s: string): Normalized {
  let text = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    const n = ch.normalize("NFKC");
    if (!/^\s+$/.test(n)) {
      for (const c of n) {
        text += c;
        map.push(i);
      }
    }
    i += ch.length;
  }
  return { text, map };
}

export type QuoteMatch =
  | { found: true; start: number; end: number }
  | { found: false; reason: "empty" | "too_short" | "not_found" };

/** 引用文が資料のどこにあるかを返す（start・end は元の資料の文字位置） */
export function findQuote(material: string, quote: string): QuoteMatch {
  const q = normalize(quote.replace(EDGE_PUNCT, ""));
  if (q.text.length === 0) return { found: false, reason: "empty" };
  if (q.text.length < MIN_QUOTE_LENGTH) return { found: false, reason: "too_short" };
  const m = normalize(material);
  const at = m.text.indexOf(q.text);
  if (at < 0) return { found: false, reason: "not_found" };
  const start = m.map[at];
  const lastIdx = m.map[at + q.text.length - 1];
  // 最後の文字が全角→半角で複数文字になる場合も含め、元の1文字分を含める
  const end = lastIdx + (material.codePointAt(lastIdx)! > 0xffff ? 2 : 1);
  return { found: true, start, end };
}

export const QUOTE_REASON_LABEL: Record<Exclude<QuoteMatch, { found: true }>["reason"], string> = {
  empty: "引用文がありません",
  too_short: `引用文が短すぎます（${MIN_QUOTE_LENGTH}文字以上必要です）`,
  not_found: "引用文が資料の中に見つかりません",
};

/** 引用箇所の前後を含む段落を切り出す（画面で「資料の該当箇所」として見せる） */
export function excerptAround(material: string, start: number, end: number): { before: string; hit: string; after: string } {
  const paraStart = material.lastIndexOf("\n", start - 1) + 1;
  const nl = material.indexOf("\n", end);
  const paraEnd = nl < 0 ? material.length : nl;
  return {
    before: material.slice(paraStart, start),
    hit: material.slice(start, end),
    after: material.slice(end, paraEnd),
  };
}
