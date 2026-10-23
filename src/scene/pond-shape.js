// @ts-check
import { fbm3, sstep, vnoise } from '../utils.js';

/* ================================================================
 * 大户外池塘的平面轮廓与河床（移植 eco-pond 的椭圆岸线，噪声用本仓库的 vnoise/fbm3）。
 * 水面在调用方的 waterY；这里的高度是相对静水面的落差（中心约 -1.72，岸线 d=1 约 -0.22）。
 * 鱼的活动矩形另由 tank-bounds 内接在 pondD < 0.92 的区域里，不跟这条岸线重合。
 * ================================================================ */

export const POND_RX = 8.5, POND_RZ = 6;

/** 岸线半径倍率（角度上的轻微起伏，不是正椭圆） @param {number} a */
export function rOf(a){
  return 1 + 0.12*Math.sin(2*a+0.6) + 0.07*Math.sin(3*a+1.9) + 0.04*Math.sin(5*a+0.3);
}

/** 到岸线的归一化距离：<1 在水里，1 在岸上 @param {number} x @param {number} z */
export function pondD(x, z){
  const qx = x/POND_RX, qz = z/POND_RZ;
  return Math.hypot(qx, qz) / rOf(Math.atan2(qz, qx));
}

/** 岸线上的一点（d=1 是水线，略大于 1 是石缘） @param {number} a @param {number} [d] @returns {[number, number]} */
export function edgePoint(a, d=1){
  const r = rOf(a)*d;
  return [Math.cos(a)*r*POND_RX, Math.sin(a)*r*POND_RZ];
}

/** 相对静水面的地形高度 @param {number} x @param {number} z */
export function terrainHeight(x, z){
  const d = pondD(x, z);
  if(d<1){
    return -0.22 - 1.5*(1-sstep(0.25, 1, d)) + (vnoise(x*1.7, z*1.7)-0.5)*0.08*(1-sstep(0.85, 1, d));
  }
  const dist = Math.hypot(x, z);
  const hills = fbm3(x*0.12+3, 0.4, z*0.12+5, 4)*1.6*sstep(1.3, 2.3, d)*(1-sstep(26, 34, dist));
  const outer = 0.2 + hills + (fbm3(x*0.5+11, 1.2, z*0.5-7, 2)-0.5)*0.08;
  return -0.22 + (outer+0.22)*sstep(1, 1.12, d);
}
