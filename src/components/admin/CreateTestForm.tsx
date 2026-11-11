"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { MaterialFull } from "../MaterialExcerpt";
import { btn, Card, cx, Icon, Modal } from "../ui";
import { generateQuiz } from "@/lib/ai";
import { newId } from "@/lib/dates";
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, QUESTION_COUNTS } from "@/lib/labels";
import type { Difficulty, Test } from "@/lib/types";

const PASTE = "paste";
const MAX_BODY = 6000;
const MIN_BODY = 200;

export function CreateTestForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { materials, saveTest } = useApp();
  const [materialId, setMaterialId] = useState<string>(materials[0]?.id ?? PASTE);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [count, setCount] = useState<number>(8);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const isPaste = materialId === PASTE;
  const selected = materials.find((m) => m.id === materialId);
  const title = isPaste ? pasteTitle.trim() : selected?.title ?? "";
  const body = isPaste ? pasteBody.trim() : selected?.body ?? "";
  const bodyLen = pasteBody.trim().length;
  const canRun = !busy && title.length > 0 && body.length >= MIN_BODY && body.length <= MAX_BODY;

  async function run() {
    setBusy(true);
    setError(null);
    const r = await generateQuiz({ title, body, count, difficulty });
    if (r.value.length === 0) {
      setError("この資料からは問題を作れませんでした。文章（「。」で終わる文）が多く含まれる資料を使ってください。");
      setBusy(false);
      return;
    }
    const id = newId("test");
    const test: Test = {
      id,
      title: `${title} 確認テスト`.slice(0, 80),
      material: { id: isPaste ? null : materialId, title, body },
      status: "draft",
      questions: r.value.map((q, i) => ({ ...q, id: `${id}-q${String(i + 1).padStart(2, "0")}`, review: "pending", edited: false })),
      createdAt: new Date().toISOString(),
      publishedAt: null,
      aiSource: r.source,
      note:
        [r.note, r.value.length < count ? `資料の長さの都合で、${r.value.length}問だけ作りました。` : null].filter(Boolean).join(" ") || null,
      targetDepartments: isPaste ? null : (selected?.targetDepartments ?? null),
      generation: { count, difficulty, variant: 0 },
    };
    try {
      await saveTest(test);
      onCreated(id);
    } catch {
      setError("保存できませんでした。通信状況を確認して、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  const segBtn = (on: boolean) =>
    cx(
      "min-h-11 flex-1 rounded-[3px] border px-3 py-2 text-sm",
      on ? "border-ink bg-ink font-bold text-white" : "border-line-strong bg-surface text-ink hover:border-ink-soft",
    );

  return (
    <Card>
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="text-xl font-bold">新しい確認テストを作る</h2>
        <p className="mt-1 text-sm text-ink-soft">3つを選ぶと、AIが問題の案を作ります。案はすぐには公開されません。</p>
      </div>
      <div className="divide-y divide-line">
        <Step n={1} title="研修資料を選ぶ">
          <fieldset disabled={busy}>
            <legend className="sr-only">研修資料</legend>
            <div className="divide-y divide-line rounded-[3px] border border-line">
              {materials.map((m) => {
                const on = materialId === m.id;
                return (
                  <label key={m.id} className={cx("flex cursor-pointer gap-3 px-3.5 py-3 text-sm", on ? "bg-brand-soft" : "hover:bg-canvas")}>
                    <input type="radio" name="material" className="mt-1 size-4 accent-brand" checked={on} onChange={() => setMaterialId(m.id)} />
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="min-w-0">
                        <span className={cx("block", on && "font-bold")}>{m.title}</span>
                        <span className="block text-xs text-ink-muted">
                          対象：{m.audience}・{m.body.length.toLocaleString()}字
                        </span>
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand underline decoration-1 underline-offset-4"
                        onClick={(e) => {
                          e.preventDefault();
                          setPreview(m.id);
                        }}
                      >
                        <Icon name="doc" className="size-3.5" />
                        資料を読む
                      </button>
                    </span>
                  </label>
                );
              })}
              <label className={cx("flex cursor-pointer gap-3 px-3.5 py-3 text-sm", isPaste ? "bg-brand-soft" : "hover:bg-canvas")}>
                <input type="radio" name="material" className="mt-1 size-4 accent-brand" checked={isPaste} onChange={() => setMaterialId(PASTE)} />
                <span>
                  <span className={cx("block", isPaste && "font-bold")}>自分の資料を貼り付ける</span>
                  <span className="block text-xs text-ink-muted">
                    社内の研修資料の文章をそのまま貼り付けて試せます（{MIN_BODY}〜{MAX_BODY.toLocaleString()}字）
                  </span>
                </span>
              </label>
            </div>
            {isPaste && (
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="label">資料の名前</span>
                  <input
                    className="mt-1 w-full rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-sm"
                    placeholder="例：電話応対の基本"
                    value={pasteTitle}
                    maxLength={60}
                    onChange={(e) => setPasteTitle(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="label">資料の本文</span>
                  <textarea
                    className="mt-1 h-48 w-full rounded-[3px] border border-line-strong bg-paper px-3 py-2 text-sm leading-relaxed"
                    placeholder="ここに資料の本文を貼り付けてください"
                    value={pasteBody}
                    onChange={(e) => setPasteBody(e.target.value)}
                  />
                </label>
                <p className={cx("text-right text-xs", bodyLen > MAX_BODY || (bodyLen > 0 && bodyLen < MIN_BODY) ? "font-bold text-bad" : "text-ink-muted")}>
                  <span className="tabular-nums">{bodyLen.toLocaleString()}</span>字
                  {bodyLen > MAX_BODY ? `（${MAX_BODY.toLocaleString()}字までにしてください）` : bodyLen > 0 && bodyLen < MIN_BODY ? `（あと${MIN_BODY - bodyLen}字以上必要です）` : ""}
                </p>
              </div>
            )}
          </fieldset>
        </Step>

        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-line">
          <Step n={2} title="問題の数">
            <fieldset disabled={busy} className="flex gap-2">
              <legend className="sr-only">問題の数</legend>
              {QUESTION_COUNTS.map((n) => (
                <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={segBtn(count === n)}>
                  {n}問
                </button>
              ))}
            </fieldset>
          </Step>
          <Step n={3} title="難しさ" className="border-t border-line sm:border-t-0">
            <fieldset disabled={busy} className="flex gap-2">
              <legend className="sr-only">難しさ</legend>
              {DIFFICULTY_ORDER.map((d) => (
                <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)} className={segBtn(difficulty === d)}>
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </fieldset>
          </Step>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-canvas px-5 py-4 sm:px-6">
          <button className={cx(btn.primary, "w-full sm:w-auto sm:min-w-56")} onClick={run} disabled={!canRun} aria-busy={busy}>
            {busy ? "問題の案を作っています…" : "AIで確認テストを作る"}
          </button>
          <p className="text-xs leading-relaxed text-ink-muted">
            {!busy && !canRun && isPaste
              ? "資料の名前と、200字以上の本文を入れると作れます。"
              : "次の画面で、根拠の文と問題を1問ずつ確かめてから公開します。"}
          </p>
        </div>
        {error && (
          <p className="flex gap-2 border-l-4 border-bad bg-bad-soft px-5 py-3 text-sm text-bad" role="alert">
            <Icon name="alert" className="mt-0.5" />
            {error}
          </p>
        )}
      </div>

      {preview && (
        <Modal title={`資料：${materials.find((m) => m.id === preview)?.title}`} onClose={() => setPreview(null)} wide>
          <MaterialFull body={materials.find((m) => m.id === preview)?.body ?? ""} />
          <button className={`${btn.secondary} mt-4 w-full`} onClick={() => setPreview(null)}>
            閉じる
          </button>
        </Modal>
      )}
    </Card>
  );
}

function Step({ n, title, children, className }: { n: number; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("px-5 py-5 sm:px-6", className)}>
      <h3 className="mb-3 flex items-baseline gap-2.5 font-bold">
        <span className="text-xl leading-none text-brand">{n}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
