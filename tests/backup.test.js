import { describe, it, expect } from 'vitest';
import { collectSave, validateSave, applySave } from '../src/ui/backup.js';

// 内存版 localStorage（实现 length/key/getItem/setItem/removeItem）
function makeLS(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    dump: () => Object.fromEntries(store),
  };
}

describe('collectSave', () => {
  it('只收 aquarium.* 键，其余不动', () => {
    const ls = makeLS({
      'aquarium.settings': '{"sound":true}',
      'aquarium.care.sc-1': '{"bond":80}',
      'other-app': 'x',
    });
    const save = collectSave(ls);
    expect(save.app).toBe('aquarium-save');
    expect(Object.keys(save.items)).toEqual(['aquarium.settings', 'aquarium.care.sc-1']);
  });

  it('空存储导出空 items', () => {
    expect(Object.keys(collectSave(makeLS()).items)).toHaveLength(0);
  });
});

describe('validateSave', () => {
  it('接受合法存档并只保留 aquarium.* 字符串键', () => {
    const ok = validateSave({
      app: 'aquarium-save', version: 1,
      items: { 'aquarium.settings': '{}', 'evil': 'x', 'aquarium.bad': 123 },
    });
    expect(ok).not.toBeNull();
    expect(Object.keys(ok.items)).toEqual(['aquarium.settings']);
  });

  it('拒绝坏存档：非对象 / 错 app / items 非对象 / 空 items', () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave('x')).toBeNull();
    expect(validateSave({ app: 'other', items: {} })).toBeNull();
    expect(validateSave({ app: 'aquarium-save', items: [1, 2] })).toBeNull();
    expect(validateSave({ app: 'aquarium-save', items: { nope: 'x' } })).toBeNull();
  });
});

describe('applySave', () => {
  it('整体替换：旧 aquarium.* 清掉，非 aquarium 键保留', () => {
    const ls = makeLS({
      'aquarium.settings': 'old',
      'aquarium.scenes': 'old-scenes',
      'keep-me': 'yes',
    });
    const n = applySave(ls, { items: { 'aquarium.settings': 'new', 'aquarium.care.sc-9': '{}' } });
    expect(n).toBe(2);
    expect(ls.dump()).toEqual({
      'keep-me': 'yes',
      'aquarium.settings': 'new',
      'aquarium.care.sc-9': '{}',
    });
  });

  it('导出 → 导入 往返一致', () => {
    const a = makeLS({ 'aquarium.scenes': '{"v":1}', 'aquarium.thumbs': '{"sc":"data:..."}' });
    const payload = validateSave(JSON.parse(JSON.stringify(collectSave(a))));
    expect(payload).not.toBeNull();
    const b = makeLS({ 'aquarium.scenes': 'stale' });
    applySave(/** @type {any} */ (b), payload);
    expect(b.dump()).toEqual(a.dump());
  });

  it('写入中途失败时恢复旧键，不留下半截新档', () => {
    const ls = makeLS({
      'aquarium.settings': 'old-settings',
      'aquarium.scenes': 'old-scenes',
      'keep-me': 'yes',
    });
    const orig = ls.setItem;
    ls.setItem = (k, v) => {
      if (k === 'aquarium.care.sc-9') throw new Error('quota');
      orig(k, v);
    };
    expect(() => applySave(ls, { items: {
      'aquarium.settings': 'new-settings',
      'aquarium.care.sc-9': '{}',
    } })).toThrow(/quota/);
    expect(ls.dump()).toEqual({
      'keep-me': 'yes',
      'aquarium.settings': 'old-settings',
      'aquarium.scenes': 'old-scenes',
    });
  });
});
