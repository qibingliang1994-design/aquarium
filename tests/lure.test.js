import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { lureAcc } from '../src/entities/fish/steering.js';

const V = (x=0, y=0, z=0) => new THREE.Vector3(x, y, z);
// 最小 lure（字段与 systems/lure.js 对外暴露的一致）
const LURE = (p=V(0,1,0), k=1, range=1.25) => ({ p, k, range });

describe('lureAcc（逗鱼光点追逐力）', () => {
  it('范围内 → 合力包含指向光点的吸引分量', () => {
    const acc=V();
    const d=lureAcc(V(0.5,1,0), LURE(), acc);
    expect(d).toBeCloseTo(0.5, 5);
    expect(acc.x).toBeLessThan(0);              // 鱼在 +x，被吸向原点的光点
  });

  it('切向分量让鱼绕光点盘旋（合力不与连线方向平行）', () => {
    const acc=V();
    lureAcc(V(0.5,1,0), LURE(), acc);
    // 只有吸力时 acc 应纯为 -x；有切向分量则 z 不为 0（初始连线沿 x，切向在 z 上）
    expect(Math.abs(acc.z)).toBeGreaterThan(0.01);
  });

  it('超出吸引半径 → 不加任何力，返回 -1', () => {
    const acc=V();
    expect(lureAcc(V(2,1,0), LURE(), acc)).toBe(-1);
    expect(acc.lengthSq()).toBe(0);
  });

  it('强度 k=0（淡出途中）→ 无力', () => {
    const acc=V();
    lureAcc(V(0.5,1,0), LURE(V(0,1,0), 0), acc);
    expect(acc.lengthSq()).toBe(0);
  });

  it('k 越大力越大；距离越近吸力越强', () => {
    const near=V(), far=V(), soft=V();
    lureAcc(V(0.2,1,0), LURE(), near);
    lureAcc(V(1.0,1,0), LURE(), far);
    lureAcc(V(0.2,1,0), LURE(V(0,1,0), 0.5), soft);
    expect(near.length()).toBeGreaterThan(far.length());
    expect(near.length()).toBeGreaterThan(soft.length());
  });

  it('正好压在光点上（距离≈0）→ 不产生数值爆炸', () => {
    const acc=V();
    expect(lureAcc(V(0,1,0), LURE(), acc)).toBe(-1);
    expect(Number.isFinite(acc.x)).toBe(true);
  });
});
