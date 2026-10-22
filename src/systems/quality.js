// @ts-check
/* ================================================================
 * 自动画质：阶梯降级 + 帧率恢复后逐级回升（带迟滞，避免抖动）
 * 每 0.5 秒喂一次实测 FPS（sample），内部按连续低/高帧数决策：
 * 连续 3 秒 < DOWN_FPS 降一级；连续 10 秒 > UP_FPS 升一级。
 * 纯状态机（可单测）；渲染副作用由构造时传入的 onLevel 回调执行。
 *
 * v2.2 起每级不再只带"像素比上限"，还带"画布像素预算"（budgetRatio）：
 * 大窗口（4K 全屏）按 sqrt(预算/窗口像素) 立即缩，不用等帧率阶梯慢慢压；
 * 小窗口预算用不完，保持基准 dpr 不变。像素比上限仍作为第二道闸。
 * ================================================================ */

/** @typedef {{ label:string, glass:'high'|'low', bloom:boolean, pixels:number|null, shadowHz:number }} QualityLevel */

/** 每一级的标签与开关。pixels = 画布像素预算（null = 不限，用基准 dpr；标定 = 各档像素比在 1080p
 *  窗口下的实际画布像素，大窗口由此立即缩、不必等帧率阶梯）；shadowHz = 阴影贴图刷新率
 *  @type {QualityLevel[]} */
export const LEVELS=[
  { label:'高清', glass:'high', bloom:true,  pixels:null,   shadowHz:30 },
  { label:'均衡', glass:'high', bloom:true,  pixels:4.6e6,  shadowHz:24 },
  { label:'均衡', glass:'high', bloom:true,  pixels:3.2e6,  shadowHz:18 },
  { label:'流畅', glass:'low',  bloom:true,  pixels:2.0e6,  shadowHz:12 },
  { label:'极速', glass:'low',  bloom:false, pixels:1.4e6,  shadowHz:10 },
];
/** 像素比上限（第二道闸；budgetRatio 算出的值再被它夹一次，小窗口保持原行为） */
const RATIOS=[null, 1.5, 1.25, 1, 1];
const DOWN_FPS=32, UP_FPS=50, DOWN_N=6, UP_N=20, GRACE_SECS=4;
/** 像素比下限：再低的档画面会糊到影响观赏，宁可降特效 */
const MIN_RATIO=0.6;

/** 像素预算 → 实际像素比：budget 为 null 直接用 base；否则
 *  min(base, sqrt(budget/(w·h)))，下限 MIN_RATIO。纯函数（可单测）
 *  @param {number|null} budget @param {number} w @param {number} h @param {number} base */
export function budgetRatio(budget, w, h, base){
  if(budget==null || w<=0 || h<=0) return base;
  return Math.min(base, Math.max(MIN_RATIO, Math.sqrt(budget/(w*h))));
}

/**
 * @param {{ baseRatio:number, onLevel:(q:{level:number,label:string,ratio:number,glass:'high'|'low',bloom:boolean,pixels:number|null,shadowHz:number})=>void }} opts
 */
export function createQuality({ baseRatio, onLevel }){
  let level=0, low=0, high=0;
  const emit=()=>onLevel({ level, ...LEVELS[level], ratio:RATIOS[level]??baseRatio });
  emit();                                        // 初始应用一次（同步基准像素比）

  return {
    get level(){ return level; },
    get label(){ return LEVELS[level].label; },
    /** 每 0.5 秒一次：fps=实测帧率，t=启动以来的真实秒数（模拟时间在低帧率下会被 dt clamp 拖慢，不能当门槛钟） @param {number} fps @param {number} t */
    sample(fps, t){
      if(t<GRACE_SECS) return;
      if(fps<DOWN_FPS){ low++; high=0; }
      else if(fps>UP_FPS){ high++; low=0; }
      else { low=0; high=0; }
      if(low>=DOWN_N && level<LEVELS.length-1){ level++; low=0; high=0; emit(); }
      else if(high>=UP_N && level>0){ level--; low=0; high=0; emit(); }
    },
    /** 调试/测试用：直接设级别 @param {number} lv */
    force(lv){
      const v=Math.max(0, Math.min(LEVELS.length-1, Math.floor(lv)));
      if(v===level) return;
      level=v; low=0; high=0; emit();
    },
    /** 窗口尺寸变化后重发当前级别（像素预算依赖 w·h，resize 时需要重算实际像素比） */
    reapply(){ emit(); },
  };
}
