import * as THREE from 'three';

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
const GRID_MIN={ x:-2.2, y:0.1, z:-0.8 }, GRID_MAX={ x:2.2, y:1.9, z:0.8 };

/** @param {number} cell 单元格边长（≥0.7 时 3×3×3 邻域即可覆盖最大 schoolRad 1.4） */
export function createFishGrid(cell=0.7){
  const nx=Math.max(1,Math.ceil((GRID_MAX.x-GRID_MIN.x)/cell));
  const ny=Math.max(1,Math.ceil((GRID_MAX.y-GRID_MIN.y)/cell));
  const nz=Math.max(1,Math.ceil((GRID_MAX.z-GRID_MIN.z)/cell));
  /** @type {number[][]} */
  const cells=Array.from({length:nx*ny*nz},()=>[]);
  /** @type {{ school:any, i:number, p:THREE.Vector3 }[]} */
  const entries=[];
  const ci=(p,axis,n)=>Math.min(n-1,Math.max(0,Math.floor((p[axis]-GRID_MIN[axis])/cell)));
  return {
    clear(){ for(const c of cells) c.length=0; entries.length=0; },
    /** @param {any} school @param {number} i @param {THREE.Vector3} p */
    insert(school, i, p){
      const k=entries.length;
      let e=entries[k];
      if(e){ e.school=school; e.i=i; e.p=p; } else entries.push(e={ school, i, p });
      cells[(ci(p,'x',nx)*ny+ci(p,'y',ny))*nz+ci(p,'z',nz)].push(k);
    },
    /** 遍历以 p 为球心、半径 r 内的条目；fn(entry, d2) 返回 false 时提前终止
     * @param {THREE.Vector3} p @param {number} r @param {(e:{school:any,i:number,p:THREE.Vector3}, d2:number)=>boolean|void} fn */
    forNeighbors(p, r, fn){
      const r2=r*r;
      const x0=ci({x:p.x-r},'x',nx), x1=ci({x:p.x+r},'x',nx);
      const y0=ci({y:p.y-r},'y',ny), y1=ci({y:p.y+r},'y',ny);
      const z0=ci({z:p.z-r},'z',nz), z1=ci({z:p.z+r},'z',nz);
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
const _bq={ school:null, i:0, p:null, v:null, rad2:0, sep:null, ali:null, coh:null, cnt:0 };
const _boidsGridCb=(e,d2)=>{
  const q=_bq;
  if(e.school!==q.school || e.i===q.i) return;
  if(d2<0.0256){                                 // 分离（0.16²）
    const d=Math.sqrt(d2);
    q.sep.add(_v.subVectors(q.p,e.p).multiplyScalar(1/Math.max(d,0.02)));
  }
  if(d2<q.rad2){ q.ali.add(e.school.vel[e.i]); q.coh.add(e.p); q.cnt++; }
};

/** 同种 Boids：分离 / 对齐 / 聚合（schoolRad 内对齐聚合；0.16 内分离）
 * @param {number} i @param {THREE.Vector3[]} pos @param {THREE.Vector3[]} vel
 * @param {{ schoolRad:number, wSep:number, wAli:number, wCoh:number }} spec
 * @param {number} social 群聚力系数（惊吓时削弱）
 * @param {THREE.Vector3} acc @param {THREE.Vector3} sep @param {THREE.Vector3} ali @param {THREE.Vector3} coh
 * @param {any} [grid] 共享网格（提供时走邻域查询）
 * @param {any} [school] 网格路径需要的自身鱼群引用
 * @returns {number} 邻居数 */
export function boidsAccumulate(i, pos, vel, spec, social, acc, sep, ali, coh, grid=null, school=null){
  sep.set(0,0,0); ali.set(0,0,0); coh.set(0,0,0);
  const p=pos[i], v=vel[i];
  let cnt=0;
  const rad2=spec.schoolRad*spec.schoolRad;
  if(grid && school){
    _bq.school=school; _bq.i=i; _bq.p=p; _bq.v=v; _bq.rad2=rad2;
    _bq.sep=sep; _bq.ali=ali; _bq.coh=coh; _bq.cnt=0;
    grid.forNeighbors(p, spec.schoolRad, _boidsGridCb);
    cnt=_bq.cnt;
  } else {
    for(let j=0;j<pos.length;j++){
      if(j===i) continue;
      const q=pos[j], d2=p.distanceToSquared(q);
      if(d2<0.0256){
        const d=Math.sqrt(d2);
        sep.add(_v.subVectors(p,q).multiplyScalar(1/Math.max(d,0.02)));
      }
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
const _xq={ school:null, p:null, bigL:0, acc:null };
const _crossGridCb=(e,d2)=>{
  if(e.school===_xq.school || e.school.spec.L<_xq.bigL) return;
  if(d2<0.04 && d2>1e-8) _xq.acc.addScaledVector(_v.subVectors(_xq.p,e.p), 3.0/Math.sqrt(d2));
};
/** @param {any} school @param {number} i @param {any[]} schools @param {THREE.Vector3} acc @param {any} [grid] */
export function crossSeparate(school, i, schools, acc, grid=null){
  const p=school.pos[i], bigL=school.spec.L*0.7;
  if(grid){
    _xq.school=school; _xq.p=p; _xq.bigL=bigL; _xq.acc=acc;
    grid.forNeighbors(p, 0.2, _crossGridCb);
    return;
  }
  for(const other of schools){
    if(other===school || other.spec.L<bigL) continue;
    for(const q of other.pos){
      const d2=p.distanceToSquared(q);
      if(d2<0.04 && d2>1e-8) acc.addScaledVector(_v.subVectors(p,q), 3.0/Math.sqrt(d2));
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
