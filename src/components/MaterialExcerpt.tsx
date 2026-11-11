"use client";

import { useState } from "react";
import { excerptAround, findQuote } from "@/lib/quote";
import { btn, Modal } from "./ui";

/** 引用文を資料の中で探し、前後の文とあわせて印をつけて見せる。見つからなければ赤で知らせる */
export function MaterialExcerpt({ body, quote, materialTitle }: { body: string; quote: string; materialTitle: string }) {
  const [full, setFull] = useState(false);
  const match = findQuote(body, quote);

  if (!match.found) {
    return (
      <div className="rounded-lg border border-bad bg-bad-soft p-3 text-sm">
        <p className="font-bold text-bad">⚠ この引用文は資料の中に見つかりません</p>
        <p className="mt-1 whitespace-pre-wrap text-ink-soft">「{quote || "（空）"}」</p>
      </div>
    );
  }
  const ex = excerptAround(body, match.start, match.end);
  return (
    <div className="rounded-lg border border-line bg-canvas p-3 text-sm leading-relaxed">
      <p className="text-ink-soft">
        {ex.before}
        <mark className="rounded bg-warn-soft px-0.5 font-medium text-ink">{ex.hit}</mark>
        {ex.after}
      </p>
      <button className="mt-1.5 text-xs text-brand underline" onClick={() => setFull(true)}>
        資料「{materialTitle}」の全文で見る
      </button>
      {full && (
        <Modal title={`資料：${materialTitle}`} onClose={() => setFull(false)} wide>
          <MaterialFull body={body} highlight={{ start: match.start, end: match.end }} />
          <button className={`${btn.secondary} mt-4 w-full`} onClick={() => setFull(false)}>
            閉じる
          </button>
        </Modal>
      )}
    </div>
  );
}

/** 資料の全文。highlight があればその部分に印をつける */
export function MaterialFull({ body, highlight }: { body: string; highlight?: { start: number; end: number } }) {
  if (!highlight) return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{body}</p>;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
      {body.slice(0, highlight.start)}
      <mark
        className="rounded bg-warn-soft px-0.5 font-medium text-ink"
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
