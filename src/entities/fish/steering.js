// @ts-check
import * as THREE from 'three';
import { SWIM as SWIM_BOUNDS, DEFAULT_BOUNDS } from '../../scenes/tank-bounds.js';

/* ================================================================
 * 鱼群转向力的纯逻辑（从 School.update 抽出，可在 Node 里单测）
 * 所有函数原地写入传入的 acc / 输出向量，零分配（每帧热路径）
 *
 * pair 查询有两条等价路径（单测验证输出一致）：
 *  - 线性（默认/单测参照）：遍历全群，距离用平方比较（省 sqrt）
 *  - 网格（ctx.grid）：全体鱼共享的统一网格，查询半径内的邻居，
 *    鱼多（编辑器加量）时把 O(N²) 降为邻域查询
 * ================================================================ */

const _v=new THREE.Vector3();

/* ---------- 统一网格：每帧重建（rebuildFishGrid），条目对象与单元格数组全部复用 ---------- */
/** 默认缸的网格盒（±2.2 / 0.1..1.9 / ±0.8）。大场景传入 bounds.grid，否则邻域查询会把远处的鱼夹进边缘格 */
const GRID_MIN=DEFAULT_BOUNDS.grid.min, GRID_MAX=DEFAULT_BOUNDS.grid.max;

/** @param {number} [cell] 单元格边长（≥0.7 时 3×3×3 邻域即可覆盖最大 schoolRad 1.4）
 *  @param {{ min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number} }} [box] */
export function createFishGrid(cell=0.7, box){
  const min=box?.min ?? GRID_MIN, max=box?.max ?? GRID_MAX;
  const nx=Math.max(1,Math.ceil((max.x-min.x)/cell));
  const ny=Math.max(1,Math.ceil((max.y-min.y)/cell));
  const nz=Math.max(1,Math.ceil((max.z-min.z)/cell));
  /** @type {number[][]} */
  const cells=Array.from({length:nx*ny*nz},()=>[]);
  /** @type {{ school:any, i:number, p:THREE.Vector3 }[]} */
  const entries=[];
  const clampI=(/** @type {number} */ v,/** @type {number} */ n)=>Math.min(n-1,Math.max(0,v));
  const cx=(/** @type {number} */ v)=>clampI(Math.floor((v-min.x)/cell),nx);
  const cy=(/** @type {number} */ v)=>clampI(Math.floor((v-min.y)/cell),ny);
  const cz=(/** @type {number} */ v)=>clampI(Math.floor((v-min.z)/cell),nz);
  return {
    clear(){ for(const c of cells) c.length=0; entries.length=0; },
    /** @param {any} school @param {number} i @param {THREE.Vector3} p */
    insert(school, i, p){
      const k=entries.length;
      let e=entries[k];
      if(e){ e.school=school; e.i=i; e.p=p; } else entries.push(e={ school, i, p });
      cells[(cx(p.x)*ny+cy(p.y))*nz+cz(p.z)].push(k);
    },
    /** 遍历以 p 为球心、半径 r 内的条目；fn(entry, d2) 返回 false 时提前终止
     * @param {THREE.Vector3} p @param {number} r @param {(e:{school:any,i:number,p:THREE.Vector3}, d2:number)=>boolean|void} fn */
    forNeighbors(p, r, fn){
      const r2=r*r;
      const x0=cx(p.x-r), x1=cx(p.x+r);
      const y0=cy(p.y-r), y1=cy(p.y+r);
      const z0=cz(p.z-r), z1=cz(p.z+r);
      for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++){
        const list=cells[(x*ny+y)*nz+z];
        for(let k=0;k<list.length;k++){
          const e=entries[list[k]];
          const d2=p.distanceToSquared(e.p);
          if(d2<=r2 && fn(e,d2)===false) return;
        }
      }
    },
    get size(){ return entries.length; },
  };
}

/** 每帧把全部鱼群塞进共享网格 @param {{ clear():void, insert(s:any,i:number,p:THREE.Vector3):void }} grid @param {any[]} schools */
export function rebuildFishGrid(grid, schools){
  grid.clear();
  for(const s of schools) for(let i=0;i<s.spec.count;i++) grid.insert(s, i, s.pos[i]);
}

/* ---------- 同种 Boids：分离 / 对齐 / 聚合 ---------- */
/** 网格查询的共享状态（单线程 + 同步查询，无重入，避免每鱼每帧建闭包） */
/** @type {{ school:any, i:number, p:THREE.Vector3, v:THREE.Vector3, rad2:number, sepR:number, sep:THREE.Vector3, ali:THREE.Vector3, coh:THREE.Vector3, cnt:number }} */
const _bq={ school:null, i:0, p:new THREE.Vector3(), v:new THREE.Vector3(), rad2:0, sepR:0.16,
  sep:new THREE.Vector3(), ali:new THREE.Vector3(), coh:new THREE.Vector3(), cnt:0 };

