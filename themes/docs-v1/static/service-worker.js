const CACHE_VERSION = "2";
const OFFLINE_PAGE_URL = "/offline.html";
const CACHES = {
  primary: `primary-v${CACHE_VERSION}`,
};
const CACHE_NAMES = Object.values(CACHES);

const CACHE_TYPES = [
  "document",
  "image",
  "script",
  "style",
  "manifest",
  "font",
];

const NETWORK_FIRST_TYPES = ["document"];

const HEADERS_TO_COMPARE = ["Content-Length", "ETag", "Last-Modified"];

const state = {
  online: true,
};

async function activate() {
  if ("navigationPreload" in self.registration) {
    await self.registration.navigationPreload.enable();
  }

  const cacheNames = await caches.keys();

  return Promise.all([
    ...cacheNames.map((cacheName) => {
      if (!CACHE_NAMES.includes(cacheName)) {
        return caches.delete(cacheName);
      }
    }),
    self.clients.claim(),
  ]);
}

function doCacheHeadersMatch(
  cachedResponse,
  networkResponse,
  headers = HEADERS_TO_COMPARE
) {
  return (
    !cachedResponse ||
    headers.some((header) => {
      return (
        cachedResponse.headers.get(header) !==
        networkResponse.headers.get(header)
      );
    })
  );
}

async function fetchFromNetwork(event, cache, cachedResponse) {
  let networkResponse;

  try {
    if ("preloadResponse" in event) {
      networkResponse = await event.preloadResponse;
    }

    if (!networkResponse) {
      networkResponse = await fetch(event.request);
    }
  } catch {
    // Fetch should only throw when it gets an invalid response of some sort,
    // so when it does we'll try to serve the page from the cache, otherwise
    // show our offline page.
    return cachedResponse || cache.match(OFFLINE_PAGE_URL);
  }

  if (
    networkResponse.status === 200 &&
    CACHE_TYPES.includes(event.request.destination) &&
    doCacheHeadersMatch(cachedResponse, networkResponse)
  ) {
    cache.put(event.request, networkResponse.clone());
  }

  return networkResponse;
}

async function fetchResponder(event) {
  const cache = await caches.open(CACHES.primary);

  const cachedResponse = await cache.match(event.request);
  const networkResponse = fetchFromNetwork(event, cache, cachedResponse);

  if (state.online && NETWORK_FIRST_TYPES.includes(event.request.destination)) {
    return networkResponse || cachedResponse;
  }

  return cachedResponse || networkResponse;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(CACHES.primary)
      .then((cache) => cache.addAll([OFFLINE_PAGE_URL]))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

/*
  Intercept requests and attempt to serve from the cache if possible
*/
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(fetchResponder(event));
});

self.addEventListener("message", (event) => {
  if ("networkStatus" in event.data) {
    state.online = event.data.networkStatus;
  }
});
