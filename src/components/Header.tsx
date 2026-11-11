"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { AiSourceBadge, btn, cx } from "./ui";

export function Header() {
  const { people, me, setMe, aiSource, storeKind, resetDemo } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  const isTrainer = me?.role === "trainer";
  const nav = isTrainer
    ? [
        { href: "/admin", label: "テストを作る" },
        { href: "/results", label: "結果を見る" },
      ]
    : [{ href: "/learn", label: "テストを受ける" }];

  const trainers = people.filter((p) => p.role === "trainer");
  const learners = people.filter((p) => p.role === "learner");

  return (
    <header className="top-0 z-20 border-b sm:sticky border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm text-white">L</span>
          LearnCheck
        </Link>
        <nav className="flex gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm",
                path.startsWith(n.href) ? "bg-brand-soft font-medium text-brand-strong" : "text-ink-soft hover:bg-canvas",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AiSourceBadge source={aiSource} />
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            利用者
            <select
              className="max-w-[13rem] rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
              value={me?.id ?? ""}
              onChange={(e) => {
                const next = people.find((p) => p.id === e.target.value);
                setMe(e.target.value);
                router.push(next?.role === "trainer" ? "/admin" : "/learn");
              }}
            >
              <optgroup label="研修担当">
                {trainers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（研修担当）
                  </option>
                ))}
              </optgroup>
              <optgroup label="受講者">
                {learners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.department}）
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            className={btn.ghost}
            disabled={resetting}
            title={storeKind === "firestore" ? "あなた専用のお試しデータを初期状態に戻します" : "このブラウザのお試しデータを初期状態に戻します"}
            onClick={async () => {
              if (!confirm("作ったテストや受講結果を消して、お試しデータを最初の状態に戻しますか？")) return;
              setResetting(true);
              await resetDemo();
              setResetting(false);
            }}
          >
            {resetting ? "戻しています…" : "データを初期化"}
          </button>
        </div>
      </div>
      <div className="border-t border-line bg-warn-soft/60 px-4 py-1 text-center text-xs text-warn">
        デモ版です。会社・人名・部署・研修資料などのデータはすべて架空のものです。
      </div>
    </header>
  );
}
