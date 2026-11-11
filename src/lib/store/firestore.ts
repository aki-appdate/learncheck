import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import { createSeedData } from "../seed";
import type { Attempt, Test } from "../types";
import { mergeWorkspace, type DataStore } from "./types";

// Firebaseが設定されているときの保存先。
// お試しの人ごとに匿名ログインし、workspaces/{uid} の下にだけ書き込む（他人のデータは読めない。firestore.rules参照）。

export class FirestoreStore implements DataStore {
  readonly kind = "firestore" as const;
  private db: Firestore;
  private uid: string | null = null;

  constructor(private app: FirebaseApp) {
    this.db = getFirestore(app);
  }

  private async userId(): Promise<string> {
    if (this.uid) return this.uid;
    const auth = getAuth(this.app);
    const cred = auth.currentUser ?? (await signInAnonymously(auth)).user;
    this.uid = cred.uid;
    return cred.uid;
  }

  private async wsRef() {
    return doc(this.db, "workspaces", await this.userId());
  }

  async load() {
    const wsRef = await this.wsRef();
    const ws = await getDoc(wsRef);
    let seedBase: string;
    if (ws.exists()) {
      seedBase = ws.data().seedBase as string;
    } else {
      seedBase = new Date().toISOString();
      await setDoc(wsRef, { seedBase });
    }
    const [testSnap, attemptSnap] = await Promise.all([getDocs(collection(wsRef, "tests")), getDocs(collection(wsRef, "attempts"))]);
    const tests = testSnap.docs.map((d) => d.data() as Test);
    const attempts = attemptSnap.docs.map((d) => d.data() as Attempt);
    return mergeWorkspace(createSeedData(new Date(seedBase)), tests, attempts);
  }

  async saveTest(test: Test) {
    const wsRef = await this.wsRef();
    await setDoc(doc(wsRef, "tests", test.id), test);
  }

  async deleteTest(id: string) {
    const wsRef = await this.wsRef();
    await deleteDoc(doc(wsRef, "tests", id));
  }

  async saveAttempt(attempt: Attempt) {
    const wsRef = await this.wsRef();
    await setDoc(doc(wsRef, "attempts", attempt.id), attempt);
  }

  async reset() {
    const wsRef = await this.wsRef();
    const [testSnap, attemptSnap] = await Promise.all([getDocs(collection(wsRef, "tests")), getDocs(collection(wsRef, "attempts"))]);
    const batch = writeBatch(this.db);
    testSnap.docs.forEach((d) => batch.delete(d.ref));
    attemptSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await deleteDoc(wsRef);
  }
}
