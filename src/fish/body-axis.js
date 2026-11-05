// @ts-check

/* ================================================================
 * 鱼体长轴（纯函数，单测覆盖）
 * 鱼鳞要按"头→尾"排成一行行覆瓦状的弧，需要知道网格局部坐标里鱼的长轴和头朝哪边。
 * Quaternius 各模型的朝向不统一，这里不靠约定：在与"向上"垂直的平面里扫一圈方向，
 * 顶点投影跨度最大的就是体长方向；再看眼睛的质心落在哪一侧，定出头的正向。
 * ================================================================ */

/** 扫描的方向数（半圈，每 5°） */
const STEPS = 36;

/**
 * @param {ArrayLike<number>} pts 身体顶点（xyz 交错，网格局部坐标）
 * @param {number[]} up 局部坐标里的"向上"（单位向量）
 * @param {ArrayLike<number>} [eyes] 眼睛顶点（xyz 交错）；没有则头向取 +
 * @returns {number[]} 指向头部的单位向量，与 up 垂直
 */
export function bodyAxis(pts, up, eyes){
  const [ux, uy, uz] = up;
  // 与 up 垂直的一组正交基 a、b
  const ref = Math.abs(uy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ax = ref[1]*uz - ref[2]*uy, ay = ref[2]*ux - ref[0]*uz, az = ref[0]*uy - ref[1]*ux;
  const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
  const bx = uy*az - uz*ay, by = uz*ax - ux*az, bz = ux*ay - uy*ax;
  let best = [ax, ay, az], span = -1;
  for(let s = 0; s < STEPS; s++){
    const t = s / STEPS * Math.PI, c = Math.cos(t), n = Math.sin(t);
    const dx = c*ax + n*bx, dy = c*ay + n*by, dz = c*az + n*bz;
    let lo = Infinity, hi = -Infinity;
    for(let i = 0; i + 2 < pts.length; i += 3){
      const d = pts[i]*dx + pts[i+1]*dy + pts[i+2]*dz;
      if(d < lo) lo = d; if(d > hi) hi = d;
    }
    if(hi - lo > span){ span = hi - lo; best = [dx, dy, dz]; }
  }
  if(!eyes || eyes.length < 3) return best;
  // 头向：眼睛质心相对身体质心在长轴上的符号
  const mean = (/** @type {ArrayLike<number>} */ a) => {
    let s = 0;
    for(let i = 0; i + 2 < a.length; i += 3) s += a[i]*best[0] + a[i+1]*best[1] + a[i+2]*best[2];
    return s / Math.floor(a.length / 3);
  };
  return mean(eyes) >= mean(pts) ? best : best.map(v => -v);
}
