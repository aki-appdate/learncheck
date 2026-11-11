"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { MaterialExcerpt } from "../MaterialExcerpt";
import { btn, ChoiceMark, cx, Icon, QNo } from "../ui";
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

  const resultRef = useRef<HTMLDivElement>(null);

  // 答えたら、正誤・解説・根拠が見える位置まで送る（スマホでは選択肢の下に隠れて見えないため）
  useEffect(() => {
    if (!revealed) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [revealed, index]);

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
  const results = answers.map((a) => test.questions.find((x) => x.id === a.questionId)?.answerIndex === a.choice);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <button className={btn.ghost} onClick={() => confirm("途中でやめると、ここまでの回答は保存されません。やめますか？") && onExit()}>
          <Icon name="arrow-left" className="size-4" />
          やめる
        </button>
        <p className="min-w-0 truncate text-xs text-ink-muted">{test.title}</p>
      </div>

      {/* 進み具合：答えた問題は○×を色と記号で */}
      <ol className="mt-3 flex gap-1" aria-label={`全${test.questions.length}問中 第${index + 1}問`}>
        {test.questions.map((x, i) => {
          const r = results[i];
          const now = i === index;
          return (
            <li
              key={x.id}
              className={cx(
                "grid h-6 min-w-0 flex-1 place-items-center rounded-[2px] text-[11px] font-bold",
                r === true && "bg-good text-white",
                r === false && "bg-bad text-white",
                r === undefined && (now ? "border-2 border-ink text-ink" : "bg-paper text-ink-muted"),
              )}
              aria-label={`第${i + 1}問：${r === true ? "正解" : r === false ? "不正解" : now ? "いまの問題" : "まだ"}`}
            >
              {r === true ? "○" : r === false ? "×" : i + 1}
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        <p className="flex items-baseline gap-2">
          <QNo n={index + 1} />
          <span className="text-xs text-ink-muted">／{test.questions.length}</span>
        </p>
        <p className="mt-2 whitespace-pre-wrap text-[17px] font-bold leading-[1.75] sm:text-lg">{q.prompt}</p>

        <div className="mt-5 space-y-2.5" role="radiogroup" aria-label="選択肢">
          {q.choices.map((c, i) => {
            const isAnswer = i === q.answerIndex;
            const isPicked = i === picked;
            const tone = revealed ? (isAnswer ? "good" : isPicked ? "bad" : "plain") : isPicked ? "picked" : "plain";
            return (
              <button
                key={i}
                role="radio"
                aria-checked={isPicked}
                disabled={revealed}
                onClick={() => setPicked(i)}
                className={cx(
                  "flex min-h-[3.5rem] w-full items-center gap-3 rounded-[4px] border bg-surface px-3.5 py-3 text-left text-base leading-snug transition-colors",
                  revealed
                    ? isAnswer
                      ? "border-2 border-good bg-good-soft font-bold"
                      : isPicked
                        ? "border-2 border-bad bg-bad-soft"
                        : "border-line text-ink-muted"
                    : isPicked
                      ? "border-2 border-ink font-bold"
                      : "border-line-strong hover:border-ink-soft",
                )}
              >
                <ChoiceMark mark={CHOICE_MARKS[i]} tone={tone} />
                <span className="flex-1">{c}</span>
                {revealed && isAnswer && <span className="shrink-0 text-xs font-bold text-good">○ 正解</span>}
                {revealed && isPicked && !isAnswer && <span className="shrink-0 text-xs font-bold text-bad">× あなたの回答</span>}
              </button>
            );
          })}
        </div>

        {!revealed ? (
          <div className="sticky bottom-0 -mx-4 mt-5 bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
            <button className={`${btn.primary} min-h-12 w-full text-base`} disabled={picked === null} onClick={answer}>
              {picked === null ? "選択肢を1つ選んでください" : "答える"}
            </button>
          </div>
        ) : (
          <div ref={resultRef} className="mt-6 scroll-mt-4 space-y-4 lg:scroll-mt-20" aria-live="polite">
            <p className={cx("flex items-center gap-2 border-l-4 px-4 py-3 text-lg font-bold", correct ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad")}>
              <span className="text-2xl leading-none" aria-hidden>
                {correct ? "○" : "×"}
              </span>
              {correct ? "正解です" : `不正解です。正解は ${CHOICE_MARKS[q.answerIndex]}`}
            </p>
            <div>
              <p className="label">解説</p>
              <p className="mt-1 leading-[1.85]">{q.explanation}</p>
            </div>
            <div>
              <p className="label mb-1.5">資料のここに書いてあります</p>
              <MaterialExcerpt body={test.material.body} quote={q.quote} materialTitle={test.material.title} />
            </div>
            {error && (
              <p className="flex gap-2 border-l-4 border-bad bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">
                <Icon name="alert" className="mt-0.5" />
                {error}
              </p>
            )}
            <div className="sticky bottom-0 -mx-4 bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
              <button className={`${btn.primary} min-h-12 w-full text-base`} onClick={next} disabled={saving}>
                {isLast ? (saving ? "保存しています…" : "結果を見る") : "次の問題へ"}
                {!saving && <Icon name="arrow-right" className="size-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Result({ test, attempt, onExit }: { test: Test; attempt: Attempt; onExit: () => void }) {
  const s = scoreAttempt(test, attempt.answers);
  const byId = new Map(attempt.answers.map((a) => [a.questionId, a.choice]));
  const wrong = s.total - s.correct;
  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">結果</p>
      <p className="mt-1 text-sm text-ink-soft">{test.title}</p>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line pb-6">
        <p className="font-bold leading-none">
          <span className="text-[64px] tracking-tight">{s.score}</span>
          <span className="ml-1 text-xl">点</span>
        </p>
        <p className="pb-2 text-sm text-ink-soft">
          {s.total}問中 <b className="text-ink">{s.correct}問</b> 正解
        </p>
      </div>
      <p className="mt-4 leading-relaxed">
        {s.score === 100
          ? "全問正解です。この調子で仕事に生かしましょう。"
          : s.score >= 70
            ? `よくできました。間違えた${wrong}問は、資料の該当箇所を読み直しておきましょう。`
            : "間違えた問題の資料を読み直して、もう一度挑戦してみましょう。"}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
        <Icon name="check" className="size-3.5 text-good" />
        結果を保存しました。研修担当の結果画面に反映されます。
      </p>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {test.questions.map((q, i) => {
          const ok = byId.get(q.id) === q.answerIndex;
          return (
            <li key={q.id} className="flex gap-3 py-3 text-sm">
              <span className={cx("grid size-6 shrink-0 place-items-center rounded-[2px] text-xs font-bold text-white", ok ? "bg-good" : "bg-bad")} aria-label={ok ? "正解" : "不正解"}>
                {ok ? "○" : "×"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-xs text-ink-muted">第{i + 1}問</span>
                <span className="block leading-snug">{q.prompt.split("\n").at(-1)}</span>
                {!ok && (
                  <span className="mt-1 block text-xs font-bold text-good">
                    正解 {CHOICE_MARKS[q.answerIndex]}　{q.choices[q.answerIndex]}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <button className={`${btn.secondary} mt-6 w-full`} onClick={onExit}>
        テストの一覧に戻る
      </button>
    </div>
  );
}
