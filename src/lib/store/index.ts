import { getFirebaseApp } from "../firebase";
import { FirestoreStore } from "./firestore";
import { LocalStore } from "./local";
import type { DataStore } from "./types";

export function createStore(): DataStore {
  const app = getFirebaseApp();
  return app ? new FirestoreStore(app) : new LocalStore();
}
