// 小さな見た目の部品。ボタン・印・アイコン・面の見た目をここで統一する（方針は docs/design.md）。

"use client";

import { useEffect, useId, useRef } from "react";
import type { AiSource } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

const base =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[3px] px-4 py-2 text-sm font-bold leading-tight transition-colors disabled:cursor-not-allowed";

export const btn = {
  primary: `${base} bg-brand text-white hover:bg-brand-strong disabled:bg-line disabled:text-ink-muted`,
  secondary: `${base} border border-line-strong bg-surface text-ink hover:border-ink-soft hover:bg-canvas disabled:border-line disabled:text-ink-muted disabled:hover:bg-surface`,
  danger: `${base} border border-line-strong bg-surface text-bad hover:border-bad hover:bg-bad-soft disabled:border-line disabled:text-ink-muted`,
  ghost:
    "inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50",
  link: "inline-flex items-center gap-1 text-sm font-bold text-brand underline decoration-1 underline-offset-4 hover:text-brand-strong",
};

/** 白い面。罫線1本で区切る（影は使わない） */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-[var(--radius-sheet)] border border-line bg-surface", className)}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-3">
      <h2 className="text-base font-bold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

/** 画面の見出し。小さなラベル＋大きな見出し＋説明 */
export function PageHead({ eyebrow, title, children, aside }: { eyebrow?: string; title: string; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="label">{eyebrow}</p>}
        <h1 className="mt-1 text-[26px] font-bold leading-snug text-ink sm:text-[28px]">{title}</h1>
        {children && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</p>}
      </div>
      {aside}
    </div>
  );
}

type Tone = "neutral" | "brand" | "good" | "warn" | "bad";
const TONE: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border-line-strong",
  brand: "bg-brand-soft text-brand-strong border-brand/30",
  good: "bg-good-soft text-good border-good/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  bad: "bg-bad-soft text-bad border-bad/30",
};

/** 小さな札。四角めの角で、印（丸）と区別する */
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 py-px text-xs font-bold leading-5", TONE[tone])}>
      {children}
    </span>
  );
}

export function AiSourceBadge({ source }: { source: AiSource }) {
  return source === "gemini" ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft">
      <span className="size-1.5 rounded-full bg-good" aria-hidden />
      AI：Gemini
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft" title="AIが使えないため、資料の文からルールで作る「見本の返答」で動いています">
      <span className="size-1.5 rounded-full bg-chart-rest" aria-hidden />
      AI：見本の返答
    </span>
  );
}

/** 検印。人が「採用」した問題にだけ押す丸い印 */
export function Seal({ children = "採用", size = "md", className }: { children?: React.ReactNode; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cx(
        "seal-in inline-grid shrink-0 -rotate-[8deg] place-items-center rounded-full border-2 border-good font-bold text-good",
        size === "sm" ? "size-9 text-[11px]" : "size-12 text-[13px]",
        className,
      )}
      style={{ boxShadow: "inset 0 0 0 2px var(--color-surface), inset 0 0 0 3px var(--color-good)" }}
    >
      <span className="leading-none">{children}</span>
    </span>
  );
}

/** 「問1」の番号。教科書の設問番号のように大きく置く */
export function QNo({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-baseline gap-0.5 font-bold text-brand", className)}>
      <span className="sr-only">第{n}問</span>
      <span className="text-xs" aria-hidden>
        問
      </span>
      <span className="text-xl leading-none" aria-hidden>
        {n}
      </span>
    </span>
  );
}

/** 選択肢の記号（A〜D）の四角 */
export function ChoiceMark({ mark, tone = "plain" }: { mark: string; tone?: "plain" | "picked" | "good" | "bad" }) {
  return (
    <span
      className={cx(
        "grid size-7 shrink-0 place-items-center rounded-[3px] border text-[13px] font-bold",
        tone === "picked" && "border-ink bg-ink text-white",
        tone === "good" && "border-good bg-good text-white",
        tone === "bad" && "border-bad bg-bad text-white",
        tone === "plain" && "border-line-strong bg-surface text-ink-soft",
      )}
      aria-hidden
    >
      {mark}
    </span>
  );
}

