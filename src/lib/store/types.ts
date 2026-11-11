import type { Attempt, Test } from "../types";
import type { SeedData } from "../seed";

/**
 * 保存先の共通の窓口。
 * デモデータ（架空の受講者・公開済みテスト・過去の受験結果）は毎回同じ規則で作り直せるので保存しない。
 * 保存するのは「お試しを始めた日時」と「利用者が作った・直したテスト」「利用者が受けた結果」だけにして、書き込み回数を抑える。
 */
export interface DataStore {
  readonly kind: "local" | "firestore";
  load(): Promise<SeedData>;
  /** 下書きの保存・公開。公開済みのテストは書き換えない */
  saveTest(test: Test): Promise<void>;
  /** 下書きを消す */
  deleteTest(id: string): Promise<void>;
  saveAttempt(attempt: Attempt): Promise<void>;
  reset(): Promise<void>;
}

/** デモデータに、利用者が保存した分を重ねる。同じIDのテストは保存した方を使う */
export function mergeWorkspace(seed: SeedData, savedTests: Test[], savedAttempts: Attempt[]): SeedData {
  const saved = new Map(savedTests.map((t) => [t.id, t]));
  const tests = [...seed.tests.map((t) => saved.get(t.id) ?? t), ...savedTests.filter((t) => !seed.tests.some((s) => s.id === t.id))].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
  const attempts = [...seed.attempts, ...savedAttempts].sort((a, b) => a.at.localeCompare(b.at));
  return { ...seed, tests, attempts };
}
