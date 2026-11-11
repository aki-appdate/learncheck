"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { MaterialExcerpt } from "@/components/MaterialExcerpt";
import { QuoteTryout } from "@/components/QuoteTryout";
import { ChoiceMark, cx, Icon, QNo, Seal } from "@/components/ui";
import { CHOICE_MARKS } from "@/lib/quality";

const STEPS = [
  {
    who: "AI",
    title: "資料から問題の案を作る",
    body: "資料を選ぶか貼り付けて、問題の数と難しさを選ぶだけ。4択の問題・正解・解説と、根拠にした資料の文を出します。",
  },
  {
    who: "プログラム",
    title: "根拠の文を資料と照らし合わせる",
    body: "引用文が資料に一字一句あるかを確かめます。見つからない問題は「根拠を確認できません」と赤で示し、そのままでは採用できません。",
  },
  {
    who: "研修担当",
    title: "1問ずつ確かめて、採用する",
    body: "「採用／直す／捨てる」を選びます。正解の位置の偏りや選択肢の重複も知らせます。確かめ終わった問題だけで公開します。",
    human: true,
  },
  {
    who: "受講者 → 研修担当",
    title: "受けて、つまずきを見直す",
    body: "受講者は答えるとすぐ、正解と資料の該当箇所が分かります。研修担当は問題・部署ごとの正答率から、フォロー研修を決めます。",
  },
];

