/// <reference lib="webworker" />

import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// Precache static assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// ------------------------------------------------------------------
// Runtime caching strategies
// ------------------------------------------------------------------

// Meal plans & shopping lists — StaleWhileRevalidate
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/v1/meal-plans/") ||
    url.pathname.startsWith("/api/v1/shopping-lists/"),
  new StaleWhileRevalidate({
    cacheName: "api-plan-shopping",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// Recipes — NetworkFirst with 3 s timeout
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/v1/recipes/"),
  new NetworkFirst({
    cacheName: "api-recipes",
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// Static assets (js, css, images, fonts) — CacheFirst
registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font",
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// ------------------------------------------------------------------
// Offline sync for shopping-list toggles
// ------------------------------------------------------------------

const DB_NAME = "cookless-offline";
const STORE_NAME = "pending-toggles";
const DB_VERSION = 1;

interface PendingToggle {
  id: number;
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

async function storePendingToggle(toggle: Omit<PendingToggle, "id">): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(toggle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPendingToggles(): Promise<PendingToggle[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PendingToggle[]);
    request.onerror = () => reject(request.error);
  });
}

async function deletePendingToggle(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Intercept shopping-list toggle PATCH requests when offline
self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  const isToggle =
    request.method === "PATCH" &&
    (url.pathname.match(/\/api\/v1\/shopping-lists\/items\/[^/]+\/toggle\/$/) !== null ||
      url.pathname === "/api/v1/shopping-lists/items/bulk-toggle/");

  if (!isToggle) return;

  event.respondWith(
    fetch(request.clone()).catch(async () => {
      // Offline — store the request for later replay
      const body = await request.clone().text();
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });

      await storePendingToggle({
        url: request.url,
        method: request.method,
        body: body || null,
        headers,
        timestamp: Date.now(),
      });

      // Return a synthetic 200 so the UI can optimistically update
      return new Response(JSON.stringify({ queued: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

// Replay pending toggles when back online
async function replayPendingToggles(): Promise<void> {
  const pending = await getAllPendingToggles();
  if (pending.length === 0) return;

  let allSucceeded = true;
  for (const toggle of pending) {
    try {
      await fetch(toggle.url, {
        method: toggle.method,
        headers: toggle.headers,
        body: toggle.body,
        credentials: "include",
      });
      await deletePendingToggle(toggle.id);
    } catch {
      // If replay fails, stop and keep remaining items for next attempt
      allSucceeded = false;
      break;
    }
  }

  if (allSucceeded) {
    // Notify clients to refetch shopping lists
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "SYNC_COMPLETE" });
    }
  }
}

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "REPLAY_PENDING") {
    event.waitUntil(replayPendingToggles());
  }
});

// Listen for online event via clients
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});
