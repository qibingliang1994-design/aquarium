// @ts-check
import { clamp, lerp } from '../utils.js';

/* ================================================================
 * 天空色键（纯逻辑）。昼夜 k 与天气帧决定天顶/地平线、云量、日月可见度和星光。
 * 不创建纹理、不每帧重建环境贴图——那是 scene/sky-dome.js 的事。
 * ================================================================ */

/** @typedef {{ cloud?:number, fogAmt?:number, grey?:number, rain?:number, wind?:number, sunMul?:number }} SkyWx */

const DAY_ZEN = [0.035, 0.11, 0.52];
const DAY_HOR = [0.46, 0.66, 0.90];
const NIGHT_ZEN = [0.004, 0.006, 0.022];
const NIGHT_HOR = [0.025, 0.032, 0.06];
const DUSK_ZEN = [0.20, 0.09, 0.28];
const DUSK_HOR = [0.98, 0.36, 0.14];
const HAZE = [0.68, 0.72, 0.76];

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
  const haze = clamp(fog*0.92+grey*0.22+rain*0.12, 0, 1);
  const clear = (1-cloud*0.45)*(1-fog*0.85)*(1-rain*0.65);
  const warm = Math.exp(-Math.pow((k-0.54)/0.15, 2))*clear;
  let zenith = mix3(DAY_ZEN, NIGHT_ZEN, k);
  let horizon = mix3(DAY_HOR, NIGHT_HOR, k);
  zenith = mix3(zenith, DUSK_ZEN, warm*0.72);
  horizon = mix3(horizon, DUSK_HOR, warm*0.88);
  zenith = mix3(zenith, HAZE, haze*0.62*(1-k*0.25));
  horizon = mix3(horizon, HAZE, haze*0.78);
  const sunElev = lerp(0.74, -0.28, k);
  const sunVis = clamp((sunElev+0.05)/0.3, 0, 1)*(1-cloud*0.82)*(1-Math.min(1, fog*0.8+rain*0.45));
  const moonVis = clamp((k-0.35)/0.35, 0, 1)*(1-cloud*0.62)*(1-rain*0.75);
  const star = clamp((k-0.42)/0.35, 0, 1)*(1-cloud)*(1-rain)*(1-fog*0.85);
  let cloudCol = mix3([0.78, 0.81, 0.84], [0.50, 0.54, 0.60], clamp(cloud*0.9+grey*0.35, 0, 1));
  cloudCol = mix3(cloudCol, [0.22, 0.26, 0.36], k);
  cloudCol = mix3(cloudCol, [1, 0.62, 0.42], warm*0.55);
  return {
    zenith, horizon, cloudCol,
    sunElev, sunVis:clamp(sunVis, 0, 1), moonVis:clamp(moonVis, 0, 1),
    star:clamp(star, 0, 1),
    cloudCover:cloud,
    wind:clamp(wx.wind ?? 0, 0, 1.5),
    haze, warm:clamp(warm, 0, 1),
  };
}

/** 环境贴图签名：量化后相同就不重建。0.05 一档
 * @param {number} nightK @param {SkyWx} [wx] */
export function skySignature(nightK, wx={}){
  const s = skyKeys(nightK, wx);
  const q = (/** @type {number} */ v)=>Math.round(v*20);
  return [q(clamp(nightK, 0, 1)), q(s.cloudCover), q(s.sunVis), q(s.star), q(wx.fogAmt ?? 0)].join('.');
}
