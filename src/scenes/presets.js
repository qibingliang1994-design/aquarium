// @ts-check
/* ================================================================
 * 预设水景（纯数据）。首次运行时复制进存档；"恢复预设"按 presetId 回到这里
 * v2.0 新增：荷兰草缸（无边框缸）+ 三个自然水域（睡莲池塘 / 山间溪流 / 林间小河）
 * classic = v1.7 之前写死的布局逐项转换而来（同位置、同鱼群），保证老玩家无感升级
 * ================================================================ */

/** @typedef {import('./scene-doc.js').SceneDoc} SceneDoc */

/** 紧凑写法 → 物件 @param {string} type @param {number} x @param {number} z @param {number} [s] @param {number} [rot] @param {number} [seed] */
const it = (type, x, z, s=1, rot=0, seed) => ({ type, x, z, s, rot, seed: seed ?? Math.round((x*7.3+z*13.1+s*3.7)*1000+5000) });

/** @type {SceneDoc[]} */
const RAW = [
  {
    id:'classic', presetId:'classic', name:'经典混养', theme:'fresh', tank:'classic',
    fish:{ tetra:24, gold:4, angel:3, cory:5, koi:2, clown:4, lion:2, mandarin:2, parrot:3 },
    items:[
      // 岩石：原 [x,z,r]，圆石基准半径 0.2 → s=r/0.2
      it('rock',-1.22,-0.35,1.7,0.4), it('rock',-0.94,-0.42,1.0,2.1), it('rock',-1.5,-0.2,0.75,4.0),
      it('rock',1.14,-0.32,1.4,1.2), it('rock',1.42,-0.4,0.85,3.3), it('rock',0.74,-0.22,0.6,5.1),
      it('rock',1.58,0.3,0.45,0.9), it('rock',-1.56,0.33,0.4,2.7), it('rock',-0.24,0.45,0.3,1.6),
      it('rock',-0.7,-0.6,1.7,5.6), it('rock',0.45,-0.66,1.4,3.9),
      it('wood',0,-0.57),
      it('kelp',-1.25,-0.45,1.05), it('kelp',0.12,-0.52,0.95), it('kelp',1.08,-0.44,0.85),
      it('kelp',-1.78,-0.62,0.42), it('kelp',1.78,-0.62,0.42),
      it('bush',-1.1,0.3,1.05), it('bush',0.82,0.34,0.95),
      it('crown',-1.85,-0.68,0.85), it('crown',1.85,-0.68,0.8),
      it('red',-0.55,0.1), it('red',0.15,0.14),
      it('carpet',-1.6,-0.02), it('carpet',-0.8,0.05), it('carpet',0,-0.04), it('carpet',0.8,0.02), it('carpet',1.6,-0.05),
      it('airstone',1.6,0.5),
    ].map((o,i)=>({ id:`classic-${i}`, ...o })),
  },
  {
    id:'reef', presetId:'reef', name:'珊瑚礁', theme:'reef', tank:'reef',
    fish:{ clown:6, angel:4, lion:2, mandarin:3, parrot:4 },
    items:[
      // 礁岩骨架：左右两座礁台 + 中后方矮礁，前景留白沙给鱼活动
      it('liveRock',-1.3,-0.48,2.0,0.3), it('liveRock',-0.92,-0.6,1.5,1.9), it('liveRock',-1.65,-0.2,1.2,3.1),
      it('rockTall',-1.15,-0.62,1.3,0.7),
      it('liveRock',1.25,-0.5,1.9,4.4), it('liveRock',0.86,-0.62,1.3,2.2), it('liveRock',1.62,-0.22,1.1,5.3),
      it('rockTall',1.45,-0.6,1.1,2.0),
      it('liveRock',0.0,-0.66,1.4,0.8), it('liveRock',-0.32,-0.7,0.9,2.6),
      // 珊瑚：礁台上鹿角与脑珊瑚，后排海扇，前中景海葵
      it('coralBranch',-1.25,-0.36,1.3,0.5), it('coralBranch',-0.7,-0.5,0.9,2.9), it('coralBranch',1.18,-0.38,1.2,2.4),
      it('coralBranch',0.15,-0.5,1.0,1.3), it('coralBranch',1.75,0.05,0.7,4.1),
      it('coralBrain',-0.55,-0.2,1.1), it('coralBrain',0.62,-0.25,1.0,1.7), it('coralBrain',1.62,0.32,0.75,3.0),
      it('coralBrain',-1.75,0.25,0.8,0.9),
      it('coralFan',-1.0,-0.74,1.4,0.2), it('coralFan',0.9,-0.74,1.5,-0.3), it('coralFan',-0.15,-0.75,1.2,0.4),
      it('coralFan',1.85,-0.7,1.1,0.9), it('coralFan',-1.85,-0.7,1.0,-0.6),
      it('anemone',-0.35,0.2,1.3), it('anemone',0.38,0.28,1.1), it('anemone',-1.3,0.3,1.0),
      it('anemone',1.05,0.18,1.2), it('anemone',0.05,-0.05,0.9),
      it('airstone',1.85,0.6),
    ].map((o,i)=>({ id:`reef-${i}`, ...o })),
  },
  {
    id:'pond', presetId:'pond', name:'锦鲤石庭', theme:'pond', tank:'zen',
    fish:{ koi:4, gold:6, cory:4 },
    items:[
      // 岩组（石组造景）：主石偏左三分线，副石、从石依次递减，彼此朝向主石
      it('rockTall',-0.72,-0.3,1.8,0.4), it('rockTall',-0.36,-0.46,1.3,1.2), it('rockTall',-1.12,-0.5,1.1,2.2),
      it('rockTall',0.92,-0.42,1.4,3.0), it('rockTall',1.28,-0.56,1.0,4.1), it('rockTall',0.56,-0.6,0.8,0.7),
      it('rock',-0.05,0.22,0.5,1.0), it('rock',0.32,0.36,0.4,2.4), it('rock',1.62,0.3,0.5,5.2), it('rock',-1.58,0.26,0.6,3.6),
      // 前景草坪 + 后景细叶草
      it('carpet',-1.75,0.3,1.2), it('carpet',-1.3,0.05,1.3), it('carpet',-0.85,0.3,1.2), it('carpet',-0.4,0.05,1.3),
      it('carpet',0.05,0.38,1.1), it('carpet',0.5,0.08,1.3), it('carpet',0.95,0.3,1.2), it('carpet',1.4,0.05,1.3),
      it('carpet',1.8,0.35,1.1), it('carpet',-0.15,-0.2,1.0), it('carpet',0.3,-0.25,1.0),
      it('seagrass',-1.8,-0.66,1.3), it('seagrass',1.78,-0.66,1.25), it('seagrass',0.15,-0.72,1.0), it('seagrass',-0.3,-0.72,0.9),
      it('mossBall',-0.95,0.12,1.1), it('mossBall',1.12,0.15,1.0), it('mossBall',0.7,-0.12,0.9),
      it('airstone',-1.85,0.55),
    ].map((o,i)=>({ id:`pond-${i}`, ...o })),
  },
  {
    id:'planted', presetId:'planted', name:'荷兰草缸', theme:'fresh', tank:'rimless',
    fish:{ tetra:26, angel:4, cory:6 },
    items:[
      // 荷兰式：后景高茎成墙，中景红草点缀，前景草坪渐低，沉木斜出
      it('kelp',-1.8,-0.66,1.2), it('kelp',-1.35,-0.68,1.1), it('kelp',1.4,-0.68,1.15), it('kelp',1.85,-0.64,1.2),
      it('red',-0.9,-0.6,1.4), it('red',-0.55,-0.68,1.2), it('red',0.95,-0.6,1.3),
      it('seagrass',0.3,-0.7,1.4), it('seagrass',-0.15,-0.72,1.3), it('seagrass',0.6,-0.72,1.2),
      it('bush',-1.55,-0.15,1.1), it('bush',1.6,-0.1,1.0), it('crown',-0.95,-0.2,1.1), it('crown',1.05,-0.18,1.0),
      it('wood',0.1,-0.35,0.9,0.25),
      it('carpet',-1.7,0.38,1.2), it('carpet',-1.1,0.3,1.3), it('carpet',-0.5,0.4,1.2), it('carpet',0.1,0.3,1.3),
      it('carpet',0.7,0.4,1.2), it('carpet',1.3,0.32,1.3), it('carpet',1.85,0.4,1.1),
      it('rock',-0.3,0.12,0.5,1.1), it('rock',0.55,0.1,0.4,3.2),
      it('airstone',1.85,0.6),
    ].map((o,i)=>({ id:`planted-${i}`, ...o })),
  },
  {
    id:'lotus', presetId:'lotus', name:'睡莲池塘', theme:'pond', tank:'pond',
    fish:{ koi:5, gold:6, cory:4 },
    items:[
      // 静水池塘：睡莲铺半个水面，岸角香蒲丛，池底苔球与零星卵石
      it('lily',-1.35,-0.35,1.3), it('lily',-0.7,0.25,1.0,1.4), it('lily',1.1,-0.5,1.4,2.2), it('lily',1.65,0.3,0.9,0.6),
      it('lily',0.25,-0.62,1.1,3.3),
      it('reeds',-1.9,-0.68,1.2), it('reeds',-1.6,-0.72,1.0,1.7), it('reeds',1.92,-0.66,1.1,0.4), it('reeds',0.75,-0.74,0.9,2.6),
      it('seagrass',-1.0,-0.66,1.1), it('seagrass',1.45,-0.62,1.0), it('seagrass',-0.2,-0.7,1.0),
      it('rock',-0.25,0.1,1.2,0.9), it('rock',0.6,0.3,0.8,2.2), it('rock',-1.7,0.2,0.9,4.4),
      it('pebbles',0.2,0.45,1.2), it('pebbles',1.3,0.45,1.0,1.5),
      it('mossBall',-0.9,-0.05,1.2), it('mossBall',0.95,0.05,1.0), it('mossBall',-0.45,0.5,0.9),
      it('carpet',-1.25,0.35,1.2), it('carpet',-0.45,-0.25,1.1), it('carpet',1.7,-0.15,1.0),
    ].map((o,i)=>({ id:`lotus-${i}`, ...o })),
  },
  {
    id:'stream', presetId:'stream', name:'山间溪流', theme:'stream', tank:'stream',
    fish:{ tetra:22, cory:6, gold:2 },
    items:[
      // 溪床：大小卵石滩铺底，几块河石破开水流，石缝里长细叶草与苔球
      it('pebbles',-1.6,0.2,1.8), it('pebbles',-0.8,-0.35,1.6,1.2), it('pebbles',0.1,0.3,1.9,2.3), it('pebbles',0.95,-0.3,1.7,0.6),
      it('pebbles',1.75,0.25,1.6,3.8), it('pebbles',-0.2,-0.6,1.3,4.6), it('pebbles',1.5,-0.62,1.2,5.4),
      it('rock',-1.15,-0.45,1.9,0.5), it('rock',-0.85,-0.6,1.1,2.4), it('rock',0.55,-0.5,1.6,3.6), it('rock',1.3,0.0,1.0,1.1),
      it('rock',-0.35,0.15,0.7,5.0), it('rock',1.9,-0.5,1.3,4.0),
      it('seagrass',-1.4,-0.68,1.1), it('seagrass',0.2,-0.7,1.0), it('seagrass',1.0,-0.68,0.9),
      it('mossBall',-0.6,-0.32,1.0), it('mossBall',0.8,-0.18,0.9),
      it('wood',-0.15,-0.62,0.7,0.35),
    ].map((o,i)=>({ id:`stream-${i}`, ...o })),
  },
  {
    id:'river', presetId:'river', name:'林间小河', theme:'river', tank:'river',
    fish:{ koi:2, gold:4, tetra:14, cory:5 },
    items:[
      // 河湾：沉木倒伏在后岸，水草顺着缓流摆动，岸边一丛香蒲、一小片睡莲
      it('wood',-0.55,-0.5,1.2,0.2), it('wood',0.9,-0.6,0.8,2.9),
      it('kelp',-1.6,-0.62,1.0), it('kelp',0.2,-0.68,1.1), it('kelp',1.55,-0.6,0.95),
      it('crown',-1.15,-0.25,1.1), it('crown',1.2,-0.2,1.0), it('bush',-1.85,0.1,1.0),
      it('rock',-0.15,0.2,1.1,1.3), it('rock',0.55,0.35,0.7,3.0), it('rock',1.75,0.15,1.2,4.8),
      it('pebbles',-0.8,0.4,1.4), it('pebbles',1.1,0.45,1.3,2.0),
      it('reeds',-1.95,-0.7,1.2), it('reeds',-1.7,-0.5,1.0,2.0),
      it('lily',1.7,-0.35,1.1,0.8),
      it('carpet',-1.35,0.42,1.1), it('carpet',0.25,0.0,1.0),
    ].map((o,i)=>({ id:`river-${i}`, ...o })),
  },
];

export const PRESETS = RAW;
export const PRESET_IDS = RAW.map(d=>d.id);
/** @param {string} id */
export const findPreset = id => RAW.find(d=>d.id===id) ?? null;
