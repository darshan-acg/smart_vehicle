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
// Hardware nodes the ESP32 owns. relay1 / relay2 are written by the dashboard
// and read by the board; sensorData is written by the board and only read here.
// They are deliberately kept out of DB_NODES so the database sync never
// overwrites them and a sensor reading never looks like a database change.
export const RELAY_PAYMENT = "relay1";
export const RELAY_GEOFENCE = "relay2";
export const SENSOR_NODE = "sensorData";

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

// Keeps only the app-owned nodes out of a root snapshot, so relay and sensor
// traffic from the board is ignored by the database layer.
export function pickDatabaseNodes(value) {
  if (!value || typeof value !== "object") return null;
  const picked = {};
  for (const node of DB_NODES) {
    if (value[node] !== undefined) picked[node] = value[node];
  }
  return Object.keys(picked).length ? picked : null;
}

// Reads the hardware branch out of a root snapshot. sensorData carries the
// three live battery readings written by the board: battery_percentage,
// current and voltage.
export function pickHardware(value) {
  const sensor = value?.[SENSOR_NODE] || {};
  return {
    relay1: Number(value?.[RELAY_PAYMENT]) === 1 ? 1 : 0,
    relay2: Number(value?.[RELAY_GEOFENCE]) === 1 ? 1 : 0,
    battery: sensor.battery_percentage ?? null,
    current: sensor.current ?? null,
    voltage: sensor.voltage ?? null,
  };
}

// Decides what the two relays should be for the current trip state. Both
// lines carry the same value, because both answer the same question: is the
// vehicle authorised to run right now?
//
//   1 once the OTP for the live trip is verified and the user is not outside
//     the boundary the admin set.
//   0 the moment the user leaves that boundary - the tracker clears the
//     verified OTP and locks the motor - and once the trip is completed or
//     cancelled, so the vehicle stays off until an OTP is verified again.
export const FINISHED_TRIP_STATUSES = ["TRIP COMPLETED", "CANCELLED"];

export function relayTargets(currentRide, insideFence) {
  const authorised = Boolean(
    currentRide &&
    !FINISHED_TRIP_STATUSES.includes(currentRide.tripStatus) &&
    currentRide.otpVerified &&
    !currentRide.motorLocked &&
    insideFence !== false
  );
  const line = authorised ? 1 : 0;
  return { relay1: line, relay2: line };
}

// Drives one relay. Always writes a plain 0 or 1 so the ESP32 can read it
// straight off the node.
export async function setRelay(relay, on) {
  await set(ref(realtimeDb, `${DB_ROOT}/${relay}`), on ? 1 : 0);
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
