import { describe, it, expect } from 'vitest';
import { bodyAxis } from '../src/fish/body-axis.js';

/** 椭球点云：半轴 (len, h, w) 先排在 (x, y, z)，再绕 y 转 yaw */
function ellipsoid(len, h, w, yaw, cx = 0){
  const out = [], c = Math.cos(yaw), s = Math.sin(yaw);
  for(let i = 0; i < 400; i++){
    const u = (i * 0.618034) % 1 * Math.PI * 2, v = Math.acos(1 - 2 * ((i + 0.5) / 400));
    const x = cx + len * Math.sin(v) * Math.cos(u), y = h * Math.cos(v), z = w * Math.sin(v) * Math.sin(u);
    out.push(x * c + z * s, y, -x * s + z * c);
  }
  return out;
}

describe('鱼体长轴', () => {
  it('长轴取顶点跨度最大的水平方向，并与 up 垂直', () => {
    const yaw = 0.7;
    const a = bodyAxis(ellipsoid(1, 0.4, 0.15, yaw), [0, 1, 0]);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect(a[1]).toBeCloseTo(0, 6);
    // 与真实长轴 (cos yaw, 0, -sin yaw) 同线（5° 扫描步长内）
    expect(Math.abs(a[0] * Math.cos(yaw) - a[2] * Math.sin(yaw))).toBeGreaterThan(Math.cos(Math.PI / 36));
  });

  it('眼睛在哪一侧，长轴就指向哪一侧（头向）', () => {
    const body = ellipsoid(1, 0.4, 0.15, 0);
    const front = bodyAxis(body, [0, 1, 0], ellipsoid(0.05, 0.05, 0.05, 0, 0.7));
    const back = bodyAxis(body, [0, 1, 0], ellipsoid(0.05, 0.05, 0.05, 0, -0.7));
    expect(front[0]).toBeGreaterThan(0.99);
    expect(back[0]).toBeLessThan(-0.99);
  });

  it('up 不是 y 轴时（网格局部坐标被转过）也给出与 up 垂直的长轴', () => {
    const pts = ellipsoid(1, 0.4, 0.15, 0).map((v, i, arr) => (i % 3 === 0 ? arr[i + 1] : i % 3 === 1 ? -arr[i - 1] : v));   // 绕 z 转 -90°：长轴落到 -y，"上"落到 +x
    const a = bodyAxis(pts, [1, 0, 0]);
    expect(Math.abs(a[0])).toBeLessThan(1e-6);
    expect(Math.abs(a[1])).toBeGreaterThan(0.99);
  });
});
