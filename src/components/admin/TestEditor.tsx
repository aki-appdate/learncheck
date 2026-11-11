"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { MaterialExcerpt } from "../MaterialExcerpt";
import { AiSourceBadge, Badge, btn, Card, CardTitle, cx } from "../ui";
import { QuestionReviewCard } from "./QuestionReviewCard";
import { generateQuiz } from "@/lib/ai";
import { formatDateTimeJa } from "@/lib/dates";
import { CHOICE_MARKS, checkTest, isChanged, publishBlockers } from "@/lib/quality";
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
        note: [r.note, r.value.length < gen.count ? `資料の長さの都合で、${r.value.length}問だけ作りました。` : null].filter(Boolean).join(" ") || null,
        generation: { ...gen, variant },
      });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">下書き</Badge>
            {test.aiSource && <AiSourceBadge source={test.aiSource} />}
            <span className="text-xs text-ink-muted">作成 {formatDateTimeJa(test.createdAt)}</span>
            {saving && <span className="text-xs text-ink-muted">保存しています…</span>}
          </div>
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">テストの名前</span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-bold"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== test.title && update({ ...test, title: title.trim() })}
            />
          </label>
          <p className="text-sm text-ink-soft">
            元の資料：{test.material.title}
            {test.targetDepartments?.length ? `・受講の対象：${test.targetDepartments.join("・")}` : "・受講の対象：全員"}
          </p>
          {test.note && <p className="rounded-lg bg-brand-soft p-3 text-sm text-brand-strong">{test.note}</p>}
          {gen && (
            <div className="flex flex-wrap items-center gap-2">
              <button className={btn.secondary} disabled={saving || regenerating} onClick={regenerate}>
                {regenerating ? "作り直しています…" : "別の問題で作り直す"}
              </button>
              <span className="text-xs text-ink-muted">同じ資料・問題数・難しさで、別の箇所や聞き方の案を作ります（今の確認の状態は消えます）。</span>
            </div>
          )}
        </div>
      </Card>

      <div className="z-10 rounded-xl sm:sticky sm:top-[4.75rem] border border-line bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span>
              採用 <b className="tabular-nums text-good">{counts.approved}</b>
            </span>
            <span>
              捨てる <b className="tabular-nums">{counts.discarded}</b>
            </span>
            <span>
              未確認 <b className={cx("tabular-nums", counts.pending > 0 && "text-brand")}>{counts.pending}</b>
            </span>
            <span className="text-ink-muted">／ 全{test.questions.length}問</span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
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
              確認した問題で公開する
            </button>
          </div>
        </div>
        {blockers.length > 0 && <p className="mt-1.5 text-xs text-ink-muted">公開するには：{blockers.join("／")}</p>}
      </div>

      {error && <p className="rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p>}
      {testIssues.map((i) => (
        <p key={i.message} className="rounded-lg bg-warn-soft p-3 text-sm text-warn">
          注意：{i.message}
        </p>
      ))}

      <div className="space-y-4">
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
      <CardTitle aside={<Badge tone="good">公開中</Badge>}>{test.title}</CardTitle>
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-muted">元の資料</dt>
            <dd className="mt-0.5">{test.material.title}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">問題数</dt>
            <dd className="mt-0.5">
              {test.questions.length}問{edited > 0 && <span className="text-ink-muted">（うち人が修正 {edited}問）</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">公開日</dt>
            <dd className="mt-0.5">{test.publishedAt && formatDateTimeJa(test.publishedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">受講済み</dt>
            <dd className="mt-0.5">
              {taken}人{test.targetDepartments?.length ? <span className="text-ink-muted">（対象：{test.targetDepartments.join("・")}）</span> : null}
            </dd>
          </div>
        </dl>
        <Link href="/results" className={btn.secondary}>
          結果を見る →
        </Link>
        <ol className="space-y-3">
          {test.questions.map((q, i) => (
            <li key={q.id} className="rounded-lg border border-line p-3">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <b>第{i + 1}問</b>
                <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
                {q.edited && <Badge tone="warn">人が修正</Badge>}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium">{q.prompt}</p>
              <p className="mt-1 text-sm text-good">
                正解：{CHOICE_MARKS[q.answerIndex]}　{q.choices[q.answerIndex]}
              </p>
              <details className="mt-1.5 text-sm">
                <summary className="cursor-pointer text-xs text-brand">選択肢と根拠を見る</summary>
                <ol className="mt-2 space-y-1 text-ink-soft">
                  {q.choices.map((c, j) => (
                    <li key={j}>
                      {CHOICE_MARKS[j]}　{c}
                    </li>
                  ))}
                </ol>
                <div className="mt-2">
                  <MaterialExcerpt body={test.material.body} quote={q.quote} materialTitle={test.material.title} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
