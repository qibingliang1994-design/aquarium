import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { boidsAccumulate, wanderAcc, boundaryAcc, obstacleAcc, huntTarget } from '../src/entities/fish/steering.js';

const V = (x=0, y=0, z=0) => new THREE.Vector3(x, y, z);
// 最小 spec（字段与 SPECIES 一致，只给本函数用到的）
const SPEC = { schoolRad: 0.6, wSep: 2.4, wAli: 1.15, wCoh: 0.85 };

describe('boidsAccumulate', () => {
  it('靠太近 → 分离力把两条鱼推开（方向相反）', () => {
    const pos=[V(-0.05,1,0), V(0.05,1,0)], vel=[V(0.1,0,0), V(0.1,0,0)];
    const acc0=V(), acc1=V(), s=V(), a=V(), c=V();
    boidsAccumulate(0, pos, vel, SPEC, 1, acc0, s, a, c);
    boidsAccumulate(1, pos, vel, SPEC, 1, acc1, s, a, c);
    expect(acc0.x).toBeLessThan(0);             // 0 号在左侧 → 被推向 -x（远离 1 号）
    expect(acc1.x).toBeGreaterThan(0);
    expect(acc0.x).toBeCloseTo(-acc1.x, 5);
  });

  it('速度不同 → 对齐力朝平均速度方向', () => {
    const pos=[V(0,1,0), V(0.2,1,0)], vel=[V(1,0,0), V(-1,0,0)];
    const acc=V(), s=V(), a=V(), c=V();
    boidsAccumulate(0, pos, vel, SPEC, 1, acc, s, a, c);
    // 平均速度为 0：0 号（+1）应被减速 → 负 x
    expect(acc.x).toBeLessThan(0);
  });

  it('social 削弱对齐/聚合但不削弱分离', () => {
    const pos=[V(0,1,0), V(0.2,1,0)], vel=[V(1,0,0), V(-1,0,0)];
    const acc1=V(), acc0=V(), s=V(), a=V(), c=V();
    boidsAccumulate(0, pos, vel, SPEC, 1, acc1, s, a, c);
    boidsAccumulate(0, pos, vel, SPEC, 0, acc0, s, a, c);
    expect(Math.abs(acc0.x)).toBeLessThan(Math.abs(acc1.x));   // social=0：对齐/聚合消失，只剩分离
  });

  it('邻居在 schoolRad 之外（且不贴近）→ 无任何力', () => {
    const pos=[V(0,1,0), V(2,1,0)], vel=[V(0.1,0,0), V(0.2,0,0)];
    const acc=V(), s=V(), a=V(), c=V();
    const cnt=boidsAccumulate(0, pos, vel, SPEC, 1, acc, s, a, c);
    expect(cnt).toBe(0);
    expect(acc.length()).toBe(0);
  });
});

describe('wanderAcc', () => {
  it('同参数结果确定，且确实加了力', () => {
    const a1=V(), a2=V();
    wanderAcc(a1, 3.2, 4, 0.28);
    wanderAcc(a2, 3.2, 4, 0.28);
    expect(a1.equals(a2)).toBe(true);
    expect(a1.length()).toBeGreaterThan(0);
  });
});

describe('boundaryAcc', () => {
  it('越界 → 弹簧把鱼推回（左右 / 上下）', () => {
    const acc=V();
    boundaryAcc(V(-1.6, 1, 0), [0.6, 1.6], acc);
    expect(acc.x).toBeGreaterThan(0);           // 左界外 → 向右推
    const acc2=V();
    boundaryAcc(V(0, 1.7, 0), [0.6, 1.6], acc2);
    expect(acc2.y).toBeLessThan(0);             // 水层带上界之上 → 向下压
    const acc3=V();
    boundaryAcc(V(0, 1.0, 0), [0.6, 1.6], acc3);
    expect(acc3.length()).toBe(0);              // 界内无弹力
  });
});

describe('obstacleAcc', () => {
  it('进入障碍包围球 → 沿连线向外推', () => {
    const acc=V();
    obstacleAcc(V(0.1, 0.9, 0), [{ c:V(0,0.9,0), r:0.3 }], acc);
    expect(acc.x).toBeGreaterThan(0);
    const acc2=V();
    obstacleAcc(V(1.5, 0.9, 0), [{ c:V(0,0.9,0), r:0.3 }], acc2);
    expect(acc2.length()).toBe(0);              // 球外无推力
  });
});

describe('huntTarget', () => {
  const pellets=[{ p:V(0.5,1,0), eaten:1 }, { p:V(0.3,1,0) }, { p:V(1.2,1,0) }];
  it('选感知半径内最近的未吃饲料', () => {
    expect(huntTarget(V(0,1,0), pellets, 2.4)).toBe(pellets[1]);
  });
  it('已吃的跳过；半径外为空', () => {
    expect(huntTarget(V(0,1,0), [{ p:V(0.1,1,0), eaten:1 }], 2)).toBeNull();
    expect(huntTarget(V(0,1,0), pellets, 0.2)).toBeNull();
  });
});
