// @ts-check
/* ================================================================
 * 预设水景（纯数据）。首次运行时复制进存档；"恢复预设"按 presetId 回到这里
 * classic = v1.7 之前写死的布局逐项转换而来（同位置、同鱼群），保证老玩家无感升级
 * ================================================================ */

/** @typedef {import('./scene-doc.js').SceneDoc} SceneDoc */

/** 紧凑写法 → 物件 @param {string} type @param {number} x @param {number} z @param {number} [s] @param {number} [rot] @param {number} [seed] */
const it = (type, x, z, s=1, rot=0, seed) => ({ type, x, z, s, rot, seed: seed ?? Math.round((x*7.3+z*13.1+s*3.7)*1000+5000) });

/** @type {SceneDoc[]} */
const RAW = [
  {
    id:'classic', presetId:'classic', name:'经典混养', theme:'fresh',
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
    id:'reef', presetId:'reef', name:'珊瑚礁', theme:'reef',
    fish:{ clown:6, angel:4, lion:2, mandarin:3, parrot:4 },
    items:[
      // 礁岩骨架：左右两座礁台 + 中后方矮礁，前景留白沙给鱼活动
      it('rock',-1.3,-0.48,2.0,0.3), it('rock',-0.92,-0.6,1.5,1.9), it('rock',-1.65,-0.2,1.2,3.1),
      it('rockTall',-1.15,-0.62,1.3,0.7),
      it('rock',1.25,-0.5,1.9,4.4), it('rock',0.86,-0.62,1.3,2.2), it('rock',1.62,-0.22,1.1,5.3),
      it('rockTall',1.45,-0.6,1.1,2.0),
      it('rock',0.0,-0.66,1.4,0.8), it('rock',-0.32,-0.7,0.9,2.6),
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
    id:'pond', presetId:'pond', name:'锦鲤石庭', theme:'pond',
    fish:{ koi:4, gold:6, cory:4 },
    items:[
      it('rockTall',-1.15,-0.5,1.5,0.3), it('rockTall',-0.85,-0.6,1.0,1.4), it('rockTall',1.35,-0.45,1.3,2.6),
      it('rock',-1.45,-0.3,1.3,1.1), it('rock',0.95,-0.55,1.5,4.2), it('rock',0.2,0.35,0.5,2.0),
      it('rock',-0.5,0.4,0.4,5.0), it('rock',1.7,0.2,0.6,0.6),
      it('mossBall',-0.2,0.15,1.2), it('mossBall',0.1,0.3,0.9), it('mossBall',-1.6,0.35,1.1),
      it('mossBall',1.3,0.4,1.0), it('mossBall',0.55,-0.1,1.4),
      it('seagrass',-1.75,-0.6,1.3), it('seagrass',1.8,-0.6,1.2), it('seagrass',0.3,-0.65,1.0),
      it('carpet',-0.9,0.1,1.2), it('carpet',0.7,0.15,1.1),
      it('wood',0.15,-0.6,0.8),
      it('airstone',-1.85,0.55),
    ].map((o,i)=>({ id:`pond-${i}`, ...o })),
  },
];

export const PRESETS = RAW;
export const PRESET_IDS = RAW.map(d=>d.id);
/** @param {string} id */
export const findPreset = id => RAW.find(d=>d.id===id) ?? null;
