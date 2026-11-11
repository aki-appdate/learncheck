"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Header } from "@/components/Header";
import { btn } from "@/components/ui";

const FEATURES = [
  {
    title: "研修資料から、確認テストの案をAIが作る",
    body: "資料を選ぶか貼り付けて、問題の数と難しさを選ぶだけ。4択の問題・正解・解説に加えて、根拠となる資料の文をAIが示します。",
  },
  {
    title: "根拠の文が資料に本当にあるかを、プログラムで確かめる",
    body: "AIは資料にないことを作ってしまうことがあります。引用文が資料に見つからない問題は「根拠を確認できません」と目立たせ、そのままでは採用できません。",
  },
  {
    title: "人が1問ずつ確認してから公開",
    body: "研修担当が「採用／直す／捨てる」を選び、確認が済んだ問題だけで公開します。正解の位置の偏りや、選択肢の重複も自動で知らせます。",
  },
  {
    title: "受講者は、答えるとすぐ正解と資料の該当箇所が分かる",
    body: "間違えたその場で、解説と資料のどこに書いてあったかを確かめられます。結果は研修担当の画面に反映されます。",
  },
  {
    title: "どこが伝わっていないかを、問題と部署ごとに見る",
    body: "問題ごとの正答率、よく選ばれた誤答、部署別の弱点を集計。間違いが多い問題は、教え方か問題文のどちらかに課題があるサインです。",
  },
  {
    title: "フォロー研修の案を、根拠の問題つきで",
    body: "集計結果からAIがフォローの案を出します。挙げた根拠の問題が実在するかを確かめ、根拠のない提案は表示しません。",
  },
];

export default function Home() {
  const { people, setMe, ready } = useApp();
  const router = useRouter();
  const start = (id: string, to: string) => {
    setMe(id);
    router.push(to);
  };
  const trainer = people.find((p) => p.role === "trainer");
  const learner = people.find((p) => p.role === "learner");

  return (
    <>
    <Header />
    <main className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
      <p className="text-sm font-medium text-brand">研修の理解度チェック</p>
      <h1 className="mt-3 text-3xl font-bold leading-tight text-ink sm:text-4xl">
        研修資料から確認テストを作り、
        <br className="hidden sm:block" />
        伝わっていない所を見つける。
      </h1>
      <p className="mt-4 max-w-2xl text-ink-soft">
        LearnCheckは、社内研修の「やりっぱなし」を防ぐためのデモアプリです。AIが作った問題を人が確認してから公開し、受講結果から、教え直すべき所とフォロー研修の案を出します。
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button className={btn.primary} disabled={!ready || !trainer} onClick={() => trainer && start(trainer.id, "/admin")}>
          研修担当として試す
        </button>
        <button className={btn.secondary} disabled={!ready || !learner} onClick={() => learner && start(learner.id, "/learn")}>
          受講者として試す
        </button>
      </div>
      <p className="mt-3 text-xs text-ink-muted">ログインは不要です。会社・人名・研修資料などのデータはすべて架空で、いつでも初期化できます。</p>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-bold text-ink">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-bold text-ink">AIの扱いで気をつけたこと</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <li>・AIの出力はすべて「案」です。テストは研修担当が1問ずつ確認してから公開し、フォロー研修の案も最終判断は人が行います。</li>
          <li>・AIの返答は決まった形で受け取り、形が違えば使いません。問題の根拠（資料の引用文）は、資料の中に一字一句あるかをプログラムで照らし合わせます。</li>
          <li>・AIが使えないとき（未設定・無料枠の上限・通信エラー・返答の形の不正）は、資料の文から問題を作るルールベースの「見本の返答」に自動で切り替わります。画面右上の表示で、どちらが動いたか分かります。</li>
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-bold text-ink">このアプリについて</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink">作った人</dt>
            <dd className="mt-1 text-ink-soft">設計・仕様決め・動作確認は筆者、実装は Claude Code（AIコーディングツール）です。</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">使っている技術</dt>
            <dd className="mt-1 text-ink-soft">Next.js / React / TypeScript / Tailwind CSS / Firebase（Firestore・匿名認証・AI Logic）/ Gemini / Vitest</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">料金</dt>
            <dd className="mt-1 text-ink-soft">Firebaseの無料プランとGeminiの無料枠だけで動く構成です。課金が必要な機能は使っていません。</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">データの保存</dt>
            <dd className="mt-1 text-ink-soft">お試しの人ごとに分けて保存します。デモデータは毎回同じ計算で作り直し、保存するのは利用者が作ったテストと受講結果だけです。</dd>
          </div>
        </dl>
      </div>
    </main>
    </>
  );
}
