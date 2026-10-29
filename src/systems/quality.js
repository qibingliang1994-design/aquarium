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

/** 每一级的标签与开关。pixels = 画布像素预算（高清档也预算化：基础 M1 全屏全 Retina 下
 *  锁高清只有 ~20 FPS，"高清"定义为能稳 60 的最高画质而非无限像素）；shadowHz = 阴影贴图刷新率。
 *  7 级细阶梯：相邻档画布像素只差 15~25%——升一级不再把帧率砸穿降档线
 *  （旧 5 级在均衡→流畅间有像素断崖，实测在两档间无限拉锯）
 *  @type {QualityLevel[]} */
export const LEVELS=[
  { label:'高清', glass:'high', bloom:true,  pixels:2.0e6,  shadowHz:20 },
  { label:'均衡', glass:'high', bloom:true,  pixels:1.75e6, shadowHz:18 },
  { label:'均衡', glass:'high', bloom:true,  pixels:1.5e6,  shadowHz:16 },
  { label:'均衡', glass:'high', bloom:true,  pixels:1.3e6,  shadowHz:14 },
  { label:'流畅', glass:'low',  bloom:true,  pixels:1.15e6, shadowHz:12 },
  { label:'流畅', glass:'low',  bloom:true,  pixels:1.0e6,  shadowHz:10 },
  { label:'极速', glass:'low',  bloom:false, pixels:0.85e6, shadowHz:8 },
];
/** 像素比上限（第二道闸；budgetRatio 算出的值再被它夹一次，小窗口上平滑过渡） */
const RATIOS=[null, 1.6, 1.45, 1.3, 1.15, 1.05, 0.9];
/** 降档 42 / 升档 57 的窄带：帧率总应收敛到 45+；降 3 秒生效，升 7 秒（先确认真的稳） */
const DOWN_FPS=42, UP_FPS=57, DOWN_N=6, UP_N=14, GRACE_SECS=4;
/** 防拉锯：刚被降级离开的档位 45 秒内不回升——那一档已被证明带不动，等负载真的变化再试 */
const TABOO_SECS=45;
/** 底部探索：下半区（level≥3）若稳定 ≥45 FPS 达 30 秒且冷却已过，向上试一级——
 *  否则"够用但不到 57"的机器会永远停在最低档（bloom 都不开），白瞎画质
 *  （线上实测：46~48 FPS 卡死极速档）。阈值贴着降档线 42+3：再低说明真带不动，
 *  探索上去若跌破 42 会被降回来 + 45 秒冷却，不会拉锯 */
const EXPLORE_FPS=45, EXPLORE_N=60;
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
  let level=0, low=0, high=0, steady=0;
  let tabooLevel=-1, tabooUntil=0;               // 升降防拉锯：被降离的档位 + 冷却截止时刻
  const emit=()=>onLevel({ level, ...LEVELS[level], ratio:RATIOS[level]??baseRatio });
  emit();                                        // 初始应用一次（同步基准像素比）

  return {
    get level(){ return level; },
    get label(){ return LEVELS[level].label; },
    /** 每 0.5 秒一次：fps=实测帧率，t=启动以来的真实秒数（模拟时间在低帧率下会被 dt clamp 拖慢，不能当门槛钟） @param {number} fps @param {number} t */
    sample(fps, t){
      if(t<GRACE_SECS) return;
      if(fps<DOWN_FPS){ low++; high=0; steady=0; }
      else if(fps>UP_FPS){ high++; low=0; steady=0; }
      else {                                     // 42~57 保持带：够用但不满——底部档位攒探索资格
        low=0; high=0;
        steady = fps>=EXPLORE_FPS ? steady+1 : 0;
      }
      if(low>=DOWN_N && level<LEVELS.length-1){
        tabooLevel=level; tabooUntil=t+TABOO_SECS;   // 这一档带不动：冷却期内不再回来
        level++; low=0; high=0; steady=0; emit();
      }
      else if(high>=UP_N && level>0){
        if(level-1===tabooLevel && t<tabooUntil){ high=0; return; }   // 拉锯保护
        level--; low=0; high=0; steady=0; emit();
      }
      else if(steady>=EXPLORE_N && level>=3 && level>0
              && !(level-1===tabooLevel && t<tabooUntil)){
        level--; low=0; high=0; steady=0; emit();     // 底部探索：稳定够快就向上试一级
      }
    },
    /** 调试/测试用：直接设级别 @param {number} lv */
    force(lv){
      const v=Math.max(0, Math.min(LEVELS.length-1, Math.floor(lv)));
      tabooLevel=-1; tabooUntil=0;                // 人工指定视为清空冷却
      if(v===level) return;
      level=v; low=0; high=0; emit();
    },
    /** 窗口尺寸变化后重发当前级别（像素预算依赖 w·h，resize 时需要重算实际像素比） */
    reapply(){ emit(); },
  };
}
