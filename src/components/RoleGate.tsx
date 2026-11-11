"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { btn } from "./ui";
import type { Role } from "@/lib/types";

/** 立場に合わない画面を開いたときに、切り替えをうながす */
export function RoleGate({ role, children }: { role: Role; children: React.ReactNode }) {
  const { me, people, setMe } = useApp();
  const router = useRouter();
  if (me?.role === role) return <>{children}</>;

  if (role === "trainer") {
    const trainer = people.find((p) => p.role === "trainer");
    return (
      <div className="mx-auto max-w-lg border-t-4 border-brand bg-surface px-6 py-8 text-center">
        <p className="text-lg font-bold">この画面は研修担当向けです</p>
        <p className="mt-2 text-sm text-ink-soft">いまは受講者「{me?.name}」として使っています。</p>
        <button className={`${btn.primary} mt-5`} onClick={() => trainer && setMe(trainer.id)}>
          研修担当（{trainer?.name}）に切り替える
        </button>
      </div>
    );
  }
  const learners = people.filter((p) => p.role === "learner");
  const depts = [...new Set(learners.map((p) => p.department ?? ""))];
  return (
    <div className="mx-auto max-w-3xl">
      <p className="label">受講者</p>
      <h1 className="mt-1 text-[26px] font-bold">どの受講者として受けますか？</h1>
      <p className="mt-2 text-sm text-ink-soft">選んだ人の受講状況が表示されます。あとから画面上部で切り替えられます。</p>
      <div className="mt-6 space-y-5">
        {depts.map((d) => (
          <section key={d}>
            <h2 className="label border-b border-line pb-1.5">{d}</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {learners
                .filter((p) => p.department === d)
                .map((p) => (
                  <button
                    key={p.id}
                    className="min-h-12 rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-left text-sm font-bold hover:border-brand hover:text-brand-strong"
                    onClick={() => {
                      setMe(p.id);
                      router.push("/learn");
                    }}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
