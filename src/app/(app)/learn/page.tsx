"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { TakeTest } from "@/components/learn/TakeTest";
import { RoleGate } from "@/components/RoleGate";
import { Badge, btn, Card } from "@/components/ui";
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">テストを受ける</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {me?.name}さん（{me?.department}）の確認テストです。1問答えるごとに、正解と資料の該当箇所が表示されます。
        </p>
      </div>
      {published.length === 0 && <p className="text-sm text-ink-muted">あなたが対象の、公開されているテストはまだありません。</p>}
      <div className="space-y-3">
        {published.map((t) => {
          const latest = latestByLearner(mine, t.id)[0];
          const score = latest && scoreAttempt(t, latest.latest.answers);
          return (
            <Card key={t.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{t.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    資料：{t.material.title}・{t.questions.length}問・約{Math.max(1, Math.round(t.questions.length * 0.7))}分
                  </p>
                </div>
                {latest ? (
                  <div className="text-right text-sm">
                    <Badge tone={score!.score >= 70 ? "good" : "warn"}>前回 {score!.score}点</Badge>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {formatDateJa(latest.latest.at)}・{latest.count}回受講
                    </p>
                  </div>
                ) : (
                  <Badge tone="brand">未受講</Badge>
                )}
                <button className={latest ? btn.secondary : btn.primary} onClick={() => setTakingId(t.id)}>
                  {latest ? "もう一度受ける" : "受ける"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
