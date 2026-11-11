"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { AiSourceBadge, btn, Icon } from "../ui";
import { suggestFollowUp, type AiResult } from "@/lib/ai";
import type { TestStats } from "@/lib/analytics";
import type { FollowUpInsight, Test } from "@/lib/types";

export function FollowUpPanel({ test, stats, onOpenQuestion }: { test: Test; stats: TestStats; onOpenQuestion: (questionId: string) => void }) {
  const { people } = useApp();
  const [state, setState] = useState<AiResult<FollowUpInsight> | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setState(await suggestFollowUp(test, stats, people));
    setLoading(false);
  }

  const number = (id: string) => test.questions.findIndex((q) => q.id === id) + 1;

  return (
    <section className="rounded-[4px] border border-line border-t-4 border-t-brand bg-surface" aria-labelledby="followup-title">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3 sm:px-6">
        <h2 id="followup-title" className="text-lg font-bold">
          フォロー研修の提案<span className="ml-2 text-sm font-normal text-ink-muted">AIの案</span>
        </h2>
        {state && <AiSourceBadge source={state.source} />}
      </div>
      <div className="px-5 py-5 sm:px-6">
        {!state ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button className={btn.primary} onClick={run} disabled={loading || stats.learnerCount === 0} aria-busy={loading}>
              {loading ? "結果を読んでいます…" : "結果からフォローの案を出す"}
            </button>
            <p className="max-w-xl flex-1 basis-64 text-sm leading-relaxed text-ink-soft">
              {stats.learnerCount === 0
                ? "受講結果がまだないため、案を出せません。受講者が受けると押せるようになります。"
                : "問題ごとの正答率と誤答の選ばれ方から、伝わっていない所とフォローの案を出します。気づきごとに根拠の問題を開いて確かめられます。"}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {state.note && <p className="border-l-[3px] border-line-strong bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-soft">{state.note}</p>}
            <p className="text-[19px] font-bold leading-snug">{state.value.headline}</p>
            <ol className="grid gap-px overflow-hidden rounded-[3px] border border-line bg-line md:grid-cols-3">
              {state.value.findings.map((f, i) => (
                <li key={f.title} className="flex flex-col bg-surface p-4">
                  <p className="flex gap-2 font-bold leading-snug">
                    <span className="text-brand">{i + 1}</span>
                    {f.title}
                  </p>
                  <p className="mt-1.5 flex-1 text-sm leading-[1.8] text-ink-soft">{f.detail}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                    <span className="text-xs text-ink-muted">根拠の問題</span>
                    {f.evidenceQuestionIds.map((id) => (
                      <button
                        key={id}
                        className="inline-flex items-center gap-0.5 rounded-[2px] border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-xs font-bold text-brand-strong hover:border-brand"
                        onClick={() => onOpenQuestion(id)}
                      >
                        第{number(id)}問を開く
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <p className="label">次にできるフォロー</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {state.value.actions.map((a) => (
                  <li key={a} className="flex gap-2 leading-relaxed">
                    <Icon name="arrow-right" className="mt-0.5 size-4 text-brand" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-ink-muted">AIの提案は参考情報です。根拠の問題と受講者の様子をあわせて、研修担当が判断してください。</p>
              <button className={btn.ghost} onClick={run} disabled={loading}>
                <Icon name="refresh" className="size-4" />
                {loading ? "読み直しています…" : "もう一度分析する"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
