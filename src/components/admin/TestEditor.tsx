"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { MaterialExcerpt } from "../MaterialExcerpt";
import { AiSourceBadge, Badge, btn, Card, cx, Icon, QNo } from "../ui";
import { QuestionReviewCard } from "./QuestionReviewCard";
import { generateQuiz } from "@/lib/ai";
import { formatDateTimeJa } from "@/lib/dates";
import { CHOICE_MARKS, checkQuestion, checkTest, hasError, isChanged, publishBlockers } from "@/lib/quality";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { SEED_TEST_IDS } from "@/lib/seed";
import type { GeneratedQuestion, Test, TestQuestion } from "@/lib/types";


/** 下書きの確認・公開。公開済みなら読み取り専用で表示する */
export function TestEditor({ test, onDeleted }: { test: Test; onDeleted: () => void }) {
  return test.status === "draft" ? <DraftEditor test={test} onDeleted={onDeleted} /> : <PublishedView test={test} />;
}

function DraftEditor({ test, onDeleted }: { test: Test; onDeleted: () => void }) {
  const { saveTest, deleteTest } = useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(test.title);
  const [regenerating, setRegenerating] = useState(false);

  async function update(next: Test) {
    setSaving(true);
    setError(null);
    try {
      await saveTest(next);
    } catch {
      setError("保存できませんでした。通信状況を確認して、もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  const patchQuestion = (id: string, patch: Partial<TestQuestion>) =>
    update({ ...test, title: title.trim() || test.title, questions: test.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  const counts = {
    approved: test.questions.filter((q) => q.review === "approved").length,
    discarded: test.questions.filter((q) => q.review === "discarded").length,
    pending: test.questions.filter((q) => q.review === "pending").length,
  };
  const testIssues = checkTest(test.questions);
  const blockers = publishBlockers(test.questions, test.material.body);

  async function publish() {
    if (!confirm(`採用した${counts.approved}問で公開します。公開したあとは問題を変更できません。よろしいですか？`)) return;
    await update({
      ...test,
      title: title.trim() || test.title,
      status: "published",
      questions: test.questions.filter((q) => q.review === "approved"),
      publishedAt: new Date().toISOString(),
    });
  }

  const canDelete = !SEED_TEST_IDS.includes(test.id);
  const gen = test.generation;

  /** 同じ資料・問題数・難しさで、別の問題の案を作り直す（見本の返答は作り直し番号で別の文・語句を選ぶ） */
  async function regenerate() {
    if (!gen) return;
    if (!confirm("今の問題の案と確認の状態を捨てて、別の問題の案を作り直します。よろしいですか？")) return;
    setRegenerating(true);
    setError(null);
    try {
      const variant = gen.variant + 1;
      const r = await generateQuiz({ title: test.material.title, body: test.material.body, count: gen.count, difficulty: gen.difficulty, variant });
      if (r.value.length === 0) {
        setError("この資料からは、別の問題を作れませんでした。");
        return;
      }
      await update({
        ...test,
        title: title.trim() || test.title,
        questions: r.value.map((q, i) => ({ ...q, id: `${test.id}-v${variant}-q${String(i + 1).padStart(2, "0")}`, review: "pending", edited: false })),
        aiSource: r.source,
        note:
          [
            r.note,
            r.value.length < gen.count ? `資料の長さの都合で、${r.value.length}問だけ作りました。` : null,
            // 短い資料では、問題にできる文が少なく、作り直しても同じ文からの問題が多くなる（隠さずに知らせる）
            sameSource(test.questions, r.value) * 2 >= r.value.length
              ? `資料が短いため、${r.value.length}問中${sameSource(test.questions, r.value)}問は、前の案と同じ文から作った問題です。`
              : null,
          ]
            .filter(Boolean)
            .join(" ") || null,
        generation: { ...gen, variant },
      });
    } finally {
      setRegenerating(false);
    }
  }

  const blockedIds = new Set(
    test.questions.filter((q) => q.review !== "discarded" && hasError(checkQuestion(q, test.material.body).issues)).map((q) => q.id),
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
            <Badge tone="warn">下書き・未公開</Badge>
            {test.aiSource && <AiSourceBadge source={test.aiSource} />}
            <span>作成 {formatDateTimeJa(test.createdAt)}</span>
            <span aria-live="polite">{saving ? "保存しています…" : ""}</span>
          </div>
          <label className="block">
            <span className="sr-only">テストの名前</span>
            <input
              className="w-full rounded-[3px] border border-transparent bg-transparent px-1 py-0.5 -mx-1 text-[22px] font-bold leading-snug hover:border-line focus:border-line-strong focus:bg-surface"
              value={title}
              maxLength={80}
              title="押すと名前を変えられます"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== test.title && update({ ...test, title: title.trim() })}
            />
          </label>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-muted">元の資料</dt>
              <dd>{test.material.title}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">受講の対象</dt>
              <dd>{test.targetDepartments?.length ? test.targetDepartments.join("・") : "全員"}</dd>
            </div>
          </dl>
          {test.note && <p className="border-l-[3px] border-brand bg-brand-soft px-3 py-2 text-sm leading-relaxed text-brand-strong">{test.note}</p>}
          {gen && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
              <button className={btn.secondary} disabled={saving || regenerating} onClick={regenerate}>
                <Icon name="refresh" className="size-4" />
                {regenerating ? "作り直しています…" : "別の問題で作り直す"}
              </button>
              <span className="text-xs leading-relaxed text-ink-muted">同じ資料・問題数・難しさで、別の箇所や聞き方の案を作ります（今の確認の状態は消えます）。</span>
            </div>
          )}
        </div>
      </Card>

      <div className="z-10 border border-line-strong bg-surface/95 px-4 py-3 backdrop-blur lg:sticky lg:top-[5.4rem] rounded-[4px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1 basis-60">
            <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="font-bold">確認の進み具合</span>
              <span className="text-ink-soft">
                採用 <b className="text-good">{counts.approved}</b>・捨てる {counts.discarded}・未確認 <b className={counts.pending ? "text-ink" : undefined}>{counts.pending}</b>
                <span className="text-ink-muted">／全{test.questions.length}問</span>
              </span>
            </p>
            <ol className="mt-2 flex gap-[2px]" aria-label="問題ごとの確認の状態">
              {test.questions.map((q, i) => {
                const blocked = blockedIds.has(q.id);
                const state = q.review === "approved" ? "採用" : q.review === "discarded" ? "捨てる" : blocked ? "要対応" : "未確認";
                return (
                  <li key={q.id} className="min-w-0 flex-1">
                    <a
                      href={`#${q.id}`}
                      title={`問${i + 1}：${state}`}
                      aria-label={`問${i + 1}：${state}`}
                      className={cx(
                        "block h-2",
                        q.review === "approved" ? "bg-good" : q.review === "discarded" ? "bg-chart-rest" : blocked ? "bg-bad" : "bg-line",
                        i === 0 && "rounded-l-full",
                        i === test.questions.length - 1 && "rounded-r-full",
                      )}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canDelete && (
              <button
                className={btn.ghost}
                disabled={saving}
                onClick={async () => {
                  if (!confirm("この下書きを削除しますか？")) return;
                  await deleteTest(test.id);
                  onDeleted();
                }}
              >
                下書きを削除
              </button>
            )}
            <button className={btn.primary} disabled={saving || regenerating || blockers.length > 0} onClick={publish}>
              {blockers.length > 0 && <Icon name="lock" className="size-4" />}
              確認した{counts.approved}問で公開する
            </button>
          </div>
        </div>
        {blockers.length > 0 && (
          <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-ink-soft">
            <span className="font-bold text-ink">公開するには：</span>
            {blockers.join("／")}
          </p>
        )}
      </div>

      {error && (
        <p className="flex gap-2 border-l-4 border-bad bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">
          <Icon name="alert" className="mt-0.5" />
          {error}
        </p>
      )}
      {testIssues.map((i) => (
        <p key={i.message} className="flex gap-2 border-l-4 border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
          <Icon name="alert" className="mt-0.5" />
          <span>
            <b>注意</b>　{i.message}
          </span>
        </p>
      ))}

      <div className="space-y-5">
        {test.questions.map((q, i) => (
          <QuestionReviewCard
            key={q.id}
            index={i}
            question={q}
            material={test.material}
            disabled={saving}
            onReview={(review) => patchQuestion(q.id, { review })}
            onEdit={(next: GeneratedQuestion) => patchQuestion(q.id, { ...next, edited: q.edited || isChanged(q, next), review: "approved" })}
          />
        ))}
      </div>
    </div>
  );
}

function PublishedView({ test }: { test: Test }) {
  const { attempts } = useApp();
  const taken = new Set(attempts.filter((a) => a.testId === test.id).map((a) => a.learnerId)).size;
  const edited = test.questions.filter((q) => q.edited).length;
  return (
    <Card>
      <div className="space-y-4 border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="good">
            <Icon name="lock" className="size-3.5" />
            公開中・変更できません
          </Badge>
        </div>
        <h2 className="text-[22px] font-bold leading-snug">{test.title}</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="label">元の資料</dt>
            <dd className="mt-0.5">{test.material.title}</dd>
          </div>
          <div>
            <dt className="label">問題数</dt>
            <dd className="mt-0.5">
              {test.questions.length}問{edited > 0 && <span className="block text-xs text-ink-muted">うち人が修正 {edited}問</span>}
            </dd>
          </div>
          <div>
            <dt className="label">公開日</dt>
            <dd className="mt-0.5">{test.publishedAt && formatDateTimeJa(test.publishedAt)}</dd>
          </div>
          <div>
            <dt className="label">受講済み</dt>
            <dd className="mt-0.5">
              {taken}人{test.targetDepartments?.length ? <span className="block text-xs text-ink-muted">対象：{test.targetDepartments.join("・")}</span> : null}
            </dd>
          </div>
        </dl>
        <Link href="/results" className={btn.secondary}>
          <Icon name="chart" className="size-4" />
          このテストの結果を見る
        </Link>
      </div>
      <ol className="divide-y divide-line">
        {test.questions.map((q, i) => (
          <li key={q.id} className="flex gap-4 px-5 py-4 sm:px-6">
            <QNo n={i + 1} className="w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
                {q.edited && (
                  <Badge tone="warn">
                    <Icon name="pen" className="size-3" />
                    人が修正
                  </Badge>
                )}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap font-bold leading-relaxed">{q.prompt}</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-good">
                <Icon name="check" className="mt-0.5 size-4" />
                <span>
                  正解 {CHOICE_MARKS[q.answerIndex]}　{q.choices[q.answerIndex]}
                </span>
              </p>
              <details className="group mt-2 text-sm">
                <summary className="cursor-pointer text-xs font-bold text-brand underline decoration-1 underline-offset-4">選択肢と根拠を見る</summary>
                <ol className="mt-2 space-y-1 text-ink-soft">
                  {q.choices.map((c, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="w-4 font-bold">{CHOICE_MARKS[j]}</span>
                      {c}
                    </li>
                  ))}
                </ol>
                <MaterialExcerpt className="mt-3" body={test.material.body} quote={q.quote} materialTitle={test.material.title} showCheck />
              </details>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** 作り直した問題のうち、前の案と同じ根拠の文から作った問題の数 */
function sameSource(before: { quote: string }[], after: { quote: string }[]): number {
  const old = new Set(before.map((q) => q.quote));
  return after.filter((q) => old.has(q.quote)).length;
}
