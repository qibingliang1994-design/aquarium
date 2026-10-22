// @ts-check
import { clamp } from '../utils.js';
import { ITEM_META, placeLimits, MAX_ITEMS } from './item-meta.js';
import { THEMES } from './themes.js';
import { resolveTank } from './tank-styles.js';
import { boundsFor } from './tank-bounds.js';

/* ================================================================
 * 场景文档：{ id, name, presetId?, theme, tank, fish:{物种:数量}, items:[物件] }
 * 存档来自 localStorage（不可信），一律经 sanitizeDoc 清洗后才进入运行时
 * ================================================================ */

/** @typedef {{ id:string, type:string, x:number, z:number, rot:number, s:number, seed:number }} SceneItem */
/** @typedef {{ id:string, name:string, presetId?:string, theme:string, tank:string, fish:Record<string,number>,
 *   items:SceneItem[], updatedAt?:number }} SceneDoc */

// 与 entities/fish/species.js 的 SPECIES 顺序一致（单测校验）
export const FISH_IDS = ['tetra','gold','angel','cory','koi','clown','lion','mandarin','parrot','guppy','betta','harlequin'];
/** @type {Record<string, number>} */
export const FISH_MAX = { tetra:40, gold:10, angel:8, cory:12, koi:6, clown:10, lion:4, mandarin:6, parrot:8, guppy:10, betta:2, harlequin:24 };
export const FISH_TOTAL_MAX = 90;
export const NAME_MAX = 16;

/** @param {string} prefix */
export function newId(prefix){
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
}

/** @param {unknown} v @param {number} fallback */
const num = (v, fallback) => (typeof v==='number' && Number.isFinite(v) ? v : fallback);

/** @param {unknown} raw @param {import('./tank-bounds.js').TankBounds} [bounds] @returns {SceneItem|null} */
export function sanitizeItem(raw, bounds){
  if(!raw || typeof raw!=='object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const type = typeof r.type==='string' ? r.type : '';
  const meta = Object.hasOwn(ITEM_META, type) ? ITEM_META[type] : null;   // 自有键：坏存档里的 "constructor"/"__proto__" 不能查到原型链上
  if(!meta) return null;
  const rot = num(r.rot, 0) % (Math.PI*2);
  const s = clamp(num(r.s,1), meta.scale[0], meta.scale[1]);
  const lim = placeLimits(type, s, bounds);   // 按这份文档自己的缸型收进内壁（大池塘不按小缸钳）
  return {
    id: typeof r.id==='string' && r.id ? r.id.slice(0,40) : newId('it'),
    type,
    x: clamp(num(r.x,0), -lim.x, lim.x),
    z: clamp(num(r.z,0), -lim.z, lim.z),
    rot: rot<0 ? rot+Math.PI*2 : rot,
    s,
    seed: Math.abs(Math.floor(num(r.seed,1))) % 1e9,
  };
}

/** 鱼群：只认识的物种、整数、单种上限、总数上限（超出时按物种顺序截断）
 * @param {unknown} raw @returns {Record<string, number>} */
export function sanitizeFish(raw){
  const src = raw && typeof raw==='object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  /** @type {Record<string, number>} */
  const out = {};
  let left = FISH_TOTAL_MAX;
  for(const id of FISH_IDS){
    const n = Math.min(clamp(Math.floor(num(src[id],0)), 0, FISH_MAX[id]), left);
    out[id] = n; left -= n;
  }
  return out;
}

/** @param {unknown} raw @returns {SceneDoc|null} */
export function sanitizeDoc(raw){
  if(!raw || typeof raw!=='object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  if(typeof r.id!=='string' || !r.id) return null;
  const theme = typeof r.theme==='string' && Object.hasOwn(THEMES, r.theme) ? r.theme : 'fresh';
  const tank = resolveTank(r.tank, theme, typeof r.presetId==='string' ? r.presetId : undefined);
  const bounds = boundsFor(tank);               // 先定缸型再钳物件：清洗大池塘时不能用当前激活的小缸
  const items = (Array.isArray(r.items) ? r.items : []).map(it => sanitizeItem(it, bounds))
    .filter(/** @returns {it is SceneItem} */ it => it!==null).slice(0, MAX_ITEMS);
  const seen = new Set();                       // 物件 id 去重（复制粘贴的坏存档）
  for(const it of items){ if(seen.has(it.id)) it.id = newId('it'); seen.add(it.id); }
  /** @type {SceneDoc} */
  const doc = {
    id: r.id.slice(0,40),
    name: (typeof r.name==='string' && r.name.trim() ? r.name.trim() : '未命名水景').slice(0, NAME_MAX),
    theme,
    tank,
    fish: sanitizeFish(r.fish),
    items,
  };
  if(typeof r.presetId==='string') doc.presetId = r.presetId;
  if(typeof r.updatedAt==='number') doc.updatedAt = r.updatedAt;
  return doc;
}

/** @param {SceneDoc} doc @returns {SceneDoc} */
export const cloneDoc = doc => JSON.parse(JSON.stringify(doc));

/** @param {SceneDoc} doc */
export const fishTotal = doc => Object.values(doc.fish).reduce((a,n)=>a+n, 0);

/** 空缸模板：只有气石，鱼群为空，等玩家自己造景
 * @param {string} name @param {string} theme @returns {SceneDoc} */
export function emptyDoc(name, theme='fresh'){
  return {
    id: newId('sc'), name, theme, tank: resolveTank(null, theme),
    fish: sanitizeFish({}),
    items: [{ id:newId('it'), type:'airstone', x:1.6, z:0.5, rot:0, s:1, seed:1 }],
  };
}
