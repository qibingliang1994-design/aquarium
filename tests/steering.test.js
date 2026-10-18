import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { boidsAccumulate, crossSeparate, wanderAcc, boundaryAcc, obstacleAcc, huntTarget,
  createFishGrid, rebuildFishGrid } from '../src/entities/fish/steering.js';

const V = (x=0, y=0, z=0) => new THREE.Vector3(x, y, z);
// 最小 spec（字段与 SPECIES 一致，只给本函数用到的）
const SPEC = { schoolRad: 0.6, wSep: 2.4, wAli: 1.15, wCoh: 0.85 };

describe('boidsAccumulate', () => {
  it('靠太近 → 分离力把两条鱼推开（方向相反）', () => {
    const pos=[V(-0.05,1,0), V(0.05,1,0)], vel=[V(0.1,0,0), V(0.1,0,0)];
    const acc0=V(), acc1=V(), s=V(), a=V(), c=V();
    boidsAccumulate(0, pos, vel, SPEC, 1, acc0, s, a, c);
    boidsAccumulate(1, pos, vel, SPEC, 1, acc1, s, a, c);
    expect(acc0.x).toBeLessThan(0);             // 0 号在左侧 → 被推向 -x（远离 1 号）
    expect(acc1.x).toBeGreaterThan(0);
    expect(acc0.x).toBeCloseTo(-acc1.x, 5);
  });

  it('速度不同 → 对齐力朝平均速度方向', () => {
    const pos=[V(0,1,0), V(0.2,1,0)], vel=[V(1,0,0), V(-1,0,0)];
    const acc=V(), s=V(), a=V(), c=V();
    boidsAccumulate(0, pos, vel, SPEC, 1, acc, s, a, c);
    // 平均速度为 0：0 号（+1）应被减速 → 负 x
    expect(acc.x).toBeLessThan(0);
  });

  it('social 削弱对齐/聚合但不削弱分离', () => {
    const pos=[V(0,1,0), V(0.2,1,0)], vel=[V(1,0,0), V(-1,0,0)];
    const acc1=V(), acc0=V(), s=V(), a=V(), c=V();
    boidsAccumulate(0, pos, vel, SPEC, 1, acc1, s, a, c);
    boidsAccumulate(0, pos, vel, SPEC, 0, acc0, s, a, c);
    expect(Math.abs(acc0.x)).toBeLessThan(Math.abs(acc1.x));   // social=0：对齐/聚合消失，只剩分离
  });

  it('邻居在 schoolRad 之外（且不贴近）→ 无任何力', () => {
    const pos=[V(0,1,0), V(2,1,0)], vel=[V(0.1,0,0), V(0.2,0,0)];
    const acc=V(), s=V(), a=V(), c=V();
    const cnt=boidsAccumulate(0, pos, vel, SPEC, 1, acc, s, a, c);
    expect(cnt).toBe(0);
    expect(acc.length()).toBe(0);
  });
});

describe('wanderAcc', () => {
  it('同参数结果确定，且确实加了力', () => {
    const a1=V(), a2=V();
    wanderAcc(a1, 3.2, 4, 0.28);
    wanderAcc(a2, 3.2, 4, 0.28);
    expect(a1.equals(a2)).toBe(true);
    expect(a1.length()).toBeGreaterThan(0);
  });
});

describe('boundaryAcc', () => {
  it('越界 → 弹簧把鱼推回（左右 / 上下）', () => {
    const acc=V();
    boundaryAcc(V(-1.6, 1, 0), [0.6, 1.6], acc);
    expect(acc.x).toBeGreaterThan(0);           // 左界外 → 向右推
    const acc2=V();
    boundaryAcc(V(0, 1.7, 0), [0.6, 1.6], acc2);
    expect(acc2.y).toBeLessThan(0);             // 水层带上界之上 → 向下压
    const acc3=V();
    boundaryAcc(V(0, 1.0, 0), [0.6, 1.6], acc3);
    expect(acc3.length()).toBe(0);              // 界内无弹力
  });
});

describe('obstacleAcc', () => {
  it('进入障碍包围球 → 沿连线向外推', () => {
    const acc=V();
    obstacleAcc(V(0.1, 0.9, 0), [{ c:V(0,0.9,0), r:0.3 }], acc);
    expect(acc.x).toBeGreaterThan(0);
    const acc2=V();
    obstacleAcc(V(1.5, 0.9, 0), [{ c:V(0,0.9,0), r:0.3 }], acc2);
    expect(acc2.length()).toBe(0);              // 球外无推力
  });
});

describe('huntTarget', () => {
  const pellets=[{ p:V(0.5,1,0), eaten:1 }, { p:V(0.3,1,0) }, { p:V(1.2,1,0) }];
  it('选感知半径内最近的未吃饲料', () => {
    expect(huntTarget(V(0,1,0), pellets, 2.4)).toBe(pellets[1]);
  });
  it('已吃的跳过；半径外为空', () => {
    expect(huntTarget(V(0,1,0), [{ p:V(0.1,1,0), eaten:1 }], 2)).toBeNull();
    expect(huntTarget(V(0,1,0), pellets, 0.2)).toBeNull();
  });
});

