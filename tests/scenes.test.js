import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeRng } from '../src/utils.js';
import { ITEM_META, ITEM_TYPES, PLACE_BOUNDS, MAX_ITEMS, placeLimits, GLASS_INNER } from '../src/scenes/item-meta.js';
import { THEMES } from '../src/scenes/themes.js';
import { sanitizeDoc, sanitizeItem, sanitizeFish, FISH_IDS, FISH_MAX, FISH_TOTAL_MAX, fishTotal, emptyDoc } from '../src/scenes/scene-doc.js';
import { PRESETS } from '../src/scenes/presets.js';
import { createSceneStore, careKey, MAX_SCENES, VERSION, BACKUP_KEY } from '../src/scenes/scene-store.js';
import { createHistory } from '../src/editor/history.js';
import { TANK_STYLES, resolveTank, isNatural } from '../src/scenes/tank-styles.js';
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
  it('原型链上的键名（constructor/__proto__/toString）当作未知类型丢弃，不会抛错', () => {
    for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(sanitizeItem({ id: 'a', type, x: 0, z: 0, rot: 0, s: 1, seed: 1 })).toBeNull();
    }
    const doc = sanitizeDoc({ id: 'x', name: 'x', theme: 'constructor', tank: '__proto__', presetId: 'toString', items: [{ type: 'constructor' }] });
    expect(doc?.theme).toBe('fresh');
    expect(TANK_STYLES[doc?.tank ?? '']).toBeTruthy();
    expect(Object.hasOwn(TANK_STYLES, doc?.tank ?? '')).toBe(true);
    expect(doc?.items).toEqual([]);
    expect(isNatural('constructor')).toBe(false);
  });

  it('FISH_IDS 与 SPECIES 顺序一致', () => {
    expect(FISH_IDS).toEqual(SPECIES.map(s => s.id));
  });

  it('非法物件被丢弃，越界坐标/缩放被夹紧', () => {
    expect(sanitizeItem({ type: 'ufo', x: 0, z: 0 })).toBeNull();
    const it = sanitizeItem({ type: 'rock', x: 99, z: -99, s: 50, rot: -1, seed: -3.7 });
    expect(it.s).toBe(ITEM_META.rock.scale[1]);
    // 大缩放的物件按占地半径收进玻璃内壁（比 PLACE_BOUNDS 更靠里）
    const lim = placeLimits('rock', ITEM_META.rock.scale[1]);
    expect(lim.x).toBeLessThan(PLACE_BOUNDS.x);
    expect(it.x).toBe(lim.x);
    expect(it.z).toBe(-lim.z);
    expect(it.rot).toBeGreaterThanOrEqual(0);
    expect(it.rot).toBeLessThan(Math.PI * 2);
    expect(Number.isInteger(it.seed) && it.seed >= 0).toBe(true);
    // 小物件（气石）不受影响，仍可用满 PLACE_BOUNDS
    const air = sanitizeItem({ type: 'airstone', x: 99, z: -99, s: 1, rot: 0, seed: 1 });
    expect(air.x).toBe(PLACE_BOUNDS.x);
    expect(air.z).toBe(-PLACE_BOUNDS.z);
  });

  it('placeLimits：占地半径×缩放 + 余量不出玻璃内壁，最小也有缸心可摆', () => {
    for (const type of ITEM_TYPES) {
      const meta = ITEM_META[type];
      for (const s of [meta.scale[0], 1, meta.scale[1]]) {
        const lim = placeLimits(type, s);
        expect(lim.x).toBeGreaterThanOrEqual(0.15);
        expect(lim.z).toBeGreaterThanOrEqual(0.15);
        const r = meta.radius * s;
        expect(lim.x).toBe(Math.max(0.15, Math.min(PLACE_BOUNDS.x, GLASS_INNER.x - 0.02 - r)));
        expect(lim.z).toBe(Math.max(0.15, Math.min(PLACE_BOUNDS.z, GLASS_INNER.z - 0.02 - r)));
        // 未触底的轴：占地半径×缩放 + 余量在玻璃内壁之内（触底的超大物件由运行时按真实包络钳制兜底）
        if (lim.x > 0.15) expect(lim.x + r).toBeLessThanOrEqual(GLASS_INNER.x + 1e-9);
        if (lim.z > 0.15) expect(lim.z + r).toBeLessThanOrEqual(GLASS_INNER.z + 1e-9);
      }
    }
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
    // 旧版九种：classic 预设的默认条数与物种表一致；后加的照片皮物种（guppy/betta/harlequin）不入旧预设
    const legacy = ['tetra','gold','angel','cory','koi','clown','lion','mandarin','parrot'];
    for (const id of legacy) expect(classic.fish[id]).toBe(SPECIES.find(s => s.id === id).count);
    for (const id of ['guppy','betta','harlequin']) expect(classic.fish[id] ?? 0).toBe(0);
  });
});

