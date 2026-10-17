// @ts-check
import { sanitizeDoc, cloneDoc, newId, emptyDoc } from './scene-doc.js';
import { PRESETS, findPreset } from './presets.js';

/* ================================================================
 * 场景存档：localStorage['aquarium.scenes'] = { version, activeId, scenes:[文档] }
 * 缩略图单独存 'aquarium.thumbs'（体积大，避免每次保存场景都重写）
 * 首次运行用预设播种；之后新版本加入的预设按 seeded 记录补发给老玩家（删掉的预设不会复活）；旧版全局饲养存档 'aquarium.care' 迁移给经典场景
 * ================================================================ */

/** @typedef {import('./scene-doc.js').SceneDoc} SceneDoc */

const KEY = 'aquarium.scenes', THUMBS = 'aquarium.thumbs', VERSION = 1;
const LEGACY_CARE = 'aquarium.care';
export const MAX_SCENES = 16;
/** v2.0 之前的存档没有 seeded 字段，当时只有这三个预设 */
const LEGACY_SEEDED = ['classic','reef','pond'];

/** 每个场景独立的饲养存档键 @param {string} sceneId */
export const careKey = sceneId => `aquarium.care.${sceneId}`;

/** @param {string} key */
function readJSON(key){
  try{ return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch(err){ console.warn(`[scenes] 读取 ${key} 失败，已忽略`, err); return null; }
}
/** @param {string} key @param {unknown} value */
function writeJSON(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(err){ console.warn(`[scenes] 写入 ${key} 失败（存储已满？）`, err); return false; }
}

export function createSceneStore(){
  const raw = readJSON(KEY);
  /** @type {SceneDoc[]} */
  let scenes = (Array.isArray(raw?.scenes) ? raw.scenes : []).map(sanitizeDoc)
    .filter(/** @param {SceneDoc|null} d @returns {d is SceneDoc} */ d => d!==null).slice(0, MAX_SCENES);
  /** @type {string[]} */
  let seeded = Array.isArray(raw?.seeded) ? raw.seeded.filter(/** @param {unknown} x */ x=>typeof x==='string') : [];
  if(scenes.length){
    if(!Array.isArray(raw?.seeded)) seeded = [...new Set([...LEGACY_SEEDED, ...scenes.map(s=>s.presetId).filter(/** @returns {x is string} */ x=>!!x)])];
    for(const p of PRESETS){
      if(seeded.includes(p.id) || scenes.length>=MAX_SCENES) continue;
      if(!scenes.some(s=>s.id===p.id)) scenes.push(cloneDoc(p));
      seeded.push(p.id);
    }
  }else{
    scenes = PRESETS.map(cloneDoc);
    seeded = PRESETS.map(p=>p.id);
    const legacy = localStorage.getItem(LEGACY_CARE);           // 老存档迁移：鱼的饱食度与成长不丢
    if(legacy && !localStorage.getItem(careKey('classic'))){
      localStorage.setItem(careKey('classic'), legacy);
      localStorage.removeItem(LEGACY_CARE);
    }
  }
  let activeId = typeof raw?.activeId==='string' && scenes.some(s=>s.id===raw.activeId) ? raw.activeId : scenes[0].id;
  /** @type {Record<string,string>} */
  const thumbs = readJSON(THUMBS) ?? {};

  const persist = () => writeJSON(KEY, { version:VERSION, activeId, scenes, seeded });
  persist();

  /** @param {string} id */
  const get = id => scenes.find(s=>s.id===id) ?? null;
  /** 插入到 after 之后（复制/新建时紧挨原场景） @param {SceneDoc} doc @param {string} [after] */
  function insert(doc, after){
    const i = after ? scenes.findIndex(s=>s.id===after) : -1;
    scenes.splice(i<0 ? scenes.length : i+1, 0, doc);
    persist();
    return doc;
  }

  return {
    list: () => scenes.map(cloneDoc),
    get: /** @param {string} id */ id => { const d=get(id); return d ? cloneDoc(d) : null; },
    get activeId(){ return activeId; },
    active: () => cloneDoc(/** @type {SceneDoc} */ (get(activeId))),
    canAdd: () => scenes.length < MAX_SCENES,
    /** @param {string} id */
    activate(id){ if(get(id)){ activeId=id; persist(); } },
    /** 保存（新增或覆盖），返回清洗后的文档 @param {SceneDoc} doc */
    save(doc){
      const clean = sanitizeDoc({ ...doc, updatedAt:Date.now() });
      if(!clean) throw new Error('无效的场景文档');
      const i = scenes.findIndex(s=>s.id===clean.id);
      if(i>=0) scenes[i]=clean; else if(scenes.length<MAX_SCENES) scenes.push(clean); else throw new Error('场景数量已达上限');
      persist();
      return cloneDoc(clean);
    },
    /** @param {string} id @returns {SceneDoc|null} */
    duplicate(id){
      const src = get(id);
      if(!src || scenes.length>=MAX_SCENES) return null;
      const copy = cloneDoc(src);
      copy.id = newId('sc'); copy.name = `${src.name} 副本`.slice(0,16);
      delete copy.presetId;
      copy.items.forEach(it=>{ it.id = newId('it'); });
      if(thumbs[id]){ thumbs[copy.id]=thumbs[id]; writeJSON(THUMBS, thumbs); }
      return cloneDoc(insert(copy, id));
    },
    /** @param {string} name @param {string} theme @returns {SceneDoc|null} */
    create(name, theme){
      if(scenes.length>=MAX_SCENES) return null;
      return cloneDoc(insert(emptyDoc(name, theme)));
    },
    /** 至少保留一个场景；删当前场景时切到相邻场景 @param {string} id */
    remove(id){
      if(scenes.length<=1 || !get(id)) return false;
      const i = scenes.findIndex(s=>s.id===id);
      scenes.splice(i,1);
      if(activeId===id) activeId = scenes[Math.max(0,i-1)].id;
      delete thumbs[id]; writeJSON(THUMBS, thumbs);
      try{ localStorage.removeItem(careKey(id)); }catch(err){ console.warn('[scenes] 清理饲养存档失败', err); }
      persist();
      return true;
    },
    /** @param {string} id @param {string} name */
    rename(id, name){
      const d = get(id); const n = name.trim().slice(0,16);
      if(!d || !n) return false;
      d.name = n; persist(); return true;
    },
    /** 回到预设的造景与鱼群（保留名称以外的一切都按预设） @param {string} id */
    reset(id){
      const d = get(id), p = d?.presetId ? findPreset(d.presetId) : null;
      if(!d || !p) return null;
      const fresh = { ...cloneDoc(p), id:d.id, name:d.name };
      return this.save(fresh);
    },
    /** @param {string} id */
    thumb: id => thumbs[id] ?? null,
    /** @param {string} id @param {string} dataUrl */
    setThumb(id, dataUrl){ thumbs[id]=dataUrl; writeJSON(THUMBS, thumbs); },
  };
}
