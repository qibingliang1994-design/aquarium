import { describe, it, expect } from 'vitest';
import { skyKeys, discDirs, skySignature } from '../src/systems/sky.js';
import { weatherFrame } from '../src/systems/weather.js';

const finite3 = (v) => v.every(n => Number.isFinite(n));

describe('skyKeys', () => {
  it('晴天正午比深夜亮，星只在夜里、云少时出现', () => {
    const day = skyKeys(0, weatherFrame('sunny', 0.7));
    const night = skyKeys(1, weatherFrame('sunny', 0.7));
    expect(finite3(day.zenith)).toBe(true);
    expect(day.zenith[2]).toBeGreaterThan(night.zenith[2]);
    expect(day.sunVis).toBeGreaterThan(0.4);
    expect(day.star).toBe(0);
    expect(night.star).toBeGreaterThan(0.5);
    expect(night.sunVis).toBeLessThan(0.05);
    expect(night.moonVis).toBeGreaterThan(0.4);
  });

  it('云量跟着天气走：中雨多于多云，多云多于晴天', () => {
    const sun = skyKeys(0, weatherFrame('sunny', 1));
    const cloud = skyKeys(0, weatherFrame('cloudy', 1));
    const rain = skyKeys(0, weatherFrame('rain', 1));
    expect(rain.cloudCover).toBeGreaterThan(cloud.cloudCover);
    expect(cloud.cloudCover).toBeGreaterThan(sun.cloudCover);
    expect(rain.sunVis).toBeLessThan(sun.sunVis);
    expect(skyKeys(1, weatherFrame('rain', 1)).star).toBeLessThan(0.05);
  });

  it('相同的量化键不换签名，跨过 0.05 才换', () => {
    const a = skySignature(0.41, weatherFrame('sunny', 1));
    const b = skySignature(0.414, weatherFrame('sunny', 1));
    const c = skySignature(0.46, weatherFrame('sunny', 1));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('discDirs', () => {
  it('太阳方向保持方位，月亮在对面并且夜里抬高', () => {
    const sun = [-18, 26, -14];
    const day = discDirs(0, sun);
    const night = discDirs(1, sun);
    expect(day.sun[0]).toBeLessThan(0);
    expect(day.sun[1]).toBeGreaterThan(0);
    expect(day.moon[0]).toBeGreaterThan(0);
    expect(night.moon[1]).toBeGreaterThan(day.moon[1]);
    expect(Math.hypot(...day.sun)).toBeCloseTo(1, 5);
    expect(Math.hypot(...night.moon)).toBeCloseTo(1, 5);
  });
});
