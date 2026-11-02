// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, rrange, vnoise, vnoise3, sstep, clamp } from '../../utils.js';

/* ================================================================
 * 沉木几何（纯几何，Node 可测）：漂木 / 杜鹃根 / 灰沉木枝的真实形态
 *  - 截面不是圆：扁圆 + 三瓣起伏，扁的朝向沿枝长慢慢转；顺纹的窄沟宽棱随木纹扭转；
 *    粗木有长裂缝、带凹心的树瘤；沿枝长有鼓胀和收腰，不是均匀的锥管
 *  - 枝条按"持续转向"生长（弯矩缓变 → S 形弯），分叉处母枝鼓起、子枝根部外扩，像长在一起而不是插进去
 *  - 末端：细枝收成圆钝的小尖；断枝和主枝断头是参差的劈裂面（纤维长短不齐，断口浅色）
 *  - UV：u 绕枝一周取整数圈贴图，v 按弧长 → 照片木纹顺着枝条走、细枝上自然收拢；
 *    aBark = 树皮覆盖（残留的树皮片，比木质高出一层）
 *  - 管道模型：每分一次杈，母枝往后按截面积守恒收细一截
 * ================================================================ */

const _p=new THREE.Vector3(), _r=new THREE.Vector3(), _c=new THREE.Color();
const TAU=Math.PI*2;
/** 两角之差（0..π） @param {number} a @param {number} b */
const angDist=(a,b)=>{ const d=Math.abs(((a-b)%TAU+TAU)%TAU); return d>Math.PI ? TAU-d : d; };

/** 色调：底色 / 沟里的暗色 / 被水泡浅的亮色 @typedef {{ base:number, dark:number, light:number }} WoodTint */
/** 分叉处母枝鼓起：位置 t、鼓起比例 r、宽度 w（局部单位） @typedef {{ t:number, r:number, w:number }} Fork */
/**
 * @typedef {Object} TubeOpts
 * @property {number} segs @property {number} radial @property {number} seed
 * @property {WoodTint} tint
 * @property {number} [density] 每单位长度的贴图平铺次数（绕一周取整数圈）
 * @property {number} [oval] 截面扁度 @property {number} [ridges] 顺纹沟数 @property {number} [ridgeK] 沟深
 * @property {number} [cracks] 长裂缝条数 @property {number} [knots] 树瘤个数 @property {number} [bark] 树皮覆盖 0..1
 * @property {'tip'|'break'|'none'} [end] 末端：收尖 / 劈裂断口 / 敞口（埋进沙里）
 * @property {'break'|'none'} [start] 起点：劈裂断口 / 敞口（埋在母枝或沙里）
 * @property {Fork[]} [forks] @property {number} [flare] 起点外扩（子枝根部、扎沙的根）
 * @property {number} [flareAt] 外扩鼓起处距起点的弧长（子枝从母枝轴心长出：鼓在出母枝表面的地方）
 * @property {number} [pinch] 起点收细（子枝埋在母枝里的一段收细，敞口不会从母枝表面露出来）
 */

/**
 * 一段木枝：沿曲线扫掠的不规则截面 + 两头的端面；返回带 position/normal/uv/color/aBark 的索引几何
 * @param {THREE.Curve<THREE.Vector3>} curve 按弧长取点（getPointAt） @param {(t:number)=>number} radius 基础半径
 * @param {TubeOpts} o
 */
