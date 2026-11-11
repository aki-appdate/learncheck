"use client";

import { useState } from "react";
import { MATERIALS } from "@/lib/materials";
import { findQuote } from "@/lib/quote";
import { MaterialExcerpt } from "./MaterialExcerpt";
import { cx } from "./ui";

// トップページの「根拠の照らし合わせを試す」。確認画面と同じ findQuote で、その場で照らし合わせる。
// 言い換えた引用が「見つからない」になるところを、実際に動かして見せるためのもの。

const MATERIAL = MATERIALS.find((m) => m.id === "mat-security")!;

const EXAMPLES = [
  {
    label: "資料のとおり",
    text: "パスワードは12文字以上にし、英字の大文字・小文字・数字・記号のうち3種類以上を組み合わせます。",
    note: "資料の文を一字一句そのまま引いているので、資料と一致します。",
  },
  {
    label: "書き方の揺れ",
    text: "パスワードは１２文字以上にし、英字の大文字・小文字・数字・記号のうち３種類以上を 組み合わせます。",
    note: "全角の数字や空白が混ざっていても、書き方の揺れだけなら同じ文とみなします。",
  },
  {
    label: "言い換え",
    text: "パスワードは12字以上にして、英字・数字・記号を3種類以上まぜます。",
    note: "意味は近くても、言い回しが違うので「見つからない」になります。言い換えを許すと、それらしい作り話も通ってしまうためです。",
  },
  {
    label: "資料にない文",
    text: "パスワードは90日ごとに必ず変更します。",
    note: "資料に書かれていない決まりです。AIがこうした文を根拠に挙げても、ここで止まります。",
  },
];

export function QuoteTryout() {
  const [picked, setPicked] = useState(2);
  const [text, setText] = useState(EXAMPLES[2].text);
  const example = EXAMPLES[picked];
  const edited = text !== example.text;
  const found = findQuote(MATERIAL.body, text).found;

  return (
    <div className="min-w-0">
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="label mb-2">AIが示した根拠の文の例</legend>
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.label}
            type="button"
            aria-pressed={picked === i && !edited}
            onClick={() => {
              setPicked(i);
              setText(ex.text);
            }}
            className={cx(
              "min-h-11 rounded-[3px] border px-3 py-2 text-sm",
              picked === i && !edited ? "border-ink bg-ink font-bold text-white" : "border-line-strong bg-surface text-ink hover:border-ink-soft",
            )}
          >
            {ex.label}
          </button>
        ))}
      </fieldset>

      <label className="mt-5 block">
        <span className="label">根拠の文（書き換えて試せます）</span>
        <textarea
          className="mt-1 h-20 w-full rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <p className={cx("mt-1 text-xs leading-relaxed", found ? "text-ink-soft" : "text-bad")} aria-live="polite">
        {edited
          ? found
            ? "書き換えた文は、資料の中にあります。"
            : "書き換えた文は、資料の中に見つかりません。1文字でも言い回しが違えば、見つからないと扱います。"
          : example.note}
      </p>

      <MaterialExcerpt className="mt-4" body={MATERIAL.body} quote={text} materialTitle={MATERIAL.title} showCheck />
    </div>
  );
}
