// @ts-check
import { sanitizeWeather } from './systems/weather.js';
import { canWrite } from './systems/write-lock.js';

/* ================================================================
 * 设置存档：localStorage['aquarium.settings'] 的默认值、读取、坏值迁移与写回
 * 只管数据；把设置应用回渲染 / 音频的副作用留在 main 的设置面板接线里
 * ================================================================ */

export const SETTINGS_KEY='aquarium.settings';

/** 存档默认值（字段含义见 CLAUDE.md 的 Settings 一节） @type {Record<string, any>} */
const DEFAULTS={ sound:true, cycle:false, clock:false, night:0, lamp:1, absorb:0.4, shafts:0.1, bubbles:true, snow:true, caustics:true, dof:true, haze:true,
  weatherMode:'sunny', weatherI:0.7, weatherAuto:false, weatherWet:0, clarity:0.88, qualityMode:'auto' };

/** 旧存档 / 坏值迁移：就地修正已知字段并返回同一对象（调用方原样交给设置面板）
 * @param {Record<string, any>} settings @returns {Record<string, any>} */
export function sanitizeSettings(settings){
  settings.lamp=Math.min(1.5, Math.max(0, +settings.lamp||1));   // 旧存档/坏值兜底：0~1.5，1=默认
  Object.assign(settings, sanitizeWeather(settings));
  if(typeof settings.clarity!=='number' || !Number.isFinite(settings.clarity)) settings.clarity=0.88;
  else settings.clarity=Math.min(1, Math.max(0.35, settings.clarity));
  { // 画质模式：'auto' 或档位号（0..6，必须是合法档位），坏值回自动
    const q=/** @type {any} */ (settings.qualityMode);
    const lv=Number(q);
    settings.qualityMode = q==='auto' || (Number.isInteger(lv) && lv>=0 && lv<=6 && String(lv)===String(q)) ? q : 'auto';
  }
  return settings;
}

/** 读取设置存档（缺失 / 坏 JSON 退回默认值），迁移后就地返回同一份可变对象；
 *  save() 与 scene-store / care 一样受单写者锁约束
 *  @returns {{ settings:Record<string, any>, save:()=>void }} */
export function createSettingsStore(){
  const settings=/** @type {Record<string, any>} */ ({ ...DEFAULTS });
  try{ Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')); }catch(err){ console.warn('[settings] 读取设置失败，使用默认值', err); }
  sanitizeSettings(settings);
  const save=()=>{ if(!canWrite()) return; try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(err){ console.warn('[settings] 保存设置失败', err); } };
  return { settings, save };
}
