// @ts-check
/* ================================================================
 * 造景物件元数据（纯数据，无 three 依赖）：编辑器面板、文档校验、单测共用
 * radius：未缩放时的占地半径（选中圈、默认摆放间距）；scale：允许的缩放区间
 * ================================================================ */

/** @typedef {{ label:string, group:string, radius:number, scale:[number,number], hint?:string, land?:boolean }} ItemMeta */

export const ITEM_GROUPS = [
  { id:'stone', label:'岩石沉木' },
  { id:'plant', label:'水草' },
  { id:'wet',   label:'池塘湿地' },
  { id:'coral', label:'珊瑚' },
  { id:'cn',    label:'中式园林' },
  { id:'gear',  label:'设备' },
  { id:'shore', label:'岸边' },
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
  pine:        { label:'松树',     group:'shore', radius:0.8, scale:[0.75,1.6], land:true, hint:'岸上的针叶树，可摆到水线外' },
  maple:       { label:'秋枫',     group:'shore', radius:0.9, scale:[0.7,1.5], land:true, hint:'红橙枫冠，叶量随画质下降' },
  bankGrass:   { label:'岸草',     group:'shore', radius:0.5, scale:[0.7,1.6], land:true, hint:'岸坡草丛，低画质减少叶片并藏起加密丛' },
  lantern:     { label:'石灯',     group:'shore', radius:0.32, scale:[0.7,1.5], land:true, hint:'石灯笼，入夜发光，倒影里也能看见' },
};

export const ITEM_TYPES = Object.keys(ITEM_META);

/** 默认缸的摆放半宽 / 玻璃内壁（大场景由 boundsFor 另算，见 tank-bounds.js） */
import { PLACE_BOUNDS, GLASS_INNER } from './tank-bounds.js';
export { PLACE_BOUNDS, GLASS_INNER };
const LIMIT_FLOOR=0.15;            // 超大物件向缸心收的下限，保证任何物件都还有摆放余地

/**
 * 物件中心点允许范围：玻璃内壁 − 占地半径×缩放（再留 2cm 余量），并夹在摆放半宽内。
 * bounds 缺省是默认缸；清洗某个场景时传入该场景缸型的边界，避免大池塘的物件被收进小缸。
 * radius 是数据侧的估算；运行时 place() 会按真实几何包络再钳一次（见 scene-runtime.js）
 * 岸边物件（land）在 shore 比水面摆放框更大时改用岸线范围，玻璃缸的 shore 与 place 重合，公式不变。
 * @param {string} type @param {number} s @param {{ place:{x:number,z:number}, glassInner:{x:number,z:number}, shore?:{x:number,z:number} }} [bounds]
 */
export function placeLimits(type, s, bounds){
  const place=bounds?.place ?? PLACE_BOUNDS, glass=bounds?.glassInner ?? GLASS_INNER;
  const r=(ITEM_META[type]?.radius ?? 0.2)*Math.max(0.1, s);
  const shore=bounds?.shore;
  const land=!!ITEM_META[type]?.land && shore && (shore.x>place.x+1e-4 || shore.z>place.z+1e-4);
  if(land) return { x:Math.max(LIMIT_FLOOR, shore.x-0.02-r), z:Math.max(LIMIT_FLOOR, shore.z-0.02-r) };
  return { x:Math.max(LIMIT_FLOOR, Math.min(place.x, glass.x-0.02-r)),
           z:Math.max(LIMIT_FLOOR, Math.min(place.z, glass.z-0.02-r)) };
}

export const MAX_ITEMS = 80;
