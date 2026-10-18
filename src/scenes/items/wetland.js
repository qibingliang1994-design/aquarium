// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rrange, fbm3 } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, castAll, injectSurfaceDetail, UP } from './common.js';
import { makeLeaf, ribbons } from './leaf-shapes.js';
import { bladeMat, bladeDepth } from './plants.js';

/* ================================================================
 * 湿地物件：睡莲 / 香蒲（挺水）/ 卵石滩
 * 睡莲与香蒲要"够到水面"：构建时不知道所在位置的沙面高度，
 * 所以在 object.userData.onPlace(H) 里按"到水面的局部高度 H"调整（运行时每次摆放后调用）
 * ================================================================ */

const paint=(/** @type {any} */ g, /** @type {number} */ hex)=>{
  const c=new THREE.Color(hex), a=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<a.length;i+=3){ a[i]=c.r; a[i+1]=c.g; a[i+2]=c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a,3));
  return g;
};

/** 芦苇/香蒲植株：缎带叶 + 两根蒲棒（自然水域岸边也用这个） */
export function reedGeo(/** @type {any} */ rng, /** @type {boolean} */ lowPoly=false){
  const parts=[ribbons(rng, { n:8, len:[0.6,1.05], width:0.024, twist:0.15, colors:[[0x34582a,0x7d9c4a],[0x3d602c,0x93a656]], segs:lowPoly ? 7 : 12, cols:2 })];
  for(let i=0;i<2;i++){
    const hgt=rrange(rng,0.82,1.05), x=rrange(rng,-0.03,0.03), z=rrange(rng,-0.03,0.03);
    parts.push(paint(new THREE.CylinderGeometry(0.004,0.005,hgt,5).translate(x,hgt/2,z), 0x55703a));
    parts.push(paint(new THREE.CylinderGeometry(0.017,0.017,0.13,8).translate(x,hgt-0.1,z), 0x5b3a22));
  }
  const out=mergeGeometries(parts);
  parts.forEach(g=>g.dispose());
  return out;
}

/** 睡莲叶：带缺口的圆叶，边缘微翘，叶脉放射状 */
function padGeo(/** @type {any} */ rng){
  const g=new THREE.CircleGeometry(1, 28, 0.18, Math.PI*2-0.36).rotateX(-Math.PI/2);
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  const a=new THREE.Color(0x2f5e22), b=new THREE.Color(0x5f8f34), c=new THREE.Color(), tint=rrange(rng,0.85,1.1);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i), r=Math.hypot(x,z), ang=Math.atan2(z,x);
    p.setY(i, r*r*0.06);                                           // 边缘微翘
    const vein=Math.pow(Math.abs(Math.sin(ang*11)), 30)*0.35;
    c.copy(a).lerp(b, 0.4+r*0.4+vein+(fbm3(x*4,0,z*4,2)-0.5)*0.3).multiplyScalar(tint);
    if(r>0.93) c.multiplyScalar(0.7).lerp(new THREE.Color(0x7a3a2a), 0.4);   // 叶缘带一点红褐
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}

/** 睡莲花：两轮尖瓣 + 黄色花心 */
function flowerGeo(/** @type {any} */ rng){
  const [c0,c1]=[[0xf2c6d8,0xfbe8f0],[0xfaf4ec,0xffffff],[0xe8889e,0xf8c8d6]][Math.floor(rng()*3)];
  const parts=[];
  for(const [n,len,tilt] of [[10,0.075,1.05],[8,0.065,0.55]]){
    for(let i=0;i<n;i++){
      const leaf=makeLeaf({ len, width:0.032, tilt, bend:-0.25, fold:0.35, cBase:c0, cTip:c1, segs:5, cols:2 });
      leaf.deleteAttribute('uv');
      leaf.rotateY(i/n*Math.PI*2+(tilt<1?0.3:0));
      parts.push(leaf);
    }
  }
  const core=paint(new THREE.SphereGeometry(0.018,10,6).scale(1,0.6,1).translate(0,0.012,0), 0xf2c23a);
  core.deleteAttribute('uv'); parts.push(core);
  const out=mergeGeometries(parts);
  parts.forEach(g=>g.dispose());
  return out;
}

