import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCare, MILESTONES } from '../src/systems/care.js';

const KEY = 'aquarium.care';
const SPECIES = [{ id: 'gold', count: 4 }, { id: 'tetra', count: 2 }];

// 内存版 localStorage + 空 addEventListener（care 会注册 pagehide 落盘）
function stubBrowser(initial = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  });
  vi.stubGlobal('addEventListener', vi.fn());
  return store;
}

describe('createCare', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('无存档时使用初始饱食度 0.3', () => {
    stubBrowser();
    const care = createCare(SPECIES);
    expect(care.satiety).toBeCloseTo(0.3);
    expect(care.growthOf('gold', 0)).toBe(1);
  });

  it('离线期间按时间衰减（180 秒从 1 到 0）', () => {
    const t0 = Date.now();
    stubBrowser({ [KEY]: JSON.stringify({ satiety: 1, t: t0 - 90_000, fed: {} }) });
    expect(createCare(SPECIES).satiety).toBeCloseTo(0.5, 3);
  });

  it('存档饱食度为 0 时不会被误当成缺省值', () => {
    stubBrowser({ [KEY]: JSON.stringify({ satiety: 0, t: Date.now(), fed: {} }) });
    expect(createCare(SPECIES).satiety).toBe(0);
  });

  it('损坏的存档回退到默认值并告警', () => {
    stubBrowser({ [KEY]: '{not json' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const care = createCare(SPECIES);
    expect(care.satiety).toBeCloseTo(0.3);
    expect(warn).toHaveBeenCalled();
  });

  it('个体喂食数组按物种数量补齐/截断，非法值归零', () => {
    stubBrowser({ [KEY]: JSON.stringify({ satiety: 0.5, t: Date.now(), fed: { gold: [30, 'x', -4, 6, 99] } }) });
    const care = createCare(SPECIES);
    expect(care.growthArray('gold')).toHaveLength(4);
    expect(care.growthProgress('gold', 0)).toBe(1);
    expect(care.growthProgress('gold', 1)).toBe(0);
    expect(care.growthProgress('gold', 2)).toBe(0);
    expect(care.growthProgress('gold', 3)).toBeCloseTo(0.2);
    expect(care.growthArray('tetra')).toEqual([1, 1]);
  });

  it('eat：饱食度 +0.025、个体成长，体型上限 1.25', () => {
    stubBrowser();
    const care = createCare(SPECIES);
    care.satiety = 0;
    let g = 1;
    for (let k = 0; k < 40; k++) g = care.eat('gold', 2);
    expect(care.satiety).toBe(1);                 // 40 颗 × 0.025，封顶 1
    expect(g).toBeCloseTo(1.25);
    expect(care.growthOf('gold', 2)).toBeCloseTo(1.25);
    expect(care.growthOf('gold', 0)).toBe(1);     // 其它鱼不受影响
  });

  it('食欲随饱食度单调下降：饿=1，吃饱≈0', () => {
    stubBrowser();
    const care = createCare(SPECIES);
    const at = s => { care.satiety = s; return care.appetite(); };
    expect(at(0)).toBe(1);
    expect(at(0.97)).toBe(0);
    let prev = 2;
    for (let s = 0; s <= 1; s += 0.05) { const a = at(s); expect(a).toBeLessThanOrEqual(prev); prev = a; }
  });

  it('状态文案随饥饿度分档', () => {
    stubBrowser();
    const care = createCare(SPECIES);
    const label = s => { care.satiety = s; return care.status(); };
    expect(label(0)).toBe('饥肠辘辘');
    expect(label(0.4)).toBe('觅食中');
    expect(label(0.7)).toBe('半饱');
    expect(label(1)).toBe('酒足饭饱');
  });

  it('update 衰减饱食度，有改动时 2 秒内落盘', () => {
    const store = stubBrowser();
    const care = createCare(SPECIES);
    care.satiety = 0.8;
    care.update(1);
    expect(store.has(KEY)).toBe(false);           // 未到落盘间隔
    care.update(1.1);
    expect(care.satiety).toBeCloseTo(0.8 - 2.1 / 180, 4);
    const saved = JSON.parse(store.get(KEY));
    expect(saved.satiety).toBeCloseTo(care.satiety, 6);
    expect(saved.fed.gold).toHaveLength(4);
  });

  it('eat 支持新入缸个体的下标（成长数组自动扩容）', () => {
    stubBrowser();
    const care = createCare(SPECIES);             // gold 初始 4 条
    care.eat('gold', 4);
    expect(care.growthProgress('gold', 4)).toBeCloseTo(1 / 30, 5);
    expect(care.growthArray('gold')).toHaveLength(5);
  });

  it('亲密度：bond 只增不减，里程碑到达/领取与进度', () => {
    stubBrowser();
    const care = createCare(SPECIES);
    expect(care.bondLevel).toBe(0);
    expect(care.milestoneDue()).toBe(false);
    for (let k = 0; k < 80; k++) care.eat('gold', 0);
    expect(care.milestoneDue()).toBe(true);
    expect(care.bondProgress()).toBeCloseTo(1, 3);
    expect(care.takeMilestone()).toBe(true);
    expect(care.bondLevel).toBe(1);
    expect(care.milestoneDue()).toBe(false);
    expect(care.bondProgress()).toBeCloseTo(0, 3);   // (80-80)/(200-80)
    expect(care.glossK()).toBe(0);
  });

  it('里程碑全部领完后 bond 转为光泽度', () => {
    stubBrowser();
    const care = createCare(SPECIES);
    const total = MILESTONES[MILESTONES.length - 1] + 300;
    for (let k = 0; k < total; k++) care.eat('gold', 0);
    while (care.milestoneDue()) care.takeMilestone();
    expect(care.bondLevel).toBe(MILESTONES.length);
    expect(care.glossK()).toBeCloseTo(300 / 600, 3);
    expect(care.bondProgress()).toBeCloseTo(0.5, 3);
  });

  it('亲密度与里程碑随存档持久化（离线不衰减）', () => {
    const store = stubBrowser();
    const care = createCare(SPECIES);
    for (let k = 0; k < 80; k++) care.eat('gold', 0);
    care.takeMilestone();
    care.update(3);                               // 触发落盘
    const saved = JSON.parse(store.get(KEY));
    expect(saved.bond).toBe(80);
    expect(saved.milestones).toBe(1);
    vi.setSystemTime(new Date('2026-10-16T14:00:00Z'));   // 两小时后重开
    const again = createCare(SPECIES);
    expect(again.bondLevel).toBe(1);
    expect(again.milestoneDue()).toBe(false);
  });
});