/** 同种分离半径：随体长放大（锦鲤/金鱼/神仙鱼此前用小鱼的 0.16，大量互相穿模），小鱼保持 0.16 不变；不超过聚群半径
 * @param {{ L?:number, schoolRad:number }} spec */
export const sepRadius = spec => Math.min(spec.schoolRad, Math.max(0.16, (spec.L ?? 0)*0.85));
/** 分离推力：单位方向 ×(1..2)，贴得越近推得越狠（此前恒为单位向量，靠得再近也推不开）
 * @param {THREE.Vector3} out @param {THREE.Vector3} p @param {THREE.Vector3} q @param {number} d2 @param {number} R */
function sepPush(out, p, q, d2, R){
  const d=Math.sqrt(d2);
  out.add(_v.subVectors(p,q).multiplyScalar((1+Math.max(0,(R-d)/R))/Math.max(d,0.02)));
}
/** @param {{school:any,i:number,p:THREE.Vector3}} e @param {number} d2 */
const _boidsGridCb=(e,d2)=>{
  const q=_bq;
  if(e.school!==q.school || e.i===q.i) return;
  if(d2<q.sepR*q.sepR) sepPush(q.sep, q.p, e.p, d2, q.sepR);   // 分离（半径随体长）
  if(d2<q.rad2){ q.ali.add(e.school.vel[e.i]); q.coh.add(e.p); q.cnt++; }
};

/** 同种 Boids：分离 / 对齐 / 聚合（schoolRad 内对齐聚合；sepRadius 内分离）
 * @param {number} i @param {THREE.Vector3[]} pos @param {THREE.Vector3[]} vel
 * @param {{ L?:number, schoolRad:number, wSep:number, wAli:number, wCoh:number }} spec
 * @param {number} social 群聚力系数（惊吓时削弱）
 * @param {THREE.Vector3} acc @param {THREE.Vector3} sep @param {THREE.Vector3} ali @param {THREE.Vector3} coh
 * @param {any} [grid] 共享网格（提供时走邻域查询）
 * @param {any} [school] 网格路径需要的自身鱼群引用
 * @returns {number} 邻居数 */
export function boidsAccumulate(i, pos, vel, spec, social, acc, sep, ali, coh, grid=null, school=null){
  sep.set(0,0,0); ali.set(0,0,0); coh.set(0,0,0);
  const p=pos[i], v=vel[i];
  let cnt=0;
  const rad2=spec.schoolRad*spec.schoolRad, sepR=sepRadius(spec), sepR2=sepR*sepR;
  if(grid && school){
    _bq.school=school; _bq.i=i; _bq.p=p; _bq.v=v; _bq.rad2=rad2; _bq.sepR=sepR;
    _bq.sep=sep; _bq.ali=ali; _bq.coh=coh; _bq.cnt=0;
    grid.forNeighbors(p, spec.schoolRad, _boidsGridCb);
    cnt=_bq.cnt;
  } else {
    for(let j=0;j<pos.length;j++){
      if(j===i) continue;
      const q=pos[j], d2=p.distanceToSquared(q);
      if(d2<sepR2) sepPush(sep, p, q, d2, sepR);
      if(d2<rad2){ ali.add(vel[j]); coh.add(q); cnt++; }
    }
  }
  if(!cnt) return 0;
  acc.addScaledVector(sep, spec.wSep);
  ali.divideScalar(cnt); acc.addScaledVector(_v.subVectors(ali,v), spec.wAli*social);
  coh.divideScalar(cnt); acc.addScaledVector(_v.subVectors(coh,p), spec.wCoh*social);
  return cnt;
}

/* ---------- 异种分离：只推小鱼（体型悬殊时小鱼推不动大鱼） ---------- */
/** 异种分离半径：两条鱼半身长之和留点余量（此前固定 0.2，锦鲤半个身长就有 0.21） @param {number} La @param {number} Lb */
export const crossRadius = (La, Lb) => Math.max(0.2, 0.45*(La+Lb));
const CROSS_QUERY=0.5;            // ≥ crossRadius 的最大值（锦鲤长满 0.525 × 2 × 0.45 ≈ 0.47）
/** @type {{ school:any, p:THREE.Vector3, L:number, bigL:number, acc:THREE.Vector3 }} */
const _xq={ school:null, p:new THREE.Vector3(), L:0, bigL:0, acc:new THREE.Vector3() };
/** @param {{school:any,i:number,p:THREE.Vector3}} e @param {number} d2 */
const _crossGridCb=(e,d2)=>{
  if(e.school===_xq.school || e.school.spec.L<_xq.bigL) return;
  const r=crossRadius(_xq.L, e.school.spec.L);
  if(d2<r*r && d2>1e-8) _xq.acc.addScaledVector(_v.subVectors(_xq.p,e.p), 3.0/Math.sqrt(d2));
};
/** @param {any} school @param {number} i @param {any[]} schools @param {THREE.Vector3} acc @param {any} [grid] */
export function crossSeparate(school, i, schools, acc, grid=null){
  const p=school.pos[i], L=school.spec.L, bigL=L*0.7;
  if(grid){
    _xq.school=school; _xq.p=p; _xq.L=L; _xq.bigL=bigL; _xq.acc=acc;
    grid.forNeighbors(p, CROSS_QUERY, _crossGridCb);
    return;
  }
  for(const other of schools){
    if(other===school || other.spec.L<bigL) continue;
    const r=crossRadius(L, other.spec.L), r2=r*r;
    for(let j=0;j<other.spec.count;j++){
      const d2=p.distanceToSquared(other.pos[j]);
      if(d2<r2 && d2>1e-8) acc.addScaledVector(_v.subVectors(p,other.pos[j]), 3.0/Math.sqrt(d2));
    }
  }
}

