"use client";

import { useId, useState } from "react";
import { MaterialExcerpt, MaterialFull } from "../MaterialExcerpt";
import { Badge, btn, cx, Modal } from "../ui";
import { CHOICE_MARKS, checkQuestion, hasError } from "@/lib/quality";
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, REVIEW_LABEL } from "@/lib/labels";
import type { Difficulty, GeneratedQuestion, TestQuestion } from "@/lib/types";

type Props = {
  index: number;
  question: TestQuestion;
  material: { title: string; body: string };
  disabled: boolean;
  onReview: (status: TestQuestion["review"]) => void;
  onEdit: (next: GeneratedQuestion) => void;
};

/** 1問分の確認カード。根拠の確認結果と機械チェックを目立たせ、「採用／直す／捨てる」を選ばせる */
export function QuestionReviewCard({ index, question: q, material, disabled, onReview, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const check = checkQuestion(q, material.body);
  const blocked = hasError(check.issues);
  const otherIssues = check.issues.filter((i) => i.code !== "quote");

  return (
    <article
      className={cx(
        "rounded-xl border bg-surface",
        q.review === "discarded" ? "border-line opacity-60" : !check.quote.found ? "border-bad" : q.review === "approved" ? "border-good" : "border-line",
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="font-bold">第{index + 1}問</span>
        <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
        {q.edited && <Badge tone="warn">人が修正</Badge>}
        <span className="ml-auto">
          <Badge tone={q.review === "approved" ? "good" : q.review === "discarded" ? "neutral" : "brand"}>
            {q.review === "pending" ? "未確認" : `確認済み：${REVIEW_LABEL[q.review]}`}
          </Badge>
        </span>
      </header>

      {editing ? (
        <QuestionEditor
          initial={q}
          material={material}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            onEdit(next);
            setEditing(false);
          }}
        />
      ) : (
        <div className="space-y-3 px-4 py-3">
          {q.review !== "discarded" &&
            (check.quote.found ? (
              <p className="text-xs font-medium text-good">✓ 根拠の文が資料の中にあることを確認しました</p>
            ) : (
              <div className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
                <p className="font-bold">⚠ 根拠を確認できません</p>
                <p className="mt-0.5">
                  AIが示した引用文が資料の中に見つかりません。資料にないことを作ってしまった可能性があります。「直す」で資料の文に差し替えるか、「捨てる」を選んでください。
                </p>
              </div>
            ))}
          {otherIssues.length > 0 && q.review !== "discarded" && (
            <ul className="space-y-1 text-sm">
              {otherIssues.map((i) => (
                <li key={i.code} className={cx("rounded-md px-2.5 py-1.5", i.level === "error" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
                  {i.level === "error" ? "⚠ " : "注意："}
                  {i.message}
                </li>
              ))}
            </ul>
          )}

          <p className="whitespace-pre-wrap font-medium leading-relaxed">{q.prompt}</p>
          <ol className="space-y-1.5">
            {q.choices.map((c, i) => (
              <li
                key={i}
                className={cx(
                  "flex gap-2 rounded-lg border px-3 py-1.5 text-sm",
                  i === q.answerIndex ? "border-good bg-good-soft" : "border-line",
                )}
              >
                <span className="font-bold text-ink-muted">{CHOICE_MARKS[i]}</span>
                <span className="flex-1">{c}</span>
                {i === q.answerIndex && <span className="shrink-0 text-xs font-bold text-good">正解</span>}
              </li>
            ))}
          </ol>
          <div className="text-sm">
            <p className="text-xs font-medium text-ink-muted">解説</p>
            <p className="mt-0.5 leading-relaxed text-ink-soft">{q.explanation || "（なし）"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-muted">根拠（資料の該当箇所）</p>
            <MaterialExcerpt body={material.body} quote={q.quote} materialTitle={material.title} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {q.review === "pending" ? (
              <>
                <button
                  className={btn.primary}
                  disabled={disabled || blocked}
                  title={blocked ? "直す必要のある点があるため、このままでは採用できません" : undefined}
                  onClick={() => onReview("approved")}
                >
                  採用
                </button>
                <button className={btn.secondary} disabled={disabled} onClick={() => setEditing(true)}>
                  直す
                </button>
                <button className={`${btn.secondary} text-bad`} disabled={disabled} onClick={() => onReview("discarded")}>
                  捨てる
                </button>
                {blocked && <span className="text-xs text-bad">このままでは採用できません。直すか捨ててください。</span>}
              </>
            ) : (
              <>
                {q.review === "approved" && (
                  <button className={btn.secondary} disabled={disabled} onClick={() => setEditing(true)}>
                    直す
                  </button>
                )}
                <button className={btn.ghost} disabled={disabled} onClick={() => onReview("pending")}>
                  確認を取り消す
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/** 問題を直すフォーム。入力のたびに機械チェックをやり直し、根拠が資料にあるかをその場で示す */
function QuestionEditor({
  initial,
  material,
  onSave,
  onCancel,
}: {
  initial: GeneratedQuestion;
  material: { title: string; body: string };
  onSave: (q: GeneratedQuestion) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<GeneratedQuestion>(() => structuredClone(initial));
  const [showMaterial, setShowMaterial] = useState(false);
  const radioName = useId();
  const check = checkQuestion(d, material.body);
  const blocked = hasError(check.issues);
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="space-y-3 px-4 py-3">
      <label className="block">
        <span className="text-xs font-medium text-ink-soft">問題文</span>
        <textarea className={`${field} mt-1 h-20`} value={d.prompt} maxLength={300} onChange={(e) => setD({ ...d, prompt: e.target.value })} />
      </label>
      <fieldset>
        <legend className="text-xs font-medium text-ink-soft">選択肢（正解に印をつける）</legend>
        <div className="mt-1 space-y-1.5">
          {d.choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <label className="flex shrink-0 items-center gap-1 text-sm">
                <input type="radio" name={radioName} className="accent-good" checked={d.answerIndex === i} onChange={() => setD({ ...d, answerIndex: i })} />
                <span className="w-4 font-bold text-ink-muted">{CHOICE_MARKS[i]}</span>
              </label>
              <input
                className={field}
                value={c}
                maxLength={100}
                aria-label={`選択肢${CHOICE_MARKS[i]}`}
                onChange={(e) => setD({ ...d, choices: d.choices.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-xs font-medium text-ink-soft">解説</span>
        <textarea className={`${field} mt-1 h-16`} value={d.explanation} maxLength={250} onChange={(e) => setD({ ...d, explanation: e.target.value })} />
      </label>
      <label className="block">
        <span className="flex items-center justify-between text-xs font-medium text-ink-soft">
          根拠となる資料の文（資料から一字一句そのまま写してください）
          <button type="button" className="text-brand underline" onClick={() => setShowMaterial(true)}>
            資料を開く
          </button>
        </span>
        <textarea className={`${field} mt-1 h-16`} value={d.quote} maxLength={200} onChange={(e) => setD({ ...d, quote: e.target.value })} />
      </label>
      <p className={cx("text-xs font-medium", check.quote.found ? "text-good" : "text-bad")}>
        {check.quote.found ? "✓ 資料の中にこの文があります" : "⚠ この文は資料の中に見つかりません"}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium text-ink-soft">難しさ</span>
        <select className="rounded-md border border-line bg-surface px-2 py-1 text-sm" value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value as Difficulty })}>
          {DIFFICULTY_ORDER.map((x) => (
            <option key={x} value={x}>
              {DIFFICULTY_LABEL[x]}
            </option>
          ))}
        </select>
      </label>
      {check.issues.filter((i) => i.code !== "quote").length > 0 && (
        <ul className="space-y-1 text-sm">
          {check.issues
            .filter((i) => i.code !== "quote")
            .map((i) => (
              <li key={i.code} className={i.level === "error" ? "text-bad" : "text-warn"}>
                {i.level === "error" ? "⚠ " : "注意："}
                {i.message}
              </li>
            ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button className={btn.primary} disabled={blocked} onClick={() => onSave({ ...d, prompt: d.prompt.trim(), choices: d.choices.map((c) => c.trim()), explanation: d.explanation.trim(), quote: d.quote.trim() })}>
          直して採用
        </button>
        <button className={btn.secondary} onClick={onCancel}>
          やめる
        </button>
      </div>

      {showMaterial && (
        <Modal title={`資料：${material.title}`} onClose={() => setShowMaterial(false)} wide>
          <p className="mb-2 text-xs text-ink-muted">根拠にしたい文を選んでコピーし、「根拠となる資料の文」に貼り付けてください。</p>
          <MaterialFull body={material.body} />
          <button className={`${btn.secondary} mt-4 w-full`} onClick={() => setShowMaterial(false)}>
            閉じる
          </button>
        </Modal>
      )}
    </div>
  );
}
