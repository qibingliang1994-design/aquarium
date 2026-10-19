// @ts-check
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { rrange, fbm3, vnoise3 } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, castAll, injectSurfaceDetail } from './common.js';

/* ================================================================
 * 太湖石：园林叠石之首，讲究"瘦、皱、漏、透"——细高扭转、表面褶皱、孔洞相通。
 * 普通位移网格做不出贯穿的孔，这里用隐式场 + Marching Cubes：
 *   主体 = 沿一条扭动竖轴的变径截面（上大下小，腰部收细）；褶皱 = 分形噪声；
 *   孔洞 = 若干横穿主体的胶囊体从场里减掉。
 * 场坐标在 [-1,1]³（MarchingCubes 的网格空间），输出后整体缩放到物件尺寸。
 * ================================================================ */

const RES=46;                 // 网格分辨率：46³ 约 10 万格，单件构建几十毫秒
const HEIGHT=0.78;            // 未缩放时的高度（物件局部单位）
let _mc=/** @type {MarchingCubes|null} */ (null);
function mc(){
  // 一个共享实例反复用：它的缓冲区很大（按 maxPolyCount 预分配），结果拷出来再交给物件
  _mc ??= new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 60000);
  return _mc;
}

/** 隐式场：>0 在石头里。p 为 [-1,1]³ 坐标 @param {any} P */
function makeField(P){
  const { ph, holes, o }=P;
  return (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z)=>{
    const t=(y+0.92)/1.82;
    const cx=0.22*Math.sin(y*2.1+ph[0]), cz=0.14*Math.sin(y*1.7+ph[1]);
    const r=0.25+0.08*Math.sin(y*3.4+ph[2])+0.1*t;                       // 上大下小，腰部收细（"瘦"）
    const dx=x-cx, dz=(z-cz)/0.72;
    let d=r-Math.hypot(dx, dz);
    d+=(fbm3(x*2.6+o, y*2.2, z*2.6-o, 3)-0.5)*0.3;                       // 大褶皱（"皱"）
    d+=(vnoise3(x*9+o, y*7, z*9)-0.5)*0.05;
    d=Math.min(d, y+0.9, (0.9-y)*0.7);                                   // 底面平切（坐在沙上），顶部收圆
    for(const h of holes){                                               // 横穿的孔（"漏""透"）
      const qx=x-h.x, qy=y-h.y, qz=z-h.z;
      const k=Math.max(-h.len, Math.min(h.len, qx*h.dx+qy*h.dy+qz*h.dz));
      const ex=qx-h.dx*k, ey=qy-h.dy*k, ez=qz-h.dz*k;
      d=Math.min(d, Math.hypot(ex,ey,ez)-h.r);
    }
    return d;
  };
}

export function buildTaihu(/** @type {any} */ rng, /** @type {number} */ seed){
  const mat=shared('mat:taihu', ()=>{
    const m=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.86, metalness:0.02 });
    injectCaustics(m, 0.5, 'taihu');
    injectSurfaceDetail(m, { freq:20, k:0.4, ao:0.3, key:'taihudet' });
    return m;
  });
  const ph=[rng()*6.28, rng()*6.28, rng()*6.28];
  const holes=[];
  const nh=4+Math.floor(rng()*3);
  for(let i=0;i<nh;i++){
    const y=rrange(rng,-0.55,0.65), a=rng()*Math.PI*2, tilt=rrange(rng,-0.5,0.5);
    const dir=new THREE.Vector3(Math.cos(a), tilt, Math.sin(a)*0.6).normalize();
    holes.push({ x:0.22*Math.sin(y*2.1+ph[0])+rrange(rng,-0.08,0.08), y, z:rrange(rng,-0.06,0.06),   // 孔心贴着扭动的主轴
      dx:dir.x, dy:dir.y, dz:dir.z, len:rrange(rng,0.15,0.45), r:rrange(rng,0.06,0.12) });
  }
  const P={ ph, holes, o:(seed%613)*0.41 };
  const f=makeField(P);

  const m=mc(), half=RES/2;
  m.reset();
  for(let zi=0;zi<RES;zi++) for(let yi=0;yi<RES;yi++) for(let xi=0;xi<RES;xi++){
    const v=f((xi-half)/half, (yi-half)/half, (zi-half)/half);
    m.field[zi*RES*RES+yi*RES+xi]=80+Math.max(-60, Math.min(60, v*400));
  }
  m.update();
  const n=m.count;
  const src=m.geometry.attributes;
  const pos=new Float32Array(/** @type {Float32Array} */ (src.position.array).subarray(0, n*3));
  // 法线用解析场的梯度重算：MarchingCubes 按（被截断的）网格场差分求法线，场饱和处梯度为 0 → NaN 法线（底面一片花斑）
  const nrm=new Float32Array(n*3), e=0.01;
  for(let i=0;i<n;i++){
    const x=pos[i*3], y=pos[i*3+1], z=pos[i*3+2];
    let gx=f(x-e,y,z)-f(x+e,y,z), gy=f(x,y-e,z)-f(x,y+e,z), gz=f(x,y,z-e)-f(x,y,z+e);   // 场向内增大：负梯度朝外
    const l=Math.hypot(gx,gy,gz);
    if(l<1e-9){ gx=0; gy=1; gz=0; } else { gx/=l; gy/=l; gz/=l; }
    nrm[i*3]=gx; nrm[i*3+1]=gy; nrm[i*3+2]=gz;
  }

  // 顶点色：浅灰白石面，凹处/孔内积暗，底部带一点水绿
  const col=new Float32Array(n*3);
  const light=new THREE.Color(0xcac6ba), base=new THREE.Color(0x9c998f), dark=new THREE.Color(0x45433d), moss=new THREE.Color(0x5d6b4a);
  const c=new THREE.Color();
  for(let i=0;i<n;i++){
    const x=pos[i*3], y=pos[i*3+1], z=pos[i*3+2];
    const nx=nrm[i*3], ny=nrm[i*3+1], nz=nrm[i*3+2];
    // 沿法线外探：外面仍在石头里 = 处于凹处/孔内
    const cav=Math.max(0, Math.min(1, f(x+nx*0.09, y+ny*0.09, z+nz*0.09)*8+0.5));
    c.copy(base).lerp(light, fbm3(x*4+P.o, y*4, z*4, 2)*0.9);
    c.lerp(dark, cav*0.85);
    c.lerp(moss, Math.max(0, -y-0.6)*1.6*(0.6+0.4*ny));
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  const k=HEIGHT/1.82;
  g.scale(k,k,k);
  g.translate(0, 0.9*k-0.015, 0);                    // 底面略埋进沙里
  const mesh=castAll(new THREE.Mesh(g, mat));
  // 避障：沿扭动主轴放几颗球
  const obstacles=[-0.6,-0.1,0.4].map(y=>({ c:new THREE.Vector3(0.22*Math.sin(y*2.1+P.ph[0])*k, (y+0.9)*k, 0), r:0.13 }));
  return { object:mesh, obstacles };
}
