// @ts-check
import * as THREE from 'three';
import { clamp, makeRng, rrange, fbm3, vnoise3, sstep } from '../utils.js';
import { pondD, edgePoint, terrainHeight } from './pond-shape.js';
import { injectCaustics } from './caustics.js';
import { injectFloat } from './water-wave.js';
import { injectWet } from './wet.js';
import { injectSurfaceDetail } from '../scenes/items/common.js';
import { ribbons } from '../scenes/items/leaf-shapes.js';
import { bladeMat, bladeDepth } from '../scenes/items/plants.js';
import { makeRockGeo } from '../scenes/items/natural-geo.js';
import { reedGeo } from '../scenes/items/wetland.js';
import { shellCount } from '../systems/shell-lod.js';

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
/** @param {any} K @param {any} dims @param {number} waterY @param {any} sandHeight */
function heightField(K, { W, D, glass }, waterY, sandHeight){
  const W2=W/2-glass, D2=D/2-glass, top=waterY+K.lift;
  // 溪流/小河：河道沿 x 无限延伸出画面，出了鱼的活动区后缓缓拐弯
  const bend=(/** @type {number} */ x)=>K.channel ? Math.sign(x)*Math.sin(Math.max(0,Math.abs(x)-W2)*0.5)*0.55 : 0;
  return (/** @type {number} */ x, /** @type {number} */ z)=>{
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

/** 实际铺出来的地形高度：高度场在网格边缘压平接远景地面（terrain 网格与水深贴图共用） */
function meshHeight(/** @type {any} */ K, /** @type {any} */ H, /** @type {number} */ waterY){
  const flat=waterY+K.lift-0.03;
  return (/** @type {number} */ x, /** @type {number} */ z)=>{
    const edge=clamp(Math.min(TW/2-Math.abs(x), TD/2-Math.abs(z-TZ))/1.8, 0, 1);   // 边缘压平，接远景地面
    return flat+(H(x,z)-flat)*edge*edge*(3-2*edge);
  };
}

/** 水深贴图：水面范围内 (waterY - 地形高) / DEPTH_MAX 存成 R8，水面着色器据此做岸线淡出、浅滩与湿边白沫
 * （此前水面是一块平面硬插进地形，岸线是一条锐利的交线） */
export const DEPTH_MAX=0.6;
function bakeDepth(/** @type {(x:number,z:number)=>number} */ hAt, /** @type {number} */ waterY, /** @type {{x:number,z:number}} */ ext){
  // NZ 封顶：旧的池塘/溪流/小河本来就在 384 以下，大户外池塘不再把水深贴图拉到 500+
  const NX=Math.min(512, Math.round(ext.x*2*28)), NZ=Math.min(384, Math.round(ext.z*2*28)), data=new Uint8Array(NX*NZ);
  for(let j=0;j<NZ;j++) for(let i=0;i<NX;i++){
    const x=-ext.x+(i+0.5)/NX*ext.x*2, z=-ext.z+(j+0.5)/NZ*ext.z*2;
    data[j*NX+i]=Math.round(clamp((waterY-hAt(x,z))/DEPTH_MAX,0,1)*255);
  }
  const tex=new THREE.DataTexture(data, NX, NZ, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter=tex.minFilter=THREE.LinearFilter; tex.needsUpdate=true;
  return { tex, box:new THREE.Vector4(-ext.x, -ext.z, 1/(ext.x*2), 1/(ext.z*2)) };
}

function terrain(/** @type {any} */ K, /** @type {any} */ H, /** @type {number} */ waterY){
  const g=new THREE.PlaneGeometry(TW,TD,250,190).rotateX(-Math.PI/2).translate(0,0,TZ);
  const hAt=meshHeight(K, H, waterY);
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  const u0=new THREE.Color(K.under[0]), u1=new THREE.Color(K.under[1]);
  const l0=new THREE.Color(K.land[0]), l1=new THREE.Color(K.land[1]), l2=new THREE.Color(K.land[2]), c=new THREE.Color();
  // 湿泥：水下泥色与岸上裸土之间偏暗一点（此前 under[1]×0.72 很黑，水面淡出后在粗网格上显成一圈黑色锯齿）
  const cu=new THREE.Color(), cl=new THREE.Color(), cw=new THREE.Color(K.under[1]).lerp(new THREE.Color(K.land[2]),0.45).multiplyScalar(0.82);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i);
    const h=hAt(x,z);
    p.setY(i,h);
    // 水下泥沙 → 水线湿泥 → 岸上（草地/土块/近岸裸土）按高度平滑过渡（此前三段硬切，岸线成一条锐利的色带边）
    cu.copy(u0).lerp(u1, fbm3(x*1.3,2,z*1.3,3)).multiplyScalar(1-Math.min(0.4,Math.max(0,waterY-h)*0.3));
    cl.copy(l0).lerp(l1, fbm3(x*0.7,3,z*0.7,3));
    const bare=Math.max(fbm3(x*0.45+9,4,z*0.45,3)*1.6-0.75, 1-(h-waterY-0.05)/0.1);    // 水线上方一窄条裸土
    cl.lerp(l2, clamp(bare,0,1));
    const w1=sstep(waterY-0.22, waterY-0.01, h), w2=sstep(waterY+0.02, waterY+0.1, h);
    c.copy(cu).lerp(cw, w1).lerp(cl, w2);
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.96, metalness:0 });
  injectCaustics(mat, 0.55, 'terrain');
  injectSurfaceDetail(mat, { freq:7, k:0.35, ao:0.25, key:'terrdet' });
  injectWet(mat, 'terrain');   // uWet=0 时与干燥材质逐值相同
  const m=new THREE.Mesh(g, mat);
  m.receiveShadow=true;
  // 远景地面：一圈大圆盘接在地形边缘外，任何缩放距离都看不到地形的边
  const far=new THREE.Mesh(new THREE.RingGeometry(8,60,48,1).rotateX(-Math.PI/2),
    new THREE.MeshStandardMaterial({ color:new THREE.Color(K.land[0]).lerp(new THREE.Color(K.land[1]),0.5).multiplyScalar(0.85), roughness:1 }));
  far.position.set(0, waterY+K.lift-0.05, TZ);   // 与 meshHeight 的压平高度 flat 对齐（flat-0.02）
  m.add(far);
  return m;
}

