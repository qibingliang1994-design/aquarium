// @ts-check
import * as THREE from 'three';
import { rrange, vnoise } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, injectSurfaceDetail } from './common.js';
import { injectSurfaceTex } from './surface-tex.js';

/* ================================================================
 * 化妆砂：ADA 岩组缸里在深色水草泥上铺出的一条浅色细砂（小径 / 河道的意象）
 * 一片不规则的长椭圆薄层，中间微微隆起、边缘压进水草泥。
 * 网格是极坐标环带（有内部顶点），摆放后由 scene-runtime 调 onGround 按沙面起伏贴合
 * ================================================================ */

const RINGS=6, SEG=48;
const sandMat=()=>shared('mat:sandPath', ()=>{
  const m=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.96, metalness:0 });
  injectCaustics(m, 0.5, 'sandpath');
  injectSurfaceDetail(m, { freq:70, k:0.2, ao:0.1, key:'sandpathdet' });
  // 白沙照片（世界坐标三平面）：一粒粒细砂与碎贝，取代原来平涂的一整片浅色
  injectSurfaceTex(m, { name:'s_white', scale:3.2, k:1.3, gain:1.3, key:'sandpathtex', world:true });
  return m;
});

/** @param {any} rng @param {number} seed */
export function buildSandPath(rng, seed){
  const a=0.55, b=rrange(rng,0.2,0.27), o=seed%97;
  /** @type {number[]} */ const pos=[];
  /** @type {number[]} */ const col=[];
  /** @type {number[]} */ const base=[];
  /** @type {number[]} */ const idx=[];
  const c=new THREE.Color(), lo=new THREE.Color(0xb3a892), hi=new THREE.Color(0xd4cbb8);
  const push=(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ t)=>{
    const y=0.014*(1-Math.pow(t,3)) - 0.006*Math.pow(t,6);   // 中间隆起，边缘压进底床
    pos.push(x, y, z); base.push(y);
    c.copy(lo).lerp(hi, vnoise(x*9+o, z*9)).multiplyScalar(0.93+0.1*vnoise(x*40, z*40+o));
    col.push(c.r, c.g, c.b);
  };
  push(0, 0, 0);
  for(let i=1;i<=RINGS;i++){
    const t=i/RINGS;
    for(let j=0;j<SEG;j++){
      const th=j/SEG*Math.PI*2;
      const wob=1+0.2*(vnoise(Math.cos(th)*1.6+o, Math.sin(th)*1.6)-0.5)*2;   // 不规则的岸线：沙流随意地收放
      push(Math.cos(th)*a*t*wob, Math.sin(th)*b*t*wob, t);
    }
  }
  for(let j=0;j<SEG;j++) idx.push(0, 1+(j+1)%SEG, 1+j);
  for(let i=1;i<RINGS;i++){
    const r0=1+(i-1)*SEG, r1=1+i*SEG;
    for(let j=0;j<SEG;j++){
      const j1=(j+1)%SEG;
      idx.push(r0+j, r0+j1, r1+j, r0+j1, r1+j1, r1+j);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo, sandMat());
  mesh.receiveShadow=true;
  /** 摆放后贴合沙面：h(lx, lz) = 该局部点处的沙面相对物件原点的高度（物件局部单位） */
  mesh.userData.onGround=(/** @type {(x:number,z:number)=>number} */ h)=>{
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++) p.setY(i, base[i]+h(p.getX(i), p.getZ(i)));
    p.needsUpdate=true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  return { object:mesh, obstacles:[] };
}
