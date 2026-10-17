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
  kelp:        { label:'长叶草',   group:'plant', radius:0.24, scale:[0.35,1.25] },
  bush:        { label:'灌丛草',   group:'plant', radius:0.24, scale:[0.5,1.4] },
  crown:       { label:'皇冠草',   group:'plant', radius:0.16, scale:[0.5,1.4] },
  red:         { label:'红宫廷',   group:'plant', radius:0.12, scale:[0.6,1.6] },
  carpet:      { label:'前景矮草', group:'plant', radius:0.32, scale:[0.6,1.6] },
  seagrass:    { label:'细叶草',   group:'plant', radius:0.2,  scale:[0.5,1.5] },
  lily:        { label:'睡莲',     group:'wet',   radius:0.26, scale:[0.7,1.5], hint:'叶片与花浮在水面' },
  reeds:       { label:'香蒲',     group:'wet',   radius:0.14, scale:[0.7,1.4], hint:'挺水植物，长出水面' },
  coralBranch: { label:'鹿角珊瑚', group:'coral', radius:0.28, scale:[0.5,1.8] },
  coralBrain:  { label:'脑珊瑚',   group:'coral', radius:0.19, scale:[0.5,1.8] },
  coralFan:    { label:'海扇',     group:'coral', radius:0.26, scale:[0.5,1.6] },
  anemone:     { label:'海葵',     group:'coral', radius:0.15, scale:[0.6,1.8] },
  airstone:    { label:'气石',     group:'gear',  radius:0.07, scale:[1,1], hint:'气泡从第一个气石冒出' },
};

export const ITEM_TYPES = Object.keys(ITEM_META);

/** 物件可摆放范围（缸内沙面，留出玻璃边距） */
export const PLACE_BOUNDS = { x:2.05, z:0.75 };
export const MAX_ITEMS = 80;