export function woodTube(curve, radius, o){
  const { segs, radial, seed, tint, density=2.4, oval=0.16, ridges=6, ridgeK=0.06, cracks=0, knots=1, bark=0,
    end='tip', start='none', forks=[], flare=0, flareAt=0, pinch=0 }=o;
  const len=curve.getLength();
  const fr=curve.computeFrenetFrames(segs, false);
  const rng=makeRng(seed*13+7), so=(seed%613)*0.731;
  const wraps=Math.max(1, Math.round(TAU*radius(0.35)*density));
  const kn=Array.from({ length:knots }, ()=>({ t:rrange(rng,0.15,0.85), a:rng()*TAU, s:rrange(rng,0.5,1) }));
  const cr=Array.from({ length:cracks }, ()=>({ a:rng()*TAU, t0:rrange(rng,0.02,0.3), t1:rrange(rng,0.6,0.98), w:rrange(rng,0.05,0.09), d:rrange(rng,0.1,0.17) }));
  // 劈裂断口：纤维长短不齐（少数长纤维戳出来）
  const splinter=(/** @type {number} */ j, /** @type {number} */ R)=>R*0.55*Math.pow(vnoise(j*0.83+so, so*1.7), 3)+R*0.08*vnoise(j*2.7, so);
  const W=radial+1;
  /** @type {number[][]} */ const [pos, uv, col, bk, idx]=[[], [], [], [], []];
  const cb=new THREE.Color(tint.base), cd=new THREE.Color(tint.dark), cl=new THREE.Color(tint.light);
  cb.lerp(cl, rng()*0.3);                                          // 每根枝风化程度不同：有的发灰发浅
  const ringR=new Float32Array(segs+1);
  const r0=radius(0);
  for(let i=0;i<=segs;i++){
    const t=i/segs, s=t*len;
    const C=curve.getPointAt(t), N=fr.normals[i], B=fr.binormals[i], T=fr.tangents[i];
    let R=radius(t)*(1+(vnoise(s*2.3+so, so*0.7)-0.5)*0.2);       // 沿枝长的鼓胀与收腰
    for(const f of forks) R*=1+f.r*Math.exp(-((((t-f.t)*len)/f.w)**2));
    if(flare) R*=1+flare*Math.exp(-(((s-flareAt)/(r0*2.2))**2));
    if(pinch) R*=1-pinch*(1-sstep(0, flareAt || r0, s));
    ringR[i]=R;
    const phi=vnoise(s*0.9+so, 4.2)*TAU;                         // 扁圆的朝向沿枝缓慢旋转
    const tw=s*2.2+vnoise(s*1.4, so+9)*1.5;                       // 沟棱随木纹扭转
    for(let j=0;j<=radial;j++){
      const a=j/radial*TAU;
      let k=1+oval*Math.cos(2*(a-phi))+oval*0.35*Math.cos(3*a+phi*1.3);
      // 顺纹窄沟宽棱：被水磨圆的纤维束
      const g=Math.pow(0.5+0.5*Math.cos(a*ridges+tw+(vnoise(s*3+so, a*1.3)-0.5)*1.6), 3);
      k-=ridgeK*g;
      let dark=g*0.55;
      for(const c of cr){
        const v=Math.exp(-((angDist(a, c.a+t*0.8)/c.w)**2))*sstep(c.t0, c.t0+0.08, t)*(1-sstep(c.t1-0.08, c.t1, t));
        k-=c.d*v; dark=Math.max(dark, v);
      }
      for(const q of kn){
        const dt=(t-q.t)*len/(R*2.4), da=angDist(a, q.a)/0.5, d2=dt*dt+da*da;
        k+=0.22*q.s*Math.exp(-d2*2.5)-0.14*q.s*Math.exp(-d2*20);   // 树瘤鼓包，中心一个凹坑
        dark=Math.max(dark, Math.exp(-d2*20)*0.8);
      }
      k+=(vnoise3(s*14+so, Math.cos(a)*2, Math.sin(a)*2)-0.5)*0.05;
      let b=0;
      if(bark>0){                                                  // 树皮成片：比木质高一层，剥落处是台阶
        const n=vnoise3(s*1.6+so, Math.cos(a)*1.2, Math.sin(a)*1.2+so);
        b=sstep(0.66-bark*0.32, 0.72-bark*0.32, n); k+=0.05*b;
      }
      _r.set(0,0,0).addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a));
      _p.copy(C).addScaledVector(_r, R*k);
      const jj=j%radial;
      if(i===segs && end==='break') _p.addScaledVector(T, splinter(jj, R));
      if(i===0 && start==='break') _p.addScaledVector(T, -splinter(jj+57, R));
      pos.push(_p.x, _p.y, _p.z);
      uv.push(j/radial*wraps, s*density);
      // 颜色：底色斑驳 → 沟、裂缝、树瘤压暗 → 朝上的棱面泡浅 → 贴沙的一段湿暗
      _c.copy(cb).lerp(cl, Math.max(0, vnoise3(s*0.8+so, a*0.4, 2.0)-0.45)*0.9);
      _c.lerp(cd, Math.min(1, dark));
      _c.lerp(cl, Math.max(0, _r.y)*0.22*(1-g));
      if(_p.y<0.05) _c.lerp(cd, Math.min(0.8, (0.05-_p.y)*10));
      col.push(_c.r, _c.g, _c.b);
      bk.push(b);
    }
  }
  for(let i=0;i<segs;i++) for(let j=0;j<radial;j++){
    const a=i*W+j, b=(i+1)*W+j, c=(i+1)*W+j+1, d=i*W+j+1;
    idx.push(a,d,b, d,c,b);                                        // (∂角 × ∂长) 朝外
  }
  const side=new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  side.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  side.setAttribute('aBark', new THREE.Float32BufferAttribute(bk,1));
  side.setIndex(idx);
  side.computeVertexNormals();
  const nrm=side.attributes.normal;                                // 接缝两列法线取平均，避免一道竖向明暗缝
  for(let i=0;i<=segs;i++){
    const a=i*W, b=i*W+radial;
    _r.set(nrm.getX(a)+nrm.getX(b), nrm.getY(a)+nrm.getY(b), nrm.getZ(a)+nrm.getZ(b)).normalize();
    nrm.setXYZ(a, _r.x, _r.y, _r.z); nrm.setXYZ(b, _r.x, _r.y, _r.z);
  }
  const parts=[side];
  if(end!=='none') parts.push(endCap(pos, segs*W, radial, curve.getPointAt(1), fr.tangents[segs], fr.normals[segs], fr.binormals[segs], ringR[segs], end, false, tint, density, so));
  if(start!=='none') parts.push(endCap(pos, 0, radial, curve.getPointAt(0), fr.tangents[0].clone().negate(), fr.normals[0], fr.binormals[0], ringR[0], start, true, tint, density, so+3));
  const g=parts.length>1 ? mergeGeometries(parts, false) : side;
  if(!g) throw new Error('woodTube: merge failed');
  return g;
}

