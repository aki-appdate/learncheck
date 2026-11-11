"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { AiSourceBadge, btn, Card, CardTitle } from "../ui";
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
    <Card>
      <CardTitle aside={state && <AiSourceBadge source={state.source} />}>✦ AIによるフォロー研修の提案</CardTitle>
      <div className="px-5 py-4">
        {!state ? (
          <div className="flex flex-wrap items-center gap-3">
            <button className={btn.primary} onClick={run} disabled={loading || stats.learnerCount === 0}>
              {loading ? "分析しています…" : "結果からフォローの案を出す"}
            </button>
            <p className="text-sm text-ink-soft">
              {stats.learnerCount === 0 ? "受講結果がまだありません。" : "問題ごとの正答率と誤答の選ばれ方から、伝わっていない所とフォローの案を出します。根拠の問題もあわせて表示します。"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {state.note && <p className="text-xs text-ink-soft">{state.note}</p>}
            <p className="text-base font-bold">{state.value.headline}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {state.value.findings.map((f) => (
                <div key={f.title} className="rounded-lg border border-line p-3">
                  <p className="font-medium">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-ink-muted">根拠：</span>
                    {f.evidenceQuestionIds.map((id) => (
                      <button key={id} className="rounded border border-line px-1.5 text-xs text-brand hover:bg-brand-soft" onClick={() => onOpenQuestion(id)}>
                        第{number(id)}問
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-canvas p-3">
              <p className="text-sm font-medium">次にできるフォロー</p>
              <ul className="mt-1.5 space-y-1 text-sm text-ink-soft">
                {state.value.actions.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="text-brand">→</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-ink-muted">AIの提案は参考情報です。根拠の問題と受講者の様子をあわせて、研修担当が判断してください。</p>
            <button className={btn.ghost} onClick={run} disabled={loading}>
              {loading ? "分析しています…" : "もう一度分析する"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
