"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { RoleGate } from "@/components/RoleGate";
import { FollowUpPanel } from "@/components/results/FollowUpPanel";
import { QuestionDetail } from "@/components/results/QuestionDetail";
import { cx, Icon, PageHead, QNo, RateBar } from "@/components/ui";
import { computeTestStats, DEPT_MIN_LEARNERS, LOW_RATE, MIN_LEARNERS, needsFollowUp, pct } from "@/lib/analytics";
import { formatDateJa, formatDateTimeJa } from "@/lib/dates";
import { CHOICE_MARKS } from "@/lib/quality";

export default function ResultsPage() {
  return (
    <RoleGate role="trainer">
      {/* URLのテスト指定を読むため（静的に書き出すページでは Suspense で包む決まり） */}
      <Suspense>
        <Results />
      </Suspense>
    </RoleGate>
  );
}

function Results() {
  const { tests, attempts, people } = useApp();
  const published = useMemo(() => tests.filter((t) => t.status === "published").reverse(), [tests]);
  // 「このテストの結果を見る」（公開済みテストの画面）から来たときは、URLのテストを開く
  // 開くテストはURLだけで決める（選び直したときもURLを書き換える）。画面の状態に別に持つと、
  // 前に選んだテストが残ってURLと違う結果が出ることがあるため
  const testId = useSearchParams().get("test");
  const [openQ, setOpenQ] = useState<string | null>(null);
  const test = published.find((t) => t.id === testId) ?? published[0];

  const stats = useMemo(() => (test ? computeTestStats(test, attempts, people) : null), [test, attempts, people]);

  if (!test || !stats) {
    return (
      <div className="mx-auto max-w-lg border-y border-line py-12 text-center">
        <p className="font-bold">公開中のテストがありません</p>
        <p className="mt-2 text-sm text-ink-soft">「テストを作る」で問題を確かめて公開すると、ここで受講結果を見られます。</p>
      </div>
    );
  }

  const person = (id: string) => people.find((p) => p.id === id);
  const lowCount = stats.questions.filter(needsFollowUp).length;
  const openStat = openQ ? stats.questions.find((q) => q.questionId === openQ) : undefined;
  const qNo = (id: string) => test.questions.findIndex((q) => q.id === id) + 1;
  const has = stats.learnerCount > 0;
  // 受講者が3人未満のうちは、正答率が低くても「要フォロー」とは判断しない（フォロー研修の提案と同じ基準）
  const tooFew = has && stats.learnerCount < MIN_LEARNERS;
  const judged = has && !tooFew;

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="研修担当"
        title="結果を見る"
        aside={
          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="label">見るテスト</span>
            <select
              className="w-full rounded-[3px] border border-line-strong bg-surface py-2 pl-3 pr-8 text-sm font-bold sm:w-[27rem]"
              value={test.id}
              onChange={(e) => {
                setOpenQ(null);
                // 再読み込みや共有のときも同じテストが開くように、選んだテストをURLに残す（useSearchParams も追従する）
                window.history.replaceState(null, "", `?test=${encodeURIComponent(e.target.value)}`);
              }}
            >
              {published.map((t) => (
                <option key={t.id} value={t.id}>
                  {/* 同じ資料から作ったテストは名前が同じになるので、公開した日時を前に置いて見分ける（スマホで後ろが切れても見える） */}
                  {t.publishedAt ? `${formatDateTimeJa(t.publishedAt)} 公開・` : ""}
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        }
      >
        どの問題で、どの部署がつまずいているかを見て、フォロー研修を決めます。同じ人が何度か受けた場合は最新の結果で集計します。
      </PageHead>

      {/* 要約：平均点だけを大きく、ほかは脇に */}
      <section aria-label="要約" className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="col-span-2 bg-surface px-5 py-4 md:col-span-1">
          <p className="label">平均点</p>
          <p className="mt-1 font-bold leading-none">
            <span className="text-[52px] tracking-tight">{has ? Math.round(stats.avgScore) : "—"}</span>
            {has && <span className="ml-1 text-lg">点</span>}
          </p>
          <p className="mt-2 text-xs text-ink-muted">100点満点・最新の結果で集計</p>
        </div>
        <div className="bg-surface px-5 py-4">
          <p className="label">受講済み</p>
          <p className="mt-1 text-[26px] font-bold leading-tight">
            {stats.learnerCount}
            <span className="text-sm font-normal text-ink-soft">／{stats.targetCount}人</span>
          </p>
          <div className="mt-2">
            <RateBar value={stats.targetCount ? stats.learnerCount / stats.targetCount : 0} thin />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">{stats.notTaken.length ? `未受講 ${stats.notTaken.length}人` : "対象の全員が受講済み"}</p>
        </div>
        <div className="bg-surface px-5 py-4">
          <p className="label">満点</p>
          <p className="mt-1 text-[26px] font-bold leading-tight">
            {has ? stats.perfectCount : "—"}
            {has && <span className="text-sm font-normal text-ink-soft">人</span>}
          </p>
          <p className="mt-2 text-xs text-ink-muted">全{test.questions.length}問正解</p>
        </div>
        <div className={cx("col-span-2 px-5 py-4 md:col-span-1", judged && lowCount ? "bg-bad-soft" : "bg-surface")}>
          <p className="label">要フォローの問題</p>
          <p className={cx("mt-1 flex items-center gap-1.5 text-[26px] font-bold leading-tight", judged && lowCount ? "text-bad" : undefined)}>
            {judged && lowCount > 0 && <Icon name="alert" className="size-5" />}
            {judged ? lowCount : "—"}
            {judged && <span className="text-sm font-normal">問</span>}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            {tooFew ? `${MIN_LEARNERS}人から判断します` : `正答率${pct(LOW_RATE)}未満`}
          </p>
        </div>
      </section>

      {/* 3人未満のときの説明は、ここ1か所にまとめる（要約・問題一覧・誤答の表・提案で同じ説明をくり返さない） */}
      {tooFew && (
        <p className="-mt-4 flex gap-2 border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm leading-relaxed text-ink-soft" role="note">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            受講したのはまだ{stats.learnerCount}人です。{MIN_LEARNERS}人未満のうちは、1人の答えで正答率が0%にも100%にもなるため、「要フォロー」「よく選ばれた誤答」「フォローの提案」で傾向を言い切りません。
          </span>
        </p>
      )}

      <FollowUpPanel key={`${test.id}:${stats.learnerCount}`} test={test} stats={stats} onOpenQuestion={setOpenQ} />

      {/* 問題ごとの正答率 */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-ink pb-2">
          <h2 className="whitespace-nowrap text-lg font-bold">問題ごとの正答率</h2>
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="inline-block h-3 w-px bg-ink-muted" aria-hidden />
            縦線＝{pct(LOW_RATE)}。{MIN_LEARNERS}人以上が受けて下回る問題は「要フォロー」。押すと選択肢ごとの人数
          </p>
        </div>
        {!has && <p className="border-b border-line py-4 text-sm text-ink-muted">まだ受講者がいません。受講者が受けると、ここに問題ごとの正答率が出ます。</p>}

        <ul className="divide-y divide-line border-b border-line">
          {stats.questions.map((s) => {
            const q = test.questions[s.index];
            const low = needsFollowUp(s);
            return (
              <li key={s.questionId}>
                <button
                  className="grid w-full grid-cols-[2.75rem_1fr] items-center gap-x-3 gap-y-2 py-3 text-left hover:bg-surface sm:grid-cols-[2.75rem_minmax(0,1fr)_15rem_3.5rem] xl:grid-cols-[2.75rem_minmax(0,1fr)_22rem_3.5rem] sm:pr-2"
                  onClick={() => setOpenQ(s.questionId)}
                >
                  <QNo n={s.index + 1} className={cx("pl-1", low && "text-bad")} />
                  <span className="min-w-0 text-sm">
                    <span className="line-clamp-2 leading-snug text-ink">{q.prompt.split("\n").at(-1)}</span>
                    {low && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-bad">
                        <Icon name="alert" className="size-3.5" />
                        要フォロー{s.topWrong && `・誤答「${CHOICE_MARKS[s.topWrong.choice]}」に${s.topWrong.count}人`}
                      </span>
                    )}
                  </span>
                  {s.answered > 0 ? (
                    <>
                      <span className="col-start-2 flex items-center gap-3 sm:col-start-auto">
                        <RateBar value={s.correctRate} tone={low ? "bad" : "brand"} mark={LOW_RATE} />
                      </span>
                      <span className={cx("num hidden text-right text-sm sm:block", low ? "font-bold text-bad" : "text-ink")}>{pct(s.correctRate)}</span>
                      <span className={cx("num col-start-2 -mt-1 text-xs sm:hidden", low ? "font-bold text-bad" : "text-ink-soft")}>
                        正答率 {pct(s.correctRate)}（{s.answered}人中{s.correct}人）
                      </span>
                    </>
                  ) : (
                    <span className="col-start-2 text-right text-sm text-ink-muted sm:col-span-2 sm:col-start-auto" aria-label="まだ受講者がいません">
                      —
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-0.5 border-b border-ink pb-2">
            <h2 className="whitespace-nowrap text-lg font-bold">よく選ばれた誤答</h2>
            <span className="text-xs text-ink-muted">選んだ人の多い順</span>
          </div>
          {tooFew ? (
            <p className="border-b border-line py-4 text-sm text-ink-muted">受講者が{MIN_LEARNERS}人になったら出します。</p>
          ) : stats.commonWrong.length ? (
            <ul className="divide-y divide-line border-b border-line">
              {stats.commonWrong.map((w) => {
                const q = test.questions.find((x) => x.id === w.questionId)!;
                return (
                  <li key={`${w.questionId}:${w.choice}`}>
                    <button className="flex w-full items-start gap-3 py-3 text-left text-sm hover:bg-surface" onClick={() => setOpenQ(w.questionId)}>
                      <span className="w-12 shrink-0 pt-0.5 text-xs text-ink-muted">
                        <span className="sr-only">第{qNo(w.questionId)}問</span>
                        <span aria-hidden>問{qNo(w.questionId)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">
                          {CHOICE_MARKS[w.choice]}　{q.choices[w.choice]}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          正解は {CHOICE_MARKS[q.answerIndex]}　{q.choices[q.answerIndex]}
                        </span>
                      </span>
                      <span className="num shrink-0 text-right">
                        <b>{w.count}人</b>
                        <span className="block text-xs text-ink-muted">{pct(w.share)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-b border-line py-4 text-sm text-ink-muted">2人以上が選んだ誤答はまだありません。</p>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-0.5 border-b border-ink pb-2">
            <h2 className="whitespace-nowrap text-lg font-bold">部署別の弱点</h2>
            <span className="text-xs text-ink-muted">平均点の低い順・一番間違いが多い問題は{DEPT_MIN_LEARNERS}人から</span>
          </div>
          {stats.departments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th className="py-2 pr-3 font-normal">部署</th>
                    <th className="hidden whitespace-nowrap px-3 py-2 text-right font-normal sm:table-cell">受講</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-normal">平均点</th>
                    <th className="whitespace-nowrap py-2 pl-3 font-normal">
                      <span className="sm:hidden">一番低い問題</span>
                      <span className="hidden sm:inline">一番間違いが多い問題</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.departments.map((d) => {
                    // 受講者が3人に満たない部署は、平均点が低くても「低い」と印を付けない
                    const weak = d.learners >= DEPT_MIN_LEARNERS && d.avgScore <= stats.avgScore - 8;
                    return (
                      <tr key={d.department} className="border-b border-line">
                        <td className="py-2.5 pr-3 leading-snug">
                          <span className="font-bold [word-break:keep-all]">{d.department}</span>
                          <span className="num block text-xs text-ink-muted sm:hidden">{d.learners}人が受講</span>
                        </td>
                        <td className="num hidden whitespace-nowrap px-3 py-2.5 text-right sm:table-cell">{d.learners}人</td>
                        <td className={cx("num whitespace-nowrap px-3 py-2.5 text-right", weak && "font-bold text-bad")}>
                          {weak && <Icon name="alert" className="mr-1 inline size-3.5 align-[-2px]" />}
                          {weak && <span className="sr-only">全体の平均より低い：</span>}
                          {Math.round(d.avgScore)}点
                        </td>
                        <td className="py-2.5 pl-3">
                          {!d.weakest && <span className="text-ink-muted">—</span>}
                          {d.weakest && (
                            <button className="text-left font-bold text-brand underline decoration-1 underline-offset-4" onClick={() => setOpenQ(d.weakest!.questionId)}>
                              第{qNo(d.weakest.questionId)}問<span className="num font-normal">（{pct(d.weakest.correctRate)}）</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-b border-line py-4 text-sm text-ink-muted">受講結果がまだありません。</p>
          )}
          {stats.departmentGaps.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold">全体より大きく低い「部署×問題」</h3>
              <p className="mt-0.5 text-xs text-ink-muted">棒＝その部署の正答率、縦線＝全体の正答率</p>
              <ul className="mt-2 space-y-2.5">
                {stats.departmentGaps.map((g) => (
                  <li key={`${g.department}:${g.questionId}`}>
                    <button className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-line-strong" onClick={() => setOpenQ(g.questionId)}>
                      <span className="flex flex-wrap justify-between gap-x-3">
                        <span>
                          <b>{g.department}</b> × 第{g.index + 1}問
                        </span>
                        <span className="num text-xs text-ink-soft">
                          部署 <b className="text-bad">{pct(g.deptRate)}</b>（{g.answered}人）／全体 {pct(g.overallRate)}
                        </span>
                      </span>
                      <span className="mt-2 block">
                        <RateBar value={g.deptRate} tone="bad" mark={g.overallRate} thin />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-0.5 border-b border-ink pb-2">
          <h2 className="whitespace-nowrap text-lg font-bold">受講者ごとの点数</h2>
          <span className="text-xs text-ink-muted">点数の高い順・未受講は最後</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="py-2 pr-3 font-normal">受講者</th>
                <th className="hidden px-3 py-2 font-normal sm:table-cell">部署</th>
                <th className="py-2 pl-3 text-right font-normal sm:px-3">点数</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">正解</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">受講日</th>
                <th className="hidden py-2 pl-3 text-right font-normal sm:table-cell">回数</th>
              </tr>
            </thead>
            <tbody>
              {stats.learners.map((l) => (
                <tr key={l.learnerId} className="border-b border-line">
                  <td className="py-2.5 pr-3">
                    <span className="font-bold">{person(l.learnerId)?.name}</span>
                    {/* スマホでは列を減らし、部署・受講日・回数を名前の下にまとめる */}
                    <span className="block text-xs text-ink-muted sm:hidden">
                      {person(l.learnerId)?.department}・<span className="num">{formatDateJa(l.at)}</span>
                      {l.attempts > 1 && `・${l.attempts}回`}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-ink-soft sm:table-cell">{person(l.learnerId)?.department}</td>
                  <td className={cx("num whitespace-nowrap py-2.5 pl-3 text-right align-top sm:px-3 sm:align-middle", l.score < 60 && "font-bold text-bad")}>
                    {l.score < 60 && <Icon name="alert" className="mr-1 inline size-3.5 align-[-2px]" />}
                    {l.score < 60 && <span className="sr-only">60点未満：</span>}
                    {l.score}点
                  </td>
                  <td className="num hidden px-3 py-2.5 text-right text-ink-soft sm:table-cell">
                    {l.correct}/{l.total}
                  </td>
                  <td className="num hidden px-3 py-2.5 text-right text-ink-soft sm:table-cell">{formatDateJa(l.at)}</td>
                  <td className="num hidden py-2.5 pl-3 text-right text-ink-soft sm:table-cell">{l.attempts}回</td>
                </tr>
              ))}
              {stats.notTaken.map((id) => (
                <tr key={id} className="border-b border-line text-ink-muted">
                  <td className="py-2.5 pr-3">
                    {person(id)?.name}
                    <span className="block text-xs sm:hidden">{person(id)?.department}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">{person(id)?.department}</td>
                  <td className="py-2.5 pl-3 text-right align-top sm:align-middle" colSpan={4}>
                    <span className="text-xs font-bold text-warn">未受講</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {openStat && <QuestionDetail test={test} stat={openStat} onClose={() => setOpenQ(null)} />}
    </div>
  );
}
