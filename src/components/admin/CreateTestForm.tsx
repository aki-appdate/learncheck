"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { MaterialFull } from "../MaterialExcerpt";
import { btn, Card, CardTitle, cx, Modal } from "../ui";
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

  return (
    <Card>
      <CardTitle>新しい確認テストを作る</CardTitle>
      <div className="space-y-5 px-5 py-4">
        <fieldset disabled={busy}>
          <legend className="text-xs font-medium text-ink-soft">1. 研修資料を選ぶ</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {materials.map((m) => (
              <label
                key={m.id}
                className={cx(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm",
                  materialId === m.id ? "border-brand bg-brand-soft" : "border-line hover:bg-canvas",
                )}
              >
                <input type="radio" name="material" className="mt-1 accent-brand" checked={materialId === m.id} onChange={() => setMaterialId(m.id)} />
                <span className="min-w-0">
                  <span className="block font-medium">{m.title}</span>
                  <span className="block text-xs text-ink-muted">
                    対象：{m.audience}・{m.body.length.toLocaleString()}字
                  </span>
                  <button
                    type="button"
                    className="mt-0.5 text-xs text-brand underline"
                    onClick={(e) => {
                      e.preventDefault();
                      setPreview(m.id);
                    }}
                  >
                    資料を読む
                  </button>
                </span>
              </label>
            ))}
            <label
              className={cx(
                "flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm sm:col-span-2",
                isPaste ? "border-brand bg-brand-soft" : "border-line hover:bg-canvas",
              )}
            >
              <input type="radio" name="material" className="mt-1 accent-brand" checked={isPaste} onChange={() => setMaterialId(PASTE)} />
              <span>
                <span className="block font-medium">自分の資料を貼り付ける</span>
                <span className="block text-xs text-ink-muted">社内の研修資料の文章をそのまま貼り付けて試せます（{MIN_BODY}〜{MAX_BODY.toLocaleString()}字）</span>
              </span>
            </label>
          </div>
          {isPaste && (
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                placeholder="資料の名前（例：電話応対の基本）"
                value={pasteTitle}
                maxLength={60}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <textarea
                className="h-48 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed"
                placeholder="ここに資料の本文を貼り付けてください"
                value={pasteBody}
                onChange={(e) => setPasteBody(e.target.value)}
              />
              <p className={cx("text-right text-xs", bodyLen > MAX_BODY || (bodyLen > 0 && bodyLen < MIN_BODY) ? "text-bad" : "text-ink-muted")}>
                {bodyLen.toLocaleString()}字{bodyLen > MAX_BODY ? `（${MAX_BODY.toLocaleString()}字までにしてください）` : bodyLen > 0 && bodyLen < MIN_BODY ? `（${MIN_BODY}字以上必要です）` : ""}
              </p>
            </div>
          )}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset disabled={busy}>
            <legend className="text-xs font-medium text-ink-soft">2. 問題の数</legend>
            <div className="mt-2 flex gap-2">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={count === n}
                  onClick={() => setCount(n)}
                  className={cx("flex-1 rounded-lg border px-3 py-2 text-sm", count === n ? "border-brand bg-brand-soft font-medium text-brand-strong" : "border-line hover:bg-canvas")}
                >
                  {n}問
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend className="text-xs font-medium text-ink-soft">3. 難しさ</legend>
            <div className="mt-2 flex gap-2">
              {DIFFICULTY_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={difficulty === d}
                  onClick={() => setDifficulty(d)}
                  className={cx("flex-1 rounded-lg border px-2 py-2 text-sm", difficulty === d ? "border-brand bg-brand-soft font-medium text-brand-strong" : "border-line hover:bg-canvas")}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button className={btn.primary} onClick={run} disabled={!canRun}>
            {busy ? "問題を作っています…" : "✦ AIで確認テストを作る"}
          </button>
          <p className="text-xs text-ink-muted">作った問題はすぐには公開されません。次の画面で1問ずつ確認してから公開します。</p>
        </div>
        {error && <p className="rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p>}
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
