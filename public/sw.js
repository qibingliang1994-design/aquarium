/* ================================================================
 * Service Worker：离线可玩
 * - 页面导航：网络优先（保证拿到新版本），离线回退缓存；cache.put 必须 await，
 *   否则 respondWith 结束时浏览器可能在写入完成前杀掉 worker
 * - 模型与贴图：网络优先，失败再回退缓存（大文件不占着旧版本不放）
 * - 其余静态资源（Vite 带哈希的产物、图标）：缓存优先 + 后台更新
 * - 运行时缓存有条数和体积上限，导航页与 manifest 不参与淘汰
 * 仅在生产构建注册（main.js 里以 import.meta.env.PROD 判断），dev 不介入
 * ================================================================ */
const CACHE = 'aquarium-v2.2.7';
const PRECACHE = ['./', './manifest.webmanifest'];
const MAX_ENTRIES = 80;
const MAX_BYTES = 32 * 1024 * 1024;

function isHeavy(/** @type {URL} */ url){
  return /\.(glb|gltf|webp|png|jpe?g|ktx2)(\?|$)/i.test(url.pathname);
}

function weightOf(/** @type {Response} */ res){
  const n = Number(res.headers.get('content-length'));
  return Number.isFinite(n) && n > 0 ? n : 256 * 1024;
}

function isPinned(/** @type {Request} */ req){
  const path = new URL(req.url).pathname;
  return path.endsWith('/') || path.endsWith('manifest.webmanifest') || path.endsWith('/index.html');
}

/** 写入后按插入顺序淘汰最旧的非钉住条目，直到条数和体积都在上限内 */
async function putCapped(/** @type {Cache} */ cache, /** @type {Request} */ req, /** @type {Response} */ res){
  await cache.put(req, res);
  const keys = await cache.keys();
  /** @type {{ k:Request, w:number, pin:boolean }[]} */
  const sized = [];
  let bytes = 0;
  for (const k of keys){
    const hit = await cache.match(k);
    const w = hit ? weightOf(hit) : 0;
    bytes += w;
    sized.push({ k, w, pin: isPinned(k) });
  }
  let overflow = sized.length - MAX_ENTRIES;
  for (const item of sized){
    if (overflow <= 0 && bytes <= MAX_BYTES) break;
    if (item.pin) continue;
    await cache.delete(item.k);
    bytes -= item.w;
    overflow--;
  }
}

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
        try {
          const cache = await caches.open(CACHE);
          await cache.put('./', fresh.clone());
        } catch (err) { /* 缓存失败不挡本次导航 */ }
        return fresh;
      } catch (err) {
        return (await caches.match('./')) ?? Response.error();
      }
    })());
    return;
  }

  // 模型 / 贴图：网络优先，离线才用缓存。成功后计入容量上限
  if (isHeavy(url)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          try { await putCapped(await caches.open(CACHE), req, res.clone()); } catch (err) { /* 缓存失败仍返回网络结果 */ }
        }
        return res;
      } catch (err) {
        return (await caches.match(req)) ?? Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {                               // 命中：先回缓存，后台悄悄更新
      e.waitUntil(fetch(req).then(async res => {
        if (res && res.ok) await putCapped(await caches.open(CACHE), req, res.clone());
      }).catch(() => {}));
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) await putCapped(await caches.open(CACHE), req, res.clone());
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
