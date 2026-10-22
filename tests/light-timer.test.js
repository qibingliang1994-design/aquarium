import { describe, it, expect } from 'vitest';
import { clockNight, parseClock } from '../src/systems/light-timer.js';

const at = (h, m = 0) => new Date(2026, 9, 19, h, m);

describe('parseClock', () => {
  it('解析 H:MM / HH:MM，非法返回 NaN', () => {
    expect(parseClock('8:00')).toBe(480);
    expect(parseClock('21:30')).toBe(1290);
    expect(parseClock('24:00')).toBeNaN();
    expect(parseClock('8点')).toBeNaN();
  });
});

describe('clockNight（默认 8:00 开灯、21:30 关灯、渐变 45 分钟）', () => {
  it('开灯前是夜', () => { expect(clockNight(at(6, 30))).toBe(1); expect(clockNight(at(7, 59))).toBe(1); });
  it('日出渐变：开灯时刻起慢慢亮', () => {
    expect(clockNight(at(8, 0))).toBe(1);
    const mid = clockNight(at(8, 22)), late = clockNight(at(8, 40));
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
    expect(late).toBeLessThan(mid);
  });
  it('白天全亮', () => { expect(clockNight(at(8, 45))).toBe(0); expect(clockNight(at(14))).toBe(0); expect(clockNight(at(20, 45))).toBe(0); });
  it('日落渐变：关灯前 45 分钟慢慢暗', () => {
    const a = clockNight(at(21, 0)), b = clockNight(at(21, 20));
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a); expect(b).toBeLessThan(1);
  });
  it('关灯后与深夜是月光（21:50 已入夜）', () => {
    expect(clockNight(at(21, 30))).toBe(1);
    expect(clockNight(at(21, 50))).toBe(1);
    expect(clockNight(at(2))).toBe(1);
  });
  it('跨午夜作息（20:00 开灯、2:00 关灯）', () => {
    const o = { on: '20:00', off: '2:00', ramp: 30 };
    expect(clockNight(at(19), o)).toBe(1);
    expect(clockNight(at(23, 30), o)).toBe(0);
    expect(clockNight(at(0, 30), o)).toBe(0);
    expect(clockNight(at(1, 45), o)).toBeGreaterThan(0);
    expect(clockNight(at(3), o)).toBe(1);
    expect(clockNight(at(12), o)).toBe(1);
  });
  it('参数非法时退回白天', () => {
    expect(clockNight(at(23), { on: 'x', off: '21:30' })).toBe(0);
    expect(clockNight(at(23), { on: '8:00', off: '8:00' })).toBe(0);
  });
});
