// @ts-check
/* ================================================================
 * 照片皮鱼的步态（纯逻辑，Node 可测）：由鱼真实的运动反推尾摆、身体弯曲和各鳍的姿态
 * 档位取自 aquarium-editor 的 FishMotion（MIT License，Copyright (c) 2026 SkentSun）：
 *   悬停：胸鳍慢划、背鳍腹鳍竖起；慢游：胸鳍划水为主（pectSwim 越大越靠胸鳍）；巡游：尾鳍推进、鳍全收；
 *   刹车：胸鳍腹鳍大张；转向：身体弯成弧、鳍半张。这里不按计划表切档，而是按速度/加速度/转向角速度连续混合。
 * 冲刺-滑行（burst 物种，小型灯鱼）：巡游中不时停摆滑行半秒左右，再快摆一两下追上，
 *   thrust 把节奏反馈给 School 的速度（滑行减速、摆尾加速），鱼的位移与尾摆对得上。
 * 速度单位是体长/秒，所以同一套参数对 2 cm 的火焰灯和 11 cm 的神仙鱼都成立。
 * ================================================================ */

/** @typedef {{ length:number, freq:number }} GaitSwim */
/** @typedef {{ pectSwim?:number, burst?:number, rng?:()=>number }} GaitOpts */

const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => v<a ? a : v>b ? b : v;
const sstep = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => { const t = clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };

/** 摆尾频率的拐点与压缩尺度（Hz） */
export const HZ_KNEE = 1.2, HZ_SOFT = 0.7;
/** 屏幕上的摆尾频率。小型灯鱼的真实摆尾是 5–9 Hz，60 帧下每拍不到十帧，看上去是一团抖动，
 *  鱼又被放大在缸里看，更显得急躁：拐点以上按对数压缩——巡游的灯鱼约 2.6 Hz、受惊约 3 Hz，
 *  神仙鱼、琉金这类 1–2 Hz 的大鱼基本不变。仍单调递增，快慢的层次保留
 * @param {number} raw 物种频率 × 步态倍率 */
export function tailHz(raw){
  return raw<=HZ_KNEE ? raw : HZ_KNEE + HZ_SOFT*Math.log(1 + (raw-HZ_KNEE)/HZ_SOFT);
}