export function buildLily(/** @type {any} */ rng){
  const padMat=shared('mat:lilyPad', ()=>new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.38, side:THREE.DoubleSide }));
  const stemMat=shared('mat:lilyStem', ()=>new THREE.MeshStandardMaterial({ color:0x3f5f2c, roughness:0.6 }));
  const flowerMat=shared('mat:lilyFlower', ()=>new THREE.MeshPhysicalMaterial({ vertexColors:true, roughness:0.45, sheen:0.8, sheenColor:new THREE.Color(0xffffff), side:THREE.DoubleSide }));
  const group=new THREE.Group();
  const stemG=new THREE.CylinderGeometry(0.005,0.007,1,5).translate(0,0.5,0);
  const tops=[];
  const n=4+Math.floor(rng()*3);
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+rrange(rng,-0.4,0.4), r=rrange(rng,0.08,0.26);
    const pad=new THREE.Mesh(padGeo(rng), padMat);
    pad.scale.setScalar(rrange(rng,0.07,0.12)); pad.rotation.y=rng()*6.283;
    tops.push({ obj:pad, x:Math.cos(a)*r, z:Math.sin(a)*r, lift:0.003 });
  }
  const nf=1+Math.floor(rng()*2);
  for(let i=0;i<nf;i++){
    const a=rng()*Math.PI*2, r=rrange(rng,0.02,0.12);
    const fl=new THREE.Mesh(flowerGeo(rng), flowerMat);
    fl.scale.setScalar(rrange(rng,0.9,1.25));
    tops.push({ obj:fl, x:Math.cos(a)*r, z:Math.sin(a)*r, lift:0.02 });
  }
  const stems=tops.map(t=>{ const m=new THREE.Mesh(stemG.clone(), stemMat); group.add(m, t.obj); return { m, t, bx:t.x*0.25, bz:t.z*0.25 }; });
  stemG.dispose();
  const dir=new THREE.Vector3(), q=new THREE.Quaternion();
  // H：物件局部坐标下到水面的高度（叶片浮在水面，茎从根部斜拉上去）
  group.userData.onPlace=(/** @type {number} */ H)=>{
    for(const { m, t, bx, bz } of stems){
      t.obj.position.set(t.x, H+t.lift, t.z);
      dir.set(t.x-bx, H, t.z-bz);
      const L=dir.length();
      m.position.set(bx,0,bz); m.quaternion.copy(q.setFromUnitVectors(UP, dir.normalize())); m.scale.set(1,L,1);
    }
  };
  castAll(group);
  return { object:group, obstacles:[] };
}

/** 香蒲（挺水植物）：一小丛，茎叶长到露出水面 */
export function buildReeds(/** @type {any} */ rng){
  const n=5, geo=reedGeo(rng);
  const mesh=new THREE.InstancedMesh(geo, bladeMat(), n);
  mesh.customDepthMaterial=bladeDepth();
  mesh.frustumCulled=false; mesh.castShadow=true;
  const ph=new Float32Array(n), m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3();
  for(let i=0;i<n;i++){
    const k=rrange(rng,0.85,1.15);
    q.setFromAxisAngle(UP, rng()*6.283);
    mesh.setMatrixAt(i, m.compose(v.set(rrange(rng,-0.1,0.1),-0.02,rrange(rng,-0.08,0.08)), q, s.set(k,k*rrange(rng,0.9,1.1),k)));
    mesh.setColorAt(i, new THREE.Color().setScalar(rrange(rng,0.88,1.08)));
    ph[i]=rng()*6.283;
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph,1));
  mesh.userData.onPlace=(/** @type {number} */ H)=>{ mesh.scale.y=Math.max(0.5,(H+0.28)/0.95); };   // 植株模板约 0.95 高：拉伸到出水 0.28
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,0.3,0), r:0.1 }] };
}

/** 卵石滩：一片大小不一的圆润河卵石 */
export function buildPebbles(/** @type {any} */ rng){
  const mat=shared('mat:pebble', ()=>{
    const m=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.55 });
    injectCaustics(m, 0.6, 'pebble');
    injectSurfaceDetail(m, { freq:40, k:0.2, ao:0.15, key:'pebbledet' });
    return m;
  });
  const pal=[0x9c968a,0x7e776b,0xb9ae98,0x6b655b,0xa8906f,0x8a8f8c,0xc8bfae];
  const parts=[], c=new THREE.Color(), v=new THREE.Vector3();
  const n=22+Math.floor(rng()*10);
  for(let i=0;i<n;i++){
    const r=Math.sqrt(rng())*0.3, a=rng()*Math.PI*2, k=rrange(rng,0.022,0.07)*(1-r*1.2);
    const g=new THREE.IcosahedronGeometry(1,2);
    const p=g.attributes.position, col=new Float32Array(p.count*3), o=rng()*100;
    c.setHex(pal[Math.floor(rng()*pal.length)]).multiplyScalar(rrange(rng,0.85,1.1));
    for(let j=0;j<p.count;j++){
      v.fromBufferAttribute(p,j).multiplyScalar(1+(fbm3(p.getX(j)*2+o,p.getY(j)*2,p.getZ(j)*2,2)-0.5)*0.25);
      p.setXYZ(j,v.x,v.y,v.z);
      const sh=0.8+0.25*Math.max(0,v.y);                           // 底部略暗
      col[j*3]=c.r*sh; col[j*3+1]=c.g*sh; col[j*3+2]=c.b*sh;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col,3));
    g.scale(k*rrange(rng,1,1.5), k*rrange(rng,0.45,0.7), k);
    g.rotateY(rng()*6.283);
    g.translate(Math.cos(a)*r, k*0.25, Math.sin(a)*r);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const geo=mergeGeometries(parts);
  parts.forEach(g=>g.dispose());
  geo.computeVertexNormals();
  return { object:castAll(new THREE.Mesh(geo, mat)), obstacles:[] };
}
