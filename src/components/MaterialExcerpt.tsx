"use client";

import { useState } from "react";
import { excerptAround, findQuote, QUOTE_REASON_LABEL } from "@/lib/quote";
import { btn, cx, Icon, Modal } from "./ui";

/** 引用文を資料の中で探し、前後の文とあわせて印をつけて見せる。見つからなければ赤で知らせる。
 *  showCheck を付けると「資料と一致」の確認結果も見出しに出す（研修担当の画面向け） */
export function MaterialExcerpt({
  body,
  quote,
  materialTitle,
  showCheck,
  className,
}: {
  body: string;
  quote: string;
  materialTitle: string;
  showCheck?: boolean;
  className?: string;
}) {
  const [full, setFull] = useState(false);
  const match = findQuote(body, quote);

  if (!match.found) {
    // 確かめられなかった理由ごとに説明を変える。「作った可能性」と言えるのは、十分な長さの文が資料に見つからないときだけ。
    // 短すぎる・空のときは、資料にあるかどうかをまだ判断していない
    const notFound = match.reason === "not_found";
    return (
      <div className={cx("border-l-[3px] px-4 py-3 text-sm", notFound ? "border-bad bg-bad-soft" : "border-warn bg-warn-soft", className)} role="alert">
        <p className={cx("flex items-center gap-1.5 font-bold", notFound ? "text-bad" : "text-warn")}>
          <Icon name="alert" className="size-4" />
          {QUOTE_REASON_LABEL[match.reason]}
        </p>
        {match.reason !== "empty" && <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-ink-soft">「{quote}」</p>}
        <p className={cx("mt-1.5 text-xs", notFound ? "text-bad" : "text-ink-soft")}>
          {notFound
            ? "資料にないことをAIが作った可能性があります。"
            : match.reason === "too_short"
              ? "短い言葉は資料のあちこちに出てくるため、根拠の文としては確かめません。文をまるごと入れてください。"
              : "根拠の文を入れると、資料の中のどこにあるかを確かめます。"}
        </p>
      </div>
    );
  }
  const ex = excerptAround(body, match.start, match.end);
  return (
    <figure className={cx("border-l-[3px] border-brand bg-paper px-4 pb-3 pt-2.5 text-sm", className)}>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-brand-strong">
          <Icon name="doc" className="size-4" />
          <span className="truncate">資料「{materialTitle}」</span>
        </span>
        <Where start={match.start} end={match.end} length={body.length} />
        {showCheck && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-good">
            <Icon name="check" className="size-4" />
            資料と一致
          </span>
        )}
      </figcaption>
      <blockquote className="mt-2 leading-[1.9] text-ink-soft">
        {ex.before}
        <mark className="evidence">{ex.hit}</mark>
        {ex.after}
      </blockquote>
      <button className="mt-2 text-xs font-bold text-brand underline decoration-1 underline-offset-4 hover:text-brand-strong" onClick={() => setFull(true)}>
        資料の全文で位置を確かめる
      </button>
      {full && (
        <Modal title={`資料：${materialTitle}`} onClose={() => setFull(false)} wide>
          <MaterialFull body={body} highlight={{ start: match.start, end: match.end }} />
          <button className={`${btn.secondary} mt-4 w-full`} onClick={() => setFull(false)}>
            閉じる
          </button>
        </Modal>
      )}
    </figure>
  );
}

/** 資料全体のどのあたりの文かを示す目盛り */
function Where({ start, end, length }: { start: number; end: number; length: number }) {
  const a = length ? start / length : 0;
  const b = length ? Math.max(end / length, a + 0.02) : 0;
  const pos = (a + b) / 2;
  const word = pos < 0.34 ? "はじめ" : pos < 0.67 ? "なかほど" : "おわり";
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-muted" title={`資料の${word}の文です`}>
      <span className="relative h-1.5 w-16 rounded-full bg-line" aria-hidden>
        <span className="absolute inset-y-0 rounded-full bg-brand" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
      </span>
      資料の{word}
    </span>
  );
}

/** 資料の全文。highlight があればその部分に印をつける */
export function MaterialFull({ body, highlight }: { body: string; highlight?: { start: number; end: number } }) {
  const cls = "whitespace-pre-wrap border-l-[3px] border-line bg-paper px-4 py-3 text-sm leading-[1.9] text-ink-soft";
  if (!highlight) return <p className={cls}>{body}</p>;
  return (
    <p className={cls}>
      {body.slice(0, highlight.start)}
      <mark
        className="evidence font-bold"
        ref={(el) => {
          el?.scrollIntoView({ block: "center" });
        }}
      >
        {body.slice(highlight.start, highlight.end)}
      </mark>
      {body.slice(highlight.end)}
    </p>
  );
}