export class PhotoGait {
  /** @param {number} capacity @param {GaitSwim} swim @param {GaitOpts} [opts] */
  constructor(capacity, swim, { pectSwim=0.5, burst=0, rng=Math.random }={}){
    this.swim = swim; this.ps = clamp(pectSwim, 0, 1); this.burst = burst; this.rng = rng;
    const f = ()=>new Float32Array(capacity);
    this.tail = f(); this.amp = f(); this.freq = f(); this.bend = f(); this.open = f();
    this.flap = f(); this.flapAmp = f(); this.flapHz = f(); this.dorsal = f(); this.pelvic = f();
    this.spd = f(); this.acc = f();                  // 平滑后的速度（体长/秒）与加速度
    this.glide = f(); this.kick = f(); this.next = f();
    /** 冲刺-滑行对速度的反馈（单位：最大速度/秒），School 每帧沿朝向加到速度上 */
    this.thrust = f();
    for(let i=0;i<capacity;i++) this.reset(i);
  }
  /** 新鱼入缸：相位错开，节奏从头开始 @param {number} i */
  reset(i){
    const r = this.rng;
    this.tail[i] = r(); this.flap[i] = r(); this.amp[i] = 0.3; this.freq[i] = 1; this.bend[i] = 0;
    this.open[i] = 0.1; this.flapAmp[i] = 0; this.flapHz[i] = 2; this.dorsal[i] = 0.3; this.pelvic[i] = 0.2;
    this.spd[i] = 0.5; this.acc[i] = 0; this.glide[i] = 0; this.kick[i] = 0; this.thrust[i] = 0;
    this.next[i] = 0.5 + r()*3;
  }
  /**
   * @param {number} i @param {number} dt
   * @param {number} sBL 速度（体长/秒） @param {number} yawRate 转向角速度（rad/s，俯视逆时针为正 = 左转）
   * @param {number} fear 惊吓 0..1 @param {number} bite 咬食包络 0..1 @param {number} rest 贴底/吸附 0..1
   * @param {number} [ts] 节奏倍率（夜里放慢、兴奋加快）
   */
  step(i, dt, sBL, yawRate, fear, bite, rest, ts=1){
    const ps = this.ps, sw = this.swim, r = this.rng;
    const k = (/** @type {number} */ rate)=>Math.min(1, dt*rate);
    const s0 = this.spd[i];
    this.spd[i] += (sBL-s0)*k(6);
    const a = dt>1e-5 ? (this.spd[i]-s0)/dt : 0;
    this.acc[i] += (a-this.acc[i])*k(4);
    const acc = this.acc[i];
    const cruise = sstep(0.25, 1.3, sBL), hold = 1-sstep(0.1, 0.6, sBL);
    const turn = Math.min(1, Math.abs(yawRate)/2.5);
    const brake = clamp(-acc*0.5, 0, 1)*(1-fear);
    const push = clamp(acc*0.4, 0, 1);
    // 冲刺-滑行：只在平稳巡游时插入（惊吓、转急弯、贴底时不滑）
    let thrust = 0;
    if(this.burst>0 && rest<0.5 && fear<0.2){
      if(this.kick[i]>0){
        this.kick[i] -= dt; thrust = 1;
        if(this.kick[i]<=0) this.next[i] = (1.2+r()*2.8)/this.burst;
      } else if(this.glide[i]>0){
        this.glide[i] -= dt; thrust = -0.45;
        if(this.glide[i]<=0) this.kick[i] = (1.5+r())/tailHz(sw.freq*1.9);   // 一两下半快摆（按屏幕上的频率算拍数）
      } else {
        this.next[i] -= dt;
        if(this.next[i]<=0){
          if(sBL>0.4 && turn<0.5) this.glide[i] = 0.35+r()*0.6;
          else this.next[i] = 0.5;
        }
      }
    } else { this.glide[i] = 0; this.kick[i] = 0; }
    this.thrust[i] = thrust;
    const gliding = this.glide[i]>0, kicking = this.kick[i]>0;
    // 尾：慢速时不靠胸鳍的鱼用小幅尾摆维持；加速/转弯/惊吓/咬食加大加快
    let ampT, freqT;
    if(rest>0.5){ ampT = 0.06; freqT = 0.3; }
    else {
      ampT = (0.1+(1-ps)*0.5)*(1-cruise) + 0.85*cruise + 0.35*push + 0.3*turn + 0.5*fear + 0.5*bite;
      freqT = 0.5+0.75*cruise + 0.35*push + 0.3*turn + 0.9*fear + 0.6*bite;
      if(gliding){ ampT = 0.04; freqT = 0.3; }
      if(kicking){ ampT = Math.max(ampT, 1.25); freqT = Math.max(freqT, 1.9); }
    }
    this.amp[i] += (Math.min(ampT, 1.6)-this.amp[i])*k(gliding ? 2.5 : kicking ? 10 : 5);
    this.freq[i] += (Math.min(freqT, 2.6)-this.freq[i])*k(4);
    // 鳍：悬停胸鳍慢划、背腹鳍竖起；巡游全收；刹车胸腹鳍大张；转弯半张；受惊全部收紧
    const still = rest>0.5;
    const openT = still ? 0.15 : (0.22*hold+0.06*(1-hold))*(1-cruise) + 0.03*cruise + 0.85*brake + 0.3*turn;
    const flapT = still ? 0.08 : hold*0.3*Math.max(ps, 0.4) + (1-hold)*(1-cruise)*0.6*ps + 0.12*brake + 0.15*turn;
    const hzT = 1.6 + 0.6*(1-hold) + 0.8*fear;
    const dorsalT = still ? 0.7 : clamp(Math.max(hold*0.75, (1-cruise)*0.2, brake, turn*0.9)-fear, 0, 1);
    const pelvicT = still ? 1 : clamp(Math.max(hold*0.8, (1-cruise)*0.15, brake, turn*0.7)-fear*0.8, 0, 1);
    this.open[i] += (Math.min(openT, 1)-this.open[i])*k(5);
    this.flapAmp[i] += (flapT-this.flapAmp[i])*k(3);
    this.flapHz[i] += (hzT-this.flapHz[i])*k(3);
    this.dorsal[i] += (dorsalT-this.dorsal[i])*k(dorsalT>this.dorsal[i] ? 7 : 2);   // 竖起快、收拢慢
    this.pelvic[i] += (pelvicT-this.pelvic[i])*k(4);
    // 身体弯曲（模型米制 1/m）：左转（yawRate>0）向左弯，模型 +z 是鱼的右侧 → 取负
    const bendT = clamp(-yawRate*0.32, -0.9, 0.9)/sw.length;
    this.bend[i] += (bendT-this.bend[i])*k(5);
    // 相位只保留小数部分：着色器里 sin(2π(s/λ - cyc)) 以 1 为周期，GPU 单精度下大相位会抖
    this.tail[i] = (this.tail[i] + tailHz(sw.freq*this.freq[i])*dt*ts) % 1;
    this.flap[i] = (this.flap[i] + this.flapHz[i]*dt*ts) % 1;
  }
  /** 第 i 条鱼此刻屏幕上的摆尾频率（Hz） @param {number} i */
  hzOf(i){ return tailHz(this.swim.freq*this.freq[i]); }
  /** 写进实例属性（PhotoFish 的 aSwim / aFin） @param {{ array:ArrayLike<number> }} swimAttr @param {{ array:ArrayLike<number> }} finAttr @param {number} n */
  write(swimAttr, finAttr, n){
    const s = /** @type {Float32Array} */ (swimAttr.array), f = /** @type {Float32Array} */ (finAttr.array);
    for(let i=0;i<n;i++){
      const o = i*4;
      s[o] = this.tail[i]; s[o+1] = this.amp[i]; s[o+2] = this.bend[i]; s[o+3] = this.open[i];
      f[o] = this.flap[i]; f[o+1] = this.flapAmp[i]; f[o+2] = this.dorsal[i]; f[o+3] = this.pelvic[i];
    }
  }
}
