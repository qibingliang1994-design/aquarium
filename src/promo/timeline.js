// @ts-check
/* ================================================================
 * 宣传片的节拍表：画面（promo/story.js）与配乐（scripts/promo-audio.mjs）共用的唯一时间源。
 * 一切以拍为单位：石头落在拍上、草按十六分音符长出来、切镜都在小节线上。
 * 纯数据，无浏览器依赖（Node 端的配乐脚本也 import 它）。
 * ================================================================ */

export const BPM=96;
export const BEAT=60/BPM;                 // 0.625 s
export const FPS=30;

/** 段落（单位：拍，绝对位置）。改节奏只改这里，画面与配乐一起跟着变 */
export const SEC={
  hook:   0,     // 成品缸一闪（第 30 天）
  rewind: 3,     // 磁带倒带：计数器 30 → 1 往回滚，音乐降速停下
  empty:  4,     // 空缸，只剩水声
  stones: 6,     // 主石起每拍落一块
  plants: 18,    // 牛毛毡按十六分音符铺开
  fish:   26,    // 放鱼
  macro:  30,    // 跟拍一条红鼻剪刀
  wide:   36,    // 全景
  night:  40,    // 关灯
  end:    46,
};

/** 和弦进行：每小节（4 拍）一个，循环；[根音, ...和弦内音]（MIDI） */
export const CHORDS=[
  [43, 59,62,66,69],      // Gmaj9
  [40, 55,59,62,66],      // Em9
  [36, 52,55,59,62],      // Cmaj9
  [38, 57,62,64,69],      // D6/9
];
/** 第 b 拍所在小节的和弦（收尾两拍强制回到主和弦） @param {number} b */
export const chordAt=(b)=>b>=SEC.end-2 ? CHORDS[0] : CHORDS[Math.floor(b/4)%CHORDS.length];

/** G 大调五声音阶（草一丛一个音，自下而上爬） */
export const PENTA=[55,57,59,62,64, 67,69,71,74,76, 79,81,83,86,88];

export const sec=(/** @type {number} */ b)=>b*BEAT;
