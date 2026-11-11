"use client";

// データ（localStorage または Firestore）を読み終えるまで画面を出さない外枠
import { Header } from "@/components/Header";
import { useApp } from "@/components/AppProvider";
import { Icon } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, error } = useApp();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {error ? (
          <div className="mx-auto flex max-w-lg gap-3 border-l-4 border-bad bg-bad-soft p-4 text-sm text-bad" role="alert">
            <Icon name="alert" className="mt-0.5" />
            <p>{error}</p>
          </div>
        ) : ready ? (
          children
        ) : (
          <div className="flex flex-col items-center gap-3 py-24 text-sm text-ink-muted" role="status">
            <span className="h-1 w-24 overflow-hidden rounded-full bg-paper">
              <span className="block h-full w-1/3 animate-pulse rounded-full bg-brand" />
            </span>
            研修のデータを読み込んでいます…
          </div>
        )}
      </main>
    </>
  );
}
