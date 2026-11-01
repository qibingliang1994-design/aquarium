// @ts-check
import * as THREE from 'three';
import { injectCaustics } from './caustics.js';

/* ================================================================
 * 沙面立体颗粒：在照片沙面上撒一层实例化小颗粒，打破"一张贴图"的平面感
 * 一次绘制（InstancedMesh，8 面八面体 + 平滑法线）。前沿（贴前玻璃、镜头最常看到的一带）加密，
 * 前沿最外一排压在侧裙顶边上，让沙面轮廓线也起伏；颗粒按优先级排序，画质降档时从后排先减。
 * 颗粒底部压暗（接触阴影），半埋进沙面；颜色取主题两色沙再逐粒抖动。
 * ================================================================ */

/** 每种底砂贴图对应的颗粒形态：r 半径区间，flat 纵向压扁，irr 不规则度，k 数量系数，jit 颜色抖动 */
const STYLES = {
  s_aquasoil:{ r:[0.0062,0.0088], flat:0.78, irr:0.1,  k:1,    jit:[0.52,1.12] },   // 水草泥：近乎等大的圆粒
  s_oiso:    { r:[0.006,0.0125],  flat:0.62, irr:0.35, k:0.8,  jit:[0.7,1.35] },   // 大磯砂：大小不一的扁圆碎石
  s_white:   { r:[0.0034,0.0055], flat:0.7,  irr:0.25, k:0.75, jit:[0.86,1.12] },  // 珊瑚白沙：细小碎粒
};
const BASE_N=13000, FRONT_N=7000;            // 全床均匀 + 前沿加密
const FRONT_BAND=0.34;                        // 前沿加密带深度（m）
const LOD=[1, 0.82, 0.64, 0.48, 0.34, 0.2, 0];   // 画质档 0..6 的保留比例，最低档不画

/**
 * @param {{ heightAt:(x:number,z:number)=>number, halfX:number, halfZ:number }} o
 */
export function createSandGrains({ heightAt, halfX, halfZ }){
  const N=BASE_N+FRONT_N;
  // 八面体（8 面）：颗粒只有 1~2 cm、又埋掉下三分之一，平滑法线下与二十面体看不出差别，三角形少 60%
  const geo=new THREE.OctahedronGeometry(1, 0);
  // 默认是非索引的平面法线：按位置合并后算平滑法线，小颗粒才显得圆润
  const pos=geo.attributes.position, uniq=/** @type {number[]} */ ([]), idx=/** @type {number[]} */ ([]);
  /** @type {Map<string, number>} */ const map=new Map();
  for(let i=0;i<pos.count;i++){
    const key=`${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j=map.get(key);
    if(j===undefined){ j=uniq.length/3; map.set(key,j); uniq.push(pos.getX(i),pos.getY(i),pos.getZ(i)); }
    idx.push(j);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(uniq,3));
  g.setIndex(idx);
  g.computeVertexNormals();
  geo.dispose();

  const mat=new THREE.MeshStandardMaterial({ roughness:0.82, metalness:0 });
  injectCaustics(mat, 0.38, 'grain');
  // 接触阴影：颗粒朝下的半边压暗，像半埋在沙里（接在焦散注入之后）
  const caustic=mat.onBeforeCompile;
  mat.onBeforeCompile=(/** @type {any} */ sh, /** @type {any} */ r)=>{
    caustic.call(mat, sh, r);
    sh.vertexShader='varying float vGrUp;\n'+sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGrUp = normal.y;`);
    sh.fragmentShader='varying float vGrUp;\n'+sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix( 0.38, 1.08, smoothstep( -0.55, 0.75, vGrUp ) );`);
  };
  mat.customProgramCacheKey=()=>'sandgrain';

  const mesh=new THREE.InstancedMesh(g, mat, N);
  mesh.receiveShadow=true; mesh.castShadow=false;
  mesh.frustumCulled=false;
  mesh.name='sandGrains';

  // 位置与优先级按固定种子生成一次（主题切换只改大小 / 颜色，不重新撒）
  let s=0x2f6b1d;
  const rnd=()=>((s=Math.imul(s^(s>>>15), 0x2c1b3c6d)+0x6d2b79f5|0)>>>0)/4294967296;
  /** @type {{x:number,z:number,pri:number,a:number,b:number,c:number,rot:number,t:number,u:number}[]} */ const grains=[];
  for(let i=0;i<N;i++){
    const front=i>=BASE_N;
    let x=(rnd()*2-1)*halfX, z;
    if(!front) z=(rnd()*2-1)*halfZ;
    else if(i<BASE_N+700) z=halfZ-rnd()*0.012;               // 最外一排压在前沿顶边上
    else z=halfZ-Math.pow(rnd(),1.6)*FRONT_BAND;            // 越靠玻璃越密
    x=Math.max(-halfX, Math.min(halfX, x));
    grains.push({ x, z, pri:rnd()*(front ? 0.35 : 1), a:rnd(), b:rnd(), c:rnd(), rot:rnd()*6.283, t:rnd(), u:rnd() });
  }
  grains.sort((p,q)=>p.pri-q.pri);

  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), sc=new THREE.Vector3(), p=new THREE.Vector3();
  const c1=new THREE.Color(), c2=new THREE.Color(), col=new THREE.Color();
  let level=0, keep=1;

  /** 主题切换：两色沙 + 底砂贴图名决定颗粒形态与颜色 @param {number} a @param {number} b @param {string} [tex] */
  function setStyle(a, b, tex){
    const st=/** @type {any} */ (STYLES)[tex ?? 's_oiso'] ?? STYLES.s_oiso;
    c1.set(a); c2.set(b);
    for(let i=0;i<N;i++){
      const gr=grains[i];
      const r=st.r[0]+(st.r[1]-st.r[0])*gr.a;
      const ir=st.irr;
      sc.set(r*(1+ir*(gr.b-0.5)*2), r*st.flat*(1+ir*(gr.c-0.5)), r*(1-ir*(gr.b-0.5)*1.4));
      e.set((gr.c-0.5)*0.6*ir, gr.rot, (gr.t-0.5)*0.6*ir);
      p.set(gr.x, heightAt(gr.x, gr.z)-sc.y*0.35, gr.z);    // 埋进沙里约三分之一
      m.compose(p, q.setFromEuler(e), sc);
      mesh.setMatrixAt(i, m);
      const j=st.jit[0]+(st.jit[1]-st.jit[0])*gr.u;
      col.copy(c1).lerp(c2, gr.t).multiplyScalar(j);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    keep=st.k; applyCount();                                  // 细沙 / 碎石颗粒少一些
  }
  function applyCount(){
    mesh.count=Math.round(N*keep*(LOD[level] ?? 0));   // 不动 visible：自然水域由 setShell 统一隐藏沙床
  }
  /** 画质档 0..6 @param {number} lv */
  function setLevel(lv){ level=Math.max(0, Math.min(LOD.length-1, lv|0)); applyCount(); }

  return { mesh, setStyle, setLevel };
}
