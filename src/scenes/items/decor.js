// @ts-check
import * as THREE from 'three';
import { rrange, vnoise } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, castAll, injectSurfaceDetail, UP } from './common.js';
import { makeRockGeo, barkTube } from './natural-geo.js';

/* ================================================================
 * 硬景：圆石 / 立石（青龙石）/ 活石 / 沉木 / 苔球 / 气石
 * 每个构建函数返回 { object, obstacles }，坐标都是物件局部坐标（原点 = 沙面）
 * ================================================================ */

const rockMat = () => shared('mat:rock', ()=>{
  const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9, metalness:0.02});
  injectCaustics(m, 0.55, 'rock');
  injectSurfaceDetail(m, { freq:14, k:0.45, ao:0.35, key:'rockdet' });
  return m;
});

/** 圆石（河石 / 龙骨石）：基准半径 0.2，物件缩放决定大小 */
export function buildRock(/** @type {any} */ rng, /** @type {number} */ seed){
  const r=0.2, g=makeRockGeo(r, seed, 'river');
  g.scale(rrange(rng,0.95,1.25), rrange(rng,0.75,0.95), rrange(rng,0.9,1.15));
  g.translate(0, r*0.24, 0);
  const mesh=castAll(new THREE.Mesh(g, rockMat()));
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,r*0.45,0), r:r*0.95 }] };
}

/** 立石（青龙石）：竖长、带竖向沟槽与白色石脉，石庭/山景的主石 */
export function buildRockTall(/** @type {any} */ rng, /** @type {number} */ seed){
  const r=0.14, g=makeRockGeo(r, seed+31, 'seiryu');
  g.scale(rrange(rng,0.7,0.9), rrange(rng,2.2,2.7), rrange(rng,0.65,0.85));
  g.rotateZ(rrange(rng,-0.14,0.14));
  g.translate(0, r*0.6, 0);
  const mesh=castAll(new THREE.Mesh(g, rockMat()));
  return { object:mesh, obstacles:[
    { c:new THREE.Vector3(0,0.12,0), r:0.13 }, { c:new THREE.Vector3(0,0.32,0), r:0.11 },
  ] };
}

/** 活石：海水缸礁岩，浅色多孔、带紫色珊瑚藻斑，扁平宽大便于叠礁 */
export function buildLiveRock(/** @type {any} */ rng, /** @type {number} */ seed){
  const r=0.22, g=makeRockGeo(r, seed+77, 'live');
  g.scale(rrange(rng,1.1,1.4), rrange(rng,0.6,0.8), rrange(rng,0.9,1.15));
  g.translate(0, r*0.2, 0);
  const mesh=castAll(new THREE.Mesh(g, rockMat()));
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,r*0.4,0), r:r*1.1 }] };
}

