"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { TakeTest } from "@/components/learn/TakeTest";
import { RoleGate } from "@/components/RoleGate";
import { btn, cx, Icon } from "@/components/ui";
import { latestByLearner, scoreAttempt } from "@/lib/analytics";
import { formatDateJa } from "@/lib/dates";

export default function LearnPage() {
  return (
    <RoleGate role="learner">
      <Learn />
    </RoleGate>
  );
}

function Learn() {
  const { tests, attempts, me } = useApp();
  const [takingId, setTakingId] = useState<string | null>(null);
  // 対象の部署が決まっているテスト（例：自社商材は営業だけ）は、対象の人にだけ出す
  const published = tests
    .filter((t) => t.status === "published" && (!t.targetDepartments?.length || (me?.department != null && t.targetDepartments.includes(me.department))))
    .reverse();
  const taking = published.find((t) => t.id === takingId);

  if (taking) return <TakeTest key={`${taking.id}:${me?.id}`} test={taking} onExit={() => setTakingId(null)} />;

  const mine = attempts.filter((a) => a.learnerId === me?.id);

  const todo = published.filter((t) => !latestByLearner(mine, t.id)[0]).length;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">{me?.department}</p>
      <h1 className="mt-1 text-[26px] font-bold leading-snug">{me?.name}さんの確認テスト</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {published.length === 0
          ? "受けられるテストはまだありません。"
          : todo > 0
            ? `まだ受けていないテストが${todo}本あります。1問答えるごとに、正解と資料の該当箇所が表示されます。`
            : "対象のテストはすべて受け終わっています。何度でも受け直せます。"}
      </p>

      {published.length === 0 && (
        <p className="mt-6 border-y border-line py-8 text-center text-sm leading-relaxed text-ink-muted">
          あなたが対象の、公開されているテストはまだありません。
          <br />
          研修担当が公開すると、ここに出ます。
        </p>
      )}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {published.map((t) => {
          const latest = latestByLearner(mine, t.id)[0];
          const score = latest && scoreAttempt(t, latest.latest.answers);
          const minutes = Math.max(1, Math.round(t.questions.length * 0.7));
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4">
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex items-center gap-2">
                  {!latest && <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />}
                  <span className="font-bold leading-snug">{t.title}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {t.questions.length}問・約{minutes}分・資料「{t.material.title}」
                </p>
              </div>
              <div className="flex w-full items-center justify-between gap-4 sm:w-auto">
                {latest ? (
                  <p className="text-sm leading-tight">
                    <span className="text-xs text-ink-muted">前回 </span>
                    <b className={cx("text-xl", score!.score >= 70 ? "text-ink" : "text-warn")}>{score!.score}</b>
                    <span className="text-xs">点</span>
                    <span className="block text-xs text-ink-muted">
                      {formatDateJa(latest.latest.at)}・{latest.count}回受講
                    </span>
                  </p>
                ) : (
                  <span className="text-sm font-bold text-brand">まだ受けていません</span>
                )}
                <button className={cx(latest ? btn.secondary : btn.primary, "min-w-36")} onClick={() => setTakingId(t.id)}>
                  {latest ? "もう一度受ける" : "受ける"}
                  <Icon name="arrow-right" className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
