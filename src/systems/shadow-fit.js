// @ts-check

/* ================================================================
 * 聚光阴影收到池塘上：半角刚好罩住 half 米的范围，近远裁包住岸。
 * 纹素吸附是纯函数——小于半个纹素的晃动不会换格，避免影子爬行。
 * 只改阴影相机，不改灯光的照射张角（那个由 SpotLight.angle 管）。
 * ================================================================ */

/** @typedef {{ x:number, y:number, z:number }} V3 */

/** @param {V3} a @param {V3} b */
function dist(a, b){ return Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z); }

/** @param {V3} sun @param {V3} target @param {number} half 池塘半幅（米） @param {number} mapSize */
export function shadowFit(sun, target, half, mapSize){
  const safe = Math.max(dist(sun, target), 0.5);
  const radius = Math.max(0.5, half);
  let angle = Math.atan(radius/safe)*1.2;
  angle = Math.min(Math.PI/2-0.05, Math.max(0.15, angle));
  const near = Math.max(1, safe-radius*2.2);
  const far = safe+radius*2.8;
  const diameter = 2*safe*Math.tan(angle);
  const texel = diameter/Math.max(1, mapSize);
  return { angle, near, far, texel, dist:safe };
}

/** 点是否落在阴影锥和近远裁里（沿光源到目标的轴）
 * @param {V3} sun @param {V3} target @param {V3} point @param {{ angle:number, near:number, far:number }} fit */
export function shadowCovers(sun, target, point, fit){
  const sx = target.x-sun.x, sy = target.y-sun.y, sz = target.z-sun.z;
  const sd = Math.hypot(sx, sy, sz) || 1;
  const px = point.x-sun.x, py = point.y-sun.y, pz = point.z-sun.z;
  const pd = Math.hypot(px, py, pz) || 1;
  const cos = (sx*px+sy*py+sz*pz)/(sd*pd);
  const ang = Math.acos(Math.min(1, Math.max(-1, cos)));
  return pd>fit.near && pd<fit.far && ang<fit.angle;
}

/** @param {number} x @param {number} y @param {number} texel */
export function snapTexel(x, y, texel){
  if(!(texel>0) || !Number.isFinite(x) || !Number.isFinite(y)) return { x, y };
  return { x:Math.round(x/texel)*texel, y:Math.round(y/texel)*texel };
}
