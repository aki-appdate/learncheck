"use client";

import { useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { CreateTestForm } from "@/components/admin/CreateTestForm";
import { TestEditor } from "@/components/admin/TestEditor";
import { RoleGate } from "@/components/RoleGate";
import { Badge, btn, Card, CardTitle, cx } from "@/components/ui";
import { formatDateJa } from "@/lib/dates";
import { findQuote } from "@/lib/quote";
import type { Test } from "@/lib/types";

type Selection = { kind: "new" } | { kind: "test"; id: string };

export default function AdminPage() {
  return (
    <RoleGate role="trainer">
      <Admin />
    </RoleGate>
  );
}

function Admin() {
  const { tests } = useApp();
  const [sel, setSel] = useState<Selection>({ kind: "new" });
  const drafts = tests.filter((t) => t.status === "draft").reverse();
  const published = tests.filter((t) => t.status === "published").reverse();
  const current = sel.kind === "test" ? tests.find((t) => t.id === sel.id) : undefined;

  const editorRef = useRef<HTMLDivElement>(null);
  const select = (s: Selection) => {
    setSel(s);
    // スマホでは一覧の下に編集画面が出るので、そこまで送る
    requestAnimationFrame(() => {
      if (window.innerWidth < 1024) editorRef.current?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">テストを作る</h1>
        <p className="mt-1 text-sm text-ink-soft">研修資料からAIが確認テストの案を作ります。1問ずつ確認し、採用した問題だけで公開します。</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardTitle>テストの一覧</CardTitle>
          <div className="p-2">
            <button
              className={cx(btn.primary, "w-full", sel.kind === "new" && "ring-2 ring-brand-soft")}
              onClick={() => select({ kind: "new" })}
            >
              ＋ 新しいテストを作る
            </button>
            <TestGroup title="確認中の下書き" tests={drafts} sel={sel} onSelect={(id) => select({ kind: "test", id })} />
            <TestGroup title="公開中" tests={published} sel={sel} onSelect={(id) => select({ kind: "test", id })} />
          </div>
        </Card>

        <div className="min-w-0 scroll-mt-4" ref={editorRef}>
          {current ? (
            <TestEditor key={current.id} test={current} onDeleted={() => select({ kind: "new" })} />
          ) : (
            <CreateTestForm onCreated={(id) => select({ kind: "test", id })} />
          )}
        </div>
      </div>
    </div>
  );
}

function TestGroup({ title, tests, sel, onSelect }: { title: string; tests: Test[]; sel: Selection; onSelect: (id: string) => void }) {
  if (!tests.length) return null;
  return (
    <div className="mt-3">
      <p className="px-2 pb-1 text-xs font-medium text-ink-muted">{title}</p>
      <ul className="space-y-1">
        {tests.map((t) => {
          const pending = t.questions.filter((q) => q.review === "pending").length;
          const noEvidence = t.questions.filter((q) => q.review !== "discarded" && !findQuote(t.material.body, q.quote).found).length;
          const active = sel.kind === "test" && sel.id === t.id;
          return (
            <li key={t.id}>
              <button
                className={cx("w-full rounded-lg px-2.5 py-2 text-left text-sm", active ? "bg-brand-soft" : "hover:bg-canvas")}
                onClick={() => onSelect(t.id)}
                aria-current={active}
              >
                <span className="block font-medium">{t.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  {t.questions.length}問
                  {t.status === "draft" ? (
                    <>
                      {pending > 0 && <Badge tone="brand">未確認 {pending}</Badge>}
                      {noEvidence > 0 && <Badge tone="bad">根拠なし {noEvidence}</Badge>}
                    </>
                  ) : (
                    t.publishedAt && <span>・{formatDateJa(t.publishedAt)} 公開</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
