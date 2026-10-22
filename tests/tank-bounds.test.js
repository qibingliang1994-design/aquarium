import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { boundsFor, DEFAULT_BOUNDS, deriveBounds, DEFAULT_VOLUME, SWIM, PLACE_BOUNDS, GLASS_INNER } from '../src/scenes/tank-bounds.js';
import { pondD, edgePoint, terrainHeight, POND_RX, POND_RZ, rOf } from '../src/scene/pond-shape.js';
import { createFishGrid } from '../src/entities/fish/steering.js';

describe('默认缸边界（历史字面量，逐值不变）', () => {
  const b = boundsFor('classic');
  it('swim / place / 玻璃内壁 / 饲料 / 点击 / 散布 / 可达 / 高度', () => {
    expect(b).toBe(DEFAULT_BOUNDS);
    expect(b.swim).toEqual({ x:2.13, z:0.74 });
    expect(b.place).toEqual({ x:2.05, z:0.75 });
    expect(b.glassInner).toEqual({ x:2.265, z:0.865 });
    expect(b.feed).toEqual({ x:2.2, z:0.8 });
    expect(b.feedClick).toEqual({ x:2.15, z:0.78 });
    expect(b.feedScatter).toEqual({ x:1.1, z:0.38 });
    expect(b.feedReach).toEqual({ x:6, z:3 });
    expect(b.yCeil).toBe(1.66);
    expect(b.waterY).toBe(1.84);
    expect(b.grid.min).toEqual({ x:-2.2, y:0.1, z:-0.8 });
    expect(b.grid.max).toEqual({ x:2.2, y:1.9, z:0.8 });
    expect(SWIM).toBe(b.swim);
    expect(PLACE_BOUNDS).toEqual({ x:2.05, z:0.75 });
    expect(GLASS_INNER).toEqual({ x:2.265, z:0.865 });
  });

  it('旧的自然水域与玻璃缸共用同一份默认边界', () => {
    for(const id of ['rimless','reef','zen','ming','pond','stream','river']) expect(boundsFor(id)).toBe(b);
  });

  it('deriveBounds(默认体积) 与字面量一致（吸附掉 IEEE 噪声）', () => {
    const d = deriveBounds(DEFAULT_VOLUME);
    expect(d.glassInner.x).toBe(2.265);
    expect(d.feed.x).toBe(2.2);
    expect(d.yCeil).toBe(1.66);
  });
});

describe('大户外池塘边界内接在岸线内', () => {
  const b = boundsFor('outdoor');
  it('比默认缸大，硬钳制角的 pondD 仍小于 0.93', () => {
    expect(b).not.toBe(DEFAULT_BOUNDS);
    expect(b.swim.x).toBeGreaterThan(5);
    expect(b.swim.z).toBeGreaterThan(3);
    expect(b.volume.glass).toBe(0);
    expect(b.volume.waterY).toBe(1.84);
    let worst = 0;
    for(const sx of [1, -1]) for(const sz of [1, -1]){
      worst = Math.max(worst, pondD(sx*(b.swim.x+0.06), sz*(b.swim.z+0.06)));
    }
    expect(worst).toBeLessThan(0.93);
  });

  it('饲料散布随水面放大，不再卡在 ±1.1', () => {
    expect(b.feedScatter.x).toBeGreaterThan(2);
    expect(b.feedReach.x).toBeGreaterThan(10);
    expect(b.place.x).toBeGreaterThan(5);
  });

  it('大网格能查到默认缸网格装不下的邻居', () => {
    const grid = createFishGrid(0.7, b.grid);
    const A = new THREE.Vector3(4.2, 1, 2.4), B = new THREE.Vector3(4.5, 1, 2.5);
    const school = { id:'t' };
    grid.insert(school, 0, A);
    grid.insert(school, 1, B);
    let seen = 0;
    grid.forNeighbors(A, 0.8, () => { seen++; });
    expect(seen).toBe(2);
  });
});

describe('池塘轮廓', () => {
  it('名义尺度约 17×12，岸线 pondD≈1，中心是深碗', () => {
    expect(POND_RX*2).toBeCloseTo(17, 5);
    expect(POND_RZ*2).toBeCloseTo(12, 5);
    expect(pondD(0, 0)).toBe(0);
    expect(rOf(0)).toBeGreaterThan(0.8);
    for(let i=0;i<8;i++){
      const a = i/8*Math.PI*2;
      const [x, z] = edgePoint(a, 1);
      expect(pondD(x, z)).toBeCloseTo(1, 5);
    }
    expect(terrainHeight(0, 0)).toBeLessThan(-1.5);
    const [ex, ez] = edgePoint(0.4, 1);
    expect(terrainHeight(ex, ez)).toBeCloseTo(-0.22, 1);
  });
});
