// @ts-check
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, rrange, vnoise } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, castAll, injectSurfaceDetail, UP } from './common.js';
import { makeRockGeo, barkTube } from './natural-geo.js';
import { woodMat } from './decor.js';
import { injectSurfaceTex } from './surface-tex.js';

/* ================================================================
 * 造景硬景（IAPLC 致敬作品用）：分叉沉木枝 / 苔石
 * 分叉沉木枝：红沉木 / 杜鹃根那种从沙里斜伸出来、逐级分叉的细枝，枝头收尖
 * 苔石：浅色层岩，朝上的面长满一团团立体苔藓垫（实例化，一次绘制）
 * ================================================================ */

const _d=new THREE.Vector3(), _a=new THREE.Vector3();
const TOP=0.72;                       // 分叉沉木枝的局部高度上限（缩放上限 1.8 × 0.72 + 沙面 ≈ 水面以下）

/**
 * 斜伸的沉木：主枝从沙里斜向 +x 上方伸出，按 depth 逐级分叉，枝头收尖
 * @param {any} rng @param {number} seed
 * @param {{ bark:{cBark:number,cDark:number,cBleach:number}, r0:number, len:[number,number], elev:[number,number], depth:number, spread:[number,number], bend:number, mat?:any, blunt?:number }} o
 *   blunt：最末一级枝的末端半径 / 起点半径（越大越像折断的钝头）
 *   bend：每段转向幅度（1 = 细枝的自然折弯，粗倒木取小值、几乎笔直）
 */
function growWood(rng, seed, { bark, r0:R0, len:LEN, elev:ELEV, depth:DEPTH, spread, bend, mat=woodMat(), blunt:BLUNT=0.12 }){
  const group=new THREE.Group();
  /** @type {{c:THREE.Vector3, r:number}[]} */ const obstacles=[];
  let tubes=0;
  /** @param {THREE.Vector3} start @param {THREE.Vector3} dir @param {number} len @param {number} r0 @param {number} depth */
  const grow=(start, dir, len, r0, depth)=>{
    const pts=[start.clone()];
    _d.copy(dir).normalize();
    for(let i=1;i<=4;i++){
      // 每段微微转向、略向上翘：沉木枝自然的折弯
      const bk=depth===DEPTH ? bend : 1;                          // 只有主枝按 bend 取直，侧杈照常弯
      _d.x+=rrange(rng,-0.2,0.2)*bk; _d.y+=rrange(rng,-0.12,0.07)*bk; _d.z+=rrange(rng,-0.18,0.18)*bk; _d.normalize();
      if(_d.y>0.75){ _d.y=0.75; _d.normalize(); }               // 不长成竖直的细杆
      if(pts[i-1].y>TOP-0.12 && _d.y>-0.1){ _d.y=-0.1-rng()*0.2; _d.normalize(); }   // 快到顶就平伸 / 下垂，放大到 1.8 倍也不出水面
      pts.push(pts[i-1].clone().addScaledVector(_d, len/4));
    }
    const curve=new THREE.CatmullRomCurve3(pts);
    const r1=r0*(depth>0 ? 0.6 : BLUNT);
    // 末端最后 6% 按四分之一圆收口：断枝是钝头（细枝 BLUNT 小、近似收尖；倒木 BLUNT 大、像折断的粗木）
    const rad=(/** @type {number} */ t)=>(r0+(r1-r0)*t)*(t<0.94 ? 1 : Math.sqrt(Math.max(0.0, 1-((t-0.94)/0.06)**2)));
    group.add(new THREE.Mesh(barkTube(curve, rad, { segs:depth>1 ? 22 : 14, radial:depth>1 ? 9 : 6, seed:seed+tubes*7, grooves:5, ...bark }), mat));
    tubes++;
    if(depth===DEPTH) for(const t of [0.3,0.65]) obstacles.push({ c:curve.getPointAt(t), r:r0*2.4+0.04 });
    if(depth<=0) return;
    const n=depth>1 ? 3 : 2;
    for(let k=0;k<n;k++){
      const t=rrange(rng,0.42,0.92);
      const p=curve.getPointAt(t), tan=curve.getTangentAt(t);
      // 侧枝：绕主枝切线随机方位张开 0.45~0.85 rad，偏向上方
      _a.set(rrange(rng,-1,1), rrange(rng,-0.2,0.7), rrange(rng,-1,1)).normalize();
      const side=_a.sub(tan.clone().multiplyScalar(_a.dot(tan))).normalize();
      const ang=rrange(rng,0.4,0.75);
      const nd=tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
      grow(p, nd, len*rrange(rng,spread[0],spread[1]), (r0+(r1-r0)*t)*0.78, depth-1);
    }
  };
  const elev=rrange(rng,ELEV[0],ELEV[1]);
  grow(new THREE.Vector3(-0.42,-0.04,rrange(rng,-0.05,0.05)), new THREE.Vector3(Math.cos(elev),Math.sin(elev),rrange(rng,-0.15,0.15)), rrange(rng,LEN[0],LEN[1]), R0, DEPTH);
  castAll(group);
  return { object:group, obstacles };
}