/* ---------- 统一网格：与暴力遍历完全等价 ---------- */
// 确定性随机摆放的假鱼群（结构与 School 对齐：spec.count / pos[] / vel[]）
function fakeSchools(){
  const mk=(id, L, n, seed)=>{
    let s=seed;
    const rnd=()=>{ s=(s*1103515245+12345)>>>0; return (s>>>8)/16777216; };
    const pos=[], vel=[];
    for(let i=0;i<n;i++){
      pos.push(V(-2+rnd()*4, 0.3+rnd()*1.3, -0.6+rnd()*1.2));
      vel.push(V(rnd()-0.5, (rnd()-0.5)*0.1, rnd()-0.5));
    }
    return { spec:{ id, L, count:n, schoolRad:0.6, wSep:2.4, wAli:1.15, wCoh:0.85 }, pos, vel };
  };
  return [mk('tetra',0.17,20,7), mk('gold',0.34,5,99), mk('koi',0.42,3,1234)];
}

describe('createFishGrid / rebuildFishGrid', () => {
  it('查询结果与暴力距离筛选一致', () => {
    const schools=fakeSchools();
    const grid=createFishGrid(0.7);
    rebuildFishGrid(grid, schools);
    expect(grid.size).toBe(28);
    const p=V(0.4, 1.0, 0.1);
    for(const r of [0.16, 0.5, 1.4]){
      const got=[];
      grid.forNeighbors(p, r, e=>{ got.push(e); });
      const brute=[];
      for(const s of schools) for(let i=0;i<s.spec.count;i++){
        if(p.distanceToSquared(s.pos[i])<=r*r) brute.push({ s, i });
      }
      expect(got.length).toBe(brute.length);
      for(const e of got) expect(brute.some(b=>b.s===e.school && b.i===e.i)).toBe(true);
    }
  });

  it('远在网格外的点查不到，超大半径覆盖全场', () => {
    const schools=fakeSchools();
    const grid=createFishGrid(0.7);
    rebuildFishGrid(grid, schools);
    let count=0;
    grid.forNeighbors(V(-10, 0.2, 0), 0.3, ()=>{ count++; });
    expect(count).toBe(0);
    let all=0;
    grid.forNeighbors(V(0, 1, 0), 10, ()=>{ all++; });
    expect(all).toBe(grid.size);
  });
});

describe('网格路径与线性路径等价', () => {
  it('boidsAccumulate：同一条鱼两种路径输出一致', () => {
    const schools=fakeSchools();
    const grid=createFishGrid(0.7);
    rebuildFishGrid(grid, schools);
    for(const s of schools){
      for(let i=0;i<s.spec.count;i+=3){
        const a1=V(), a2=V(), s1=V(), s2=V(), al1=V(), al2=V(), c1=V(), c2=V();
        const n1=boidsAccumulate(i, s.pos, s.vel, s.spec, 0.8, a1, s1, al1, c1);
        const n2=boidsAccumulate(i, s.pos, s.vel, s.spec, 0.8, a2, s2, al2, c2, grid, s);
        expect(n2).toBe(n1);
        expect(a2.x).toBeCloseTo(a1.x, 9);
        expect(a2.y).toBeCloseTo(a1.y, 9);
        expect(a2.z).toBeCloseTo(a1.z, 9);
      }
    }
  });
});

describe('crossSeparate', () => {
  it('确定性场景：小鱼被大鱼推开且两路径一致；大鱼不被小鱼推动', () => {
    const big={ spec:{ id:'koi', L:0.42, count:2, schoolRad:1.4, wSep:1.6, wAli:0.15, wCoh:0.5 },
      pos:[V(0.1,1,0), V(0,1,0.3)], vel:[V(0.1,0,0), V(0,0,0.1)] };
    const small={ spec:{ id:'tetra', L:0.17, count:1, schoolRad:0.6, wSep:2.4, wAli:1.15, wCoh:0.85 },
      pos:[V(0.15,1,0.05)], vel:[V(0.2,0,0)] };
    const schools=[big, small];
    const grid=createFishGrid(0.7);
    rebuildFishGrid(grid, schools);
    const a1=V(), a2=V();
    crossSeparate(small, 0, schools, a1);
    crossSeparate(small, 0, schools, a2, grid);
    expect(a1.length()).toBeGreaterThan(0);
    expect(a2.distanceTo(a1)).toBeLessThan(1e-9);
    const b1=V(), b2=V();                        // 0.17 < 0.42*0.7：大鱼直接跳过小鱼
    crossSeparate(big, 0, schools, b1);
    crossSeparate(big, 0, schools, b2, grid);
    expect(b1.length()).toBe(0);
    expect(b2.length()).toBe(0);
  });
});
