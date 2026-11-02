import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { footprintOf, reachOf, rangeIn, symRange, clampTo } from '../src/scenes/item-reach.js';

const GLASS = { x: 2.265, z: 0.865 }, PLACE = { x: 2.05, z: 0.75 };
/** 一根往 +x 伸出去的长条：x ∈ [-0.2, 1.0]，z ∈ [-0.1, 0.1] */
const stick = () => {
  const g = new THREE.BoxGeometry(1.2, 0.1, 0.2);
  g.translate(0.4, 0, 0);
  return new THREE.Mesh(g);
};

describe('物件俯视轮廓与摆放范围', () => {
  it('支撑点覆盖全部顶点（含 InstancedMesh 每个实例）', () => {
    const fp = footprintOf(stick());
    const r = reachOf(fp, 0, 1);
    expect(r.x0).toBeCloseTo(-0.2, 6); expect(r.x1).toBeCloseTo(1.0, 6);
    expect(r.z0).toBeCloseTo(-0.1, 6); expect(r.z1).toBeCloseTo(0.1, 6);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial(), 2);
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-0.5, 0, 0.3));
    inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0.7, 0, -0.4));
    const g = new THREE.Group(); g.add(inst);
    const ri = reachOf(footprintOf(g), 0, 1);
    expect(ri.x0).toBeCloseTo(-0.55, 6); expect(ri.x1).toBeCloseTo(0.75, 6);
    expect(ri.z0).toBeCloseTo(-0.45, 6); expect(ri.z1).toBeCloseTo(0.35, 6);
  });

  it('转角与缩放：和根节点"先缩放再绕 y 转"一致', () => {
    const fp = footprintOf(stick());
    const r = reachOf(fp, Math.PI / 2, 2);       // 绕 y 转 90°：局部 +x → 世界 −z
    expect(r.z0).toBeCloseTo(-2.0, 2); expect(r.z1).toBeCloseTo(0.4, 2);
    expect(r.x0).toBeCloseTo(-0.2, 2); expect(r.x1).toBeCloseTo(0.2, 2);
    const m = new THREE.Object3D(); m.rotation.y = Math.PI / 2; m.scale.setScalar(2); m.updateMatrixWorld();
    const tip = new THREE.Vector3(1.0, 0, 0).applyMatrix4(m.matrixWorld);
    expect(tip.z).toBeCloseTo(r.z0, 2);
  });

  it('各方向分别让开：往 +x 伸得长，只在 +x 一侧离玻璃远', () => {
    const lim = rangeIn(reachOf(footprintOf(stick()), 0, 1.5), GLASS, PLACE);
    expect(lim.x1).toBeCloseTo(GLASS.x - 0.01 - 1.5, 6);
    expect(lim.x0).toBeCloseTo(-GLASS.x + 0.01 + 0.3, 6);   // 短的一侧只让开 0.3，能往 −x 摆得远得多
    expect(-lim.x0).toBeGreaterThan(lim.x1 + 1);
    // 摆在区间端点上，轮廓刚好贴着玻璃内壁、不探出去
    const r = reachOf(footprintOf(stick()), 0, 1.5);
    expect(lim.x1 + r.x1).toBeLessThanOrEqual(GLASS.x);
    expect(lim.z1 + r.z1).toBeLessThanOrEqual(GLASS.z);
    expect(lim.z0 + r.z0).toBeGreaterThanOrEqual(-GLASS.z);
  });

  it('比缸还宽的物件放在正中，两侧探出一样多', () => {
    const lim = rangeIn({ x0: -0.3, x1: 0.3, z0: -1.2, z1: 0.6 }, GLASS, PLACE);
    expect(lim.z0).toBe(lim.z1);
    expect(lim.z0 + 0.6 - GLASS.z).toBeCloseTo(-GLASS.z - (lim.z0 - 1.2), 9);
  });

  it('对称区间与钳制', () => {
    const r = symRange({ x: 1, z: 0.5 });
    expect(r).toEqual({ x0: -1, x1: 1, z0: -0.5, z1: 0.5 });
    expect(clampTo(r, 3, -2)).toEqual({ x: 1, z: -0.5 });
    expect(clampTo(r, 0.2, 0.1)).toEqual({ x: 0.2, z: 0.1 });
  });
});
