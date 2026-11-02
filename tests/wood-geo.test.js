import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { woodTube, branchCurve, growDriftwood, growLimb } from '../src/scenes/items/wood-geo.js';
import { makeRng } from '../src/utils.js';

const TINT = { base: 0x7c3f26, dark: 0x2a120a, light: 0xa66c4c };
const ATTRS = ['aBark', 'color', 'normal', 'position', 'uv'];
const straight = () => new THREE.LineCurve3(new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(1, 0.2, 0));
/** 红沉木枝的参数（与 hardscape.js 一致） */
const BRANCH = { tint: TINT, r0: 0.042, len: [0.85, 1.05], elev: [0.3, 0.55], depth: 2, spread: [0.45, 0.62], kids: [0, 3, 4],
  curl: 0.24, tipK: 0.1, brk: 0.18, stub: [0.22, 0.42], twigs: 0.55, zMax: 0.34, mainEnd: 'tip', mainStart: 'break', rootFlare: 0.45,
  density: 2.6, oval: 0.2, ridgeK: 0.09, cracks: 0, knots: 1, bark: 0, top: 0.72 };
/** 灰沉木枝（logWood）的参数（与 hardscape.js 一致） */
const LOG = { ...BRANCH, tint: { base: 0x72675d, dark: 0x221c17, light: 0xb0a79c }, r0: 0.045, len: [1.15, 1.4], elev: [0.3, 0.72],
  depth: 2, spread: [0.32, 0.5], kids: [0, 2, 3], curl: 0.18, tipK: 0.14, brk: 0.4, stub: [0.25, 0.55], twigs: 0.35, up: 0.35, zMax: 0.3,
  mainEnd: 'break', rootFlare: 0.3, density: 2.6, oval: 0.18, ridgeK: 0.09, cracks: 1, knots: 2, bark: 0.15 };

const finite = (g) => ATTRS.every(k => g.attributes[k].array.every(Number.isFinite));

describe('沉木枝段', () => {
  it('属性齐全且有限（同材质的枝段才能合批）', () => {
    for (const end of ['tip', 'break', 'none']) {
      const g = woodTube(straight(), t => 0.05 * (1 - t * 0.6), { segs: 12, radial: 9, seed: 3, tint: TINT, end, start: 'break', knots: 2, cracks: 1, bark: 0.5 });
      expect(Object.keys(g.attributes).sort()).toEqual(ATTRS);
      expect(g.index).not.toBeNull();
      expect(finite(g)).toBe(true);
    }
  });

  it('截面不是正圆，法线朝外', () => {
    const g = woodTube(straight(), () => 0.05, { segs: 10, radial: 12, seed: 5, tint: TINT, end: 'none', oval: 0.2 });
    const p = g.attributes.position, n = g.attributes.normal, side = 11 * 13;
    let out = 0, rmin = Infinity, rmax = 0;
    for (let i = 0; i < side; i++) {
      const dy = p.getY(i) - 0.2, dz = p.getZ(i), r = Math.hypot(dy, dz);
      if (n.getY(i) * dy + n.getZ(i) * dz > 0) out++;
      rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
    }
    expect(out / side).toBeGreaterThan(0.95);
    expect(rmax / rmin).toBeGreaterThan(1.25);
  });

  it('UV：v 沿弧长递增，u 绕一周是整数圈（贴图无接缝）', () => {
    const g = woodTube(straight(), () => 0.05, { segs: 8, radial: 10, seed: 1, tint: TINT, end: 'none', density: 3 });
    const uv = g.attributes.uv, W = 11;
    expect(uv.getY(8 * W)).toBeCloseTo(3, 5);
    expect(uv.getY(0)).toBeCloseTo(0, 5);
    const u1 = uv.getX(10);
    expect(u1).toBeGreaterThanOrEqual(1);
    expect(u1 % 1).toBe(0);
  });

  it('劈裂断口的末端参差不齐，收尖的末端越过曲线终点', () => {
    const tip = woodTube(straight(), () => 0.04, { segs: 6, radial: 10, seed: 2, tint: TINT, end: 'tip' });
    const brk = woodTube(straight(), () => 0.04, { segs: 6, radial: 10, seed: 2, tint: TINT, end: 'break' });
    tip.computeBoundingBox(); expect(tip.boundingBox.max.x).toBeGreaterThan(1.02);
    const p = brk.attributes.position, xs = [];
    for (let j = 0; j < 10; j++) xs.push(p.getX(6 * 11 + j));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.004);
  });
});