describe('缸体款式', () => {
  it('旧存档缺 tank：预设按预设、其余按主题兜底；非法值同样兜底', () => {
    expect(sanitizeDoc({ id: 'classic', presetId: 'classic', theme: 'fresh' }).tank).toBe('classic');
    expect(sanitizeDoc({ id: 'x', theme: 'reef' }).tank).toBe('reef');
    expect(sanitizeDoc({ id: 'x', theme: 'pond', tank: 'glassbowl' }).tank).toBe('zen');
    expect(resolveTank('rimless', 'reef')).toBe('rimless');
  });

  it('每个预设各配一种不同的缸 / 水域，且都是已知款式', () => {
    const tanks = PRESETS.map(p => sanitizeDoc(p).tank);
    for (const t of tanks) expect(TANK_STYLES[t]).toBeTruthy();
    expect(new Set(tanks).size).toBe(PRESETS.length);
  });

  it('池塘 / 溪流 / 小河是自然水域，溪流有水流而池塘是静水', () => {
    expect(['pond', 'stream', 'river'].every(isNatural)).toBe(true);
    expect(['classic', 'rimless', 'reef', 'zen', 'nope'].some(isNatural)).toBe(false);
    expect(TANK_STYLES.stream.env.current).toBeGreaterThan(0);
    expect(TANK_STYLES.pond.env.current).toBe(0);
    const natural = PRESETS.filter(p => isNatural(p.tank)).map(p => p.id);
    expect(natural).toEqual(['lotus', 'stream', 'river']);
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

  it('老存档：补发新版本加入的预设，且只补一次', () => {
    const old = PRESETS.filter(p => ['classic', 'reef', 'pond'].includes(p.id));
    mem.set('aquarium.scenes', JSON.stringify({ version: 1, activeId: 'reef', scenes: old }));
    const s1 = createSceneStore();
    expect(s1.list().map(s => s.id)).toEqual(PRESETS.map(p => p.id));
    expect(s1.activeId).toBe('reef');
    s1.remove('stream');                                         // 玩家删掉的预设不会再冒出来
    expect(createSceneStore().list().map(s => s.id)).not.toContain('stream');
  });

  it('补发预设不超过场景上限', () => {
    const many = Array.from({ length: MAX_SCENES }, (_, i) => ({ ...PRESETS[0], id: `s${i}`, presetId: undefined }));
    mem.set('aquarium.scenes', JSON.stringify({ version: 1, activeId: 's0', scenes: many }));
    expect(createSceneStore().list()).toHaveLength(MAX_SCENES);
  });

  it('损坏的存档不会让程序崩溃，且重新播种前原样备份', () => {
    mem.set('aquarium.scenes', '{oops');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createSceneStore();
    expect(store.list()).toHaveLength(PRESETS.length);
    expect(store.recovered).toBe(true);
    expect(mem.get(BACKUP_KEY)).toBe('{oops');
  });

  it('来自更新版本的存档只读：启动与保存都不回写', () => {
    const raw = JSON.stringify({ version: VERSION + 1, activeId: 'reef', scenes: [PRESETS[1], { ...PRESETS[0], items: [{ id: 'x', type: 'future-thing', x: 0, z: 0, rot: 0, s: 1, seed: 1 }] }], seeded: PRESETS.map(p => p.id) });
    mem.set('aquarium.scenes', raw);
    const store = createSceneStore();
    expect(store.readOnly).toBe(true);
    store.activate(PRESETS[0].id);
    store.save({ ...store.active(), name: '改名' });
    expect(mem.get('aquarium.scenes')).toBe(raw);
  });

  it('内容没变时启动不回写', () => {
    createSceneStore();
    const first = mem.get('aquarium.scenes');
    const setItem = vi.spyOn(localStorage, 'setItem');
    createSceneStore();
    expect(setItem.mock.calls.filter(([k]) => k === 'aquarium.scenes')).toHaveLength(0);
    expect(mem.get('aquarium.scenes')).toBe(first);
  });

  it('写盘失败时保存抛错并回滚内存', () => {
    const store = createSceneStore();
    const before = store.active();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => store.save({ ...before, name: '新名字' })).toThrow(/保存失败/);
    expect(store.active().name).toBe(before.name);
  });

  it('禁用存储（getItem 抛错）时也能启动', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => {} });
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
