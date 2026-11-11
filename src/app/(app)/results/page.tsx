"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { RoleGate } from "@/components/RoleGate";
import { FollowUpPanel } from "@/components/results/FollowUpPanel";
import { QuestionDetail } from "@/components/results/QuestionDetail";
import { Badge, Card, CardTitle, cx, RateBar, Stat } from "@/components/ui";
import { computeTestStats, LOW_RATE, pct } from "@/lib/analytics";
import { formatDateJa } from "@/lib/dates";
import { CHOICE_MARKS } from "@/lib/quality";

export default function ResultsPage() {
  return (
    <RoleGate role="trainer">
      <Results />
    </RoleGate>
  );
}

function Results() {
  const { tests, attempts, people } = useApp();
  const published = useMemo(() => tests.filter((t) => t.status === "published").reverse(), [tests]);
  const [testId, setTestId] = useState<string | null>(null);
  const [openQ, setOpenQ] = useState<string | null>(null);
  const test = published.find((t) => t.id === testId) ?? published[0];

  const stats = useMemo(() => (test ? computeTestStats(test, attempts, people) : null), [test, attempts, people]);

  if (!test || !stats) {
    return <p className="py-10 text-center text-sm text-ink-muted">公開中のテストがありません。「テストを作る」から公開してください。</p>;
  }

  const person = (id: string) => people.find((p) => p.id === id);
  const lowCount = stats.questions.filter((q) => q.answered > 0 && q.correctRate < LOW_RATE).length;
  const openStat = openQ ? stats.questions.find((q) => q.questionId === openQ) : undefined;
  const qNo = (id: string) => test.questions.findIndex((q) => q.id === id) + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">結果を見る</h1>
          <p className="mt-1 text-sm text-ink-soft">どの問題で、どの部署がつまずいているかを確認できます。同じ人が何度か受けた場合は最新の結果で集計します。</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs text-ink-muted">テスト</span>
          <select className="max-w-[16rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={test.id} onChange={(e) => setTestId(e.target.value)}>
            {published.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="平均点" value={stats.learnerCount ? `${Math.round(stats.avgScore)}点` : "—"} sub="100点満点" />
        <Stat label="受講済み" value={`${stats.learnerCount}人`} sub={`対象 ${stats.targetCount}人中`} />
        <Stat label="満点" value={stats.learnerCount ? `${stats.perfectCount}人` : "—"} sub={`全${test.questions.length}問正解`} />
        <Stat
          label="間違いが多い問題"
          value={stats.learnerCount ? <span className={lowCount ? "text-bad" : undefined}>{lowCount}問</span> : "—"}
          sub={`正答率${pct(LOW_RATE)}未満`}
        />
      </div>

      <FollowUpPanel key={`${test.id}:${stats.learnerCount}`} test={test} stats={stats} onOpenQuestion={setOpenQ} />

      <Card>
        <CardTitle aside={<span className="text-xs text-ink-muted">{stats.learnerCount ? "押すと選択肢ごとの人数が見られます" : "まだ受講者がいません"}</span>}>
          問題ごとの正答率
        </CardTitle>
        {stats.learnerCount === 0 && <p className="border-b border-line px-5 py-3 text-sm text-ink-muted">まだ受講者がいません。受講者が受けると、ここに問題ごとの正答率が出ます。</p>}
        <ul className="divide-y divide-line">
          {stats.questions.map((s) => {
            const q = test.questions[s.index];
            const low = s.answered > 0 && s.correctRate < LOW_RATE;
            return (
              <li key={s.questionId}>
                <button className="grid w-full gap-x-4 gap-y-1.5 px-5 py-3 text-left hover:bg-canvas sm:grid-cols-[1fr_14rem]" onClick={() => setOpenQ(s.questionId)}>
                  <span className="min-w-0 text-sm">
                    <span className="flex items-center gap-2">
                      <b>第{s.index + 1}問</b>
                      {low && <Badge tone="bad">要フォロー</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-ink-soft">{q.prompt.split("\n").at(-1)}</span>
                  </span>
                  {s.answered > 0 ? (
                    <span className="flex items-center gap-2">
                      <RateBar value={s.correctRate} tone={low ? "bad" : "brand"} />
                      <span className={cx("w-11 shrink-0 text-right text-sm tabular-nums", low && "font-bold text-bad")}>{pct(s.correctRate)}</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-end text-sm text-ink-muted" aria-label="まだ受講者がいません">
                      —
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>よく選ばれた誤答</CardTitle>
          {stats.commonWrong.length ? (
            <ul className="divide-y divide-line">
              {stats.commonWrong.map((w) => {
                const q = test.questions.find((x) => x.id === w.questionId)!;
                return (
                  <li key={`${w.questionId}:${w.choice}`}>
                    <button className="flex w-full items-start gap-3 px-5 py-2.5 text-left text-sm hover:bg-canvas" onClick={() => setOpenQ(w.questionId)}>
                      <span className="shrink-0 text-xs text-ink-muted">第{qNo(w.questionId)}問</span>
                      <span className="min-w-0 flex-1">
                        「{CHOICE_MARKS[w.choice]}：{q.choices[w.choice]}」
                        <span className="block text-xs text-ink-muted">正解：{q.choices[q.answerIndex]}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-bad">
                        {w.count}人（{pct(w.share)}）
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-ink-muted">誤答はまだありません。</p>
          )}
        </Card>

        <Card>
          <CardTitle aside={<span className="text-xs text-ink-muted">平均点の低い順</span>}>部署別の弱点</CardTitle>
          {stats.departments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th className="px-4 py-2 font-medium">部署</th>
                    <th className="px-4 py-2 text-right font-medium">受講</th>
                    <th className="px-4 py-2 text-right font-medium">平均点</th>
                    <th className="px-4 py-2 font-medium">一番間違いが多い問題</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.departments.map((d) => (
                    <tr key={d.department} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium">{d.department}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{d.learners}人</td>
                      <td className={cx("px-4 py-2.5 text-right tabular-nums", d.avgScore <= stats.avgScore - 8 && "font-bold text-bad")}>
                        {Math.round(d.avgScore)}点
                      </td>
                      <td className="px-4 py-2.5">
                        {d.weakest && (
                          <button className="text-brand underline" onClick={() => setOpenQ(d.weakest!.questionId)}>
                            第{qNo(d.weakest.questionId)}問（正答率{pct(d.weakest.correctRate)}）
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-ink-muted">受講結果がまだありません。</p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle aside={<span className="text-xs text-ink-muted">点数の高い順</span>}>受講者ごとの点数</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-2 font-medium">受講者</th>
                <th className="px-4 py-2 font-medium">部署</th>
                <th className="px-4 py-2 text-right font-medium">点数</th>
                <th className="px-4 py-2 text-right font-medium">正解</th>
                <th className="px-4 py-2 text-right font-medium">受講日</th>
                <th className="px-4 py-2 text-right font-medium">回数</th>
              </tr>
            </thead>
            <tbody>
              {stats.learners.map((l) => (
                <tr key={l.learnerId} className="border-b border-line">
                  <td className="px-4 py-2.5 font-medium">{person(l.learnerId)?.name}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{person(l.learnerId)?.department}</td>
                  <td className={cx("px-4 py-2.5 text-right tabular-nums", l.score < 60 && "font-bold text-bad")}>{l.score}点</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.correct}/{l.total}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatDateJa(l.at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{l.attempts}回</td>
                </tr>
              ))}
              {stats.notTaken.map((id) => (
                <tr key={id} className="border-b border-line text-ink-muted last:border-0">
                  <td className="px-4 py-2.5">{person(id)?.name}</td>
                  <td className="px-4 py-2.5">{person(id)?.department}</td>
                  <td className="px-4 py-2.5 text-right" colSpan={4}>
                    <Badge tone="warn">未受講</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {openStat && <QuestionDetail test={test} stat={openStat} onClose={() => setOpenQ(null)} />}
    </div>
  );
}
