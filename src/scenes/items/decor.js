import * as THREE from 'three';
import { rrange, vnoise } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, makeRockGeo, castAll, UP } from './common.js';

/* ================================================================
 * 硬景：圆石 / 立石 / 沉木拱 / 苔球 / 气石
 * 每个构建函数返回 { object, obstacles }，坐标都是物件局部坐标（原点 = 沙面）
 * ================================================================ */

const rockMat = () => shared('mat:rock', ()=>{
  const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.92, metalness:0.02});
  injectCaustics(m, 0.55, 'rock');
  return m;
});

/** 圆石：基准半径 0.2，物件缩放决定大小 */
export function buildRock(rng, seed){
  const r=0.2, g=makeRockGeo(r, seed);
  g.scale(rrange(rng,0.9,1.25), rrange(rng,0.7,0.9), rrange(rng,0.9,1.2));
  g.translate(0, r*0.35, 0);
  const mesh=castAll(new THREE.Mesh(g, rockMat()));
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,r*0.5,0), r:r*0.95 }] };
}

/** 立石：竖长的片岩，石庭/假山的主石 */
export function buildRockTall(rng, seed){
  const r=0.14, g=makeRockGeo(r, seed+31);
  g.scale(rrange(rng,0.65,0.85), rrange(rng,2.1,2.6), rrange(rng,0.6,0.8));
  g.rotateZ(rrange(rng,-0.12,0.12));
  g.translate(0, r*0.75, 0);
  const mesh=castAll(new THREE.Mesh(g, rockMat()));
  return { object:mesh, obstacles:[
    { c:new THREE.Vector3(0,0.12,0), r:0.13 }, { c:new THREE.Vector3(0,0.32,0), r:0.11 },
  ] };
}

/** 沉木拱：主干拱 + 侧枝 + 几团苔藓。原经典布局中位于 (0,-0.57)，坐标已减去该处沙面 */
export function buildWood(rng){
  const woodMat=shared('mat:wood', ()=>{
    const m=new THREE.MeshStandardMaterial({color:0x5a4030, roughness:0.85, metalness:0.05});
    injectCaustics(m, 0.4, 'wood');
    return m;
  });
  const mossMat=shared('mat:woodMoss', ()=>new THREE.MeshStandardMaterial({color:0x4a6b2f, roughness:1, flatShading:true}));
  const V=(x,y,z)=>new THREE.Vector3(x, y-0.3, z+0.57);
  const curve=new THREE.CatmullRomCurve3([V(-0.72,0.34,-0.54), V(-0.42,0.8,-0.6), V(0,1.0,-0.58), V(0.42,0.78,-0.6), V(0.72,0.32,-0.54)]);
  const branch=new THREE.CatmullRomCurve3([V(-0.18,0.86,-0.58), V(-0.4,1.1,-0.6), V(-0.52,1.24,-0.56)]);
  const group=new THREE.Group();
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,40,0.045,8), woodMat));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(branch,16,0.026,7), woodMat));
  const ts=[0.18,0.32,0.46,0.6,0.74];
  const moss=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32,1), mossMat, ts.length);
  const mm=new THREE.Matrix4(), mq=new THREE.Quaternion(), ms=new THREE.Vector3(), mp=new THREE.Vector3();
  ts.forEach((t,i)=>{
    mp.copy(curve.getPoint(t)); mp.y+=0.02;
    mp.x+=rrange(rng,-0.05,0.05); mp.z+=rrange(rng,-0.04,0.04);
    const s=rrange(rng,0.035,0.06);
    ms.set(s*1.5,s*0.55,s*1.2);
    mq.setFromAxisAngle(UP, rng()*6.283);
    moss.setMatrixAt(i, mm.compose(mp,mq,ms));
  });
  group.add(moss);
  castAll(group);
  return { object:group, obstacles:[0.25,0.5,0.75].map(t=>({ c:curve.getPoint(t), r:0.13 })) };
}

/** 苔球：毛茸茸的绿色小球，半埋在沙里 */
export function buildMossBall(rng, seed){
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
