import { describe, it, expect } from 'vitest';
import { reflectTier, reflectDim, REFLECT_TIERS } from '../src/systems/reflect.js';
import { weatherFrame } from '../src/systems/weather.js';

describe('reflectTier', () => {
  it('七档从大到小，只在极速档关闭', () => {
    expect(REFLECT_TIERS).toHaveLength(7);
    let prev = Infinity;
    for(let i=0;i<6;i++){
      const t = reflectTier(i);
      expect(t.on).toBe(true);
      expect(t.size).toBeLessThan(prev);
      prev = t.size;
    }
    expect(reflectTier(5).on).toBe(true);
    expect(reflectTier(6)).toEqual({ on:false, size:0 });
    expect(reflectTier(99)).toEqual({ on:false, size:0 });
    expect(reflectTier(Number.NaN).on).toBe(true);
  });
});

describe('reflectDim', () => {
  it('晴天正午最亮，夜、雨、雾依次压暗', () => {
    const sun = reflectDim(0, weatherFrame('sunny', 1));
    const night = reflectDim(1, weatherFrame('sunny', 1));
    const rain = reflectDim(0, weatherFrame('rain', 1));
    const fog = reflectDim(0, weatherFrame('fog', 1));
    expect(sun).toBeCloseTo(1, 5);
    expect(night).toBeLessThan(0.45);
    expect(rain).toBeLessThan(sun);
    expect(fog).toBeLessThan(sun);
    expect(rain).toBeGreaterThan(0.05);
    expect(reflectDim(1, weatherFrame('rain', 1))).toBeLessThan(rain);
  });
});
