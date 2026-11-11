"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { aiMode } from "@/lib/ai";
import { createStore } from "@/lib/store";
import type { DataStore } from "@/lib/store/types";
import type { AiSource, Attempt, Material, Person, Test } from "@/lib/types";

// 画面全体で共有する状態：データ・今だれとして使っているか・保存の操作。

type Ctx = {
  ready: boolean;
  error: string | null;
  people: Person[];
  materials: Material[];
  tests: Test[];
  attempts: Attempt[];
  me: Person | null;
  setMe: (id: string) => void;
  storeKind: DataStore["kind"];
  aiSource: AiSource;
  saveTest: (test: Test) => Promise<void>;
  deleteTest: (id: string) => Promise<void>;
  saveAttempt: (attempt: Attempt) => Promise<void>;
  resetDemo: () => Promise<void>;
};

const AppContext = createContext<Ctx | null>(null);
const ME_KEY = "learncheck:me";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<DataStore | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [meId, setMeId] = useState<string>("trainer-1");
  const [source, setSource] = useState<AiSource>("sample");
  const [kind, setKind] = useState<DataStore["kind"]>("local");

  const load = useCallback(async () => {
    const store = storeRef.current ?? createStore();
    storeRef.current = store;
    try {
      const data = await store.load();
      setKind(store.kind);
      setSource(aiMode());
      try {
        const saved = localStorage.getItem(ME_KEY);
        if (saved && data.people.some((p) => p.id === saved)) setMeId(saved);
      } catch {}
      setPeople(data.people);
      setMaterials(data.materials);
      setTests(data.tests);
      setAttempts(data.attempts);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("データを読み込めませんでした。時間をおいて再読み込みしてください。");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setMe = useCallback((id: string) => {
    setMeId(id);
    try {
      localStorage.setItem(ME_KEY, id);
    } catch {}
  }, []);

  const saveTest = useCallback(
    async (test: Test) => {
      const before = tests.find((t) => t.id === test.id);
      // 先に画面へ反映し、保存に失敗したら元に戻す
      setTests((prev) => (before ? prev.map((t) => (t.id === test.id ? test : t)) : [...prev, test]));
      try {
        await storeRef.current!.saveTest(test);
      } catch (e) {
        setTests((prev) => (before ? prev.map((t) => (t.id === test.id ? before : t)) : prev.filter((t) => t.id !== test.id)));
        throw e;
      }
    },
    [tests],
  );

  const deleteTest = useCallback(async (id: string) => {
    await storeRef.current!.deleteTest(id);
    setTests((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const saveAttempt = useCallback(async (attempt: Attempt) => {
    setAttempts((prev) => [...prev, attempt]);
    try {
      await storeRef.current!.saveAttempt(attempt);
    } catch (e) {
      setAttempts((prev) => prev.filter((a) => a.id !== attempt.id));
      throw e;
    }
  }, []);

  const resetDemo = useCallback(async () => {
    setReady(false);
    await storeRef.current?.reset();
    await load();
  }, [load]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      error,
      people,
      materials,
      tests,
      attempts,
      me: people.find((p) => p.id === meId) ?? null,
      setMe,
      storeKind: kind,
      aiSource: source,
      saveTest,
      deleteTest,
      saveAttempt,
      resetDemo,
    }),
    [ready, error, people, materials, tests, attempts, meId, setMe, kind, source, saveTest, deleteTest, saveAttempt, resetDemo],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp は AppProvider の中で使ってください");
  return ctx;
}
