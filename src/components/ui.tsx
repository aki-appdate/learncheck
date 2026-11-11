// 小さな見た目の部品。ボタン・バッジ・カードの見た目をここで統一する。

import type { AiSource } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed",
  ghost: "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-canvas",
};

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-line bg-surface", className)}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-sm font-bold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

type Tone = "neutral" | "brand" | "good" | "warn" | "bad";
const TONE: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border-line",
  brand: "bg-brand-soft text-brand-strong border-brand-soft",
  good: "bg-good-soft text-good border-good-soft",
  warn: "bg-warn-soft text-warn border-warn-soft",
  bad: "bg-bad-soft text-bad border-bad-soft",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONE[tone])}>
      {children}
    </span>
  );
}

export function AiSourceBadge({ source }: { source: AiSource }) {
  return source === "gemini" ? (
    <Badge tone="brand">✦ AI：Gemini</Badge>
  ) : (
    <Badge tone="neutral">AI：見本の返答</Badge>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

export function pct(n: number): string {
  return `${(Math.round(n * 1000) / 10).toFixed(1)}%`;
}

/** 画面の上に重ねて出す小窓。外側を押すか「閉じる」で閉じる */
export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={cx("max-h-[85vh] w-full overflow-y-auto rounded-xl bg-surface p-5 shadow-lg", wide ? "max-w-2xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-bold">{title}</h2>
          <button className={btn.ghost} onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/** 横棒（割合）。値の文字は棒の外に書く */
export function RateBar({ value, tone = "brand" }: { value: number; tone?: "brand" | "bad" | "good" }) {
  const color = tone === "bad" ? "bg-bad" : tone === "good" ? "bg-good" : "bg-brand";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
      <div className={cx("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
