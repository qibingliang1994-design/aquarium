import { describe, it, expect } from 'vitest';
import { PhotoGait, tailHz, HZ_KNEE } from '../src/fish/photo-gait.js';

const SWIM = { length: 0.035, freq: 4.5 };
/** 固定随机数，结果可复现 */
const seq = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
/** 以恒定输入跑 n 秒，返回第 0 条鱼的状态 */
function run(g, sec, sBL, yawRate = 0, opts = {}) {
  const { fear = 0, bite = 0, rest = 0 } = opts;
  for (let t = 0; t < sec; t += 1 / 60) g.step(0, 1 / 60, sBL, yawRate, fear, bite, rest);
  return g;
}

describe('照片皮步态', () => {
  it('游得越快尾摆越快越大；悬停时背鳍竖起、胸鳍在划', () => {
    const slow = run(new PhotoGait(1, SWIM, { rng: seq() }), 3, 0.1);
    const fast = run(new PhotoGait(1, SWIM, { rng: seq() }), 3, 2.5);
    expect(fast.freq[0]).toBeGreaterThan(slow.freq[0]);
    expect(fast.amp[0]).toBeGreaterThan(slow.amp[0]);
    expect(slow.dorsal[0]).toBeGreaterThan(0.6);
    expect(fast.dorsal[0]).toBeLessThan(0.1);
    expect(slow.flapAmp[0]).toBeGreaterThan(fast.flapAmp[0]);
  });

  it('靠胸鳍划水的鱼慢游时尾摆更小', () => {
    const pect = run(new PhotoGait(1, SWIM, { pectSwim: 0.9, rng: seq() }), 3, 0.2);
    const tail = run(new PhotoGait(1, SWIM, { pectSwim: 0.1, rng: seq() }), 3, 0.2);
    expect(pect.amp[0]).toBeLessThan(tail.amp[0]);
  });

  it('急刹车时胸鳍腹鳍张开', () => {
    const g = run(new PhotoGait(1, SWIM, { rng: seq() }), 2, 2.5);
    const open0 = g.open[0];
    for (let k = 0; k < 20; k++) g.step(0, 1 / 60, 2.5 - k * 0.12, 0, 0, 0, 0);
    expect(g.open[0]).toBeGreaterThan(open0 + 0.2);
    expect(g.pelvic[0]).toBeGreaterThan(0.3);
  });

  it('左转（俯视逆时针）身体向左弯 = 模型 -z，右转相反', () => {
    expect(run(new PhotoGait(1, SWIM, { rng: seq() }), 1, 1, 2).bend[0]).toBeLessThan(0);
    expect(run(new PhotoGait(1, SWIM, { rng: seq() }), 1, 1, -2).bend[0]).toBeGreaterThan(0);
  });

  it('贴底/吸附时几乎不摆尾', () => {
    const g = run(new PhotoGait(1, SWIM, { rng: seq() }), 3, 0, 0, { rest: 1 });
    expect(g.amp[0]).toBeLessThan(0.1);
    expect(g.pelvic[0]).toBeGreaterThan(0.9);
  });

  it('冲刺-滑行：巡游中会出现滑行（减速）与连摆（加速）', () => {
    const g = new PhotoGait(1, SWIM, { burst: 1, rng: seq() });
    let glide = 0, kick = 0, minAmp = Infinity;
    for (let t = 0; t < 30; t += 1 / 60) {
      g.step(0, 1 / 60, 1.5, 0, 0, 0, 0);
      if (g.thrust[0] < 0) glide++;
      if (g.thrust[0] > 0) kick++;
      if (g.glide[0] > 0) minAmp = Math.min(minAmp, g.amp[0]);
    }
    expect(glide).toBeGreaterThan(30);
    expect(kick).toBeGreaterThan(10);
    expect(minAmp).toBeLessThan(0.5);
    // 惊吓时不滑行
    const scared = new PhotoGait(1, SWIM, { burst: 1, rng: seq() });
    for (let t = 0; t < 10; t += 1 / 60) { scared.step(0, 1 / 60, 1.5, 0, 0.8, 0, 0); expect(scared.thrust[0]).toBe(0); }
  });

  it('屏幕摆尾频率：拐点以下不变，以上单调压缩，小型灯鱼巡游不超过 3 Hz', () => {
    expect(tailHz(0.6)).toBe(0.6);
    expect(tailHz(HZ_KNEE)).toBeCloseTo(HZ_KNEE, 9);
    let prev = 0;
    for (let raw = 0.1; raw < 20; raw += 0.1) { const h = tailHz(raw); expect(h).toBeGreaterThan(prev); expect(h).toBeLessThanOrEqual(raw + 1e-9); prev = h; }
    expect(tailHz(4.5 * 1.25)).toBeLessThan(3);    // 霓虹巡游（原 5.6 Hz）
    expect(tailHz(5.5 * 1.7)).toBeLessThan(3.2);   // 火焰灯加速（原 9.4 Hz）
    expect(tailHz(1.8 * 0.8)).toBeGreaterThan(1.35); // 神仙鱼慢游（原 1.44 Hz）几乎不变
  });

  it('尾相位按压缩后的频率推进', () => {
    const g = run(new PhotoGait(1, SWIM, { rng: seq() }), 3, 2.5);
    const t0 = g.tail[0], hz = g.hzOf(0);
    g.step(0, 0.01, 2.5, 0, 0, 0, 0);
    expect(((g.tail[0] - t0 + 1) % 1) / 0.01).toBeCloseTo(hz, 1);
    expect(hz).toBeLessThan(SWIM.freq * g.freq[0]);
  });

  it('相位只保留小数（GPU 单精度）且全部数值有限；写进实例属性', () => {
    const g = run(new PhotoGait(2, SWIM, { burst: 1, rng: seq() }), 60, 3, 1.3, { fear: 0.5, bite: 0.5 });
    for (const k of ['tail', 'flap', 'amp', 'freq', 'bend', 'open', 'flapAmp', 'dorsal', 'pelvic']) expect(Number.isFinite(g[k][0]), k).toBe(true);
    expect(g.tail[0]).toBeGreaterThanOrEqual(0); expect(g.tail[0]).toBeLessThan(1);
    expect(g.flap[0]).toBeGreaterThanOrEqual(0); expect(g.flap[0]).toBeLessThan(1);
    const swim = { array: new Float32Array(8) }, fin = { array: new Float32Array(8) };
    g.write(swim, fin, 2);
    expect(swim.array[1]).toBeCloseTo(g.amp[0], 5);
    expect(fin.array[2]).toBeCloseTo(g.dorsal[0], 5);
    expect(swim.array[4]).toBeCloseTo(g.tail[1], 5);
  });
});
