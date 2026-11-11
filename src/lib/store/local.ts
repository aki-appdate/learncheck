import { createSeedData } from "../seed";
import type { Attempt, Test } from "../types";
import { mergeWorkspace, type DataStore } from "./types";

// Firebaseが未設定のときの保存先。このブラウザの中だけに保存する。

const KEY = "learncheck:workspace:v1";

type Saved = { seedBase: string; tests: Test[]; attempts: Attempt[] };

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function write(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートモード等）でも、画面上の操作は続けられる
  }
}

export class LocalStore implements DataStore {
  readonly kind = "local" as const;
  private state: Saved | null = null;

  async load() {
    this.state = read() ?? { seedBase: new Date().toISOString(), tests: [], attempts: [] };
    write(this.state);
    return mergeWorkspace(createSeedData(new Date(this.state.seedBase)), this.state.tests, this.state.attempts);
  }

  private async current(): Promise<Saved> {
    if (!this.state) await this.load();
    return this.state!;
  }

  async saveTest(test: Test) {
    const s = await this.current();
    s.tests = [...s.tests.filter((t) => t.id !== test.id), test];
    write(s);
  }

  async deleteTest(id: string) {
    const s = await this.current();
    s.tests = s.tests.filter((t) => t.id !== id);
    write(s);
  }

  async saveAttempt(attempt: Attempt) {
    const s = await this.current();
    s.attempts.push(attempt);
    write(s);
  }

  async reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    this.state = null;
  }
}