/** 按条件撒点：在大范围内随机取样，离水越近越密 */
function scatter(/** @type {any} */ rng, /** @type {any} */ H, /** @type {number} */ waterY, /** @type {number} */ n, /** @type {(h:number,d:number)=>boolean} */ ok, /** @type {number} */ falloff=3){
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

function swayInstances(/** @type {any} */ geo, /** @type {any[]} */ pts, /** @type {any} */ rng, /** @type {any} */ scale, /** @type {number} */ sink=0.01){
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
  mesh.userData.shellFull=pts.length;
  return mesh;
}

/** 按画质档减外壳实例（草/芦苇/卵石/浮叶/成组岸石）。地形网格不动。
 * @param {THREE.Object3D|null|undefined} root @param {number} level */
export function applyShellDensity(root, level){
  if(!root) return;
  root.traverse((/** @type {any} */ o)=>{
    const full=o.userData?.shellFull;
    if(o.isInstancedMesh && full) o.count=shellCount(full, level);
    const rock=o.userData?.shellRock;
    if(rock) o.visible=rock.i<shellCount(rock.n, level);
  });
}

/** 大户外池塘：不规则岸线 + 石缘 + 碗形底 + 四周地面。鱼的矩形内腔由 volume 决定，这里只负责看得到的地形。
 * @param {number} waterY */
function buildOutdoor(waterY){
  const rng=makeRng(71);
  const bed=(/** @type {number} */ x, /** @type {number} */ z)=>{
    const h=waterY+terrainHeight(x, z);
    return Number.isFinite(h) ? h : waterY-0.2;
  };
  const group=new THREE.Group();
  const TW=42, TD=34, flat=waterY+0.42;
  const g=new THREE.PlaneGeometry(TW, TD, 160, 120).rotateX(-Math.PI/2);
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  const mud0=new THREE.Color(0x6d6248), mud1=new THREE.Color(0x4a4334);
  const stone=new THREE.Color(0x8a8478), grass0=new THREE.Color(0x4f7a32), grass1=new THREE.Color(0x6e9444), dry=new THREE.Color(0x8d8458);
  const c=new THREE.Color();
  const hMesh=(/** @type {number} */ x, /** @type {number} */ z)=>{
    const edge=clamp(Math.min(TW/2-Math.abs(x), TD/2-Math.abs(z))/2.4, 0, 1);
    const h=bed(x, z);
    const e=edge*edge*(3-2*edge);                 // 只在网格最外圈压平，碗底和岸线不动
    return flat+(h-flat)*e;
  };
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i), h=hMesh(x, z), d=pondD(x, z);
    p.setY(i, h);
    const n=fbm3(x*0.35, 2, z*0.35, 3);
    if(d<0.9) c.copy(mud0).lerp(mud1, n).multiplyScalar(0.72+0.28*(1-Math.min(1, (waterY-h)*0.35)));
    else if(d<1.08) c.copy(mud1).lerp(stone, sstep(0.9, 1.08, d));
    else c.copy(grass0).lerp(grass1, n).lerp(dry, Math.max(0, n*1.4-0.85));
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.96, metalness:0 });
  injectCaustics(mat, 0.45, 'outdoor');
  injectSurfaceDetail(mat, { freq:5, k:0.28, ao:0.22, key:'outdet' });
  injectWet(mat, 'outdoor');
  const mesh=new THREE.Mesh(g, mat);
  mesh.receiveShadow=true;
  const far=new THREE.Mesh(new THREE.RingGeometry(16, 90, 48, 1).rotateX(-Math.PI/2),
    new THREE.MeshStandardMaterial({ color:new THREE.Color(0x4a6e30).multiplyScalar(0.85), roughness:1 }));
  far.position.y=flat-0.02;
  far.receiveShadow=true;
  mesh.add(far);
  group.add(mesh);

  const rockMat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.9 });
  injectCaustics(rockMat, 0.4, 'orock');
  injectSurfaceDetail(rockMat, { freq:12, k:0.4, ao:0.3, key:'orockdet' });
  injectWet(rockMat, 'orock');
  const rockN=14;
  for(let k=0;k<3;k++){
    const geo=makeRockGeo(0.46, 800+k*91, 'river');
    const im=new THREE.InstancedMesh(geo, rockMat, rockN);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);
    for(let i=0;i<rockN;i++){
      const a=(k*rockN+i)/(rockN*3)*Math.PI*2+rrange(rng, -0.05, 0.05);
      const [x, z]=edgePoint(a, rrange(rng, 1.02, 1.14));
      const sc=rrange(rng, 0.55, 1.15);
      q.setFromAxisAngle(up, rng()*6.283);
      im.setMatrixAt(i, m.compose(v.set(x, bed(x, z)-sc*0.12, z), q, s.set(sc, sc*rrange(rng, 0.45, 0.75), sc*rrange(rng, 0.8, 1.15))));
    }
    im.castShadow=im.receiveShadow=true;
    im.userData.shellFull=rockN;
    group.add(im);
  }

  // 水下卵石（岸线以内），一网格实例化
  {
    const pts=[];
    for(let tries=0; pts.length<220 && tries<4000; tries++){
      const x=rrange(rng, -9, 9), z=rrange(rng, -6.5, 6.5), d=pondD(x, z);
      if(d<0.72 || d>0.97) continue;
      pts.push({ x, z, h:bed(x, z) });
    }
    const pebMat=new THREE.MeshStandardMaterial({ roughness:0.72 });
    injectWet(pebMat, 'opeb');
    const im=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), pebMat, pts.length);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), e=new THREE.Euler(), c=new THREE.Color();
    const pal=[0x9a958a, 0x7d776c, 0xb4ab98, 0x6a645b];
    pts.forEach((pt, i)=>{
      const sc=rrange(rng, 0.025, 0.07);
      q.setFromEuler(e.set(rrange(rng, -0.3, 0.3), rng()*6.283, rrange(rng, -0.3, 0.3)));
      im.setMatrixAt(i, m.compose(v.set(pt.x, pt.h+sc*0.2, pt.z), q, s.set(sc*rrange(rng, 1, 1.4), sc*0.55, sc)));
      im.setColorAt(i, c.setHex(pal[i%pal.length]).multiplyScalar(rrange(rng, 0.85, 1.1)));
    });
    im.receiveShadow=true;
    im.userData.shellFull=pts.length;
    group.add(im);
  }

  const grassPts=[];
  for(let tries=0; grassPts.length<900 && tries<8000; tries++){
    const x=rrange(rng, -16, 16), z=rrange(rng, -13, 13), d=pondD(x, z), h=bed(x, z);
    if(d<1.06 || h<waterY+0.02) continue;
    if(z>5 && Math.abs(x)<6 && rng()<0.8) continue;     // 镜头这一侧少挡视线
    grassPts.push({ x, z, h, d });
  }
  const grassGeo=ribbons(rng, { n:5, len:[0.16, 0.34], width:0.016, twist:0.3, spread:0.05,
    colors:[[0x3d5e22, 0x86a848], [0x4a6a28, 0x9ab85a]], segs:4, cols:1 });
  if(grassPts.length) group.add(swayInstances(grassGeo, grassPts, rng, [0.75, 1.45]));

  const reedPts=[];
  for(let tries=0; reedPts.length<70 && tries<2000; tries++){
    const a=rng()*Math.PI*2, [x, z]=edgePoint(a, rrange(rng, 0.9, 1.06)), h=bed(x, z);
    if(h<waterY-0.25 || h>waterY+0.18) continue;
    if(z>3.5 && Math.abs(x)<4) continue;
    reedPts.push({ x, z, h, d:pondD(x, z) });
  }
  if(reedPts.length) group.add(swayInstances(reedGeo(rng, true), reedPts, rng, [0.7, 1.15], 0.02));

  const padPts=[];
  for(let tries=0; padPts.length<18 && tries<800; tries++){
    const x=rrange(rng, -6, 6), z=rrange(rng, -4, 3), d=pondD(x, z);
    if(d<0.45 || d>0.82) continue;
    padPts.push({ x, z });
  }
  if(padPts.length){
    const pad=new THREE.CircleGeometry(1, 18, 0.3, Math.PI*2-0.45).rotateX(-Math.PI/2);
    const padMat=new THREE.MeshStandardMaterial({ roughness:0.42, side:THREE.DoubleSide });
    injectFloat(padMat, 'outPad');
    const im=new THREE.InstancedMesh(pad, padMat, padPts.length);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), up=new THREE.Vector3(0,1,0), c=new THREE.Color();
    padPts.forEach((pt, i)=>{
      const sc=rrange(rng, 0.16, 0.32);
      q.setFromAxisAngle(up, rng()*6.283);
      im.setMatrixAt(i, m.compose(v.set(pt.x, waterY+0.004, pt.z), q, s.set(sc, 1, sc)));
      im.setColorAt(i, c.setHex(rng()<0.3 ? 0x7a5a2e : 0x3f6a2a).multiplyScalar(rrange(rng, 0.85, 1.12)));
    });
    im.receiveShadow=true;
    im.userData.shellFull=padPts.length;
    group.add(im);
  }

  // 半宽给 tank.setShell 放大水面。网格半宽 ≈ water.x * (几何宽 / TANK.W)，略放大才盖住最凸的岸线
  group.userData.water={ x:13, z:9.6 };
  group.userData.depth=bakeDepth(hMesh, waterY, group.userData.water);
  group.userData.bed=bed;                       // 鱼和物件贴这张碗，不贴压平后的网格边缘
  return group;
}

