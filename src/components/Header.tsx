"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { AiSourceBadge, cx, Icon, LogoMark } from "./ui";

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
    <header className="top-0 z-20 border-b border-line bg-surface lg:sticky">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-x-6 px-4 lg:flex lg:h-14 lg:px-6">
        <Link href="/" className="flex h-12 items-center gap-2.5 text-ink lg:h-auto" aria-label="LearnCheck トップへ">
          <LogoMark />
          <span className="whitespace-nowrap text-[17px] font-bold tracking-wide">LearnCheck</span>
          <span className="hidden whitespace-nowrap border-l border-line pl-2.5 text-xs text-ink-muted xl:inline">研修の理解度チェック</span>
        </Link>

        <button
          className="justify-self-end whitespace-nowrap text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50 lg:order-last"
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

        {/* 受講者は画面が1つだけなので、スマホでは切り替えの行を出さない（画面の上を広く使う） */}
        <nav
          className={cx("col-span-2 -mx-4 border-t border-line px-4 lg:mx-0 lg:flex lg:h-full lg:border-0 lg:px-0", nav.length > 1 ? "flex" : "hidden")}
          aria-label="画面の切り替え"
        >
          {nav.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-11 flex-1 items-center justify-center border-b-2 px-4 text-sm lg:h-full lg:flex-none",
                  active ? "border-brand font-bold text-brand-strong" : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="col-span-2 -mx-4 flex items-center gap-3 border-t border-line bg-canvas px-4 py-2 lg:mx-0 lg:ml-auto lg:border-0 lg:bg-transparent lg:p-0">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-muted lg:flex-none">
            <Icon name="user" className="size-4" />
            <span className="sr-only">利用者を切り替える</span>
            <select
              className="min-w-0 flex-1 rounded-[3px] border border-line-strong bg-surface py-1 pl-2 pr-7 text-sm text-ink lg:max-w-[15rem]"
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
          <AiSourceBadge source={aiSource} />
        </div>
      </div>
      <p className="border-t border-line bg-paper px-4 py-1 text-center text-[11.5px] leading-5 text-ink-soft">
        デモ版です。<span className="hidden sm:inline">会社・人名・部署・研修資料などの</span>データはすべて架空です。
      </p>
    </header>
  );
}
