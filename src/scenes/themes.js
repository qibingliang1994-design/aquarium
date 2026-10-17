// @ts-check
/* ================================================================
 * 水体主题（纯数据）：只覆盖日间表里的水色/雾色/辉光 + 沙色 + 背光幕 + 碎石色
 * 夜间统一走月光表，主题差异主要体现在白天
 * ================================================================ */

/** @typedef {{ label:string, fog:number, glow:number, sky:[number,number,number], deep:[number,number,number],
 *   sand:[number,number], backdrop:string, gravel:number[], hint?:string }} Theme */

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
};

export const THEME_IDS = Object.keys(THEMES);