/** 红沉木枝（杜鹃根）：细、三级分叉，主枝斜伸 17°~31°（"躺着伸出去"，不是立着）；局部长度约 1 */
export function buildBranchWood(/** @type {any} */ rng, /** @type {number} */ seed){
  return growWood(rng, seed, { bark:{ cBark:0x7c3f26, cDark:0x2e140b, cBleach:0x9a5e40 },   // 红褐树皮，高处泛浅
    r0:0.042, len:[0.85,1.05], elev:[0.3,0.55], depth:2, spread:[0.45,0.62], bend:1 });
}

/** 倒木（粗沉木）：粗而深色，只分一级短杈，一头扎沙一头斜搭起来；几根交错成一堆 */
export function buildLogWood(/** @type {any} */ rng, /** @type {number} */ seed){
  return growWood(rng, seed, { bark:{ cBark:0x6a5a4c, cDark:0x2a2018, cBleach:0x8a7c6c },   // 顶点色只给明暗与沟纹，色相交给树皮照片（深褐）
    r0:0.08, len:[1.15,1.35], elev:[0.32,0.55], depth:1, spread:[0.22,0.36], bend:0.3, mat:logMat(), blunt:0.55 });
}

// 照片贴图（public/tex/，CC0）：层岩 = Poly Haven marble_cliff_04，苔藓 = ambientCG Moss002，倒木树皮 = Poly Haven bark_brown_02
const paleMat = () => shared('mat:rockPale', ()=>{
  const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.86, metalness:0.02});
  injectCaustics(m, 0.55, 'rock');
  injectSurfaceDetail(m, { freq:14, k:0.12, ao:0.3, key:'rockdet' });      // 照片法线已给足细节，程序噪声只留一点凹处积暗
  injectSurfaceTex(m, { name:'r_pale', scale:2.2, k:1.5, gain:1.75, key:'pale' });
  return m;
});
const mossTuftMat = () => shared('mat:mossTuft', ()=>{
  const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95});
  injectCaustics(m, 0.45, 'mosstuft');
  injectSurfaceDetail(m, { freq:150, k:0.5, ao:0.4, key:'mosstuftdet' });  // 照片之上再加一层更细的绒毛噪声
  injectSurfaceTex(m, { name:'m_moss', scale:5.5, k:1.6, gain:1.7, key:'moss', world:true });
  return m;
});
export const logMat = () => shared('mat:logWood', ()=>{
  const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.8, metalness:0.02});
  injectCaustics(m, 0.4, 'wood');
  injectSurfaceDetail(m, { freq:10, k:0.15, ao:0.25, stretch:[1,0.25,1], key:'wooddet' });
  injectSurfaceTex(m, { name:'b_log', scale:5.0, k:2.3, gain:1.9, key:'log' });
  return m;
});
// 苔藓垫单元：表面起伏的扁球，顶部偏亮绿、底部偏暗；所有苔石共用一份
const tuftGeo = () => shared('geo:mossTuft', ()=>{
  // 20 面体 + 平滑法线：单团 1.5~3 cm、一块石头几百团叠成苔垫，面数要省
  let g=new THREE.IcosahedronGeometry(1,0);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g=/** @type {any} */ (mergeVertices(g));
  const p=g.attributes.position, v=new THREE.Vector3();
  const col=new Float32Array(p.count*3), c1=new THREE.Color(0x4e5844), c2=new THREE.Color(0xe2ead6), tmp=new THREE.Color();   // 只给明暗（底暗顶亮），色相交给苔藓照片
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);
    const fuzz=vnoise(v.x*5+3, v.y*5+v.z*4)*0.6+vnoise(v.x*11, v.z*11+v.y*9)*0.4;
    v.multiplyScalar(1+(fuzz-0.5)*0.3);
    p.setXYZ(i,v.x,v.y,v.z);
    tmp.copy(c1).lerp(c2, Math.min(1, fuzz*0.6+Math.max(0,v.y)*0.55));
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
});

