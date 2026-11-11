"use client";

import { MaterialExcerpt } from "../MaterialExcerpt";
import { Badge, btn, ChoiceMark, cx, Modal } from "../ui";
import { LOW_RATE, pct, type QuestionStat } from "@/lib/analytics";
import { CHOICE_MARKS } from "@/lib/quality";
import type { Test } from "@/lib/types";

/** 1問の詳しい結果：選択肢ごとに何人が選んだか・根拠の箇所 */
export function QuestionDetail({ test, stat, onClose }: { test: Test; stat: QuestionStat; onClose: () => void }) {
  const q = test.questions[stat.index];
  const max = Math.max(1, ...stat.choiceCounts);
  const low = stat.answered > 0 && stat.correctRate < LOW_RATE;
  return (
    <Modal title={`第${stat.index + 1}問の結果`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <p className={cx("font-bold leading-none", low && "text-bad")}>
            <span className="label mb-1 block">正答率</span>
            <span className="text-[40px] tracking-tight">{stat.answered ? pct(stat.correctRate) : "—"}</span>
          </p>
          <p className="pb-1 text-sm text-ink-soft">
            {stat.answered ? `${stat.answered}人中 ${stat.correct}人が正解` : "まだ受講者がいません"}
            {low && <span className="ml-2 font-bold text-bad">要フォロー</span>}
          </p>
          {q.edited && (
            <span className="pb-1">
              <Badge tone="warn">人が修正した問題</Badge>
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap font-bold leading-relaxed">{q.prompt}</p>
        <div>
          <p className="label">選択肢ごとに選んだ人数</p>
          <ul className="mt-2 space-y-3">
            {q.choices.map((c, i) => {
              const n = stat.choiceCounts[i];
              const isAnswer = i === q.answerIndex;
              return (
                <li key={i} className="text-sm">
                  <div className="flex items-start gap-2">
                    <ChoiceMark mark={CHOICE_MARKS[i]} tone={isAnswer ? "good" : "plain"} />
                    <span className={cx("flex-1 pt-0.5 leading-snug", isAnswer && "font-bold")}>
                      {c}
                      {isAnswer && <span className="ml-2 text-xs font-bold text-good">正解</span>}
                    </span>
                    <span className="num w-10 shrink-0 pt-0.5 text-right">{n}人</span>
                  </div>
                  <div className="mt-1.5 pl-9 pr-12">
                    <div className="h-2 rounded-full bg-paper">
                      <div className={cx("h-full rounded-full", isAnswer ? "bg-good" : "bg-chart-rest")} style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="label mb-1.5">根拠（資料の該当箇所）</p>
          <MaterialExcerpt body={test.material.body} quote={q.quote} materialTitle={test.material.title} />
        </div>
        <p className="border-l-[3px] border-line-strong pl-3 text-xs leading-relaxed text-ink-soft">
          間違いが多い問題は、教え方に課題があるか、問題文・選択肢が紛らわしい可能性があります。誤答の選ばれ方から、どちらかを見分けてください。
        </p>
        <button className={`${btn.secondary} w-full`} onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
