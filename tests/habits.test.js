import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clingState, stepCling, pickClingSpot, breathState, stepBreath } from '../src/entities/fish/habits.js';

const seq = () => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const SP = { glass: { x: 2.265, z: 0.865 }, gap: 0.026, y0: 0.6, y1: 1.4 };

/** 简化的积分：v += acc·dt，p += v·dt（School 的硬约束在这里不需要） */
function simCling(c, p, v, sec, sp, rng) {
  const acc = new THREE.Vector3(), modes = [];
  for (let t = 0; t < sec; t += 1 / 60) {
    const on = stepCling(c, p, v, acc, 1 / 60, t, sp, rng);
    if (on) { v.addScaledVector(acc, 1 / 60); p.addScaledVector(v, 1 / 60); }
    modes.push(c.mode);
  }
  return modes;
}

describe('小精灵吸玻璃', () => {
  it('吸附点在左右侧玻璃内壁上，头朝上、背朝缸内', () => {
    const c = clingState(seq()), rng = seq();
    for (let k = 0; k < 20; k++) {
      pickClingSpot(c, new THREE.Vector3(k % 2 ? 1 : -1, 1, 0), SP, rng);
      expect(Math.abs(c.a.x)).toBeCloseTo(SP.glass.x - SP.gap, 6);
      expect(Math.abs(c.a.z)).toBeLessThanOrEqual(SP.glass.z - 0.15);
      expect(c.a.y).toBeGreaterThanOrEqual(SP.y0); expect(c.a.y).toBeLessThanOrEqual(SP.y1);
      expect(c.n.x).toBe(-Math.sign(c.a.x));        // 法线指向缸内
      expect(c.f.dot(c.n)).toBeCloseTo(0, 6);        // 头的方向在玻璃平面内
      expect(c.f.y).toBeGreaterThan(0.9);
    }
  });

  it('游过去吸住，过一阵离开并朝缸内推一下', () => {
    const rng = seq(), c = clingState(rng);
    c.t = 0.01;
    const p = new THREE.Vector3(1.5, 1, 0), v = new THREE.Vector3();
    let sec = 0;
    while (c.mode !== 2 && sec < 16) { simCling(c, p, v, 0.1, SP, rng); sec += 0.1; }
    expect(c.mode).toBe(2);
    simCling(c, p, v, 1, SP, rng);                 // 吸住后 1 秒：姿态已基本切到贴玻璃
    expect(c.mode).toBe(2);
    expect(c.w).toBeGreaterThan(0.9);
    expect(Math.abs(p.x)).toBeGreaterThan(2.2);
    c.dur = 0.01;
    const before = v.clone();
    simCling(c, p, v, 0.05, SP, rng);
    expect(c.mode).toBe(0);
    expect(v.clone().sub(before).dot(c.n)).toBeGreaterThan(0.1);
  });

  it('没有玻璃（自然水域）不吸附，吸着时失去玻璃就松开', () => {
    const rng = seq(), c = clingState(rng);
    c.t = 0;
    expect(simCling(c, new THREE.Vector3(), new THREE.Vector3(), 5, null, rng).every(m => m === 0)).toBe(true);
    c.mode = 2; c.dur = 10;
    simCling(c, new THREE.Vector3(), new THREE.Vector3(), 0.05, null, rng);
    expect(c.mode).toBe(0);
  });
});

describe('迷鳃鱼换气', () => {
  it('到点上浮，嘴碰到水面时回调一次，然后回到平常', () => {
    const rng = seq(), b = breathState(rng);
    b.t = 0.01;
    const p = new THREE.Vector3(0, 1.2, 0), v = new THREE.Vector3(), acc = new THREE.Vector3();
    let gulps = 0, rose = false;
    for (let t = 0; t < 8; t += 1 / 60) {
      acc.set(0, 0, 0);
      const on = stepBreath(b, p, v, acc, 1 / 60, 1.8, true, rng, () => gulps++);
      if (on) rose = true;
      v.addScaledVector(acc, 1 / 60).multiplyScalar(0.98); p.addScaledVector(v, 1 / 60);
      p.y = Math.min(p.y, 1.8);
    }
    expect(rose).toBe(true);
    expect(gulps).toBe(1);
    expect(b.mode).toBe(0);
    expect(b.t).toBeGreaterThan(10);
  });

  it('受惊或在抢食时推迟换气', () => {
    const rng = seq(), b = breathState(rng);
    b.t = 0.01;
    const p = new THREE.Vector3(0, 1.2, 0), v = new THREE.Vector3(), acc = new THREE.Vector3();
    expect(stepBreath(b, p, v, acc, 0.02, 1.8, false, rng, undefined)).toBe(false);
    expect(b.mode).toBe(0);
    expect(b.t).toBeGreaterThan(1);
  });
});
