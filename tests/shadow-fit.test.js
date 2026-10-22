import { describe, it, expect } from 'vitest';
import { shadowFit, shadowCovers, snapTexel } from '../src/systems/shadow-fit.js';

const SUN = { x:-18, y:26, z:-14 };
const TGT = { x:0, y:0.35, z:0 };

describe('shadowFit', () => {
  it('半角比灯光张角更紧，四角岸线都在锥里', () => {
    const fit = shadowFit(SUN, TGT, 12, 1024);
    expect(fit.angle).toBeLessThan(0.72);
    expect(fit.angle).toBeGreaterThan(0.2);
    expect(fit.far).toBeGreaterThan(fit.near);
    expect(fit.texel).toBeGreaterThan(0);
    expect(fit.texel).toBeLessThan(0.08);
    for(const s of [1, -1]) for(const t of [1, -1]){
      expect(shadowCovers(SUN, TGT, { x:8.5*s, y:0.2, z:6*t }, fit)).toBe(true);
    }
    expect(shadowCovers(SUN, TGT, { x:0, y:0.2, z:0 }, fit)).toBe(true);
  });
});

describe('snapTexel', () => {
  it('半个纹素以内的晃动不换格', () => {
    const texel = 0.05;
    const a = snapTexel(1.2, -0.4, texel);
    const b = snapTexel(1.2+texel*0.2, -0.4+texel*0.2, texel);
    expect(b).toEqual(a);
    const c = snapTexel(1.2+texel*0.8, -0.4, texel);
    expect(c.x).not.toBe(a.x);
    expect(snapTexel(1, 2, 0)).toEqual({ x:1, y:2 });
  });
});