/** 苔石：2~3 块浅色层岩逐级叠起（基准半径 0.2），每块顶面削平成台，台面与缓坡长满苔藓垫、陡壁露出浅色岩面 */
export function buildMossRock(/** @type {any} */ rng, /** @type {number} */ seed){
  const r=0.2, group=new THREE.Group(), o=(seed%389)*0.61;
  const deep=new THREE.Color(0x2c4a1e), tc=new THREE.Color();
  /** @type {{c:THREE.Vector3, r:number}[]} */ const obstacles=[];
  /** @type {{p:THREE.Vector3, n:THREE.Vector3, w:number}[]} */ const pick=[];
  const tiers=2+(rng()<0.5 ? 1 : 0);
  let base=-r*0.04, w=1, ox=0, oz=0;
  for(let b=0;b<tiers;b++){
    const g=makeRockGeo(r, seed+53+b*17, 'pale');
    const sx=rrange(rng,1.0,1.3)*w, sy=rrange(rng,1.35,1.8)*w, sz=rrange(rng,0.8,1.0)*w;
    g.scale(sx, sy, sz);
    g.computeBoundingBox();
    // 顶面削平：块状层岩，顶上留出平台给苔垫
    const bb0=/** @type {THREE.Box3} */ (g.boundingBox), cap=bb0.min.y+(bb0.max.y-bb0.min.y)*0.78;
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){ const y=p.getY(i); if(y>cap) p.setY(i, cap+(y-cap)*0.2); }
    // 层阶：按高度分成一道道水平岩层，层缝处向内收 → 岩面出现横向台阶，不再是一整坨圆鼓包
    const per=r*rrange(rng,0.2,0.3)*sy, ph=(seed%13)*0.37+b;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      const f=((y/per+ph+vnoise(x*7+o, z*7)*0.4)%1+1)%1;
      const t=Math.min(1, Math.max(0, (f-0.72)/0.22)), k=1-0.09*t*t*(3-2*t);
      p.setX(i, x*k); p.setZ(i, z*k);
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    const bb=/** @type {THREE.Box3} */ (g.boundingBox);
    g.translate(ox, base-bb.min.y, oz);
    g.computeBoundingBox();
    const box=/** @type {THREE.Box3} */ (g.boundingBox), h=box.max.y-box.min.y;
    group.add(new THREE.Mesh(g, paleMat()));
    obstacles.push({ c:new THREE.Vector3(ox, box.min.y+h*0.5, oz), r:Math.max(sx,sz)*r*0.95 });
    // 苔藓区域：台面几乎长满，缓坡按低频噪声成片；石面先染深苔绿（绒团之间不露灰石），再撒绒团
    const nrm=g.attributes.normal, gc=g.attributes.color;
    for(let i=0;i<p.count;i++){
      const up=nrm.getY(i);
      if(up<0.25) continue;
      const patch=vnoise(p.getX(i)*8+o, p.getZ(i)*8+p.getY(i)*3);
      const k=Math.min(1, (up-0.25)*2.5)*Math.min(1, Math.max(0, (patch-0.45+up*0.55)*4));   // 越平越容易长满
      if(k<=0) continue;
      tc.fromBufferAttribute(gc,i).lerp(deep, k*0.92);
      gc.setXYZ(i, tc.r, tc.g, tc.b);
      if(k>0.3 && rng()<0.7) pick.push({ p:new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)), n:new THREE.Vector3(nrm.getX(i),nrm.getY(i),nrm.getZ(i)), w });
    }
    gc.needsUpdate=true;
    // 下一块压在这块顶上，略缩小、略错开
    base=box.max.y-h*0.14;
    w*=rrange(rng,0.62,0.8);
    ox+=rrange(rng,-0.05,0.05); oz+=rrange(rng,-0.03,0.03);
  }
  const N=Math.min(380, pick.length*2), tuft=new THREE.InstancedMesh(tuftGeo(), mossTuftMat(), Math.max(1,N));
  tuft.count=N;
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pos=new THREE.Vector3(), n=new THREE.Vector3(), col=new THREE.Color();
  const pr=makeRng(seed*3+11);
  for(let k=0;k<N;k++){
    const pk=pick[Math.floor(pr()*pick.length)];
    pos.copy(pk.p); n.copy(pk.n);
    const sz=rrange(pr,0.018,0.04)*(0.6+0.4*pk.w)*(0.6+0.6*Math.max(0,n.y));   // 台面上的苔垫更大更鼓
    // 同一顶点附近抖开一点再叠一层：几百团互相嵌套，轮廓起伏但连成一片苔垫
    pos.x+=rrange(pr,-0.012,0.012); pos.z+=rrange(pr,-0.012,0.012);
    pos.addScaledVector(n, sz*rrange(pr,0.0,0.35));
    q.setFromUnitVectors(UP, n.lerp(UP,0.6).normalize());   // 绒团顺着坡面，但比石面更平
    s.set(sz*rrange(pr,1.0,1.4), sz*rrange(pr,0.55,0.85), sz*rrange(pr,1.0,1.4));
    tuft.setMatrixAt(k, m.compose(pos,q,s));
    tuft.setColorAt(k, col.setRGB(rrange(pr,0.78,1.05), rrange(pr,0.8,1.02), rrange(pr,0.7,0.95)));
  }
  if(tuft.instanceColor) tuft.instanceColor.needsUpdate=true;
  group.add(tuft);
  castAll(group);
  return { object:group, obstacles };
}
