"use client";

import { useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { CreateTestForm } from "@/components/admin/CreateTestForm";
import { TestEditor } from "@/components/admin/TestEditor";
import { RoleGate } from "@/components/RoleGate";
import { cx, Icon, PageHead, RateBar } from "@/components/ui";
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
    <div className="space-y-6">
      <PageHead eyebrow="研修担当" title="テストを作る">
        研修資料からAIが確認テストの案を作ります。根拠の文を資料と照らし合わせ、1問ずつ確かめて採用した問題だけで公開します。
      </PageHead>

      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 lg:grid-cols-[17rem_1fr]">
        <nav aria-label="テストの一覧" className="lg:sticky lg:top-24">
          <button
            className={cx(
              "flex w-full items-center gap-2 rounded-[3px] border px-3 py-2.5 text-left text-sm font-bold",
              sel.kind === "new" ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-brand hover:border-brand",
            )}
            onClick={() => select({ kind: "new" })}
            aria-current={sel.kind === "new"}
          >
            <Icon name="plus" />
            新しいテストを作る
          </button>
          <TestGroup title="確認中の下書き" tests={drafts} sel={sel} onSelect={(id) => select({ kind: "test", id })} />
          <TestGroup title="公開中" tests={published} sel={sel} onSelect={(id) => select({ kind: "test", id })} />
        </nav>

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
    <div className="mt-6">
      <p className="label border-b border-line pb-1.5">
        {title}
        <span className="ml-1.5 font-normal">{tests.length}</span>
      </p>
      <ul>
        {tests.map((t) => {
          const pending = t.questions.filter((q) => q.review === "pending").length;
          const approved = t.questions.filter((q) => q.review === "approved").length;
          const noEvidence = t.questions.filter((q) => q.review !== "discarded" && !findQuote(t.material.body, q.quote).found).length;
          const active = sel.kind === "test" && sel.id === t.id;
          return (
            <li key={t.id} className="border-b border-line">
              <button
                className={cx(
                  "w-full border-l-[3px] py-2.5 pl-3 pr-2 text-left text-sm",
                  active ? "border-brand bg-surface" : "border-transparent hover:bg-surface",
                )}
                onClick={() => onSelect(t.id)}
                aria-current={active}
              >
                <span className={cx("block leading-snug", active ? "font-bold text-ink" : "text-ink")}>{t.title}</span>
                {t.status === "draft" ? (
                  <>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                      <span>
                        採用 {approved}/{t.questions.length}
                      </span>
                      {pending > 0 && <span>未確認 {pending}</span>}
                      {noEvidence > 0 && (
                        <span className="inline-flex items-center gap-0.5 font-bold text-bad">
                          <Icon name="alert" className="size-3.5" />
                          根拠なし {noEvidence}
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 block">
                      <RateBar value={t.questions.length ? approved / t.questions.length : 0} tone="good" thin />
                    </span>
                  </>
                ) : (
                  <span className="mt-1 block text-xs text-ink-muted">
                    {t.questions.length}問{t.publishedAt && `・${formatDateJa(t.publishedAt)} 公開`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
