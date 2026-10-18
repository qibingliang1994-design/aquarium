import * as THREE from 'three';

/* ================================================================
 * 鱼群转向力的纯逻辑（从 School.update 抽出，可在 Node 里单测）
 * 所有函数原地写入传入的 acc / 输出向量，零分配（每帧热路径）
 * ================================================================ */

const _v=new THREE.Vector3();

/** 同种 Boids：分离 / 对齐 / 聚合（schoolRad 内对齐聚合；0.16 内分离）
 * @param {number} i @param {THREE.Vector3[]} pos @param {THREE.Vector3[]} vel
 * @param {{ schoolRad:number, wSep:number, wAli:number, wCoh:number }} spec
 * @param {number} social 群聚力系数（惊吓时削弱）
 * @param {THREE.Vector3} acc @param {THREE.Vector3} sep @param {THREE.Vector3} ali @param {THREE.Vector3} coh
 * @returns {number} 邻居数 */
export function boidsAccumulate(i, pos, vel, spec, social, acc, sep, ali, coh){
  sep.set(0,0,0); ali.set(0,0,0); coh.set(0,0,0);
  const p=pos[i], v=vel[i];
  let cnt=0;
  for(let j=0;j<pos.length;j++){
    if(j===i) continue;
    const q=pos[j], d=p.distanceTo(q);
    if(d<0.16) sep.add(_v.subVectors(p,q).multiplyScalar(1/Math.max(d,0.02)));
    if(d<spec.schoolRad){ ali.add(vel[j]); coh.add(q); cnt++; }
  }
  if(!cnt) return 0;
  acc.addScaledVector(sep, spec.wSep);
  ali.divideScalar(cnt); acc.addScaledVector(_v.subVectors(ali,v), spec.wAli*social);
  coh.divideScalar(cnt); acc.addScaledVector(_v.subVectors(coh,p), spec.wCoh*social);
  return cnt;
}

/** 漫游力：低频缓变，直线巡航为主 @param {THREE.Vector3} acc @param {number} time @param {number} i @param {number} wander */
export function wanderAcc(acc, time, i, wander){
  const wT=time*0.3+i*2.1;
  acc.x+=Math.sin(wT*1.1+i*2.7)*wander*0.4;
  acc.y+=Math.sin(wT*0.5+i*1.7)*wander*0.1;
  acc.z+=Math.cos(wT*0.9+i*3.3)*wander*0.4;
}

/** 缸体软边界（x ±1.5 / z ±0.48 / band 水层带，边界内 0.14 起弹簧）
 * @param {THREE.Vector3} p @param {[number,number]} band @param {THREE.Vector3} acc */
export function boundaryAcc(p, band, acc){
  const m=0.14, k=7;
  if(p.x<-1.5+m) acc.x+=k*((-1.5+m)-p.x);
  if(p.x> 1.5-m) acc.x-=k*(p.x-(1.5-m));
  if(p.z> 0.48-m) acc.z-=k*(p.z-(0.48-m));
  if(p.z<-0.48+m) acc.z+=k*((-0.48+m)-p.z);
  if(p.y>band[1]-0.08) acc.y-=k*(p.y-(band[1]-0.08));
  if(p.y<band[0]+0.08) acc.y+=k*((band[0]+0.08)-p.y);
}

/** 障碍推离（岩石/沉木等的包围球）
 * @param {THREE.Vector3} p @param {{c:THREE.Vector3, r:number}[]} obstacles @param {THREE.Vector3} acc */
export function obstacleAcc(p, obstacles, acc){
  for(const o of obstacles){
    const d=p.distanceTo(o.c), rr=o.r+0.13;
    if(d<rr) acc.add(_v.subVectors(p,o.c).normalize().multiplyScalar((rr-d)*16));
  }
}

/** 觅食目标：感知半径内最近的未吃饲料（无则 null）
 * @param {THREE.Vector3} p @param {{p:THREE.Vector3, eaten?:number}[]} pellets @param {number} senseR */
export function huntTarget(p, pellets, senseR){
  let best=null, bd=senseR;
  for(const pel of pellets){
    if(pel.eaten) continue;
    const d=p.distanceTo(pel.p);
    if(d<bd){ bd=d; best=pel; }
  }
  return best;
}
