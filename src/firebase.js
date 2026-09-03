// Firebase Realtime Database storage layer
// ----------------------------------------
// The dashboard used to keep its database in data/db.json (served by a Vite
// dev-server plugin). Everything now lives in the Firebase Realtime Database
// below, under the DB_ROOT node, so the data is shared across every device
// that opens the app instead of being stuck on one laptop.

import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, get, update, set } from "firebase/database";

export const firebaseConfig = {
  apiKey: "AIzaSyAr4IYnykpwovqOJWzfBd7abVdAma_Ig3Q",
  authDomain: "diet-planner-3bdf3.firebaseapp.com",
  databaseURL: "https://diet-planner-3bdf3-default-rtdb.firebaseio.com",
  projectId: "diet-planner-3bdf3",
  storageBucket: "diet-planner-3bdf3.firebasestorage.app",
  messagingSenderId: "927878354911",
  appId: "1:927878354911:web:2e616b171a267b9910566a",
  measurementId: "G-MSYWCM58MT",
};

// Everything this dashboard owns is stored under this single root node so the
// project shares the database with the other apps already in it.
export const DB_ROOT = "smart_vehicle_system";

// Child nodes created under DB_ROOT. Each one shows up separately in the
// Firebase console and is written independently.
export const DB_NODES = [
  "meta",
  "settings",
  "users",
  "dropLocations",
  "rides",
  "payments",
  "locationSamples",
  "events",
  "vehicle",
];

export const firebaseApp = initializeApp(firebaseConfig);
export const realtimeDb = getDatabase(firebaseApp);

export const rootRef = () => ref(realtimeDb, DB_ROOT);
export const nodeRef = (node) => ref(realtimeDb, `${DB_ROOT}/${node}`);

// Live subscription: every change made from any device is pushed here.
export function subscribeToDatabase(onData, onError) {
  return onValue(
    rootRef(),
    (snapshot) => onData(snapshot.val()),
    (error) => onError?.(error)
  );
}

export async function readDatabaseOnce() {
  const snapshot = await get(rootRef());
  return snapshot.val();
}

// Writes only the nodes that actually changed. Firebase drops keys whose value
// is `undefined`, and stores an empty array as `null`, so empty collections are
// normalised to null explicitly.
export async function writeDatabaseNodes(db, previous = null) {
  const patch = {};
  for (const node of DB_NODES) {
    const value = db?.[node];
    if (value === undefined) continue;
    const next = Array.isArray(value) && value.length === 0 ? null : value;
    if (previous && JSON.stringify(previous[node] ?? null) === JSON.stringify(next ?? null)) continue;
    patch[node] = next ?? null;
  }
  if (!Object.keys(patch).length) return patch;
  await update(rootRef(), patch);
  return patch;
}

// Full overwrite - used by the "Import JSON Backup" action.
export async function replaceDatabase(db) {
  const payload = {};
  for (const node of DB_NODES) {
    const value = db?.[node];
    payload[node] = Array.isArray(value) && value.length === 0 ? null : value ?? null;
  }
  await set(rootRef(), payload);
  return payload;
}
