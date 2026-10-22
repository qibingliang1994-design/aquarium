// @ts-check
import { clamp, lerp } from '../utils.js';

/* ================================================================
 * 天空色键（纯逻辑）。昼夜 k 与天气帧决定天顶/地平线、云量、日月可见度和星光。
 * 不创建纹理、不每帧重建环境贴图——那是 scene/sky-dome.js 的事。
 * ================================================================ */

/** @typedef {{ cloud?:number, fogAmt?:number, grey?:number, rain?:number, wind?:number, sunMul?:number }} SkyWx */

const DAY_ZEN = [0.38, 0.62, 0.90];
const DAY_HOR = [0.78, 0.86, 0.93];
const NIGHT_ZEN = [0.012, 0.016, 0.045];
const NIGHT_HOR = [0.05, 0.07, 0.12];
const GREY = [0.62, 0.66, 0.72];

/** @param {number[]} a @param {number[]} b @param {number} k */
function mix3(a, b, k){
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

/** @param {number} x @param {number} y @param {number} z */
function n3(x, y, z){
  const l = Math.hypot(x, y, z);
  const s = l>1e-6 ? l : 1;
  return [x/s, y/s, z/s];
}

/** 太阳在日间高、夜间落到地平线下；月亮相反。方向给穹顶着色器，不移动真实灯光
 * @param {number} nightK @param {number[]} sun 世界空间、不必单位化 */
export function discDirs(nightK, sun){
  const k = clamp(nightK, 0, 1);
  const s = n3(sun[0] ?? 0, sun[1] ?? 1, sun[2] ?? 0);
  const moon = n3(-s[0], lerp(0.22, 0.78, k), -s[2]*0.35+0.28);
  return { sun:s, moon };
}

/** @param {number} nightK 0 昼 .. 1 夜 @param {SkyWx} [wx] */
export function skyKeys(nightK, wx={}){
  const k = clamp(Number.isFinite(nightK) ? nightK : 0, 0, 1);
  const cloud = clamp(wx.cloud ?? 0, 0, 1);
  const fog = clamp(wx.fogAmt ?? 0, 0, 1);
  const grey = clamp(wx.grey ?? 0, 0, 1);
  const rain = clamp(wx.rain ?? 0, 0, 1);
  const g = clamp(grey*0.85+fog*0.45, 0, 1);
  let zenith = mix3(DAY_ZEN, NIGHT_ZEN, k);
  let horizon = mix3(DAY_HOR, NIGHT_HOR, k);
  zenith = mix3(zenith, GREY, g*(1-k*0.35));
  horizon = mix3(horizon, GREY, g*0.8);
  const sunElev = lerp(0.74, -0.28, k);
  const sunVis = clamp((sunElev+0.05)/0.3, 0, 1)*(1-cloud*0.78)*(1-Math.min(1, fog*0.75+rain*0.4));
  const moonVis = clamp((k-0.35)/0.35, 0, 1)*(1-cloud*0.62)*(1-rain*0.75);
  const star = clamp((k-0.42)/0.35, 0, 1)*(1-cloud)*(1-rain)*(1-fog*0.85);
  const cloudCol = mix3([0.96, 0.97, 0.98], [0.55, 0.60, 0.70], k);
  return {
    zenith, horizon, cloudCol,
    sunElev, sunVis:clamp(sunVis, 0, 1), moonVis:clamp(moonVis, 0, 1),
    star:clamp(star, 0, 1),
    cloudCover:cloud,
    wind:clamp(wx.wind ?? 0, 0, 1.5),
  };
}

/** 环境贴图签名：量化后相同就不重建。0.05 一档
 * @param {number} nightK @param {SkyWx} [wx] */
export function skySignature(nightK, wx={}){
  const s = skyKeys(nightK, wx);
  const q = (/** @type {number} */ v)=>Math.round(v*20);
  return [q(clamp(nightK, 0, 1)), q(s.cloudCover), q(s.sunVis), q(s.star), q(wx.fogAmt ?? 0)].join('.');
}
