// @ts-check
/* ================================================================
 * 自动画质：阶梯降级 + 帧率恢复后逐级回升（带迟滞，避免抖动）
 * 每 0.5 秒喂一次实测 FPS（sample），内部按连续低/高帧数决策：
 * 连续 3 秒 < DOWN_FPS 降一级；连续 10 秒 > UP_FPS 升一级。
 * 纯状态机（可单测）；渲染副作用由构造时传入的 onLevel 回调执行。
 * ================================================================ */

/** @typedef {{ label:string, glass:'high'|'low', bloom:boolean }} QualityLevel */

/** 每一级的标签与开关（pixelRatio 由 RATIOS 给出，null = 基准 dpr） @type {QualityLevel[]} */
export const LEVELS=[
  { label:'高清', glass:'high', bloom:true },
  { label:'均衡', glass:'high', bloom:true },
  { label:'均衡', glass:'high', bloom:true },
  { label:'流畅', glass:'low',  bloom:true },
  { label:'极速', glass:'low',  bloom:false },
];
const RATIOS=[null, 1.5, 1.25, 1, 1];
const DOWN_FPS=32, UP_FPS=50, DOWN_N=6, UP_N=20, GRACE_SECS=4;

/** @param {number} baseRatio min(devicePixelRatio,2)：第 0 级的像素比 */

/**
 * @param {{ baseRatio:number, onLevel:(q:{level:number,label:string,ratio:number,glass:'high'|'low',bloom:boolean})=>void }} opts
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
  };
}
