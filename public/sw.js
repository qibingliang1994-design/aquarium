/* ================================================================
 * Service Worker：离线可玩
 * - 页面导航：网络优先（保证拿到新版本），离线回退缓存
 * - 静态资源（Vite 带哈希的产物、模型、图标）：缓存优先 + 后台更新
 * 仅在生产构建注册（main.js 里以 import.meta.env.PROD 判断），dev 不介入
 * ================================================================ */
const CACHE = 'aquarium-v2.2.5';
const PRECACHE = ['./', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE).catch(() => {});   // 预缓存失败不阻塞安装
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./')) ?? Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {                               // 命中：先回缓存，后台悄悄更新
      e.waitUntil(fetch(req).then(async res => {
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      }).catch(() => {}));
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) await (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
