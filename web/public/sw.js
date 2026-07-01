/* Cookless service worker — runtime caching only (Plan 8f). */
const VERSION = "v1";
const STATIC_CACHE = `cookless-static-${VERSION}`;
const PAGES_CACHE = `cookless-pages-${VERSION}`;
const OFFLINE_ROUTES = ["/shopping", "/plan", "/recipes"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

function isStaticAsset(url, request) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    ["style", "script", "image", "font"].includes(request.destination)
  );
}

function isCacheableNav(url, request) {
  const isRsc = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  const isNav = request.mode === "navigate" || isRsc;
  if (!isNav) return false;
  return OFFLINE_ROUTES.some((r) => url.pathname === r || url.pathname.startsWith(r + "/"));
}

function pageCacheKey(url) {
  const u = new URL(url);
  u.searchParams.delete("_rsc");
  return u.toString();
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  const key = pageCacheKey(url);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url, request)) {
    event.respondWith(cacheFirst(request));
  } else if (isCacheableNav(url, request)) {
    event.respondWith(networkFirst(request, url));
  }
});
