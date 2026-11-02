// @ts-check
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, rrange, vnoise } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, castAll, injectSurfaceDetail, UP } from './common.js';
import { makeRockGeo } from './natural-geo.js';
import { woodMat } from './decor.js';
import { growDriftwood } from './wood-geo.js';
import { injectSurfaceTex } from './surface-tex.js';

/* ================================================================
 * 造景硬景（IAPLC 致敬作品用）：分叉沉木枝 / 苔石
 * 分叉沉木枝：红沉木 / 杜鹃根那种从沙里斜伸出来、逐级分叉的细枝，枝头收尖
 * 苔石：浅色层岩，朝上的面长满一团团立体苔藓垫（实例化，一次绘制）
 * ================================================================ */

const TOP=0.72;                       // 分叉沉木枝的局部高度上限（缩放上限 1.8 × 0.72 + 沙面 ≈ 水面以下）

/**
 * 斜伸的沉木：主枝从沙里斜向 +x 上方伸出、逐级分叉（形态见 wood-geo.js），所有枝合成一个网格、共用沉木材质
 * @param {any} rng @param {number} seed @param {Omit<import('./wood-geo.js').DriftOpts, 'top'>} o
 */
function growWood(rng, seed, o){
  const { geometry, obstacles }=growDriftwood(rng, seed, { ...o, top:TOP });
  return { object:castAll(new THREE.Mesh(geometry, woodMat())), obstacles };
}

/** 红沉木枝（杜鹃根）：细、三级分叉，主枝斜伸 17°~31°（"躺着伸出去"，不是立着）；局部长度约 1。
 *  S 形弯、枝头收成细尖，末梢常挂一两根发丝细枝，少数侧杈是折断的短桩 */
export function buildBranchWood(/** @type {any} */ rng, /** @type {number} */ seed){
  return growWood(rng, seed, { tint:{ base:0x5c3324, dark:0x1c0d07, light:0x8a6a58 },   // 栗红褐，朝上的棱面泡得发灰发浅
    r0:0.042, len:[0.85,1.05], elev:[0.3,0.55], depth:2, spread:[0.45,0.62], kids:[0,3,4],
    curl:0.24, tipK:0.1, brk:0.18, stub:[0.22,0.42], twigs:0.55, zMax:0.34, mainEnd:'tip', mainStart:'break', rootFlare:0.45,
    density:2.6, oval:0.2, ridgeK:0.09, cracks:0, knots:1, bark:0 });
}

/** 灰沉木枝（id 沿用 logWood）：水泡褪色的灰褐漂木粗枝，一头扎沙一头斜搭起来，几根交错成一堆。
 *  比红沉木枝略粗、略直，两级分杈，不少侧杈折断成参差的短桩，主枝末端是断口；纵向裂缝、树瘤，偶尔残留一小片树皮。
 *  基部半径 0.045（缩放 1.7 时直径约 4 cm，往上收细）：造景沉木是枝，不是原木 */
export function buildLogWood(/** @type {any} */ rng, /** @type {number} */ seed){
  return growWood(rng, seed, { tint:{ base:0x72675d, dark:0x221c17, light:0xb0a79c },   // 灰褐，朝上的棱面泡得发白
    r0:0.045, len:[1.15,1.4], elev:[0.3,0.72], depth:2, spread:[0.32,0.5], kids:[0,2,3],   // 仰角 17°~41°：陡的几根撑起木堆的高处
    curl:0.18, tipK:0.14, brk:0.4, stub:[0.25,0.55], twigs:0.35, up:0.35, zMax:0.3, mainEnd:'break', mainStart:'break', rootFlare:0.3,
    density:2.6, oval:0.18, ridgeK:0.09, cracks:1, knots:2, bark:0.15 });
}

// 照片贴图（public/tex/，CC0）：层岩 = Poly Haven marble_cliff_04，苔藓 = ambientCG Moss002
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
  injectSurfaceTex(m, { name:'m_moss', scale:5.5, k:1.6, gain:2.1, key:'moss', world:true });   // 原作的苔是亮黄绿
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

/** 苔石：2~3 块浅色柱状层岩逐级叠起（基准半径 0.2），每块顶面削平成台、侧面有竖向裂隙与横向层阶，
 * 台面与缓坡长满苔藓垫、陡壁露出浅色岩面 */
export function buildMossRock(/** @type {any} */ rng, /** @type {number} */ seed){
  const r=0.2, group=new THREE.Group(), o=(seed%389)*0.61;
  const deep=new THREE.Color(0x2c4a1e), tc=new THREE.Color();
  /** @type {{c:THREE.Vector3, r:number}[]} */ const obstacles=[];
  /** @type {{p:THREE.Vector3, n:THREE.Vector3, w:number}[]} */ const pick=[];
  const tiers=2+(rng()<0.5 ? 1 : 0);
  let base=-r*0.04, w=1, ox=0, oz=0;
  for(let b=0;b<tiers;b++){
    const g=makeRockGeo(r, seed+53+b*17, 'pale');
    // 柱状：原作的石头是一根根竖长的石柱并起来、再逐级叠高，高宽比接近 2
    const sx=rrange(rng,0.95,1.2)*w, sy=rrange(rng,1.9,2.5)*w, sz=rrange(rng,0.8,1.0)*w;
    g.scale(sx, sy, sz);
    // 竖向裂隙：绕竖轴等分出几道深浅不一的竖槽，槽线随高度轻微摆动，岩面像几根石柱挤在一起
    {
      const p=g.attributes.position, nG=4+Math.floor(rng()*4), gph=rng()*6.283;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
        const th=Math.atan2(z/sz, x/sx)+(vnoise(y*5+o, b*3.1)-0.5)*0.7;
        const gv=Math.pow(0.5+0.5*Math.cos(th*nG+gph), 10)*(0.5+vnoise(th*1.7+o, b*2.3));
        const dk=1-0.13*gv;
        p.setX(i, x*dk); p.setZ(i, z*dk);
      }
    }
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
    tuft.setColorAt(k, col.setRGB(rrange(pr,0.85,1.12), rrange(pr,0.92,1.12), rrange(pr,0.55,0.8)));
  }
  if(tuft.instanceColor) tuft.instanceColor.needsUpdate=true;
  group.add(tuft);
  castAll(group);
  return { object:group, obstacles };
}