export default function Home() {
  const { people, setMe, ready, tests } = useApp();
  const router = useRouter();
  const start = (id: string, to: string) => {
    setMe(id);
    router.push(to);
  };
  const trainer = people.find((p) => p.role === "trainer");
  const learner = people.find((p) => p.role === "learner");
  const sample = tests.find((t) => t.id === "test-security");
  const sq = sample?.questions[0];

  return (
    <>
      <Header />
      <main>
        {/* 冒頭：何をするアプリか＋確認画面の見本 */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_29rem] lg:py-20">
            <div className="min-w-0 lg:self-center">
              <p className="label">社内研修の理解度チェック</p>
              <h1 className="mt-3 text-[30px] font-bold leading-[1.4] tracking-tight text-ink sm:text-[40px]">
                <span className="whitespace-nowrap">研修資料から</span>
                <wbr />
                <span className="whitespace-nowrap">確認テストを作り、</span>
                <wbr />
                <span className="whitespace-nowrap">伝わっていない所を</span>
                <wbr />
                <span className="whitespace-nowrap">見つける。</span>
              </h1>
              <p className="mt-5 max-w-xl leading-[1.9] text-ink-soft">
                AIが作った問題には、必ず<b className="font-bold text-ink">資料の根拠</b>を添えます。研修担当が<b className="font-bold text-ink">1問ずつ確かめて採用</b>
                した問題だけで公開し、受講結果から、教え直すべき所とフォロー研修の案を出します。
              </p>

              <div className="mt-8 grid max-w-xl gap-px overflow-hidden rounded-[4px] border border-line-strong bg-line-strong sm:grid-cols-2">
                <RoleButton
                  primary
                  disabled={!ready || !trainer}
                  onClick={() => trainer && start(trainer.id, "/admin")}
                  title="研修担当として試す"
                  sub="問題の案を確かめて公開・結果を見る"
                />
                <RoleButton
                  disabled={!ready || !learner}
                  onClick={() => learner && start(learner.id, "/learn")}
                  title="受講者として試す"
                  sub="スマホで5分。答えるとすぐ根拠が分かる"
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">ログインは不要です。データはすべて架空で、いつでも初期化できます。</p>
            </div>

            {/* 見本：実際のデモデータの1問を、研修担当の確認画面と同じ見せ方で */}
            <figure className="min-w-0" aria-label="問題の確認画面の見本">
              <div className="relative rounded-[4px] border border-line-strong bg-surface">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <span className="text-xs text-ink-muted">確認画面の見本</span>
                  <span className="text-xs text-ink-muted">{sample?.title ?? "　"}</span>
                </div>
                {sq && sample ? (
                  <div className="space-y-3 px-4 pb-4 pt-3">
                    <div className="flex items-start gap-3">
                      <QNo n={1} className="mt-0.5" />
                      <p className="text-[15px] font-bold leading-relaxed">{sq.prompt}</p>
                    </div>
                    <ol className="grid grid-cols-2 gap-1.5">
                      {sq.choices.map((c, i) => (
                        <li
                          key={i}
                          className={cx(
                            "flex items-center gap-2 rounded-[3px] border px-2 py-1.5 text-sm",
                            i === sq.answerIndex ? "border-good bg-good-soft font-bold" : "border-line",
                          )}
                        >
                          <ChoiceMark mark={CHOICE_MARKS[i]} tone={i === sq.answerIndex ? "good" : "plain"} />
                          {c}
                          {i === sq.answerIndex && <span className="sr-only">（正解）</span>}
                        </li>
                      ))}
                    </ol>
                    <Callout n={1}>AIが示した根拠の文を、資料と照らし合わせる</Callout>
                    <MaterialExcerpt body={sample.material.body} quote={sq.quote} materialTitle={sample.material.title} showCheck />
                    <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                      <Callout n={2}>研修担当が確かめて「採用」を押す</Callout>
                      <Seal />
                    </div>
                  </div>
                ) : (
                  <div className="h-80" />
                )}
              </div>
            </figure>
          </div>
        </section>

        {/* 公開までの流れ：誰が何をするか */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-[22px] font-bold sm:text-2xl">
            <span className="inline-block">テストが公開されるまで、</span>
            <span className="inline-block">誰が何をするか</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">AIに任せるのは「案」まで。根拠の照らし合わせはプログラム、採用するかは人が決めます。</p>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className={cx("p-5", s.human ? "bg-good-soft" : "bg-surface")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[28px] font-bold leading-none text-brand">{i + 1}</span>
                  <span className={cx("flex items-center gap-2 text-xs font-bold", s.human ? "text-good" : "text-ink-muted")}>
                    {s.who}
                    {s.human && <Seal size="sm" className="-my-2" />}
                  </span>
                </div>
                <h3 className="mt-4 font-bold leading-snug">{s.title}</h3>
                <p className="mt-2 text-sm leading-[1.85] text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 根拠の照らし合わせ：確認画面と同じ処理を、その場で動かして見せる */}
        <section className="border-y border-line bg-paper">
          <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[16rem_1fr]">
            <div>
              <h2 className="text-[22px] font-bold">
                <span className="inline-block">根拠の照らし合わせを、</span>
                <span className="inline-block">ここで試せます</span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                AIが示した根拠の文が、資料に一字一句あるかを確かめます。研修担当の確認画面と同じ処理です。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                同じとみなすのは、空白・全角と半角・かっこの形などの<b className="font-bold text-ink">書き方の揺れだけ</b>
                。言い換えた文は、意味が近くても「見つからない」と扱います。
              </p>
            </div>
            <QuoteTryout />
          </div>
        </section>

        {/* このアプリについて */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-lg font-bold">このアプリについて</h2>
          <dl className="mt-5 grid gap-x-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["作った人", "設計・仕様決め・動作確認は筆者、実装は Claude Code（AIコーディングツール）です。"],
              ["使っている技術", "Next.js / React / TypeScript / Tailwind CSS / Firebase（Firestore・匿名認証・AI Logic）/ Gemini / Vitest"],
              ["料金", "Firebaseの無料プランとGeminiの無料枠だけで動く構成です。課金が必要な機能は使っていません。"],
              ["データの保存", "お試しの人ごとに分けて保存します。デモデータは毎回同じ計算で作り直し、保存するのは利用者が作ったテストと受講結果だけです。"],
            ].map(([k, v]) => (
              <div key={k} className="border-t border-line py-4">
                <dt className="label">{k}</dt>
                <dd className="mt-1.5 leading-[1.85] text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </>
  );
}

function RoleButton({ title, sub, onClick, disabled, primary }: { title: string; sub: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "group flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        primary ? "bg-brand text-white hover:bg-brand-strong" : "bg-surface text-ink hover:bg-canvas",
      )}
    >
      <span>
        <span className="block font-bold">{title}</span>
        <span className={cx("mt-0.5 block text-xs leading-relaxed", primary ? "text-white/80" : "text-ink-muted")}>{sub}</span>
      </span>
      <Icon name="arrow-right" className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function Callout({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-bold text-brand-strong">
      <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] text-white">{n}</span>
      {children}
    </p>
  );
}
