// @ts-check
import * as THREE from 'three';

/* ================================================================
 * 物种习性（纯逻辑，Node 可测；School 按物种字段调用）
 *  cling（小精灵）：隔一阵游到左右侧玻璃上吸住，头朝上、腹面贴玻璃啃藻，边啃边慢慢挪，几秒后离开
 *    （只去侧玻璃：照片皮模型左右很薄，贴前/后玻璃时从正面只看得到一条腹线或背线；贴侧玻璃正好把整个体侧亮给镜头）
 *  breathe（迷鳃鱼：斗鱼、丽丽）：每隔半分钟到一分钟浮到水面吞一口气（水面泛起一圈涟漪），再回到原来的水层
 * ================================================================ */

const _d = new THREE.Vector3();
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => v<a ? a : v>b ? b : v;

/** mode：0 自由游 / 1 游向吸附点 / 2 吸在玻璃上；w = 吸附姿态权重（0..1，School 用它在游姿与贴玻璃姿态间插值）
 * @typedef {{ t:number, mode:number, w:number, dur:number, a:THREE.Vector3, n:THREE.Vector3, f:THREE.Vector3 }} ClingState */
/** @param {()=>number} [rng] @returns {ClingState} */
export function clingState(rng=Math.random){
  return { t:3+rng()*8, mode:0, w:0, dur:0, a:new THREE.Vector3(), n:new THREE.Vector3(0,0,-1), f:new THREE.Vector3(0,1,0) };
}

/** 吸附的几何条件：玻璃内壁半宽、鱼心到腹面的距离、吸附高度范围
 * @typedef {{ glass:{x:number,z:number}, gap:number, y0:number, y1:number }} ClingSpace */

/** 选侧玻璃上的吸附点：离得近的那一侧更常去；头朝上，略向前或向后斜
 * n = 玻璃指向缸内的法线（鱼背朝它），f = 头的方向（在玻璃平面内）
 * @param {ClingState} c @param {THREE.Vector3} p @param {ClingSpace} sp @param {()=>number} rng */
export function pickClingSpot(c, p, sp, rng){
  const g = sp.glass, y = sp.y0+(sp.y1-sp.y0)*rng(), tilt = (rng()-0.5)*0.8;
  const s = rng() < (p.x>=0 ? 0.75 : 0.25) ? 1 : -1;
  c.a.set(s*(g.x-sp.gap), y, clamp(p.z+(rng()-0.5)*0.6, -g.z+0.15, g.z-0.15));
  c.n.set(-s, 0, 0); c.f.set(0, 1, tilt).normalize();
}

/** 一帧吸附逻辑。返回 true = 本帧由吸附接管（School 用 acc 代替群游力，并放宽玻璃前的硬约束）
 * sp 为 null（自然水域没有玻璃）时永远不吸附
 * @param {ClingState} c @param {THREE.Vector3} p @param {THREE.Vector3} v @param {THREE.Vector3} acc
 * @param {number} dt @param {number} phase 个体相位（啃藻挪动的节奏） @param {ClingSpace|null} sp @param {()=>number} rng */
export function stepCling(c, p, v, acc, dt, phase, sp, rng){
  if(c.mode===0){
    if(sp && (c.t-=dt)<=0){ pickClingSpot(c, p, sp, rng); c.mode = 1; c.dur = 16; }
  } else if(c.mode===1){
    _d.subVectors(c.a, p);
    const d = _d.length();
    acc.copy(_d).multiplyScalar(d>0.3 ? 1.2/d : 4).addScaledVector(v, -1.6);   // 远处匀速靠近，近了弹簧阻尼落位
    if(d<0.035){ c.mode = 2; c.dur = 6+rng()*9; }
    else if((c.dur-=dt)<=0 || !sp){ c.mode = 0; c.t = 4+rng()*6; }
  } else {
    c.dur -= dt;
    if(sp) c.a.y = Math.min(sp.y1, c.a.y + c.f.y*Math.max(0, Math.sin(phase))*0.006*dt);   // 啃一口、挪一点
    c.a.x += c.f.x*Math.max(0, Math.sin(phase))*0.006*dt;
    c.a.z += c.f.z*Math.max(0, Math.sin(phase))*0.006*dt;
    p.lerp(c.a, Math.min(1, dt*8));
    v.multiplyScalar(1-Math.min(1, dt*6));
    acc.set(0, 0, 0);
    if(c.dur<=0 || !sp){                          // 离开：先朝缸内推一下，再交还群游
      c.mode = 0; c.t = 8+rng()*12;
      v.addScaledVector(c.n, 0.14).addScaledVector(c.f, 0.04);
    }
  }
  c.w += ((c.mode===2 ? 1 : 0)-c.w)*Math.min(1, dt*3);
  return c.mode>0;
}

/** mode：0 平常 / 1 上浮中 / 2 在水面吞气 @typedef {{ t:number, mode:number }} BreathState */
/** @param {()=>number} [rng] @returns {BreathState} */
export function breathState(rng=Math.random){ return { t:8+rng()*30, mode:0 }; }

/** 一帧换气逻辑：往 acc 里加上浮力，返回 true 表示正在换气（School 把水层上限放到 surfaceY）
 * onGulp(p) 在嘴碰到水面的那一刻调用一次（涟漪/气泡）
 * @param {BreathState} b @param {THREE.Vector3} p @param {THREE.Vector3} v @param {THREE.Vector3} acc @param {number} dt
 * @param {number} surfaceY 换气时鱼心的高度 @param {boolean} calm 可以去换气（没受惊、没在抢食） @param {()=>number} rng
 * @param {((p:THREE.Vector3)=>void)|undefined} onGulp */
export function stepBreath(b, p, v, acc, dt, surfaceY, calm, rng, onGulp){
  if(b.mode===0){
    if((b.t-=dt)<=0){ if(calm){ b.mode = 1; b.t = 10; } else b.t = 3; }
    return false;
  }
  if(b.mode===1){
    acc.y += clamp((surfaceY-p.y)*5, 0.6, 3);
    acc.x -= v.x*0.3; acc.z -= v.z*0.3;          // 放慢但保留前进：斜着游上去
    if(p.y>=surfaceY-0.03){ b.mode = 2; b.t = 0.45; onGulp?.(p); }
    else if((b.t-=dt)<=0){ b.mode = 0; b.t = 20+rng()*30; }
    return true;
  }
  acc.y += (surfaceY-p.y)*6;
  if((b.t-=dt)<=0){ b.mode = 0; b.t = 25+rng()*40; v.y -= 0.12; }
  return true;
}
