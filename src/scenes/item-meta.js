// @ts-check
/* ================================================================
 * 造景物件元数据（纯数据，无 three 依赖）：编辑器面板、文档校验、单测共用
 * radius：未缩放时的占地半径（选中圈、默认摆放间距）；scale：允许的缩放区间
 * depth：长条物件沿局部 z 的占地半宽（缺省 = radius，即圆形占地）
 * ================================================================ */

/** @typedef {{ label:string, group:string, radius:number, depth?:number, scale:[number,number], hint?:string, land?:boolean }} ItemMeta */

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
  rockTall:    { label:'青龙石',   group:'stone', radius:0.16, scale:[0.5,3.2], hint:'岩组主石可放到很大' },
  liveRock:    { label:'活石',     group:'stone', radius:0.3,  scale:[0.4,2.0], hint:'海水缸礁岩，可叠放成礁' },
  wood:        { label:'沉木拱',   group:'stone', radius:0.75, scale:[0.5,1.3] },
  branchWood:  { label:'红沉木枝', group:'stone', radius:0.55, depth:0.24, scale:[0.5,1.8], hint:'从沙里斜伸出的分叉细枝，可交错堆成一组' },
  logWood:     { label:'灰沉木枝', group:'stone', radius:0.6,  depth:0.2, scale:[0.5,1.8], hint:'褪色的灰褐漂木粗枝，带断头分杈，一头扎沙斜搭着，几根交错成堆' },
  mossRock:    { label:'苔石',     group:'stone', radius:0.22, scale:[0.4,3.0], hint:'浅色层岩，顶面长满苔藓垫，可叠成山' },
  mossBall:    { label:'苔球',     group:'stone', radius:0.09, scale:[0.6,2.0] },
  pebbles:     { label:'卵石滩',   group:'stone', radius:0.32, scale:[0.6,2.0], hint:'溪流河床常见的圆润卵石' },
  sandPath:    { label:'化妆砂',   group:'stone', radius:0.5,  depth:0.25, scale:[0.6,2.2], hint:'浅色细砂铺出的小径，贴着底床起伏' },
  // 水草的 radius 含叶片伸出的满幅（不是只算丛心）：选中圈更贴实、边界钳制才挡得住穿玻璃
  kelp:        { label:'长叶草',   group:'plant', radius:0.42, scale:[0.35,1.25] },
  bush:        { label:'灌丛草',   group:'plant', radius:0.38, scale:[0.5,1.4] },
  crown:       { label:'皇冠草',   group:'plant', radius:0.4,  scale:[0.5,1.4] },
  red:         { label:'红宫廷',   group:'plant', radius:0.16, scale:[0.6,1.8] },
  stemGreen:   { label:'绿宫廷',   group:'plant', radius:0.18, scale:[0.6,1.8], hint:'高大的绿色有茎草，成片种在后景可长到水面' },
  rotala:      { label:'圆叶节节菜', group:'plant', radius:0.2, scale:[0.6,2.2], hint:'细碎小叶修剪成圆顶，顶梢橙红，水景的红色焦点' },
  pearl:       { label:'珍珠草',   group:'plant', radius:0.22, scale:[0.6,2.2], hint:'极细小叶密生的浅绿圆顶，做层次过渡' },
  star:        { label:'星状刺蕊草', group:'plant', radius:0.18, scale:[0.6,2.0], hint:'轮生针叶在茎顶散成星芒，亮黄绿' },
  carpet:      { label:'前景矮草', group:'plant', radius:0.36, scale:[0.6,1.6] },
  hairgrass:   { label:'牛毛毡',   group:'plant', radius:0.36, scale:[0.6,1.6], hint:'针状细叶连成草原，岩组缸的前中景' },
  fern:        { label:'铁皇冠',   group:'plant', radius:0.3,  scale:[0.6,1.6], hint:'深绿披针叶，适合种在沉木与石缝间' },
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
 * @param {number} [rot] 物件绕 y 的转角（只影响带 depth 的长条物件）
 */
export function placeLimits(type, s, bounds, rot=0){
  const place=bounds?.place ?? PLACE_BOUNDS, glass=bounds?.glassInner ?? GLASS_INNER;
  const k=Math.max(0.1, s), meta=ITEM_META[type];
  // 长条物件（倒木 / 沉木枝 / 化妆砂）的占地是椭圆：半长 radius、半宽 depth，按自身转角投到 x / z 轴；圆形物件 depth=radius，与转角无关
  const R=(meta?.radius ?? 0.2)*k, D=(meta?.depth ?? 0)*k, c=Math.cos(rot), sn=Math.sin(rot);
  const rx=D ? Math.hypot(R*c, D*sn) : R, rz=D ? Math.hypot(R*sn, D*c) : R;
  const shore=bounds?.shore;
  const land=!!meta?.land && shore && (shore.x>place.x+1e-4 || shore.z>place.z+1e-4);
  if(land) return { x:Math.max(LIMIT_FLOOR, shore.x-0.02-rx), z:Math.max(LIMIT_FLOOR, shore.z-0.02-rz) };
  return { x:Math.max(LIMIT_FLOOR, Math.min(place.x, glass.x-0.02-rx)),
           z:Math.max(LIMIT_FLOOR, Math.min(place.z, glass.z-0.02-rz)) };
}

export const MAX_ITEMS = 80;
