"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { MaterialExcerpt } from "../MaterialExcerpt";
import { btn, Card, cx, RateBar } from "../ui";
import { scoreAttempt } from "@/lib/analytics";
import { newId } from "@/lib/dates";
import { CHOICE_MARKS } from "@/lib/quality";
import type { Attempt, Test } from "@/lib/types";

/** 1問ずつ答え、答えるたびに正誤・解説・資料の該当箇所を見せる。最後に結果を保存する */
export function TakeTest({ test, onExit }: { test: Test; onExit: () => void }) {
  const { me, saveAttempt } = useApp();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Attempt["answers"]>([]);
  const [finished, setFinished] = useState<Attempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = test.questions[index];
  const isLast = index === test.questions.length - 1;

  function answer() {
    if (picked === null) return;
    setAnswers((prev) => [...prev, { questionId: q.id, choice: picked }]);
    setRevealed(true);
  }

  async function finish(all: Attempt["answers"]) {
    if (!me) return;
    const attempt: Attempt = { id: newId("att"), testId: test.id, learnerId: me.id, answers: all, at: new Date().toISOString() };
    setSaving(true);
    setError(null);
    try {
      await saveAttempt(attempt);
      setFinished(attempt);
    } catch {
      setError("結果を保存できませんでした。通信状況を確認して、もう一度「結果を見る」を押してください。");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (isLast) {
      void finish(answers);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
    setRevealed(false);
    window.scrollTo({ top: 0 });
  }

  if (finished) return <Result test={test} attempt={finished} onExit={onExit} />;

  const correct = picked === q.answerIndex;
  const progress = (index + (revealed ? 1 : 0)) / test.questions.length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button className={btn.ghost} onClick={() => confirm("途中でやめると、ここまでの回答は保存されません。やめますか？") && onExit()}>
          ← やめる
        </button>
        <span className="text-sm tabular-nums text-ink-soft">
          第{index + 1}問 ／ 全{test.questions.length}問
        </span>
      </div>
      <RateBar value={progress} />

      <Card>
        <div className="space-y-4 px-5 py-5">
          <p className="text-xs text-ink-muted">{test.title}</p>
          <p className="whitespace-pre-wrap font-medium leading-relaxed">{q.prompt}</p>
          <div className="space-y-2" role="radiogroup" aria-label="選択肢">
            {q.choices.map((c, i) => {
              const isAnswer = i === q.answerIndex;
              const isPicked = i === picked;
              return (
                <button
                  key={i}
                  role="radio"
                  aria-checked={isPicked}
                  disabled={revealed}
                  onClick={() => setPicked(i)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                    revealed
                      ? isAnswer
                        ? "border-good bg-good-soft"
                        : isPicked
                          ? "border-bad bg-bad-soft"
                          : "border-line opacity-70"
                      : isPicked
                        ? "border-brand bg-brand-soft"
                        : "border-line hover:bg-canvas",
                  )}
                >
                  <span className="font-bold text-ink-muted">{CHOICE_MARKS[i]}</span>
                  <span className="flex-1">{c}</span>
                  {revealed && isAnswer && <span className="shrink-0 text-xs font-bold text-good">正解</span>}
                  {revealed && isPicked && !isAnswer && <span className="shrink-0 text-xs font-bold text-bad">あなたの回答</span>}
                </button>
              );
            })}
          </div>

          {!revealed ? (
            <button className={`${btn.primary} w-full`} disabled={picked === null} onClick={answer}>
              答える
            </button>
          ) : (
            <div className="space-y-3">
              <p className={cx("rounded-lg p-3 font-bold", correct ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
                {correct ? "○ 正解です" : `× 不正解です（正解は ${CHOICE_MARKS[q.answerIndex]}）`}
              </p>
              <div className="text-sm">
                <p className="text-xs font-medium text-ink-muted">解説</p>
                <p className="mt-0.5 leading-relaxed">{q.explanation}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-ink-muted">資料の該当箇所</p>
                <MaterialExcerpt body={test.material.body} quote={q.quote} materialTitle={test.material.title} />
              </div>
              {error && <p className="rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p>}
              <button className={`${btn.primary} w-full`} onClick={next} disabled={saving}>
                {isLast ? (saving ? "保存しています…" : "結果を見る") : "次の問題へ →"}
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Result({ test, attempt, onExit }: { test: Test; attempt: Attempt; onExit: () => void }) {
  const s = scoreAttempt(test, attempt.answers);
  const byId = new Map(attempt.answers.map((a) => [a.questionId, a.choice]));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-ink-soft">{test.title}</p>
          <p className="mt-2 text-4xl font-bold tabular-nums">
            {s.score}
            <span className="text-lg">点</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {s.total}問中 {s.correct}問 正解
          </p>
          <p className="mt-3 text-sm">
            {s.score === 100 ? "全問正解です。この調子で仕事に生かしましょう。" : s.score >= 70 ? "よくできました。間違えた問題は、資料の該当箇所を読み直しておきましょう。" : "間違えた問題の資料を読み直して、もう一度挑戦してみましょう。"}
          </p>
          <p className="mt-1 text-xs text-ink-muted">結果を保存しました。研修担当の結果画面に反映されます。</p>
        </div>
      </Card>
      <Card>
        <ul className="divide-y divide-line">
          {test.questions.map((q, i) => {
            const ok = byId.get(q.id) === q.answerIndex;
            return (
              <li key={q.id} className="flex gap-3 px-5 py-3 text-sm">
                <span className={cx("font-bold", ok ? "text-good" : "text-bad")}>{ok ? "○" : "×"}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs text-ink-muted">第{i + 1}問</span>
                  <span className="block truncate">{q.prompt.split("\n").at(-1)}</span>
                  {!ok && (
                    <span className="block text-xs text-ink-soft">
                      正解：{CHOICE_MARKS[q.answerIndex]}　{q.choices[q.answerIndex]}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <button className={`${btn.secondary} w-full`} onClick={onExit}>
        テストの一覧に戻る
      </button>
    </div>
  );
}
