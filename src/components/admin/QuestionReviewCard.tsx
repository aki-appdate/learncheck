"use client";

import { useId, useState } from "react";
import { MaterialExcerpt, MaterialFull } from "../MaterialExcerpt";
import { Badge, btn, ChoiceMark, cx, Icon, Modal, QNo, Seal } from "../ui";
import { CHOICE_MARKS, checkQuestion, hasError, staleExplanationQuotes } from "@/lib/quality";
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER } from "@/lib/labels";
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

  const discarded = q.review === "discarded";
  const approved = q.review === "approved";

  return (
    <article
      id={q.id}
      className={cx(
        "scroll-mt-48 rounded-[4px] border border-l-[4px] bg-surface",
        discarded ? "border-line border-l-chart-rest bg-canvas" : blocked ? "border-line border-l-bad" : approved ? "border-line border-l-good" : "border-line border-l-line-strong",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5 sm:px-5">
        <QNo n={index + 1} className={discarded ? "text-ink-muted" : undefined} />
        <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
        {q.edited ? (
          <Badge tone="warn">
            <Icon name="pen" className="size-3" />
            人が修正
          </Badge>
        ) : (
          <span className="text-xs text-ink-muted">AIの案のまま</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs font-bold">
          {approved ? (
            <span className="text-good">確認済み</span>
          ) : discarded ? (
            <span className="text-ink-muted">捨てる（テストに入れない）</span>
          ) : blocked ? (
            <span className="inline-flex items-center gap-1 text-bad">
              <Icon name="alert" className="size-4" />
              直す必要あり
            </span>
          ) : (
            <span className="text-ink-soft">未確認</span>
          )}
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
        <>
          <div className={cx("grid gap-x-6 gap-y-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_22rem]", discarded && "opacity-60")}>
            {/* 本文：問題・選択肢・解説 */}
            <div className="min-w-0 space-y-3">
              <p className="whitespace-pre-wrap text-[16px] font-bold leading-relaxed">{q.prompt}</p>
              <ol className="space-y-1.5">
                {q.choices.map((c, i) => {
                  const ok = i === q.answerIndex;
                  return (
                    <li key={i} className={cx("flex items-start gap-2.5 rounded-[3px] border px-2.5 py-2 text-sm", ok ? "border-good bg-good-soft" : "border-line")}>
                      <ChoiceMark mark={CHOICE_MARKS[i]} tone={ok ? "good" : "plain"} />
                      <span className={cx("flex-1 pt-0.5", ok && "font-bold")}>{c || <span className="text-bad">（空欄）</span>}</span>
                      {ok && <span className="shrink-0 pt-0.5 text-xs font-bold text-good">正解</span>}
                    </li>
                  );
                })}
              </ol>
              <div className="text-sm">
                <p className="label">解説</p>
                <p className="mt-0.5 leading-relaxed text-ink-soft">{q.explanation || "（なし）"}</p>
              </div>
            </div>

            {/* 余白：根拠と自動チェック */}
            <aside className="min-w-0 space-y-2.5 xl:border-l xl:border-line xl:pl-6" aria-label="根拠と自動チェック">
              <p className="label">根拠（資料の該当箇所）</p>
              <MaterialExcerpt body={material.body} quote={q.quote} materialTitle={material.title} showCheck />
              {otherIssues.length > 0 && !discarded && (
                <ul className="space-y-1.5 text-sm">
                  {otherIssues.map((i) => (
                    <li
                      key={i.code}
                      className={cx("flex gap-1.5 border-l-[3px] px-2.5 py-1.5 leading-relaxed", i.level === "error" ? "border-bad bg-bad-soft text-bad" : "border-warn bg-warn-soft text-warn")}
                    >
                      <Icon name="alert" className="mt-0.5 size-4" />
                      <span>
                        <b>{i.level === "error" ? "直す必要あり" : "注意"}</b>　{i.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!check.quote.found && !discarded && (
                <p className="text-xs leading-relaxed text-bad">「直す」で資料の文に差し替えるか、「捨てる」を選んでください。</p>
              )}
            </aside>
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas px-4 py-3 sm:px-5">
            {q.review === "pending" ? (
              <>
                <button
                  className={btn.primary}
                  disabled={disabled || blocked}
                  title={blocked ? "直す必要のある点があるため、このままでは採用できません" : undefined}
                  onClick={() => onReview("approved")}
                >
                  <Icon name="check" className="size-4" />
                  採用
                </button>
                <button className={btn.secondary} disabled={disabled} onClick={() => setEditing(true)}>
                  <Icon name="pen" className="size-4" />
                  直す
                </button>
                <button className={btn.danger} disabled={disabled} onClick={() => onReview("discarded")}>
                  捨てる
                </button>
                {blocked && <span className="basis-full text-xs text-bad sm:basis-auto">このままでは採用できません。直すか捨ててください。</span>}
              </>
            ) : (
              <>
                {approved && <Seal size="sm" className="mr-1" />}
                <span className="mr-auto text-sm text-ink-soft">{approved ? "この問題をテストに入れます" : "この問題はテストに入れません"}</span>
                {approved && (
                  <button className={btn.secondary} disabled={disabled} onClick={() => setEditing(true)}>
                    <Icon name="pen" className="size-4" />
                    直す
                  </button>
                )}
                <button className={btn.ghost} disabled={disabled} onClick={() => onReview("pending")}>
                  <Icon name="undo" className="size-4" />
                  確認を取り消す
                </button>
              </>
            )}
          </footer>
        </>
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
  // 選択肢を書き換えたのに、解説が直す前の文言を引いたままになっていないか
  const stale = staleExplanationQuotes(initial, d);
  const field = "w-full rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed";

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      <p className="border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">直している途中です。「直して採用」を押すと、書き換えた問題に「人が修正」の印が残ります。</p>
      <label className="block">
        <span className="label">問題文</span>
        <textarea className={`${field} mt-1 h-20`} value={d.prompt} maxLength={300} onChange={(e) => setD({ ...d, prompt: e.target.value })} />
      </label>
      <fieldset>
        <legend className="label">選択肢（正解の丸を選ぶ）</legend>
        <div className="mt-1 space-y-1.5">
          {d.choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <label className="flex shrink-0 items-center gap-1 text-sm">
                <input type="radio" name={radioName} className="size-4 accent-good" checked={d.answerIndex === i} onChange={() => setD({ ...d, answerIndex: i })} />
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
        <span className="label">解説</span>
        <textarea className={`${field} mt-1 h-16`} value={d.explanation} maxLength={250} onChange={(e) => setD({ ...d, explanation: e.target.value })} />
      </label>
      {stale.length > 0 && (
        <p className="-mt-2 flex gap-1.5 text-xs font-bold text-warn" role="status">
          <Icon name="alert" className="mt-px size-4 shrink-0" />
          <span>解説が、直す前の選択肢「{stale[0]}」を引いたままです。選択肢に合わせて解説も直してください。</span>
        </p>
      )}
      <label className="block">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">根拠となる資料の文（一字一句そのまま写す）</span>
          <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-brand underline decoration-1 underline-offset-4" onClick={() => setShowMaterial(true)}>
            <Icon name="doc" className="size-3.5" />
            資料を開く
          </button>
        </span>
        <textarea className={`${field} mt-1 h-20 bg-paper`} value={d.quote} maxLength={200} onChange={(e) => setD({ ...d, quote: e.target.value })} />
      </label>
      <p className={cx("-mt-2 flex items-center gap-1 text-xs font-bold", check.quote.found ? "text-good" : "text-bad")} aria-live="polite">
        <Icon name={check.quote.found ? "check" : "alert"} className="size-4" />
        {check.quote.found ? "資料の中にこの文があります" : "この文は資料の中に見つかりません"}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <span className="label">難しさ</span>
        <select className="rounded-[3px] border border-line-strong bg-surface px-2 py-1 text-sm" value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value as Difficulty })}>
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
              <li key={i.code} className={cx("flex gap-1.5", i.level === "error" ? "text-bad" : "text-warn")}>
                <Icon name="alert" className="mt-0.5 size-4" />
                <span>
                  <b>{i.level === "error" ? "直す必要あり" : "注意"}</b>　{i.message}
                </span>
              </li>
            ))}
        </ul>
      )}
      <div className="-mx-4 -mb-4 flex flex-wrap gap-2 border-t border-line bg-canvas px-4 py-3 sm:-mx-5 sm:px-5">
        <button className={btn.primary} disabled={blocked} onClick={() => onSave({ ...d, prompt: d.prompt.trim(), choices: d.choices.map((c) => c.trim()), explanation: d.explanation.trim(), quote: d.quote.trim() })}>
          直して採用
        </button>
        <button className={btn.secondary} onClick={onCancel}>
          やめる
        </button>
        {blocked && <span className="self-center text-xs text-bad">赤い印の点を直すと「直して採用」を押せます。</span>}
      </div>

      {showMaterial && (
        <Modal title={`資料：${material.title}`} onClose={() => setShowMaterial(false)} wide>
          <p className="mb-3 text-xs text-ink-muted">根拠にしたい文を選んでコピーし、「根拠となる資料の文」に貼り付けてください。</p>
          <MaterialFull body={material.body} />
          <button className={`${btn.secondary} mt-4 w-full`} onClick={() => setShowMaterial(false)}>
            閉じる
          </button>
        </Modal>
      )}
    </div>
  );
}