/**
 * 端面（独立顶点，和侧面之间是硬边）：tip = 圆钝小尖；break = 劈裂断口（外圈接侧面、内圈凹进去，断口浅色、中心偏暗）
 * @param {number[]} pos @param {number} o0 端面那一圈在 pos 中的起始顶点 @param {number} radial
 * @param {THREE.Vector3} C @param {THREE.Vector3} T 朝外的切向 @param {THREE.Vector3} N @param {THREE.Vector3} B
 * @param {number} R @param {'tip'|'break'} kind @param {boolean} flip 起点端面（圈的绕向相对朝外切向是反的）
 * @param {WoodTint} tint @param {number} density @param {number} so
 */
function endCap(pos, o0, radial, C, T, N, B, R, kind, flip, tint, density, so){
  /** @type {number[][]} */ const [p, uv, col, idx]=[[], [], [], []];
  const cd=new THREE.Color(tint.dark), cl=new THREE.Color(tint.light), cb=new THREE.Color(tint.base);
  const push=(/** @type {THREE.Vector3} */ v, /** @type {THREE.Color} */ c)=>{
    p.push(v.x, v.y, v.z);
    _r.subVectors(v, C);
    uv.push(_r.dot(N)*density, _r.dot(B)*density);
    col.push(c.r, c.g, c.b);
    return p.length/3-1;
  };
  const ring=[];
  for(let j=0;j<radial;j++) ring.push(push(_p.set(pos[(o0+j)*3], pos[(o0+j)*3+1], pos[(o0+j)*3+2]), kind==='tip' ? cb : _c.copy(cb).lerp(cl, 0.35)));
  const tri=(/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ c)=>{ if(flip) idx.push(b,a,c); else idx.push(a,b,c); };
  if(kind==='tip'){
    const apex=push(_p.copy(C).addScaledVector(T, R*0.9), cb);
    for(let j=0;j<radial;j++) tri(ring[j], ring[(j+1)%radial], apex);
  } else {
    // 内圈：半径一半、沿切向参差；中心凹进去（朽心）
    const inner=[];
    for(let j=0;j<radial;j++){
      const a=j/radial*TAU, jag=(vnoise(j*1.37+so, so*2.1)-0.4)*R*0.45;
      _p.copy(C).addScaledVector(N, Math.cos(a)*R*0.5).addScaledVector(B, Math.sin(a)*R*0.5).addScaledVector(T, jag);
      inner.push(push(_p, _c.copy(cl).lerp(cb, 0.3)));
    }
    const ctr=push(_p.copy(C).addScaledVector(T, -R*0.25), _c.copy(cd).lerp(cb, 0.3));
    for(let j=0;j<radial;j++){
      const j1=(j+1)%radial;
      tri(ring[j], ring[j1], inner[j]); tri(ring[j1], inner[j1], inner[j]);
      tri(inner[j], inner[j1], ctr);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('aBark', new THREE.Float32BufferAttribute(new Float32Array(p.length/3),1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 一根枝条的中心线：方向按"缓变的弯矩"转向（上一步的转向衰减着带到下一步 → S 形弯而不是折线）
 * 高处自动平伸 / 下垂（不出水面），侧枝不往沙里钻
 * @param {()=>number} rng @param {THREE.Vector3} start @param {THREE.Vector3} dir @param {number} len
 * @param {{ curl:number, top:number, step?:number, ground?:boolean }} o ground：允许贴沙（主枝起点埋在沙里）
 */
export function branchCurve(rng, start, dir, len, { curl, top, step=0.09, ground=false }){
  const n=Math.max(4, Math.round(len/step));
  const pts=[start.clone()], d=dir.clone().normalize(), w=new THREE.Vector3();
  const cs=curl*Math.pow(len/n/0.09, 0.8);                        // 按每步长度折算：细枝步子密，不然弯成钩
  for(let k=1;k<=n;k++){
    w.x+=rrange(rng,-1,1)*cs; w.y+=rrange(rng,-0.7,0.6)*cs; w.z+=rrange(rng,-1,1)*cs;
    w.multiplyScalar(0.72);
    d.add(w).normalize();
    if(d.y>0.8){ d.y=0.8; d.normalize(); }                       // 不长成竖直的细杆
    const prev=pts[k-1];
    if(prev.y>top-0.1 && d.y>-0.05){ d.y=-0.05-rng()*0.2; d.normalize(); w.y=Math.min(w.y,0); }
    const sl=len/n;
    if(!ground && prev.y+d.y*sl<0.05){ d.y=Math.max(d.y, Math.min(0.6, (0.05-prev.y)/sl)); d.normalize(); w.y=Math.max(w.y,0); }
    pts.push(prev.clone().addScaledVector(d, sl));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/**
 * @typedef {Object} TreeOpts
 * @property {WoodTint} tint
 * @property {[number,number]} spread 侧枝长 / 母枝长
 * @property {number[]} kids 每级侧枝数（下标 = 剩余级数；实际取它或少一根）
 * @property {number} curl 弯曲度 @property {number} top 局部高度上限
 * @property {number} tipK 收尖枝末端半径 / 起点半径 @property {number} brk 侧枝折断概率
 * @property {[number,number]} stub 折断的侧枝保留的长度比例
 * @property {number} [twigs] 末梢细枝簇的概率（杜鹃根那种发丝细枝）
 * @property {number} [up] 侧枝朝上偏的程度（默认 0.8；堆成一堆的粗枝取小值，侧杈多往两边伸、少朝天）
 * @property {number} density @property {number} oval @property {number} ridgeK
 * 以下只用于主枝（growDriftwood）：
 * @property {number} [r0] 主枝起点半径 @property {[number,number]} [len] 主枝长度 @property {[number,number]} [elev] 主枝仰角
 * @property {number} [depth] 分叉级数
 * @property {'break'|'tip'} [mainEnd] @property {'break'|'none'} [mainStart] @property {number} [rootFlare]
 * @property {number} [cracks] @property {number} [knots] @property {number} [bark]
 */

/**
 * 长一根枝及其逐级侧枝，几何推进 geos；返回这根枝的中心线
 * @param {()=>number} rng @param {number} seed @param {TreeOpts} o @param {THREE.BufferGeometry[]} geos
 * @param {THREE.Vector3} start @param {THREE.Vector3} dir @param {number} len @param {number} r0 @param {number} depth
 * @param {boolean} main 主枝（起点扎沙、不会折断）
 * @param {number} exit 侧枝：从母枝轴心长出，穿出母枝表面处距起点的弧长（颈圈鼓在这里，之前收细埋着）
 */
export function growLimb(rng, seed, o, geos, start, dir, len, r0, depth, main, exit){
  const broken=!main && rng()<o.brk;
  if(broken){ len*=rrange(rng,o.stub[0],o.stub[1]); depth=0; }
  const curve=branchCurve(rng, start, dir, len, { curl:main ? o.curl*0.7 : o.curl, top:o.top, ground:main, step:clamp(r0*3, 0.04, 0.11) });
  const end=main ? (o.mainEnd ?? 'tip') : broken ? 'break' : 'tip';
  const tipK=end==='tip' ? o.tipK : rrange(rng,0.5,0.7);
  // 管道模型：每分出一根侧枝，母枝往后按截面积守恒收细一截（真实枝条是分一次细一次，不是一根均匀的锥）
  /** @type {{ t:number, f:number }[]} */ const steps=[];
  const rad=(/** @type {number} */ t)=>{
    let r=r0*(1-(1-tipK)*Math.pow(t, 0.85));
    for(const s of steps) r*=1-(1-s.f)*sstep(s.t, s.t+0.06, t);
    return r;
  };
  /** @type {Fork[]} */ const forks=[];
  /** @type {[THREE.Vector3, THREE.Vector3, number, number, number, number][]} */ const kids=[];
  const nk=depth>0 ? Math.max(1, (o.kids[depth] ?? 2)-Math.floor(rng()*2)) : (end==='tip' && rng()<(o.twigs ?? 0) ? 1+Math.floor(rng()*2) : 0);
  const twig=depth===0;
  const ts=Array.from({ length:nk }, ()=>twig ? rrange(rng,0.55,0.85) : rrange(rng,0.25,0.9)).sort((a,b)=>a-b);
  for(const t of ts){
    const p=curve.getPointAt(t), tan=curve.getTangentAt(t);
    const side=new THREE.Vector3(rrange(rng,-1,1), rrange(rng,-0.15,o.up ?? 0.8), rrange(rng,-1,1));
    side.addScaledVector(tan, -side.dot(tan)).normalize();
    const ang=rrange(rng,0.35,0.9);
    const cdir=tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
    if(cdir.y<-0.25){ cdir.y=-cdir.y*0.5; cdir.normalize(); }
    const rp=rad(t), rc=Math.max(0.003, rp*(twig ? rrange(rng,0.4,0.55) : rrange(rng,0.5,0.7)));
    const lc=twig ? len*rrange(rng,0.14,0.28) : len*(1-t*0.45)*rrange(rng,o.spread[0],o.spread[1]);
    forks.push(forkOf(t, rc, rp));
    steps.push({ t, f:Math.sqrt(1-0.6*Math.min(1, rc/rp)**2) });   // 细枝 rc 有下限，可能超过母枝半径
    kids.push([p, cdir, lc, rc, twig ? 0 : depth-1, exitOf(rp, ang)]);
  }
  const radial=clamp(Math.round(r0*260)+4, 5, 16);
  const segs=clamp(Math.round(len*34+4), 5, 46);
  geos.push(woodTube(curve, rad, { segs, radial, seed:seed+geos.length*31, tint:o.tint, density:o.density,
    oval:o.oval, ridges:Math.max(2, Math.floor(radial/3)), ridgeK:o.ridgeK*Math.min(1, radial/9),
    cracks:main ? (o.cracks ?? 0) : 0, knots:main ? (o.knots ?? 1) : (r0>0.02 && rng()<0.4 ? 1 : 0), bark:r0>0.03 ? (o.bark ?? 0) : 0,
    end, start:main ? (o.mainStart ?? 'none') : 'none', forks,
    flare:main ? (o.rootFlare ?? 0) : 0.3, flareAt:exit, pinch:main ? 0 : 0.45 }));
  for(const k of kids) growLimb(rng, seed, o, geos, k[0], k[1], k[2], k[3], k[4], false, k[5]);
  return curve;
}

/** 母枝在分叉处的鼓起 @param {number} t 分叉位置 @param {number} rc 子枝半径 @param {number} rp 母枝在该处的半径 @returns {Fork} */
export const forkOf=(t, rc, rp)=>({ t, r:0.08+0.12*rc/rp, w:rc*2.6 });
/** 子枝穿出母枝表面处距起点的弧长 @param {number} rp 母枝半径 @param {number} ang 子枝与母枝的夹角 */
export const exitOf=(rp, ang)=>Math.min(rp/Math.max(0.3, Math.sin(ang)), rp*2.5)*0.85;

/** @typedef {TreeOpts & { r0:number, len:[number,number], elev:[number,number], depth:number }} DriftOpts */

/**
 * 长一棵沉木：主枝从 (-0.42,-0.04) 斜向 +x 上方伸出，逐级分叉；所有枝合成一个几何
 * @param {()=>number} rng @param {number} seed @param {DriftOpts} o
 * @returns {{ geometry:THREE.BufferGeometry, obstacles:{c:THREE.Vector3, r:number}[], tubes:number }}
 */
export function growDriftwood(rng, seed, o){
  /** @type {THREE.BufferGeometry[]} */ const geos=[];
  const elev=rrange(rng,o.elev[0],o.elev[1]);
  const start=new THREE.Vector3(-0.42,-0.04,rrange(rng,-0.05,0.05)), dir=new THREE.Vector3(Math.cos(elev),Math.sin(elev),rrange(rng,-0.15,0.15));
  const curve=growLimb(rng, seed, o, geos, start, dir, rrange(rng,o.len[0],o.len[1]), o.r0, o.depth, true, 0);
  const obstacles=[0.3,0.65].map(t=>({ c:curve.getPointAt(t), r:o.r0*2.4+0.04 }));
  const geometry=mergeGeometries(geos, false);
  if(!geometry) throw new Error('growDriftwood: merge failed');
  for(const g of geos) g.dispose();
  return { geometry, obstacles, tubes:geos.length };
}