describe('沉木生长', () => {
  it('中心线是连续的 S 形弯，不出顶、侧枝不钻沙', () => {
    const rng = makeRng(42);
    const c = branchCurve(rng, new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(1, 0.5, 0), 1.2, { curl: 0.24, top: 0.72 });
    let turned = 0, prev = c.getTangentAt(0);
    for (let k = 1; k <= 20; k++) {
      const t = c.getTangentAt(k / 20), p = c.getPointAt(k / 20);
      expect(p.y).toBeLessThan(0.75);
      expect(p.y).toBeGreaterThan(0);
      turned += prev.angleTo(t); prev = t;
    }
    expect(turned).toBeGreaterThan(0.2);
  });

  it('同一个 seed 长出同一棵；分叉沉木枝面数有上限', () => {
    const a = growDriftwood(makeRng(7), 7, BRANCH), b = growDriftwood(makeRng(7), 7, BRANCH);
    expect(a.geometry.attributes.position.count).toBe(b.geometry.attributes.position.count);
    expect(a.geometry.attributes.position.array[123]).toBe(b.geometry.attributes.position.array[123]);
    expect(a.tubes).toBeGreaterThan(6);
    expect(a.obstacles.length).toBe(2);
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = growDriftwood(makeRng(seed), seed, BRANCH).geometry;
      expect(g.index.count / 3).toBeLessThan(9000);
      expect(finite(g)).toBe(true);
      g.computeBoundingBox();
      expect(g.boundingBox.max.y).toBeLessThan(0.72 + 0.08);
    }
  });

  it('树皮片成片覆盖一部分；灰沉木枝与分叉枝属性一致（合进同一批）', () => {
    const g = woodTube(straight(), () => 0.06, { segs: 30, radial: 14, seed: 4, tint: TINT, end: 'break', bark: 0.55 });
    const bark = g.attributes.aBark.array;
    const covered = bark.filter(v => v > 0.5).length / bark.length;
    expect(covered).toBeGreaterThan(0.15);
    expect(covered).toBeLessThan(0.85);
    const br = growDriftwood(makeRng(9), 9, BRANCH).geometry;
    expect(br.attributes.aBark.array.every(v => v === 0)).toBe(true);
    for (const seed of [20311, 20127, 20005, 20217, 20080]) {
      const log = growDriftwood(makeRng(seed), seed, LOG).geometry;
      expect(Object.keys(log.attributes).sort()).toEqual(Object.keys(br.attributes).sort());
      expect(finite(log)).toBe(true);
    }
  });

  it('分一次杈细一截（管道模型）：分过杈的枝末端比不分杈的同一根枝细', () => {
    const o = { ...BRANCH, brk: 0, twigs: 0, kids: [0, 3], mainEnd: 'break', mainStart: 'none' };
    /** 主枝（第一段几何）最后一圈的平均半径；半径 0.04 → 径向 14 段，长 1 → 38 段 */
    const endR = (depth) => {
      const geos = [];
      growLimb(makeRng(3), 3, o, geos, new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(1, 0.3, 0), 1, 0.04, depth, true, 0);
      const p = geos[0].attributes.position, W = 15, o0 = 38 * W, c = new THREE.Vector3(), v = new THREE.Vector3();
      for (let j = 0; j < 14; j++) c.add(v.fromBufferAttribute(p, o0 + j));
      c.divideScalar(14);
      let r = 0;
      for (let j = 0; j < 14; j++) r += v.fromBufferAttribute(p, o0 + j).distanceTo(c) / 14;
      return { r, n: geos.length };
    };
    const plain = endR(0), forked = endR(1);
    expect(plain.n).toBe(1);
    expect(forked.n).toBeGreaterThan(2);
    expect(forked.r).toBeLessThan(plain.r * 0.9);
  });
});