/** 沉木：渐细的主干拱 + 主侧枝 + 随机细枝 + 根部扎沙；原经典布局中位于 (0,-0.57)，坐标已减去该处沙面 */
export function buildWood(/** @type {any} */ rng, /** @type {number} */ seed){
  const woodMat=shared('mat:wood', ()=>{
    const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.82, metalness:0.02});
    injectCaustics(m, 0.4, 'wood');
    injectSurfaceDetail(m, { freq:10, k:0.3, ao:0.25, stretch:[1,0.25,1], key:'wooddet' });   // 拉长的噪声 ≈ 顺纹理的木纤维
    return m;
  });
  const mossMat=shared('mat:woodMoss', ()=>new THREE.MeshStandardMaterial({color:0x4a6b2f, roughness:1, flatShading:true}));
  const V=(/** @type {number} */ x,/** @type {number} */ y,/** @type {number} */ z)=>new THREE.Vector3(x, y-0.3, z+0.57);
  const curve=new THREE.CatmullRomCurve3([V(-0.74,0.27,-0.54), V(-0.62,0.52,-0.57), V(-0.38,0.82,-0.6), V(0,1.0,-0.58),
    V(0.42,0.78,-0.6), V(0.66,0.42,-0.55), V(0.76,0.26,-0.53)]);
  const group=new THREE.Group();
  const add=(/** @type {any} */ g)=>{ group.add(new THREE.Mesh(g, woodMat)); };
  // 主干：左端是粗根（喇叭口扎进沙里），向右逐渐变细
  add(barkTube(curve, t=>0.034+0.032*(1-t)+0.05*Math.max(0,1-t/0.07)**2+0.02*Math.max(0,(t-0.94)/0.06)**2, { segs:64, radial:14, seed }));
  // 主侧枝 + 2~3 根随机细枝：从主干某点长出，向上外伸，末端收尖
  const twig=(/** @type {any} */ t0, /** @type {any} */ dir, /** @type {number} */ len, /** @type {number} */ r0, /** @type {number} */ s)=>{
    const a=curve.getPointAt(t0), pts=[a.clone()];
    const d=dir.clone().normalize();
    for(let i=1;i<=3;i++){
      d.x+=rrange(rng,-0.35,0.35); d.y+=rrange(rng,-0.1,0.25); d.z+=rrange(rng,-0.15,0.15); d.normalize();
      pts.push(pts[i-1].clone().addScaledVector(d, len/3));
    }
    add(barkTube(new THREE.CatmullRomCurve3(pts), t=>r0*(1-t*0.9), { segs:20, radial:8, seed:s, grooves:5 }));
  };
  twig(0.36, new THREE.Vector3(-0.45,0.9,-0.05), 0.48, 0.026, seed+1);
  const n=2+Math.floor(rng()*2);
  for(let i=0;i<n;i++){
    const t=rrange(rng,0.45,0.85);
    twig(t, new THREE.Vector3(rrange(rng,-0.3,0.6), 1, rrange(rng,-0.3,0.3)), rrange(rng,0.18,0.32), 0.014, seed+10+i);
  }
  // 根须：粗端向两侧扎进沙里
  for(const dz of [-1,1]){
    const a=curve.getPointAt(0.02);
    const pts=[a.clone(), a.clone().add(new THREE.Vector3(-0.08,-0.06,dz*0.08)), a.clone().add(new THREE.Vector3(-0.14,-0.11,dz*0.16))];
    add(barkTube(new THREE.CatmullRomCurve3(pts), t=>0.024*(1-t*0.85), { segs:10, radial:8, seed:seed+20+dz }));
  }
  // 苔藓团：贴在主干上表面
  const ts=[0.2,0.34,0.5,0.63];
  const moss=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32,1), mossMat, ts.length);
  const mm=new THREE.Matrix4(), mq=new THREE.Quaternion(), ms=new THREE.Vector3(), mp=new THREE.Vector3();
  ts.forEach((t,i)=>{
    mp.copy(curve.getPointAt(t)); mp.y+=0.035;
    mp.x+=rrange(rng,-0.04,0.04); mp.z+=rrange(rng,-0.03,0.03);
    const s=rrange(rng,0.03,0.05);
    ms.set(s*1.6,s*0.5,s*1.2);
    mq.setFromAxisAngle(UP, rng()*6.283);
    moss.setMatrixAt(i, mm.compose(mp,mq,ms));
  });
  group.add(moss);
  castAll(group);
  return { object:group, obstacles:[0.25,0.5,0.75].map(t=>({ c:curve.getPointAt(t), r:0.13 })) };
}

/** 苔球：毛茸茸的绿色小球，半埋在沙里 */
export function buildMossBall(/** @type {any} */ rng, /** @type {number} */ seed){
  const mat=shared('mat:moss', ()=>{
    const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:1});
    injectCaustics(m, 0.45, 'moss');
    return m;
  });
  const r=0.075, g=new THREE.IcosahedronGeometry(r,4), o=(seed%577)*0.53;
  const p=g.attributes.position, v=new THREE.Vector3(), col=new Float32Array(p.count*3);
  const c1=new THREE.Color(0x2f5a22), c2=new THREE.Color(0x6f9c3c), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    v.set(p.getX(i),p.getY(i),p.getZ(i));
    const fuzz=vnoise(v.x*90+o, v.y*90+v.z*70)*0.5+vnoise(v.x*30+o, v.z*30+v.y*20)*0.5;
    v.multiplyScalar(1+(fuzz-0.5)*0.16+rng()*0.03);
    v.y*=0.88;
    p.setXYZ(i,v.x,v.y,v.z);
    tmp.copy(c1).lerp(c2, fuzz*0.8+Math.max(0,v.y/r)*0.3);
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  g.translate(0, r*0.62, 0);
  const mesh=castAll(new THREE.Mesh(g, mat));
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,r*0.62,0), r:r }] };
}

/** 气石 + 气管（气泡发射点由运行时取第一个气石的位置） */
export function buildAirstone(){
  const stoneMat=shared('mat:airstone', ()=>new THREE.MeshStandardMaterial({color:0x3a3f45, roughness:0.9}));
  const tubeMat=shared('mat:airtube', ()=>new THREE.MeshStandardMaterial({color:0x14181c, roughness:0.6}));
  const group=new THREE.Group();
  const stone=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.045,0.035,10), stoneMat);
  stone.position.y=0.02;
  group.add(stone);
  const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0.04,0), new THREE.Vector3(-0.07,0.08,-0.01),
    new THREE.Vector3(-0.14,0.3,-0.02), new THREE.Vector3(-0.16,0.7,-0.02),
  ]), 24, 0.012, 6), tubeMat);
  group.add(tube);
  return { object:group, obstacles:[] };
}