/** 漫游力：低频缓变，直线巡航为主 @param {THREE.Vector3} acc @param {number} time @param {number} i @param {number} wander */
export function wanderAcc(acc, time, i, wander){
  const wT=time*0.3+i*2.1;
  acc.x+=Math.sin(wT*1.1+i*2.7)*wander*0.4;
  acc.y+=Math.sin(wT*0.5+i*1.7)*wander*0.1;
  acc.z+=Math.cos(wT*0.9+i*3.3)*wander*0.4;
}

/** 默认缸的活动范围（鱼体中心）。大场景把 bounds.swim 传给 swimLimits 的第二个参数 */
export const SWIM=SWIM_BOUNDS;
/** 某体长的鱼的水平软边界半宽：大鱼离玻璃更远（转身时头尾不撞玻璃）
 * @param {number} L @param {{x:number,z:number}} [swim] */
export function swimLimits(L, swim=SWIM){ return { x:swim.x-0.5*L, z:swim.z-0.3*L }; }

/** 缸体软边界（swimLimits 内 0.14 起弹簧；y 为 band 水层带，floor 可抬高下界——底栖种按沙面算）
 * @param {THREE.Vector3} p @param {[number,number]} band @param {THREE.Vector3} acc
 * @param {{x:number,z:number}} [lim] 水平半宽（默认按 0 体长） @param {number} [floor] 下界（默认 band[0]） */
export function boundaryAcc(p, band, acc, lim=SWIM, floor=band[0]){
  const m=0.14, k=7, X=lim.x-m, Z=lim.z-m;
  if(p.x<-X) acc.x+=k*(-X-p.x);
  if(p.x> X) acc.x-=k*(p.x-X);
  if(p.z> Z) acc.z-=k*(p.z-Z);
  if(p.z<-Z) acc.z+=k*(-Z-p.z);
  if(p.y>band[1]-0.08) acc.y-=k*(p.y-(band[1]-0.08));
  if(p.y<floor+0.08) acc.y+=k*((floor+0.08)-p.y);
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
 * minY：沉到这个高度以下的饲料不追（中层鱼游不下去，留给底栖鱼；此前沉底前就被抢光，鼠鱼一颗都吃不到）
 * bottomOk：是否追沉底片（feeder 的 bottom 饲料只给底栖鱼）
 * @param {THREE.Vector3} p @param {{p:THREE.Vector3, eaten?:number, bottom?:boolean}[]} pellets @param {number} senseR
 * @param {number} [minY] @param {boolean} [bottomOk] */
export function huntTarget(p, pellets, senseR, minY=-Infinity, bottomOk=true){
  let best=null, bd=senseR;
  for(const pel of pellets){
    if(pel.eaten || pel.p.y<minY || (pel.bottom && !bottomOk)) continue;
    const d=p.distanceTo(pel.p);
    if(d<bd){ bd=d; best=pel; }
  }
  return best;
}

/** 逗鱼光点：感知范围内的鱼被吸向光点，并叠加切向分量绕着光点盘旋（越近吸力越强）。
 * 返回到光点的距离（超出范围 / 强度为 0 返回 -1，不加任何力）
 * @param {THREE.Vector3} p @param {{p:THREE.Vector3, k:number, range:number}} lure @param {THREE.Vector3} acc */
export function lureAcc(p, lure, acc){
  _v.subVectors(lure.p, p);
  const d=_v.length();
  if(d>lure.range || d<1e-4) return -1;
  _v.divideScalar(d);
  const w=lure.k*(1-0.55*d/lure.range);        // 距离权重：贴着光点最疯
  acc.addScaledVector(_v, 2.8*w);              // 吸向光点
  acc.x+=-_v.z*1.05*w;                         // 切向：绕光点打转（盘旋而不是挤成一坨）
  acc.z+= _v.x*1.05*w;
  acc.y+=Math.sin(d*9)*0.15*w;                 // 轻微起伏，像在啄光
  return d;
}