/** 画面の上に重ねて出す小窓。外側を押す・「閉じる」・Escキーで閉じる。
 *  開いたら小窓の中にフォーカスを移し、閉じたら開く前の場所に戻す（キーボードで迷わないように） */
export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      // Tab で小窓の外へ出ないようにする
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/45 sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          "outline-none",
          "max-h-[88vh] w-full overflow-y-auto rounded-t-[6px] border-t-4 border-brand bg-surface px-5 pb-5 pt-4 shadow-xl sm:rounded-[6px]",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button className="-mr-2 grid size-9 shrink-0 place-items-center rounded-[3px] text-ink-soft hover:bg-canvas hover:text-ink" onClick={onClose} aria-label="閉じる">
            <Icon name="x" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/** 横棒（割合）。値の文字は棒の外に書く。mark を渡すとその位置に基準線を引く */
export function RateBar({ value, tone = "brand", mark, thin }: { value: number; tone?: "brand" | "bad" | "good" | "rest"; mark?: number; thin?: boolean }) {
  const color = tone === "bad" ? "bg-bad" : tone === "good" ? "bg-good" : tone === "rest" ? "bg-chart-rest" : "bg-brand";
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx("relative w-full rounded-full bg-paper", thin ? "h-1.5" : "h-2.5")}>
      <div className={cx("h-full rounded-full", color)} style={{ width: `${v * 100}%` }} />
      {mark != null && <div className="absolute -inset-y-1 w-px bg-ink-muted" style={{ left: `${mark * 100}%` }} aria-hidden />}
    </div>
  );
}

type IconName = "check" | "alert" | "x" | "doc" | "arrow-right" | "arrow-left" | "plus" | "pen" | "refresh" | "undo" | "trash" | "user" | "lock" | "chart" | "list";

/** 線の太さ1.75でそろえたアイコン。意味は必ず横の文字でも伝える */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = {
    check: <path d="M4 10.5l3.5 3.5L16 5.5" />,
    alert: (
      <>
        <path d="M10 3.5l7 12.5H3z" />
        <path d="M10 8.5v3.5M10 14.2v.1" />
      </>
    ),
    x: <path d="M5 5l10 10M15 5L5 15" />,
    doc: (
      <>
        <path d="M5 2.75h6.5L15 6.25v11H5z" />
        <path d="M11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" />
      </>
    ),
    "arrow-right": <path d="M4 10h11M11 6l4 4-4 4" />,
    "arrow-left": <path d="M16 10H5M9 6l-4 4 4 4" />,
    plus: <path d="M10 4v12M4 10h12" />,
    pen: <path d="M12.5 4.5l3 3L7 16H4v-3zM11 6l3 3" />,
    refresh: <path d="M15.5 8A6 6 0 1 0 16 11M16 3.5V8h-4.5" />,
    undo: <path d="M7 6L3.5 9.5 7 13M4 9.5h7.5a4.5 4.5 0 0 1 0 9H9" />,
    trash: <path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.75 11h7.5l.75-11" />,
    user: (
      <>
        <circle cx="10" cy="7" r="3" />
        <path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
      </>
    ),
    lock: (
      <>
        <rect x="4.5" y="9" width="11" height="8" rx="1" />
        <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
      </>
    ),
    chart: <path d="M3.5 16.5h13M6 13.5v-4M10 13.5V5M14 13.5v-6" />,
    list: <path d="M7 5.5h9M7 10h9M7 14.5h9M3.5 5.5h.1M3.5 10h.1M3.5 14.5h.1" />,
  }[name];
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cx("size-[18px] shrink-0", className)} aria-hidden>
      {p}
    </svg>
  );
}

/** ロゴ：かぎかっこ（引用）の中にチェック。「根拠を確かめる」の意味 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cx("size-7", className)} aria-hidden>
      <rect width="28" height="28" rx="4" fill="var(--color-brand)" />
      <path d="M9 7H6.5v8.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="square" />
      <path d="M19 21h2.5v-8.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="square" />
      <path d="M9.5 14.5l3 3 6-7" fill="none" stroke="var(--color-evidence)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 読み込み中・空の状態の文 */
export function Quiet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("py-10 text-center text-sm leading-relaxed text-ink-muted", className)}>{children}</p>;
}
