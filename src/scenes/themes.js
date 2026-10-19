// @ts-check
/* ================================================================
 * 水体主题（纯数据）：只覆盖日间表里的水色/雾色/辉光 + 沙色 + 背光幕 + 碎石色
 * 夜间统一走月光表，主题差异主要体现在白天
 * ================================================================ */

/** @typedef {{ label:string, fog:number, glow:number, sky:[number,number,number], deep:[number,number,number],
 *   sand:[number,number], backdrop:string, gravel:number[], hint?:string, art?:'ink' }} Theme */
/* art：背光幕画面（缺省 = 纯色辉光；'ink' = 水墨远山） */

/** @type {Record<string, Theme>} */
export const THEMES = {
  fresh: {
    label:'淡水草缸', hint:'暖色细沙 · 清澈青水',
    fog:0x0a2430, glow:0x2e8fb0, sky:[0.45,0.62,0.72], deep:[0.02,0.09,0.13],
    sand:[0xa28862,0x7e6647], backdrop:'58,138,160',
    gravel:[0xbcb09b,0x9d9281,0xd6cab4,0xab8d6c,0x857b6e],
  },
  reef: {
    label:'珊瑚海缸', hint:'珊瑚白沙 · 通透海蓝',
    fog:0x0b3550, glow:0x3fb4e0, sky:[0.5,0.76,0.92], deep:[0.02,0.13,0.22],
    sand:[0xd6cebd,0xb3a991], backdrop:'60,150,215',
    gravel:[0xf4efe4,0xe2d9c6,0xd4c2a6,0xf0d8d0,0xc9c0b0],
  },
  pond: {
    label:'锦鲤石庭', hint:'青灰砂石 · 幽静池绿',
    fog:0x112a26, glow:0x4f9a82, sky:[0.5,0.64,0.58], deep:[0.03,0.09,0.08],
    sand:[0x8d8f86,0x6a6c66], backdrop:'86,140,118',
    gravel:[0x9a9c95,0x7e807a,0xb6b7b0,0x6c6e69,0xa59a88],
  },
  stream: {
    label:'溪流清水', hint:'青灰卵石 · 清冽见底',
    fog:0x0d3038, glow:0x58b8c8, sky:[0.55,0.74,0.8], deep:[0.03,0.14,0.17],
    sand:[0x8f8a80,0x6c6860], backdrop:'90,160,175',
    gravel:[0xa8a49a,0x8a8478,0xc4bfb2,0x7b7468,0x9a9284],
  },
  river: {
    label:'河湾茶水', hint:'黄褐泥沙 · 微茶色河水',
    fog:0x1d2a1c, glow:0x8a9a5a, sky:[0.58,0.6,0.46], deep:[0.07,0.08,0.04],
    sand:[0x9c8461,0x76603f], backdrop:'130,140,90',
    gravel:[0xa08a6a,0x86704f,0xb8a585,0x6f5c40,0x958165],
  },
  garden: {
    label:'园林墨韵', hint:'灰白细沙 · 水墨远山 · 碧玉池水', art:'ink',
    fog:0x12302a, glow:0x6fb39a, sky:[0.56,0.7,0.64], deep:[0.03,0.1,0.09],
    sand:[0xa29e92,0x7f7c73], backdrop:'150,185,170',
    gravel:[0xb3b0a6,0x8f8c83,0xcfccc2,0x6e6c66,0x9c968a],
  },
};

export const THEME_IDS = Object.keys(THEMES);
