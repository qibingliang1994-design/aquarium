import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Feeder } from '../src/systems/feeder.js';

const WATER_Y = 1.84;
const makeFeeder = () => {
  const ripples = { spawn: vi.fn() };
  vi.useFakeTimers();                             // spawn 内有 setTimeout 第二圈涟漪
  const feeder = new Feeder({ tankGroup: new THREE.Group(), sandHeight: () => 0.2, waterY: WATER_Y, ripples });
  return { feeder, ripples };
};

describe('Feeder', () => {
  it('spawn 一轮投放 10 颗饲料并产生涟漪', () => {
    const { feeder, ripples } = makeFeeder();
    feeder.spawn(new THREE.Vector3(0, WATER_Y, 0));
    expect(feeder.pellets).toHaveLength(10);
    vi.runAllTimers();
    expect(ripples.spawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('consume 同一颗只算一次，并崩出 3 粒碎屑', () => {
    const { feeder } = makeFeeder();
    feeder.spawn(new THREE.Vector3(0, WATER_Y, 0));
    const pellet = feeder.pellets[0];
    expect(feeder.consume(pellet)).toBe(true);
    expect(feeder.consume(pellet)).toBe(false);
    expect(feeder.pellets).toHaveLength(9);
    expect(feeder.crumbs.filter(Boolean)).toHaveLength(3);
    vi.useRealTimers();
  });

  it('被吃掉的饲料与碎屑随时间回收', () => {
    const { feeder } = makeFeeder();
    feeder.spawn(new THREE.Vector3(0, WATER_Y, 0));
    feeder.consume(feeder.pellets[0]);
    for (let k = 0; k < 120; k++) feeder.update(1 / 60, k / 60);   // 2 秒
    expect(feeder.items.filter(Boolean)).toHaveLength(9);
    expect(feeder.crumbs.filter(Boolean)).toHaveLength(0);
    vi.useRealTimers();
  });

  it('饲料下沉后停在沙面上', () => {
    const { feeder } = makeFeeder();
    feeder.spawn(new THREE.Vector3(0, WATER_Y, 0));
    for (let k = 0; k < 60 * 25; k++) feeder.update(1 / 60, k / 60);  // 25 秒（28 秒后才会消失）
    for (const p of feeder.pellets) expect(p.p.y).toBeCloseTo(0.2 + 0.018, 5);
    vi.useRealTimers();
  });

  it('有水流时下沉的饲料顺流漂向 +x', () => {
    const { feeder } = makeFeeder();
    feeder.flow = 0.16;
    feeder.spawn(new THREE.Vector3(0, WATER_Y, 0));
    const x0 = feeder.pellets.reduce((a, p) => a + p.p.x, 0);
    for (let i = 0; i < 30; i++) feeder.update(1 / 30, i / 30);
    const x1 = feeder.pellets.reduce((a, p) => a + p.p.x, 0);
    expect(x1 - x0).toBeGreaterThan(feeder.pellets.length * 0.08);
    vi.useRealTimers();
  });
});
