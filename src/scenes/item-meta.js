// @ts-check
/* ================================================================
 * 造景物件元数据（纯数据，无 three 依赖）：编辑器面板、文档校验、单测共用
 * radius：未缩放时的占地半径（选中圈、默认摆放间距）；scale：允许的缩放区间
 * ================================================================ */

/** @typedef {{ label:string, group:string, radius:number, scale:[number,number], hint?:string }} ItemMeta */

export const ITEM_GROUPS = [
  { id:'stone', label:'岩石沉木' },
  { id:'plant', label:'水草' },
  { id:'wet',   label:'池塘湿地' },
  { id:'coral', label:'珊瑚' },
  { id:'cn',    label:'中式园林' },
  { id:'gear',  label:'设备' },
];

/** @type {Record<string, ItemMeta>} */
export const ITEM_META = {
  rock:        { label:'河石',     group:'stone', radius:0.22, scale:[0.3,2.2] },
  rockTall:    { label:'青龙石',   group:'stone', radius:0.16, scale:[0.5,1.8] },
  liveRock:    { label:'活石',     group:'stone', radius:0.3,  scale:[0.4,2.0], hint:'海水缸礁岩，可叠放成礁' },
  wood:        { label:'沉木拱',   group:'stone', radius:0.75, scale:[0.5,1.3] },
  mossBall:    { label:'苔球',     group:'stone', radius:0.09, scale:[0.6,2.0] },
  pebbles:     { label:'卵石滩',   group:'stone', radius:0.32, scale:[0.6,2.0], hint:'溪流河床常见的圆润卵石' },
  // 水草的 radius 含叶片伸出的满幅（不是只算丛心）：选中圈更贴实、边界钳制才挡得住穿玻璃
  kelp:        { label:'长叶草',   group:'plant', radius:0.42, scale:[0.35,1.25] },
  bush:        { label:'灌丛草',   group:'plant', radius:0.38, scale:[0.5,1.4] },
  crown:       { label:'皇冠草',   group:'plant', radius:0.4,  scale:[0.5,1.4] },
  red:         { label:'红宫廷',   group:'plant', radius:0.16, scale:[0.6,1.6] },
  carpet:      { label:'前景矮草', group:'plant', radius:0.36, scale:[0.6,1.6] },
  seagrass:    { label:'细叶草',   group:'plant', radius:0.38, scale:[0.5,1.5] },
  lily:        { label:'睡莲',     group:'wet',   radius:0.42, scale:[0.7,1.5], hint:'叶片与花浮在水面' },
  reeds:       { label:'香蒲',     group:'wet',   radius:0.22, scale:[0.7,1.4], hint:'挺水植物，长出水面' },
  coralBranch: { label:'鹿角珊瑚', group:'coral', radius:0.28, scale:[0.5,1.8] },
  coralBrain:  { label:'脑珊瑚',   group:'coral', radius:0.19, scale:[0.5,1.8] },
  coralFan:    { label:'海扇',     group:'coral', radius:0.26, scale:[0.5,1.6] },
  anemone:     { label:'海葵',     group:'coral', radius:0.15, scale:[0.6,1.8] },
  taihu:       { label:'太湖石',   group:'cn',    radius:0.18, scale:[0.5,1.8], hint:'瘦皱漏透，孔洞相通' },
  bridge:      { label:'石拱桥',   group:'cn',    radius:0.62, scale:[0.6,1.4], hint:'驼峰单孔桥，鱼可穿过桥洞' },
  porcelain:   { label:'青花瓷罐', group:'cn',    radius:0.26, scale:[0.6,1.6], hint:'倾倒半埋，鱼可钻进罐口' },
  airstone:    { label:'气石',     group:'gear',  radius:0.07, scale:[1,1], hint:'气泡从第一个气石冒出' },
};

export const ITEM_TYPES = Object.keys(ITEM_META);

/** 物件可摆放范围（缸内沙面，留出玻璃边距） */
export const PLACE_BOUNDS = { x:2.05, z:0.75 };
/** 玻璃内壁坐标（对应 scene/tank.js 的 TANK：外尺寸/2 − 玻璃厚 = ±2.265 / ±0.865）。
 *  物件与饲料都不许越过这条线 */
export const GLASS_INNER = { x:2.265, z:0.865 };
const LIMIT_FLOOR=0.15;            // 超大物件向缸心收的下限，保证任何物件都还有摆放余地

/**
 * 物件中心点允许范围：玻璃内壁 − 占地半径×缩放（再留 2cm 余量），并夹在 PLACE_BOUNDS 内。
 * radius 是数据侧的估算；运行时 place() 会按真实几何包络再钳一次（见 scene-runtime.js）
 */
export function placeLimits(/** @type {string} */ type, /** @type {number} */ s){
  const r=(ITEM_META[type]?.radius ?? 0.2)*Math.max(0.1, s);
  return { x:Math.max(LIMIT_FLOOR, Math.min(PLACE_BOUNDS.x, GLASS_INNER.x-0.02-r)),
           z:Math.max(LIMIT_FLOOR, Math.min(PLACE_BOUNDS.z, GLASS_INNER.z-0.02-r)) };
}

export const MAX_ITEMS = 80;
