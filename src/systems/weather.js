// @ts-check
import { clamp, lerp } from '../utils.js';

/* ================================================================
 * 天气（纯逻辑，不碰 three / DOM）。
 * 晴天、或强度为 0：灯光 / 雾 / 波浪倍率全是 1，灰、雨、雪、湿目标全是 0，
 * 现有缸在默认设置下画面不变。其余天气按 eco-pond 的预设表，用强度去插值；
 * 波浪倍率相对「晴天 = 1」而不是相对 eco 的 0.35，避免晴天把浪压没。
 * 水质惩罚不进这里——见 murkVisual / pondTint，只给水面着色，没有分数。
 * ================================================================ */

/** @typedef {'sunny'|'cloudy'|'drizzle'|'rain'|'fog'|'snow'} WeatherId */

export const WEATHER_IDS = /** @type {WeatherId[]} */ (['sunny','cloudy','drizzle','rain','fog','snow']);
/** @type {Record<WeatherId, string>} */
export const WEATHER_LABELS = { sunny:'晴天', cloudy:'多云', drizzle:'小雨', rain:'中雨', fog:'薄雾', snow:'小雪' };
/** 自动轮换，每段 CYCLE_SECS 秒 */
export const WEATHER_CYCLE = /** @type {WeatherId[]} */ (['sunny','cloudy','drizzle','rain','cloudy','fog','sunny','snow']);
export const CYCLE_SECS = 28;

/** @typedef {{ cloud:number, rain:number, snow:number, fog:number, wind:number, sunMul:number, hemiMul:number, wetTarget:number, chop:number, grey:number }} WxPreset */
/** @type {Record<WeatherId, WxPreset>} */
const PRESETS = {
  sunny:   { cloud:0.05, rain:0,    snow:0,   fog:0.05, wind:0.35, sunMul:1,    hemiMul:1,    wetTarget:0.05, chop:0.35, grey:0 },
  cloudy:  { cloud:0.75, rain:0,    snow:0,   fog:0.18, wind:0.55, sunMul:0.45, hemiMul:0.85, wetTarget:0.12, chop:0.55, grey:0.55 },
  drizzle: { cloud:0.7,  rain:0.35, snow:0,   fog:0.25, wind:0.5,  sunMul:0.35, hemiMul:0.75, wetTarget:0.7,  chop:0.7,  grey:0.5 },
  rain:    { cloud:0.9,  rain:1,    snow:0,   fog:0.35, wind:0.85, sunMul:0.22, hemiMul:0.65, wetTarget:1,    chop:1.15, grey:0.65 },
  fog:     { cloud:0.55, rain:0,    snow:0,   fog:0.95, wind:0.2,  sunMul:0.4,  hemiMul:0.7,  wetTarget:0.35, chop:0.2,  grey:0.4 },
  snow:    { cloud:0.8,  rain:0,    snow:0.7, fog:0.4,  wind:0.4,  sunMul:0.5,  hemiMul:0.8,  wetTarget:0.25, chop:0.3,  grey:0.35 },
};

/** @typedef {{ mode:WeatherId, intensity:number, sunMul:number, hemiMul:number, fogMul:number, chop:number,
 *   grey:number, rain:number, snow:number, wind:number, wetTarget:number, fogAmt:number }} WeatherFrame */

/** 本帧要叠到昼夜上的倍率。晴天或强度 0 → 恒等
 * @param {string} mode @param {number} intensity @returns {WeatherFrame} */
export function weatherFrame(mode, intensity){
  const id = /** @type {WeatherId} */ (Object.hasOwn(PRESETS, mode) ? mode : 'sunny');
  const I = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
  const p = PRESETS[id];
  const k = id==='sunny' ? 0 : I;          // 晴天不看强度；强度 0 也是恒等
  return {
    mode:id, intensity:I,
    sunMul:lerp(1, p.sunMul, k),
    hemiMul:lerp(1, p.hemiMul, k),
    fogMul:lerp(1, 1+p.fog*2.4, k),
    chop:lerp(1, Math.max(0.25, p.chop/0.35), k),
    grey:p.grey*k,
    rain:p.rain*I,
    snow:p.snow*I,
    wind:id==='sunny' ? 0 : p.wind*I,
    wetTarget:id==='sunny' ? 0 : p.wetTarget*I,
    fogAmt:p.fog*k,
  };
}

/** 潮湿度：下雨时约 1.8/秒靠向目标，否则约 0.12/秒慢慢干
 * @param {number} wet @param {{ rain:number, wetTarget:number }} frame @param {number} dt */
