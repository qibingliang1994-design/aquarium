import * as THREE from 'three';
import { clamp, makeRng, rrange, fbm3, vnoise3 } from '../utils.js';
import { injectCaustics } from './caustics.js';
import { injectSurfaceDetail } from '../scenes/items/common.js';
import { ribbons } from '../scenes/items/leaf-shapes.js';
import { bladeMat, bladeDepth } from '../scenes/items/plants.js';
import { makeRockGeo } from '../scenes/items/natural-geo.js';
import { reedGeo } from '../scenes/items/wetland.js';

/* ================================================================
 * 自然水域外壳：池塘 / 溪流 / 小河
 * 水体仍是缸内那块矩形（鱼与造景都在里面），四周换成土岸地形：
 *   矩形边缘与沙床齐平 → 水下缓坡（浅滩，透过清水可见）→ 不规则岸线 → 岸上起伏地面
 * 水面平面放大到覆盖浅滩，岸线以外的部分被地形挡住，于是岸线看起来是自然弯曲的
 * 岸上：草丛 / 芦苇香蒲 / 岸石 / 卵石 / 浮叶，按种类配比
 * ================================================================ */

// shore：水下坡宽区间；beach：近岸坡宽倍数；lift：岸顶高出水面；hill：岸上起伏；front：近岸（朝镜头一侧）起伏系数
const KINDS={
  pond:   { shore:[0.55,1.15], lift:0.14, hill:0.6, front:0.25, beach:2.2, under:[0x6f6248,0x4b4333], land:[0x4c7a2e,0x6e9038,0x7d6a46],
            grass:1100, reeds:120, rocks:9, pebbles:160, pads:34, seed:11 },
  stream: { shore:[0.22,0.55], lift:0.15, hill:0.8, front:0.3, beach:2.8, under:[0x8c877c,0x5e5a51], land:[0x7e7b72,0x5e6d3c,0x948c7c],
            grass:380, reeds:0, rocks:26, pebbles:900, pads:0, seed:23, channel:true },
  river:  { shore:[0.85,1.7], lift:0.13, hill:0.45, front:0.2, beach:1.6, under:[0x9a8462,0x6c5839], land:[0x5a7a32,0x88994e,0xb7a378],
            grass:850, reeds:80, rocks:7, pebbles:260, pads:8, seed:37, channel:true },
};
export const NATURAL_KINDS=Object.keys(KINDS);
export const WATER_EXTEND=1.8;
const TW=20, TD=17, TZ=1.5;                    // 地形网格：宽 / 深 / 向镜头一侧偏移（开场运镜从 z≈8.8 飞入）                 // 水面向四周多铺的宽度（盖住最宽的浅滩）

/** 地形高度函数：矩形内贴着沙床下方，矩形外按浅滩 → 岸 → 岸上地面过渡 */
function heightField(K, { W, D, glass }, waterY, sandHeight){
  const W2=W/2-glass, D2=D/2-glass, top=waterY+K.lift;
  // 溪流/小河：河道沿 x 无限延伸出画面，出了鱼的活动区后缓缓拐弯
  const bend=x=>K.channel ? Math.sign(x)*Math.sin(Math.max(0,Math.abs(x)-W2)*0.5)*0.55 : 0;
  return (x,z)=>{
    if(Math.abs(x)<W2 && Math.abs(z)<D2) return sandHeight(x,z);   // 矩形内就是河床本身（缸的沙床在自然水域里隐藏）
    const zz=z-bend(x), ax=K.channel ? -1 : Math.abs(x)-W2, az=Math.abs(zz)-D2;
    const d=Math.hypot(Math.max(ax,0),Math.max(az,0));
    const h0=sandHeight(clamp(x,-W2,W2), clamp(zz,-D2,D2));
    const sw=(K.shore[0]+(K.shore[1]-K.shore[0])*fbm3(x*0.35,0.7,z*0.35+5,3))*(zz>0 ? K.beach : 1);   // 近岸是宽缓的浅滩：俯视时视线不被岸挡住
    const t=Math.min(1,d/sw), e=t*t*(3-2*t);
    let h=h0+(top-h0)*e+(vnoise3(x*3.1,0.5,z*3.1)-0.5)*0.035*Math.min(1,d*4);
    if(t>=1){
      const far=Math.min(1,(d-sw)/2.6), fk=z>0 ? K.front : 1;
      h=Math.max(top-0.03, h+(fbm3(x*0.22+3,1,z*0.22,4)*1.25-0.35)*K.hill*fk*far);
    }
    return h;
  };
}