/** 构建自然水域外壳 @param {string} kind @param {{W:number,D:number,glass:number}} dims */
/** @param {string} kind @param {any} dims @param {any} opts */
export function buildNaturalShell(kind, dims, { waterY, sandHeight }){
  if(kind==='outdoor') return buildOutdoor(waterY);
  const K=(/** @type {any} */ (KINDS))[kind] ?? KINDS.pond, rng=makeRng(K.seed);
  const H=heightField(K, dims, waterY, sandHeight);
  const group=new THREE.Group();
  group.add(terrain(K, H, waterY));

  // 草丛：岸上
  const grassGeo=ribbons(rng, { n:6, len:[0.12,0.3], width:0.014, twist:0.35, spread:0.04,
    colors:[[0x3d5e22,0x86a848],[0x4a6a28,0x9ab85a],[0x5a6a30,0xb0a868]], segs:5, cols:1 });   // 成片岸草：低面数
  group.add(swayInstances(grassGeo, scatter(rng, H, waterY, K.grass, (/** @type {number} */ h)=>h>waterY+0.03, 3.5), rng, [0.7,1.5]));
  // 芦苇香蒲：水线附近（一半站在浅水里）
  if(K.reeds) group.add(swayInstances(reedGeo(rng, true), scatter(rng, H, waterY, K.reeds, (h,d)=>d<1.6 && h>waterY-0.16 && h<waterY+0.12, 2), rng, [0.55,0.95], 0.02));

  // 岸石：水线上下的大石块
  const rockMat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.9 });
  injectCaustics(rockMat, 0.55, 'rock');
  injectSurfaceDetail(rockMat, { freq:14, k:0.45, ao:0.35, key:'rockdet' });
  injectWet(rockMat, 'rock');
  const rockPts=scatter(rng, H, waterY, K.rocks, (h)=>h>waterY-0.35 && h<waterY+0.35, 1.6);
  rockPts.forEach((pt,i)=>{
    const r=rrange(rng,0.22,0.5), g=makeRockGeo(r, Math.floor(rng()*1e6), 'river');
    g.scale(1, rrange(rng,0.55,0.85), rrange(rng,0.8,1.1));
    const m=new THREE.Mesh(g, rockMat);
    m.position.set(pt.x, pt.h-r*0.18, pt.z); m.rotation.y=rng()*6.283;
    m.castShadow=m.receiveShadow=true;
    m.userData.shellRock={ i, n:rockPts.length };
    group.add(m);
  });
  // 卵石：浅滩与水线
  {
    const pts=scatter(rng, H, waterY, K.pebbles, (h)=>h<waterY+0.1, 1.2);
    const pebMat=new THREE.MeshStandardMaterial({ roughness:0.7 });
    injectWet(pebMat, 'peb');
    const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1), pebMat, pts.length);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), e=new THREE.Euler(), c=new THREE.Color();
    const pal=[0x9a958a,0x7d776c,0xb4ab98,0x6a645b,0xa38f72];
    pts.forEach((pt,i)=>{
      const k=rrange(rng,0.02,0.07);
      q.setFromEuler(e.set(rrange(rng,-0.3,0.3), rng()*6.283, rrange(rng,-0.3,0.3)));
      mesh.setMatrixAt(i, m.compose(v.set(pt.x,pt.h+k*0.2,pt.z), q, s.set(k*rrange(rng,1,1.5),k*rrange(rng,0.45,0.7),k)));
      mesh.setColorAt(i, c.setHex(pal[Math.floor(rng()*pal.length)]).multiplyScalar(rrange(rng,0.85,1.1)));
    });
    mesh.receiveShadow=true; mesh.castShadow=true;
    mesh.userData.shellFull=pts.length;
    group.add(mesh);
  }
  // 浮叶：浅滩水面上零星的睡莲叶（矩形外，不挡鱼）
  if(K.pads){
    const pts=scatter(rng, H, waterY, K.pads, (h,d)=>h<waterY-0.12 && d>0.15, 1.5);
    const pad=new THREE.CircleGeometry(1,22,0.25,Math.PI*2-0.5).rotateX(-Math.PI/2);
    const padMat=new THREE.MeshStandardMaterial({ roughness:0.42, side:THREE.DoubleSide });
    injectFloat(padMat, 'shorePad');                   // 随水面波动
    const mesh=new THREE.InstancedMesh(pad, padMat, pts.length);
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), v=new THREE.Vector3(), up=new THREE.Vector3(0,1,0), c=new THREE.Color();
    mesh.userData.shellFull=pts.length;
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
  group.userData.depth=bakeDepth(meshHeight(K, H, waterY), waterY, group.userData.water);   // tank.setShell 接到水面，换壳时释放
  return group;
}
