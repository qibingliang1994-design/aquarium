// @ts-check
import { sanitizeDoc, cloneDoc, newId, emptyDoc } from './scene-doc.js';
import { PRESETS, findPreset } from './presets.js';
import { canWrite } from '../systems/write-lock.js';

/* ================================================================
 * 场景存档：localStorage['aquarium.scenes'] = { version, activeId, scenes:[文档] }
 * 缩略图单独存 'aquarium.thumbs'（体积大，避免每次保存场景都重写）
 * 首次运行用预设播种；之后新版本加入的预设按 seeded 记录补发给老玩家（删掉的预设不会复活）；旧版全局饲养存档 'aquarium.care' 迁移给经典场景
 * ================================================================ */

/** @typedef {import('./scene-doc.js').SceneDoc} SceneDoc */

/** 存档格式版本：加入新物件类型/缸型/字段时递增——更老的代码读到更高版本会进入只读，不会把新数据清洗掉再写回
 * 1 = v1.8~v2.0，2 = v2.1 起（版本闸门本身从这一版开始生效），3 = v2.1.11 起（中式物件 / 明式缸 / 园林主题），
 * 4 = 大户外池塘（tank=outdoor；旧代码会把不认识的缸型洗掉，所以升版本） */
export const VERSION = 4;
const KEY = 'aquarium.scenes', THUMBS = 'aquarium.thumbs';
/** 无法解析的存档在重新播种前原样备份到这里（只保留最近一份） */
export const BACKUP_KEY = 'aquarium.scenes.bak';
const LEGACY_CARE = 'aquarium.care';
export const MAX_SCENES = 16;
/** v2.0 之前的存档没有 seeded 字段，当时只有这三个预设 */
const LEGACY_SEEDED = ['classic','reef','pond'];

/** 每个场景独立的饲养存档键 @param {string} sceneId */
export const careKey = sceneId => `aquarium.care.${sceneId}`;

/** 存储被禁用（站点数据关闭）时 getItem 也会抛错：一律当作没有数据 @param {string} key */
function readRaw(key){
  try{ return localStorage.getItem(key); }
  catch(err){ console.warn(`[scenes] 读取 ${key} 失败，已忽略`, err); return null; }
}
/** @param {string|null} str */
function parseJSON(str){
  try{ return JSON.parse(str || 'null'); }
  catch(err){ console.warn('[scenes] 存档无法解析', err); return null; }
}
/** @param {string} key @param {string} str */
function writeRaw(key, str){
  try{ localStorage.setItem(key, str); return true; }
  catch(err){ console.warn(`[scenes] 写入 ${key} 失败（存储已满？）`, err); return false; }
}
/** @param {string} key @param {unknown} value */
const writeJSON = (key, value) => writeRaw(key, JSON.stringify(value));

/** 预设播种也走清洗：否则首次运行用的是原始预设（负种子等），刷新后清洗出的造型会变，存档也总要多回写一次
 * @param {SceneDoc} p @returns {SceneDoc} */
const seedDoc = p => sanitizeDoc(cloneDoc(p)) ?? cloneDoc(p);

export function createSceneStore(){
  const rawStr = readRaw(KEY);
  const raw = parseJSON(rawStr);
  // 来自更新版本的存档：照常读（未知物件会被清洗掉），但本次运行一律不写回，避免抹掉新版本的数据
  const readOnly = typeof raw?.version==='number' && raw.version > VERSION;
  /** @type {SceneDoc[]} */
  let scenes = (Array.isArray(raw?.scenes) ? raw.scenes : []).map(sanitizeDoc)
    .filter(/** @param {SceneDoc|null} d @returns {d is SceneDoc} */ d => d!==null).slice(0, MAX_SCENES);
  // 有存档却一个场景都读不出来（损坏/手改坏）：重新播种前先原样备份，可从备份键手动找回
  const recovered = !!rawStr && !scenes.length && !readOnly;
  if(recovered) writeRaw(BACKUP_KEY, /** @type {string} */ (rawStr));
  /** @type {string[]} */
  let seeded = Array.isArray(raw?.seeded) ? raw.seeded.filter(/** @param {unknown} x */ x=>typeof x==='string') : [];
  if(scenes.length){
    if(!Array.isArray(raw?.seeded)) seeded = [...new Set([...LEGACY_SEEDED, ...scenes.map(s=>s.presetId).filter(/** @returns {x is string} */ x=>!!x)])];
    for(const p of PRESETS){
      if(seeded.includes(p.id) || scenes.length>=MAX_SCENES) continue;
      if(!scenes.some(s=>s.id===p.id)) scenes.push(seedDoc(p));
      seeded.push(p.id);
    }
  }else{
    scenes = PRESETS.map(seedDoc);
    seeded = PRESETS.map(p=>p.id);
    const legacy = readRaw(LEGACY_CARE);                         // 老存档迁移：鱼的饱食度与成长不丢
    if(legacy && !readRaw(careKey('classic')) && writeRaw(careKey('classic'), legacy)){
      try{ localStorage.removeItem(LEGACY_CARE); }catch(err){ console.warn('[scenes] 清理旧饲养存档失败', err); }
    }
  }
  let activeId = typeof raw?.activeId==='string' && scenes.some(s=>s.id===raw.activeId) ? raw.activeId : scenes[0].id;
  /** @type {Record<string,string>} */
  const thumbs = parseJSON(readRaw(THUMBS)) ?? {};

  const snapshot = () => JSON.stringify({ version:VERSION, activeId, scenes, seeded });
  /** 只读时不写；写失败返回 false（调用方决定是否报错） */
  const persist = () => readOnly || !canWrite() || writeRaw(KEY, snapshot());
  if(snapshot()!==rawStr) persist();          // 内容没变（清洗/补发都没改动）就不回写
  // 缩略图写满时淘汰最旧的几张再试（缩略图丢了会自动重拍，场景文档更重要）
  const writeThumbs = () => {
    if(readOnly || !canWrite()) return;
    while(!writeJSON(THUMBS, thumbs)){
      const ids = Object.keys(thumbs);
      if(!ids.length) return;
      delete thumbs[ids[0]];
    }
  };

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
      const i = scenes.findIndex(s=>s.id===clean.id), prev = i>=0 ? scenes[i] : null;
      if(i>=0) scenes[i]=clean; else if(scenes.length<MAX_SCENES) scenes.push(clean); else throw new Error('场景数量已达上限');
      if(!persist()){                             // 写盘失败：内存回滚，让调用方如实提示，而不是假装"已保存"
        if(prev) scenes[i]=prev; else scenes.pop();
        throw new Error('保存失败：存储空间可能已满');
      }
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
      if(thumbs[id]){ thumbs[copy.id]=thumbs[id]; writeThumbs(); }
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
      delete thumbs[id]; writeThumbs();
      if(!readOnly && canWrite()) try{ localStorage.removeItem(careKey(id)); }catch(err){ console.warn('[scenes] 清理饲养存档失败', err); }
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
    setThumb(id, dataUrl){ thumbs[id]=dataUrl; writeThumbs(); },
    /** 存档来自更新版本：本次运行的修改不会写盘 */
    /** 存档来自更新版本，或另一个窗口正在写（write-lock）：本次运行不落盘 */
    get readOnly(){ return readOnly || !canWrite(); },
    /** 启动时发现存档损坏，已备份到 BACKUP_KEY 并用预设重新播种 */
    recovered,
  };
}
