"use client";

import { useId, useState } from "react";
import { findQuote } from "@/lib/quote";
import { CHOICE_MARKS, sharesWord } from "@/lib/quality";
import { MaterialExcerpt, MaterialFull } from "./MaterialExcerpt";
import { Badge, btn, ChoiceMark, cx, Icon, Modal, QNo, Seal } from "./ui";

// トップページの「確認画面の見本」。研修担当の確認カードと同じ並び（本文＝問題、余白＝根拠）で、
// AIが示した根拠の文を切り替えると、確認画面と同じ findQuote で照らし合わせ、「採用」を押せるかが変わる。
// 言い換えた引用が「見つからない」になり、採用できないところを、実際に動かして見せるためのもの。

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

type Sample = {
  title: string;
  material: { title: string; body: string };
  question: { prompt: string; choices: string[]; answerIndex: number; explanation: string };
};

export function QuoteTryout({ sample }: { sample: Sample }) {
  const [picked, setPicked] = useState(2);
  const [text, setText] = useState(EXAMPLES[2].text);
  const [stamped, setStamped] = useState(false);
  const [full, setFull] = useState(false);
  const fieldId = useId();
  const example = EXAMPLES[picked];
  const edited = text !== example.text;
  const match = findQuote(sample.material.body, text);
  const found = match.found;
  // 短すぎる・空のときは「見つからない」とは言わない（照らし合わせ自体をしていないため）
  const notChecked = !match.found && match.reason !== "not_found";
  const q = sample.question;
  // 本物の確認画面（checkQuestion）と同じ注意：資料にある文でも、正解の言葉が1つも出てこなければ確かめてもらう
  const unrelated = found && !sharesWord(q.choices[q.answerIndex], text);

  const choose = (i: number) => {
    setPicked(i);
    setText(EXAMPLES[i].text);
    setStamped(false);
  };

  return (
    <article className="overflow-hidden rounded-[4px] border border-line-strong bg-surface" aria-label="問題の確認画面の見本">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5 sm:px-6">
        <QNo n={1} />
        <Badge>ふつう</Badge>
        <span className="text-xs text-ink-muted">AIの案のまま</span>
        <span className="hidden border-l border-line pl-3 text-xs text-ink-muted sm:inline">{sample.title}</span>
        <span className="ml-auto text-xs font-bold" aria-live="polite">
          {stamped ? (
            <span className="text-good">確認済み</span>
          ) : found ? (
            <span className="text-ink-soft">未確認</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-bad">
              <Icon name="alert" className="size-4" />
              直す必要あり
            </span>
          )}
        </span>
      </header>

      <div className="grid gap-x-8 gap-y-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        {/* 本文：AIが出した問題と、根拠に挙げた文 */}
        <div className="min-w-0">
          <p className="text-[16px] font-bold leading-relaxed">{q.prompt}</p>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {q.choices.map((c, i) => {
              const ok = i === q.answerIndex;
              return (
                <li key={i} className={cx("flex items-center gap-2.5 rounded-[3px] border px-2.5 py-2 text-sm", ok ? "border-good bg-good-soft font-bold" : "border-line")}>
                  <ChoiceMark mark={CHOICE_MARKS[i]} tone={ok ? "good" : "plain"} />
                  <span className="flex-1">{c}</span>
                  {ok && <span className="text-xs font-bold text-good">正解</span>}
                </li>
              );
            })}
          </ol>

          <div className="mt-6 border-t border-dashed border-line-strong pt-4">
            <p id={`${fieldId}-legend`} className="label">
              AIが根拠に挙げた文（例を選ぶか、書き換えて試せます）
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-labelledby={`${fieldId}-legend`}>
              {EXAMPLES.map((ex, i) => {
                const on = picked === i && !edited;
                return (
                  <button
                    key={ex.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => choose(i)}
                    className={cx(
                      "min-h-10 rounded-[3px] border px-2 py-1.5 text-[13px] leading-tight",
                      on ? "border-ink font-bold text-ink shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-line-strong text-ink-soft hover:border-ink-soft hover:text-ink",
                    )}
                  >
                    {ex.label}
                  </button>
                );
              })}
            </div>
            <label htmlFor={fieldId} className="sr-only">
              AIが根拠に挙げた文
            </label>
            <textarea
              id={fieldId}
              className="mt-2 h-[4.75rem] w-full resize-none rounded-[3px] border border-line-strong bg-paper px-3 py-2 text-sm leading-relaxed"
              value={text}
              maxLength={200}
              onChange={(e) => {
                setText(e.target.value);
                setStamped(false);
              }}
            />
            <p className={cx("mt-1 text-xs leading-relaxed", found || notChecked ? "text-ink-soft" : "text-bad")} aria-live="polite">
              {edited
                ? notChecked
                  ? "短い言葉や空の文は、照らし合わせをしません（理由は右に出ます）。"
                  : found
                    ? "書き換えた文は、資料の中にあります。"
                    : "書き換えた文は、資料の中に見つかりません。1文字でも言い回しが違えば、見つからないと扱います。"
                : example.note}
            </p>
          </div>
        </div>

        {/* 余白：プログラムが資料と照らし合わせた結果 */}
        <aside className="min-w-0 lg:border-l lg:border-line lg:pl-8" aria-label="資料と照らし合わせた結果">
          <p className="label">根拠（資料の該当箇所）</p>
          <MaterialExcerpt className="mt-2" body={sample.material.body} quote={text} materialTitle={sample.material.title} showCheck />
          {!found && (
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand underline decoration-1 underline-offset-4 hover:text-brand-strong" onClick={() => setFull(true)}>
              <Icon name="doc" className="size-3.5" />
              資料の全文と見比べる
            </button>
          )}
          <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
            同じとみなすのは、空白・全角と半角・かっこの形など<b className="font-bold text-ink-soft">書き方の揺れだけ</b>です。
          </p>
        </aside>
      </div>

      <footer className="flex min-h-[4.25rem] flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-canvas px-4 py-3 sm:px-6">
        {stamped ? (
          <>
            <Seal size="sm" className="mr-1" />
            <span className="mr-auto text-sm text-ink-soft">研修担当が確かめて採用しました。この問題だけがテストに入ります。</span>
            <button type="button" className={btn.ghost} onClick={() => setStamped(false)}>
              <Icon name="undo" className="size-4" />
              確認を取り消す
            </button>
          </>
        ) : (
          <>
            <button type="button" className={btn.primary} disabled={!found} onClick={() => setStamped(true)}>
              <Icon name={found ? "check" : "lock"} className="size-4" />
              採用
            </button>
            <span className={cx("text-xs leading-relaxed", !found ? "text-bad" : unrelated ? "font-bold text-warn" : "text-ink-soft")} aria-live="polite">
              {!found
                ? "根拠が資料で確かめられないため、このままでは採用できません。"
                : unrelated
                  ? "資料にある文ですが、正解の選択肢の言葉が出てきません。正解の根拠になっているか確かめてから採用してください。"
                  : "根拠が資料と一致しました。押すと、採用の印が付きます。"}
            </span>
          </>
        )}
      </footer>
      {full && (
        <Modal title={`資料：${sample.material.title}`} onClose={() => setFull(false)} wide>
          <MaterialFull body={sample.material.body} />
          <button className={`${btn.secondary} mt-4 w-full`} onClick={() => setFull(false)}>
            閉じる
          </button>
        </Modal>
      )}
    </article>
  );
}
