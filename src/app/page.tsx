"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { QuoteTryout } from "@/components/QuoteTryout";
import { cx, Icon, Seal } from "@/components/ui";

// 余白の書き込み：テストができるまでに、誰が何をするか
const STEPS = [
  { who: "AI", title: "資料から問題の案を作る", body: "4択の問題・正解・解説と、根拠にした資料の文を出す。" },
  { who: "プログラム", title: "根拠の文を資料と照らし合わせる", body: "一字一句あるかを確かめる。見つからなければ採用できない。" },
  { who: "研修担当", title: "1問ずつ確かめて、採用する", body: "採用した問題だけで公開する。", human: true },
  { who: "受講者 → 研修担当", title: "受けて、つまずきを見直す", body: "問題・部署ごとの正答率から、フォロー研修を決める。" },
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
        {/* 冒頭：教科書の1ページ。本文に「何をするアプリか」と入口、余白に「誰が何をするか」の書き込み */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-w-0 py-12 sm:py-16 lg:py-20 lg:pr-14">
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

              {/* 入口：教科書の目次のように、立場ごとに1行 */}
              <nav className="mt-9 max-w-2xl" aria-label="試し方">
                <p className="label">どちらの立場で試しますか</p>
                <ul className="mt-2 border-t border-ink">
                  <EntryRow
                    primary
                    disabled={!ready || !trainer}
                    onClick={() => trainer && start(trainer.id, "/admin")}
                    title="研修担当として試す"
                    sub="AIの問題案を確かめて公開し、結果からフォローを決める"
                  />
                  <EntryRow
                    disabled={!ready || !learner}
                    onClick={() => learner && start(learner.id, "/learn")}
                    title="受講者として試す"
                    sub="スマホで5分。答えるとすぐ、資料の該当箇所が分かる"
                  />
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">ログインは不要です。データはすべて架空で、いつでも初期化できます。</p>
              </nav>
            </div>

            {/* 余白：テストができるまで */}
            <aside className="-mx-4 border-t border-line bg-paper px-4 py-8 sm:-mx-6 sm:px-6 lg:mx-0 lg:border-l lg:border-t-0 lg:bg-transparent lg:py-20 lg:pl-8 lg:pr-0" aria-labelledby="flow-title">
              <p id="flow-title" className="label">
                テストができるまで
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">AIに任せるのは「案」まで。採用するかは人が決めます。</p>
              <ol className="mt-5">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="relative grid grid-cols-[1.75rem_1fr] gap-x-3 pb-5 last:pb-0">
                    {i < STEPS.length - 1 && <span className="absolute bottom-0 left-[0.8125rem] top-7 w-px bg-line-strong" aria-hidden />}
                    <span
                      className={cx(
                        "grid size-7 place-items-center rounded-[3px] text-[13px] font-bold",
                        s.human ? "bg-good text-white" : "border border-line-strong bg-surface text-brand",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={cx("text-[11.5px] font-bold tracking-wide", s.human ? "text-good" : "text-ink-muted")}>{s.who}</p>
                      <p className="mt-0.5 flex items-start justify-between gap-2 text-sm font-bold leading-snug">
                        {s.title}
                        {s.human && <Seal size="sm" className="-mt-1" />}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        {/* 確認画面の見本：根拠の文を切り替えると、照らし合わせと「採用」の可否が実際に変わる */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-x-14 gap-y-3 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
            <div>
              <p className="label">確認画面の見本（動かせます）</p>
              <h2 className="mt-2 text-[22px] font-bold sm:text-2xl">
                <span className="inline-block">AIが示した根拠を、</span>
                <span className="inline-block">資料と一字一句照らし合わせる</span>
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">
              研修担当の確認画面と同じ部品・同じ処理です。根拠の文の例を切り替えて、「採用」を押せるかどうかが変わるのを確かめられます。
            </p>
          </div>
          <div className="mt-8">{sample && sq ? <QuoteTryout sample={{ title: sample.title, material: sample.material, question: sq }} /> : <div className="h-96 rounded-[4px] border border-line bg-surface" />}</div>
        </section>

        {/* このアプリについて */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
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
            <p className="mt-2 border-t border-line pt-4 text-sm text-ink-soft">
              ソースコード・設計の説明・テストは GitHub で公開しています：
              <a
                className="ml-1 font-bold text-brand underline decoration-1 underline-offset-4 hover:text-brand-strong [overflow-wrap:anywhere]"
                href="https://github.com/aki-appdate/learncheck"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/aki-appdate/learncheck
              </a>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

function EntryRow({ title, sub, onClick, disabled, primary }: { title: string; sub: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <li className="border-b border-line">
      <button
        onClick={onClick}
        disabled={disabled}
        className="group flex w-full items-center gap-4 py-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className={cx("block text-[19px] font-bold leading-snug group-hover:underline group-hover:decoration-1 group-hover:underline-offset-[6px]", primary ? "text-brand-strong" : "text-ink")}>
            {title}
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">{sub}</span>
        </span>
        {/* 目次のリーダー線 */}
        <span className="hidden min-w-8 flex-1 self-center border-b-2 border-dotted border-line-strong sm:block" aria-hidden />
        <span
          className={cx(
            "ml-auto grid size-11 shrink-0 place-items-center rounded-[3px] transition-colors sm:ml-0",
            primary ? "bg-brand text-white group-hover:bg-brand-strong" : "border border-line-strong text-brand group-hover:border-brand",
          )}
          aria-hidden
        >
          <Icon name="arrow-right" className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </li>
  );
}