function terrain(K, H, waterY){
  const g=new THREE.PlaneGeometry(TW,TD,250,190).rotateX(-Math.PI/2).translate(0,0,TZ);
  const flat=waterY+K.lift-0.03;
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  const u0=new THREE.Color(K.under[0]), u1=new THREE.Color(K.under[1]);
  const l0=new THREE.Color(K.land[0]), l1=new THREE.Color(K.land[1]), l2=new THREE.Color(K.land[2]), c=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i);
    const edge=clamp(Math.min(TW/2-Math.abs(x), TD/2-Math.abs(z-TZ))/1.8, 0, 1);   // 边缘压平，接远景地面
    const h=flat+(H(x,z)-flat)*edge*edge*(3-2*edge);
    p.setY(i,h);
    if(h<waterY-0.02){                                         // 水下：泥沙，越深越暗
      c.copy(u0).lerp(u1, fbm3(x*1.3,2,z*1.3,3)).multiplyScalar(1-Math.min(0.4,(waterY-h)*0.3));
    } else if(h<waterY+0.05){                                  // 水线：湿泥
      c.copy(u1).multiplyScalar(0.72);
    } else {                                                   // 岸上：草地 / 土块 / 近岸裸土
      c.copy(l0).lerp(l1, fbm3(x*0.7,3,z*0.7,3));
      const bare=Math.max(fbm3(x*0.45+9,4,z*0.45,3)*1.6-0.75, 1-(h-waterY-0.05)/0.06);   // 水线上方一窄条裸土
      c.lerp(l2, clamp(bare,0,1));
    }
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.96, metalness:0 });
  injectCaustics(mat, 0.55, 'terrain');
  injectSurfaceDetail(mat, { freq:7, k:0.35, ao:0.25, key:'terrdet' });
  const m=new THREE.Mesh(g, mat);
  m.receiveShadow=true;
  // 远景地面：一圈大圆盘接在地形边缘外，任何缩放距离都看不到地形的边
  const far=new THREE.Mesh(new THREE.RingGeometry(8,60,48,1).rotateX(-Math.PI/2),
    new THREE.MeshStandardMaterial({ color:new THREE.Color(K.land[0]).lerp(new THREE.Color(K.land[1]),0.5).multiplyScalar(0.85), roughness:1 }));
  far.position.set(0, flat-0.02, TZ);
  m.add(far);
  return m;
}

/** 按条件撒点：在大范围内随机取样，离水越近越密 */
function scatter(rng, H, waterY, n, ok, falloff=3){
  const out=[];
  for(let tries=0; out.length<n && tries<n*30; tries++){
    const x=rrange(rng,-8.6,8.6), z=rrange(rng,-6.2,7.5), h=H(x,z);
    const d=Math.hypot(Math.max(Math.abs(x)-2.3,0), Math.max(Math.abs(z)-0.9,0));
    if(d<0.05 || !ok(h,d) || (z>1.25 && Math.abs(x)<4.2 && rng()<0.92)) continue;   // 镜头前的近岸基本留空，不挡视线
    if(rng()>Math.exp(-d/falloff)) continue;
    out.push({ x, z, h, d });
  }
  return out;
}

function swayInstances(geo, pts, rng, scale, sink=0.01){
  const mesh=new THREE.InstancedMesh(geo, bladeMat(), pts.length);
  mesh.customDepthMaterial=bladeDepth();
  mesh.userData.sharedMat=true;
  mesh.frustumCulled=false;
  const ph=new Float32Array(pts.length), m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), up=new THREE.Vector3(0,1,0), c=new THREE.Color();
  pts.forEach((pt,i)=>{
    const k=rrange(rng,scale[0],scale[1]);
    q.setFromAxisAngle(up, rng()*6.283);
    mesh.setMatrixAt(i, m.compose(v.set(pt.x,pt.h-sink,pt.z), q, s.set(k,k*rrange(rng,0.85,1.2),k)));
    const t=rrange(rng,0.82,1.1); mesh.setColorAt(i, c.setRGB(t*rrange(rng,0.95,1.08),t,t*0.95));
    ph[i]=rng()*6.283;
  });
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph,1));
  return mesh;
}

