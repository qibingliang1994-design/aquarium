// @ts-check
/* ================================================================
 * 物种生态标签（纯数据 + 纯函数，Node 单测可直接加载）：
 * 水（淡水/海水）、水温（冷水/温水/热带）、是否会吞小鱼。
 * mixNote(fish) 给当前鱼群一句"混养冷知识"——只是提示，不阻止、不打分。
 * 不放进 ui/encyclopedia.js：那里依赖 DOM / GLTFLoader。
 * ================================================================ */

/** @typedef {'fresh'|'salt'} Water */
/** @typedef {'cold'|'warm'|'tropical'} Temp */
/** @typedef {{ water:Water, temp:Temp, predator?:boolean }} Ecology */

/** @type {Record<string, Ecology>} */
export const ECOLOGY={
  tetra:{ water:'fresh', temp:'tropical' },
  gold:{ water:'fresh', temp:'cold' },
  angel:{ water:'salt', temp:'tropical' },     // 现为海水蝴蝶鱼（见任务分解 A3）
  cory:{ water:'fresh', temp:'warm' },         // 花鼠 C. paleatus：18–24 °C，冷水热带都合得来
  koi:{ water:'fresh', temp:'cold' },
  clown:{ water:'salt', temp:'tropical' },
  lion:{ water:'salt', temp:'tropical', predator:true },
  mandarin:{ water:'salt', temp:'tropical' },
  parrot:{ water:'salt', temp:'tropical' },
  guppy:{ water:'fresh', temp:'tropical' },
  betta:{ water:'fresh', temp:'tropical' },    // 半月斗鱼：26 °C 左右，独居
  harlequin:{ water:'fresh', temp:'tropical' },
};

export const WATER_LABEL={ fresh:'淡水', salt:'海水' };
export const TEMP_LABEL={ cold:'冷水', warm:'温水', tropical:'热带' };

/** 图鉴胶囊文字 @param {string} id @returns {[string, string]|null} */
export function ecologyTags(id){
  const e=ECOLOGY[id];
  return e ? [WATER_LABEL[e.water], TEMP_LABEL[e.temp]] : null;
}

/** 肉食鱼会把体长不超过自己这个比例的鱼当点心 */
export const PREY_RATIO=0.7;

/**
 * 当前鱼群的混养冷知识：按优先级只返回一句，无则 null
 * @param {Record<string, number>} fish 物种 id → 条数
 * @param {{ lengths?:Record<string, number>, names?:Record<string, string> }} [opts] 体长 L（判断大鱼吃小鱼）与显示名
 * @returns {string|null}
 */
export function mixNote(fish, { lengths={}, names={} }={}){
  const ids=Object.keys(fish).filter(id=>fish[id]>0 && ECOLOGY[id]);
  const has=(/** @type {(e:Ecology)=>boolean} */ f)=>ids.some(id=>f(ECOLOGY[id]));
  if(has(e=>e.water==='fresh') && has(e=>e.water==='salt'))
    return '现实里淡水鱼和海水鱼没法同缸——在这里它们相安无事。';
  if(has(e=>e.temp==='cold') && has(e=>e.temp==='tropical'))
    return '金鱼锦鲤爱凉水，热带鱼要 26 °C 左右的温水；这缸的水刚好两边都喜欢。';
  for(const p of ids){
    const Lp=lengths[p];
    if(!ECOLOGY[p].predator || !Lp) continue;
    const prey=ids.find(id=>id!==p && (lengths[id] ?? Infinity)<=Lp*PREY_RATIO);
    if(prey) return `现实中${names[p] ?? '狮子鱼'}会把${names[prey] ?? '小鱼'}当点心，这里它只是在巡游。`;
  }
  return null;
}