export function stepWet(wet, frame, dt){
  const rate = frame.rain>0.05 ? 1.8 : 0.12;
  const k = 1-Math.exp(-rate*Math.max(0, dt));
  const next = wet+(frame.wetTarget-wet)*k;
  return Number.isFinite(next) ? clamp(next, 0, 1) : 0;
}

/** @param {unknown} raw */
export function sanitizeWeather(raw){
  const r = raw && typeof raw==='object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const mode = typeof r.weatherMode==='string' && Object.hasOwn(PRESETS, r.weatherMode) ? /** @type {WeatherId} */ (r.weatherMode) : 'sunny';
  const weatherI = clamp(typeof r.weatherI==='number' && Number.isFinite(r.weatherI) ? r.weatherI : 0.7, 0, 1);
  return { weatherMode:mode, weatherI, weatherAuto:r.weatherAuto===true,
    weatherWet:clamp(typeof r.weatherWet==='number' && Number.isFinite(r.weatherWet) ? r.weatherWet : 0, 0, 1) };
}

/** eco-pond 的水色公式（只出视觉量，不累计废物、不减容量）
 *  q=clarity=1 时 turb=0、murk=0.18（那是它们的基础吸收，不是惩罚）
 * @param {number} quality @param {number} clarity */
export function murkVisual(quality, clarity){
  const q = clamp(quality, 0, 1), c = clamp(clarity, 0, 1);
  const turb = clamp((1-c)*0.75+(1-q)*0.55, 0, 1);
  const algae = clamp((0.75-q)*1.6, 0, 1);
  return { turb, algae, murk:0.18+turb*0.7, caustic:Math.max(0, 0.42-turb*0.3) };
}

/** 相对「完全清澈」多出来的那一点茶色。健康池塘（0.88）只有轻微茶色；晴天玻璃缸用 0
 * @param {number} quality @param {number} [clarity] */
export function pondTint(quality, clarity=1){
  return Math.max(0, murkVisual(quality, clarity).murk-murkVisual(1, 1).murk);
}

/** 降水粒子预算随现有五档画质下降（满档 1600 雨 / 700 雪） */
const PRECIP_SCALE = [1, 0.85, 0.65, 0.45, 0.28];
/** @param {number} level */
export function precipBudget(level){
  const s = PRECIP_SCALE[clamp(level|0, 0, PRECIP_SCALE.length-1)] ?? 0.28;
  return { rain:Math.round(1600*s), snow:Math.round(700*s) };
}

/** @param {Record<string, unknown>} [initial] */
export function createWeather(initial){
  const s = sanitizeWeather(initial ?? {});
  let mode = s.weatherMode, intensity = s.weatherI, auto = s.weatherAuto, wet = s.weatherWet;
  let cycleI = Math.max(0, WEATHER_CYCLE.indexOf(mode)), cycleT = 0;
  return {
    get mode(){ return mode; },
    get intensity(){ return intensity; },
    get auto(){ return auto; },
    get wet(){ return wet; },
    frame(){ return weatherFrame(mode, intensity); },
    /** @param {string} m @param {number} [I] */
    set(m, I){
      if(Object.hasOwn(PRESETS, m)) mode = /** @type {WeatherId} */ (m);
      if(I!=null && Number.isFinite(I)) intensity = clamp(I, 0, 1);
      const i = WEATHER_CYCLE.indexOf(mode);
      if(i>=0) cycleI = i;
    },
    /** @param {boolean} on */
    setAuto(on){ auto = !!on; if(!auto) cycleT = 0; },
    /** 推进一步。changed：自动轮换刚切了天气（调用方据此落盘，不要每帧写）
     * @param {number} dt @param {()=>number} [rng] */
    step(dt, rng=Math.random){
      wet = stepWet(wet, weatherFrame(mode, intensity), dt);
      let changed = false;
      if(auto){
        cycleT += dt;
        if(cycleT>=CYCLE_SECS){
          cycleT = 0;
          cycleI = (cycleI+1)%WEATHER_CYCLE.length;
          mode = WEATHER_CYCLE[cycleI];
          intensity = 0.55+rng()*0.35;
          changed = true;
        }
      }
      return { ...weatherFrame(mode, intensity), wet, changed };
    },
    snapshot(){ return { weatherMode:mode, weatherI:intensity, weatherAuto:auto, weatherWet:wet }; },
  };
}