/** 构建自然水域外壳 @param {string} kind @param {{W:number,D:number,glass:number}} dims */
export function buildNaturalShell(kind, dims, { waterY, sandHeight }){
  const K=KINDS[kind] ?? KINDS.pond, rng=makeRng(K.seed);
  const H=heightField(K, dims, waterY, sandHeight);
  const group=new THREE.Group();
  group.add(terrain(K, H, waterY));

  // 草丛：岸上
  const grassGeo=ribbons(rng, { n:6, len:[0.12,0.3], width:0.014, twist:0.35, spread:0.04,
    colors:[[0x3d5e22,0x86a848],[0x4a6a28,0x9ab85a],[0x5a6a30,0xb0a868]], segs:5, cols:1 });   // 成片岸草：低面数
  group.add(swayInstances(grassGeo, scatter(rng, H, waterY, K.grass, (h)=>h>waterY+0.03, 3.5), rng, [0.7,1.5]));
  // 芦苇香蒲：水线附近（一半站在浅水里）
  if(K.reeds) group.add(swayInstances(reedGeo(rng, true), scatter(rng, H, waterY, K.reeds, (h,d)=>d<1.6 && h>waterY-0.16 && h<waterY+0.12, 2), rng, [0.55,0.95], 0.02));

  // 岸石：水线上下的大石块
  const rockMat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.9 });
  injectCaustics(rockMat, 0.55, 'rock');
  injectSurfaceDetail(rockMat, { freq:14, k:0.45, ao:0.35, key:'rockdet' });
  for(const pt of scatter(rng, H, waterY, K.rocks, (h)=>h>waterY-0.35 && h<waterY+0.35, 1.6)){
    const r=rrange(rng,0.22,0.5), g=makeRockGeo(r, Math.floor(rng()*1e6), 'river');
    g.scale(1, rrange(rng,0.55,0.85), rrange(rng,0.8,1.1));
    const m=new THREE.Mesh(g, rockMat);
    m.position.set(pt.x, pt.h-r*0.18, pt.z); m.rotation.y=rng()*6.283;
    m.castShadow=m.receiveShadow=true;
    group.add(m);
  }
  // 卵石：浅滩与水线
  {
    const pts=scatter(rng, H, waterY, K.pebbles, (h)=>h<waterY+0.1, 1.2);
    const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1), new THREE.MeshStandardMaterial({ roughness:0.7 }), pts.length);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), e=new THREE.Euler(), c=new THREE.Color();
    const pal=[0x9a958a,0x7d776c,0xb4ab98,0x6a645b,0xa38f72];
    pts.forEach((pt,i)=>{
      const k=rrange(rng,0.02,0.07);
      q.setFromEuler(e.set(rrange(rng,-0.3,0.3), rng()*6.283, rrange(rng,-0.3,0.3)));
      mesh.setMatrixAt(i, m.compose(v.set(pt.x,pt.h+k*0.2,pt.z), q, s.set(k*rrange(rng,1,1.5),k*rrange(rng,0.45,0.7),k)));
      mesh.setColorAt(i, c.setHex(pal[Math.floor(rng()*pal.length)]).multiplyScalar(rrange(rng,0.85,1.1)));
    });
    mesh.receiveShadow=true; mesh.castShadow=true;
    group.add(mesh);
  }
  // 浮叶：浅滩水面上零星的睡莲叶（矩形外，不挡鱼）
  if(K.pads){
    const pts=scatter(rng, H, waterY, K.pads, (h,d)=>h<waterY-0.12 && d>0.15, 1.5);
    const pad=new THREE.CircleGeometry(1,22,0.25,Math.PI*2-0.5).rotateX(-Math.PI/2);
    const mesh=new THREE.InstancedMesh(pad, new THREE.MeshStandardMaterial({ roughness:0.42, side:THREE.DoubleSide }), pts.length);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), up=new THREE.Vector3(0,1,0), c=new THREE.Color();
    pts.forEach((pt,i)=>{
      const k=rrange(rng,0.07,0.15);
      q.setFromAxisAngle(up, rng()*6.283);
      mesh.setMatrixAt(i, m.compose(v.set(pt.x,waterY+0.004,pt.z), q, s.set(k,1,k)));
      mesh.setColorAt(i, c.setHex(rng()<0.25 ? 0x7a5a2e : 0x3f6a2a).multiplyScalar(rrange(rng,0.85,1.15)));
    });
    mesh.receiveShadow=true;
    group.add(mesh);
  }
  // 水面需要铺开的半宽（tank.setShell 读取）：河道一直铺到地形边缘
  group.userData.water={ x:K.channel ? 9 : dims.W/2+WATER_EXTEND, z:dims.D/2+Math.max(WATER_EXTEND, K.shore[1]*K.beach+0.2) };
  return group;
}
