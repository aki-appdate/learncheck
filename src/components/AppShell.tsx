"use client";

// データ（localStorage または Firestore）を読み終えるまで画面を出さない外枠
import { Header } from "@/components/Header";
import { useApp } from "@/components/AppProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, error } = useApp();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {error ? (
          <p className="rounded-lg bg-bad-soft p-4 text-sm text-bad">{error}</p>
        ) : ready ? (
          children
        ) : (
          <p className="py-20 text-center text-sm text-ink-muted">読み込んでいます…</p>
        )}
      </main>
    </>
  );
}
