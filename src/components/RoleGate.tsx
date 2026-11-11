"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { btn, Card } from "./ui";
import type { Role } from "@/lib/types";

/** 立場に合わない画面を開いたときに、切り替えをうながす */
export function RoleGate({ role, children }: { role: Role; children: React.ReactNode }) {
  const { me, people, setMe } = useApp();
  const router = useRouter();
  if (me?.role === role) return <>{children}</>;

  if (role === "trainer") {
    const trainer = people.find((p) => p.role === "trainer");
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <p className="font-bold">この画面は研修担当向けです</p>
        <p className="mt-2 text-sm text-ink-soft">いまは受講者「{me?.name}」として使っています。</p>
        <button className={`${btn.primary} mt-4`} onClick={() => trainer && setMe(trainer.id)}>
          研修担当（{trainer?.name}）に切り替える
        </button>
      </Card>
    );
  }
  const learners = people.filter((p) => p.role === "learner");
  return (
    <Card className="mx-auto max-w-2xl p-6">
      <p className="font-bold">どの受講者としてテストを受けますか？</p>
      <p className="mt-1 text-sm text-ink-soft">受講者を選ぶと、その人の受講状況が表示されます（あとからヘッダーで切り替えられます）。</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {learners.map((p) => (
          <button
            key={p.id}
            className="rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-canvas"
            onClick={() => {
              setMe(p.id);
              router.push("/learn");
            }}
          >
            <span className="font-medium">{p.name}</span>
            <span className="block text-xs text-ink-muted">{p.department}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
