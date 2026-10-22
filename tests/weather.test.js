import { describe, it, expect } from 'vitest';
import { weatherFrame, stepWet, sanitizeWeather, murkVisual, pondTint, precipBudget,
  createWeather, WEATHER_IDS, CYCLE_SECS } from '../src/systems/weather.js';

const ID = { sunMul:1, hemiMul:1, fogMul:1, chop:1, grey:0, rain:0, snow:0, wind:0, wetTarget:0, fogAmt:0 };

describe('weatherFrame', () => {
  it('晴天任意强度都是恒等', () => {
    for(const I of [0, 0.7, 1]){
      const f = weatherFrame('sunny', I);
      expect(f.sunMul).toBe(1);
      expect(f.hemiMul).toBe(1);
      expect(f.fogMul).toBe(1);
      expect(f.chop).toBe(1);
      expect(f.grey).toBe(0);
      expect(f.rain).toBe(0);
      expect(f.snow).toBe(0);
      expect(f.wind).toBe(0);
      expect(f.wetTarget).toBe(0);
    }
  });

  it('强度 0 的任何天气也是恒等', () => {
    for(const id of WEATHER_IDS){
      const f = weatherFrame(id, 0);
      for(const k of Object.keys(ID)) expect(f[k]).toBe(ID[k]);
    }
  });

  it('中雨满强度压暗太阳、下雨、浪比晴天更大', () => {
    const f = weatherFrame('rain', 1);
    expect(f.sunMul).toBeCloseTo(0.22, 5);
    expect(f.rain).toBe(1);
    expect(f.snow).toBe(0);
    expect(f.chop).toBeGreaterThan(1);
    expect(f.grey).toBeGreaterThan(0);
    expect(f.wetTarget).toBe(1);
  });

  it('小雪有雪没有雨；薄雾把雾加浓', () => {
    expect(weatherFrame('snow', 1).snow).toBeCloseTo(0.7, 5);
    expect(weatherFrame('snow', 1).rain).toBe(0);
    expect(weatherFrame('fog', 1).fogMul).toBeGreaterThan(2);
    expect(weatherFrame('fog', 1).chop).toBeLessThan(1);
  });

  it('未知天气当晴天', () => {
    expect(weatherFrame('hail', 1).mode).toBe('sunny');
    expect(weatherFrame('hail', 1).sunMul).toBe(1);
  });
});

describe('潮湿度与轮换', () => {
  it('雨中变湿、放晴后变干', () => {
    const wet = stepWet(0, weatherFrame('rain', 1), 2);
    expect(wet).toBeGreaterThan(0.8);
    const dry = stepWet(1, weatherFrame('sunny', 1), 30);
    expect(dry).toBeLessThan(0.2);
  });

  it('自动轮换满一段就切到下一天气，强度落在区间里', () => {
    const w = createWeather({ weatherMode:'sunny', weatherI:0.7, weatherAuto:true });
    const a = w.step(CYCLE_SECS-0.01, () => 0);
    expect(a.changed).toBe(false);
    expect(a.mode).toBe('sunny');
    const b = w.step(0.02, () => 0);          // rng 0 → 强度 0.55
    expect(b.changed).toBe(true);
    expect(b.mode).toBe('cloudy');
    expect(b.intensity).toBeCloseTo(0.55, 5);
    expect(w.snapshot().weatherAuto).toBe(true);
  });

  it('关掉自动后不再轮换', () => {
    const w = createWeather({ weatherAuto:true, weatherMode:'sunny' });
    w.setAuto(false);
    expect(w.step(CYCLE_SECS+1).changed).toBe(false);
    expect(w.mode).toBe('sunny');
  });
});

describe('存档清洗 / 水色 / 粒子预算', () => {
  it('坏值回落到晴天 0.7', () => {
    expect(sanitizeWeather(null)).toEqual({ weatherMode:'sunny', weatherI:0.7, weatherAuto:false, weatherWet:0 });
    expect(sanitizeWeather({ weatherMode:'typhoon', weatherI:4, weatherAuto:1, weatherWet:-2 }).weatherMode).toBe('sunny');
    expect(sanitizeWeather({ weatherMode:'fog', weatherI:0.4, weatherAuto:true, weatherWet:0.2 })).toEqual({
      weatherMode:'fog', weatherI:0.4, weatherAuto:true, weatherWet:0.2,
    });
  });

  it('完全清澈没有额外茶色；健康池塘只有一点', () => {
    expect(murkVisual(1, 1)).toMatchObject({ turb:0, algae:0, murk:0.18 });
    expect(pondTint(1, 1)).toBe(0);
    const t = pondTint(0.88, 0.88);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.25);
  });

  it('粒子数随五档画质下降', () => {
    expect(precipBudget(0)).toEqual({ rain:1600, snow:700 });
    expect(precipBudget(4).rain).toBeLessThan(precipBudget(2).rain);
    expect(precipBudget(2).rain).toBeLessThan(precipBudget(0).rain);
    expect(precipBudget(99).rain).toBe(precipBudget(4).rain);
  });
});
