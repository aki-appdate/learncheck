"use client";

import { MaterialExcerpt } from "../MaterialExcerpt";
import { Badge, btn, cx, Modal } from "../ui";
import type { QuestionStat } from "@/lib/analytics";
import { CHOICE_MARKS } from "@/lib/quality";
import type { Test } from "@/lib/types";

/** 1問の詳しい結果：選択肢ごとに何人が選んだか・根拠の箇所 */
export function QuestionDetail({ test, stat, onClose }: { test: Test; stat: QuestionStat; onClose: () => void }) {
  const q = test.questions[stat.index];
  const max = Math.max(1, ...stat.choiceCounts);
  return (
    <Modal title={`第${stat.index + 1}問の結果`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          正答率 <b className="text-lg tabular-nums">{Math.round(stat.correctRate * 100)}%</b>
          <span className="text-ink-muted">（{stat.answered}人中 {stat.correct}人が正解）</span>
          {q.edited && <Badge tone="warn">人が修正した問題</Badge>}
        </p>
        <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{q.prompt}</p>
        <ul className="space-y-2">
          {q.choices.map((c, i) => {
            const n = stat.choiceCounts[i];
            const isAnswer = i === q.answerIndex;
            return (
              <li key={i} className="text-sm">
                <div className="flex gap-2">
                  <span className="font-bold text-ink-muted">{CHOICE_MARKS[i]}</span>
                  <span className="flex-1">{c}</span>
                  {isAnswer && <span className="shrink-0 text-xs font-bold text-good">正解</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 pl-5">
                  <div className="h-3 flex-1 rounded-full bg-canvas">
                    <div className={cx("h-full rounded-full", isAnswer ? "bg-good" : "bg-bad")} style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums">{n}人</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">根拠（資料の該当箇所）</p>
          <MaterialExcerpt body={test.material.body} quote={q.quote} materialTitle={test.material.title} />
        </div>
        <p className="text-xs text-ink-muted">
          間違いが多い問題は、教え方に課題があるか、問題文・選択肢が紛らわしい可能性があります。誤答の選ばれ方から、どちらかを見分けてください。
        </p>
        <button className={`${btn.secondary} w-full`} onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
