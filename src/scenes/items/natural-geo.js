// @ts-check
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, rrange, fbm3, vnoise3 } from '../../utils.js';

/* ================================================================
 * 写实自然物几何：岩石（断裂面 + 分形起伏 + 层理/石英脉 + 凹处积暗 + 顶面苔藓）
 * 与沉木枝干（渐细管 + 树皮纵纹 + 节疤 + 风化褪色）
 * ================================================================ */

const _v=new THREE.Vector3(), _n=new THREE.Vector3(), _c=new THREE.Color(), _t=new THREE.Color();

/** 岩石调色板：底色 / 暗部 / 层理线 / 苔藓 */
export const ROCK_LOOKS={
  river:  { base:0x7d7468, dark:0x423d36, vein:0x9a9184, moss:0x4d6438, cuts:6, strata:0.25, groove:0 },
  seiryu: { base:0x878b8a, dark:0x3e4442, vein:0xd9dcd6, moss:0x56693c, cuts:9, strata:0.6, groove:1 },
  live:   { base:0xb3a58e, dark:0x6b5e4d, vein:0xc9a7b0, moss:0x7a5d8a, cuts:5, strata:0.1, groove:0 },   // 海水活石：浅色多孔、带珊瑚藻紫斑
};

/**
 * @param {number} r 基准半径 @param {number} seed @param {keyof typeof ROCK_LOOKS} look
 * 底面恒有一刀水平切面（坐在沙上），其余断裂面随机朝向
 */
export function makeRockGeo(r, seed, look='river'){
  const L=ROCK_LOOKS[look], rng=makeRng(seed*7+3), o=(seed%997)*0.37;
  let g=new THREE.IcosahedronGeometry(r,4);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g=/** @type {THREE.IcosahedronGeometry} */ (mergeVertices(g));      // 共享顶点 → 平滑法线、位移无裂缝
  const cuts=[{ n:new THREE.Vector3(0,-1,0), d:r*0.32 }];
  for(let i=0;i<L.cuts;i++){
    const n=new THREE.Vector3(rng()*2-1, rng()*1.4-0.35, rng()*2-1).normalize();
    cuts.push({ n, d:r*rrange(rng,0.55,0.86) });
  }
  const p=g.attributes.position, cav=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){
    _v.fromBufferAttribute(p,i).normalize();
    // 大形：低频分形起伏
    const rad=r*(1+(fbm3(_v.x*1.6+o,_v.y*1.6,_v.z*1.6-o,3)-0.5)*0.6);
    _v.multiplyScalar(rad);
    // 断裂面：越过平面的部分压回平面（留一点余量，边缘不至于太锐）
    for(const c of cuts){ const ex=_v.dot(c.n)-c.d; if(ex>0) _v.addScaledVector(c.n, -ex*0.93); }
    // 细节：小坑与风化纹；青龙石加竖向沟槽
    _n.copy(_v).normalize();
    const pit=fbm3(_v.x*9/r*0.2+o, _v.y*9/r*0.2, _v.z*9/r*0.2, 3);
    let disp=(pit-0.5)*r*0.09;
    if(L.groove){ const gr=Math.abs(Math.sin((Math.atan2(_v.z,_v.x)*7+fbm3(_v.x*3,_v.y*1.2,_v.z*3,2)*6))); disp-=Math.pow(gr,6)*r*0.06; }
    _v.addScaledVector(_n, disp);
    cav[i]=pit;
    p.setXYZ(i,_v.x,_v.y*0.82,_v.z);
  }
  g.computeVertexNormals();
  const nrm=g.attributes.normal, col=new Float32Array(p.count*3);
  const base=new THREE.Color(L.base), dark=new THREE.Color(L.dark), vein=new THREE.Color(L.vein), moss=new THREE.Color(L.moss);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    // 底色斑驳 + 凹处积暗（细节噪声低处更暗）
    _c.copy(base).lerp(dark, Math.min(1, fbm3(x*4/r*0.2+o,y*4/r*0.2,z*4/r*0.2,3)*0.7+(0.5-cav[i])*1.4));
    // 层理 / 石英细脉：沿近水平方向的细线
    if(L.strata){
      const band=Math.abs(Math.sin((y*38/r*0.2+fbm3(x*2,y*2,z*2+o,2)*4)));
      _c.lerp(vein, Math.pow(1-band, 14)*L.strata);
    }
    // 顶面苔藓 / 珊瑚藻斑
    const up=nrm.getY(i);
    if(up>0.5) _c.lerp(moss, Math.min(1,(up-0.5)*2.2)*Math.max(0, vnoise3(x*14+o,y*14,z*14)*1.4-0.45));
    col[i*3]=_c.r; col[i*3+1]=_c.g; col[i*3+2]=_c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  return g;
}

/**
 * 渐细树枝管：radius(t) 给出沿长度的半径；树皮 = 纵向沟纹 + 节疤 + 上部风化变浅
 * @param {THREE.Curve<THREE.Vector3>} curve @param {(t:number)=>number} radius
 */
export function barkTube(curve, radius, { segs=48, radial=12, seed=1, grooves=7, cBark=0x5d412c, cDark=0x2a1c12, cBleach=0x9c8c78 }={}){
  const g=new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p=g.attributes.position, col=new Float32Array(p.count*3), o=(seed%311)*0.71;
  const cb=new THREE.Color(cBark), cd=new THREE.Color(cDark), cw=new THREE.Color(cBleach);
  const knot=[rrange(makeRng(seed),0.2,0.8), rrange(makeRng(seed+1),0.2,0.8)];
  for(let i=0;i<=segs;i++){
    const t=i/segs, ctr=curve.getPointAt(t);
    for(let j=0;j<=radial;j++){
      const idx=i*(radial+1)+j, a=j/radial*Math.PI*2;
      _v.fromBufferAttribute(p,idx).sub(ctr);                       // 单位半径的径向
      const groove=Math.pow(Math.abs(Math.sin(a*grooves*0.5+vnoise3(t*6+o,ctr.y*3,0)*3)), 3);
      const k=knot.reduce((m,kt)=>Math.max(m, Math.exp(-((t-kt)**2)/0.0016)*Math.max(0,Math.cos(a-kt*9))), 0);
      const rr=radius(t)*(1-groove*0.12+k*0.35+(vnoise3(t*20+o,a,o)-0.5)*0.1);
      p.setXYZ(idx, ctr.x+_v.x*rr, ctr.y+_v.y*rr, ctr.z+_v.z*rr);
      _c.copy(cb).lerp(cd, groove*0.75+k*0.3);
      _c.lerp(_t.copy(cw), Math.min(0.75, Math.max(0, ctr.y*0.9-0.15)+(vnoise3(t*8,a*0.5,o)-0.5)*0.4));   // 露出水面的高处被泡白
      col[idx*3]=_c.r; col[idx*3+1]=_c.g; col[idx*3+2]=_c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}
