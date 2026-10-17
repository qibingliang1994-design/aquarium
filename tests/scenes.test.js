import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeRng } from '../src/utils.js';
import { ITEM_META, ITEM_TYPES, PLACE_BOUNDS, MAX_ITEMS } from '../src/scenes/item-meta.js';
import { THEMES } from '../src/scenes/themes.js';
import { sanitizeDoc, sanitizeItem, sanitizeFish, FISH_IDS, FISH_MAX, FISH_TOTAL_MAX, fishTotal, emptyDoc } from '../src/scenes/scene-doc.js';
import { PRESETS } from '../src/scenes/presets.js';
import { createSceneStore, careKey, MAX_SCENES } from '../src/scenes/scene-store.js';
import { createHistory } from '../src/editor/history.js';
import { SPECIES } from '../src/entities/fish/species.js';

function stubStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  });
  return store;
}

describe('makeRng', () => {
  it('同一 seed 序列一致、不同 seed 不同，且落在 [0,1)', () => {
    const a = makeRng(42), b = makeRng(42), c = makeRng(43);
    const xs = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(xs);
    expect(Array.from({ length: 50 }, c)).not.toEqual(xs);
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
  });
});

describe('场景文档校验', () => {
  it('FISH_IDS 与 SPECIES 顺序一致', () => {
    expect(FISH_IDS).toEqual(SPECIES.map(s => s.id));
  });

  it('非法物件被丢弃，越界坐标/缩放被夹紧', () => {
    expect(sanitizeItem({ type: 'ufo', x: 0, z: 0 })).toBeNull();
    const it = sanitizeItem({ type: 'rock', x: 99, z: -99, s: 50, rot: -1, seed: -3.7 });
    expect(it.x).toBe(PLACE_BOUNDS.x);
    expect(it.z).toBe(-PLACE_BOUNDS.z);
    expect(it.s).toBe(ITEM_META.rock.scale[1]);
    expect(it.rot).toBeGreaterThanOrEqual(0);
    expect(it.rot).toBeLessThan(Math.PI * 2);
    expect(Number.isInteger(it.seed) && it.seed >= 0).toBe(true);
  });

  it('鱼群：单种上限 + 总数上限 + 未知物种忽略', () => {
    const f = sanitizeFish({ tetra: 999, gold: -2, shark: 5, koi: 2.9 });
    expect(f.tetra).toBe(FISH_MAX.tetra);
    expect(f.gold).toBe(0);
    expect(f.koi).toBe(2);
    expect(f).not.toHaveProperty('shark');
    const all = sanitizeFish(Object.fromEntries(FISH_IDS.map(id => [id, 999])));
    expect(Object.values(all).reduce((a, n) => a + n, 0)).toBe(FISH_TOTAL_MAX);
  });

  it('文档：缺 id 拒绝；名称/主题兜底；物件数量封顶；重复 id 重新生成', () => {
    expect(sanitizeDoc({ name: 'x' })).toBeNull();
    const items = Array.from({ length: MAX_ITEMS + 5 }, () => ({ id: 'dup', type: 'rock', x: 0, z: 0 }));
    const d = sanitizeDoc({ id: 'a', name: '   ', theme: 'lava', items });
    expect(d.name).toBe('未命名水景');
    expect(d.theme).toBe('fresh');
    expect(d.items).toHaveLength(MAX_ITEMS);
    expect(new Set(d.items.map(i => i.id)).size).toBe(MAX_ITEMS);
  });

  it('空缸模板只有一个气石', () => {
    const d = emptyDoc('新缸', 'reef');
    expect(d.items.map(i => i.type)).toEqual(['airstone']);
    expect(fishTotal(d)).toBe(0);
  });
});

describe('预设', () => {
  it.each(PRESETS.map(p => [p.id, p]))('%s 经清洗后不丢任何内容', (_, p) => {
    const d = sanitizeDoc(p);
    expect(d.items).toHaveLength(p.items.length);
    expect(THEMES[p.theme]).toBeTruthy();
    for (const it of p.items) expect(ITEM_TYPES).toContain(it.type);
    expect(d.fish).toEqual(sanitizeFish(p.fish));
    expect(fishTotal(d)).toBe(Object.values(p.fish).reduce((a, n) => a + n, 0));   // 没被上限截断
  });

  it('经典混养保留旧版鱼群数量', () => {
    const classic = PRESETS.find(p => p.id === 'classic');
    for (const s of SPECIES) expect(classic.fish[s.id]).toBe(s.count);
  });
});

describe('createSceneStore', () => {
  let mem;
  beforeEach(() => { mem = stubStorage(); });

  it('首次运行用预设播种，并迁移旧饲养存档给经典场景', () => {
    mem.set('aquarium.care', '{"satiety":0.8}');
    const store = createSceneStore();
    expect(store.list().map(s => s.id)).toEqual(PRESETS.map(p => p.id));
    expect(store.activeId).toBe('classic');
    expect(mem.get(careKey('classic'))).toBe('{"satiety":0.8}');
    expect(mem.has('aquarium.care')).toBe(false);
  });

  it('保存 / 复制 / 改名 / 删除后重新读取仍一致', () => {
    const s1 = createSceneStore();
    const copy = s1.duplicate('reef');
    expect(copy.presetId).toBeUndefined();
    expect(copy.items.every((it, i) => it.id !== s1.get('reef').items[i].id)).toBe(true);
    s1.rename(copy.id, '  我的礁石  ');
    s1.activate(copy.id);
    const s2 = createSceneStore();
    expect(s2.activeId).toBe(copy.id);
    expect(s2.get(copy.id).name).toBe('我的礁石');
    expect(s2.list().map(s => s.id).indexOf(copy.id)).toBe(2);   // 紧挨原场景
    expect(s2.remove(copy.id)).toBe(true);
    expect(s2.activeId).toBe('reef');                            // 删当前 → 切到相邻
  });

  it('恢复预设：布局回到预设，名称保留', () => {
    const store = createSceneStore();
    const d = store.get('pond');
    d.items = []; d.name = '小池塘';
    store.save(d);
    const r = store.reset('pond');
    expect(r.name).toBe('小池塘');
    expect(r.items).toHaveLength(PRESETS.find(p => p.id === 'pond').items.length);
  });

  it('至少保留一个场景，数量有上限', () => {
    const store = createSceneStore();
    for (const s of store.list().slice(1)) store.remove(s.id);
    expect(store.remove(store.activeId)).toBe(false);
    while (store.canAdd()) store.create('x', 'fresh');
    expect(store.list()).toHaveLength(MAX_SCENES);
    expect(store.duplicate(store.activeId)).toBeNull();
  });

  it('损坏的存档不会让程序崩溃', () => {
    mem.set('aquarium.scenes', '{oops');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createSceneStore().list()).toHaveLength(PRESETS.length);
  });
});

describe('createHistory', () => {
  it('撤销/重做往返，新改动清空重做栈', () => {
    const h = createHistory(3);
    h.push('a'); h.push('b');
    expect(h.undo('c')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.canRedo).toBe(false);
    h.undo('c');
    h.push('x');
    expect(h.canRedo).toBe(false);
  });

  it('超过上限时丢弃最早的快照', () => {
    const h = createHistory(2);
    h.push('1'); h.push('2'); h.push('3');
    expect(h.undo('4')).toBe('3');
    expect(h.undo('3')).toBe('2');
    expect(h.undo('2')).toBeNull();
  });
});
