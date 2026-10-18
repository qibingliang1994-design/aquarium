import { describe, it, expect, beforeEach, vi } from 'vitest';

// write-lock 有模块级状态：每个用例重新加载模块
function stubStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  });
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('removeEventListener', vi.fn());
  return store;
}
/** 模拟 Web Locks：held=true 表示锁已被别的窗口持有 */
function stubLocks(held) {
  vi.stubGlobal('navigator', { locks: { request: (_name, _opts, cb) => Promise.resolve(cb(held ? null : {})) } });
}

describe('多窗口单写者', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

  it('没有 Web Locks 时可写', async () => {
    vi.stubGlobal('navigator', {});
    const { acquireWriter, canWrite } = await import('../src/systems/write-lock.js');
    expect(await acquireWriter()).toBe(true);
    expect(canWrite()).toBe(true);
  });

  it('第一个窗口拿到锁：可写', async () => {
    stubLocks(false);
    const { acquireWriter, canWrite } = await import('../src/systems/write-lock.js');
    expect(await acquireWriter()).toBe(true);
    expect(canWrite()).toBe(true);
  });

  it('锁被别的窗口持有：场景存档与饲养存档都不写', async () => {
    stubLocks(true);
    const mem = stubStorage();
    const { acquireWriter, canWrite } = await import('../src/systems/write-lock.js');
    expect(await acquireWriter()).toBe(false);
    expect(canWrite()).toBe(false);
    const { createSceneStore } = await import('../src/scenes/scene-store.js');
    const store = createSceneStore();
    expect(store.readOnly).toBe(true);
    store.save({ ...store.active(), name: '改名' });
    store.setThumb(store.activeId, 'data:x');
    expect(mem.size).toBe(0);
    const { createCare } = await import('../src/systems/care.js');
    const care = createCare([{ id: 'gold', count: 2 }], { key: 'aquarium.care.x' });
    care.eat('gold', 0);
    care.save();
    expect(mem.size).toBe(0);
  });
});
