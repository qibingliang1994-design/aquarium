// @ts-check
import * as THREE from 'three';
import { rrange } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { castAll } from './common.js';

/* ================================================================
 * 青花瓷罐：倾倒、半埋在沙里，罐口朝外，鱼可以钻进去。
 * 车削（Lathe）出带壁厚的罐形：圈足 → 鼓腹 → 丰肩 → 短颈 → 唇口 → 内壁。
 * 纹样画在 canvas 上，按罐身高度分带：足部双弦纹、下腹蕉叶、腹部缠枝莲、肩部如意云头、颈部回纹。
 * 钴蓝用多层半透明叠画，模拟青花"晕散"的浓淡。每个 seed 的纹样相位不同。
 * ================================================================ */

const BLUE='31,58,140';
const HJ=0.36;                                  // 罐高（未缩放）

/** 外轮廓（自下而上）：[半径, 高度] */
const OUTER=(()=>{
  const pts=[];
  for(let i=0;i<=30;i++){
    const h=HJ*i/30, t=h/HJ;
    let r;
    if(t<0.04) r=0.07+t/0.04*0.012;                                          // 圈足
    else if(t<0.82) r=0.082+0.075*Math.sin(Math.min(1,(t-0.04)/0.7)*Math.PI*0.92)**0.8;   // 鼓腹 → 丰肩
    else r=0.062+(t>0.95 ? (t-0.95)/0.05*0.014 : 0);                         // 短颈 + 外翻唇口
    pts.push([r, h]);
  }
  return pts;
})();
/** 内壁（自上而下，比外壁薄 8 mm 左右） */
const INNER=[[0.068,HJ-0.004],[0.054,HJ*0.9],[0.13,HJ*0.5],[0.12,HJ*0.18],[0.06,0.025],[0.0,0.022]];
const NP=1+OUTER.length+INNER.length;
const V_LIP=OUTER.length/(NP-1);                 // 外壁在贴图 v 上占的范围 [0, V_LIP]
/** 罐身高度 → 贴图 v（外壁按采样点均分） @param {number} h */
const vOf=h=>(1+h/HJ*(OUTER.length-1))/(NP-1);

/** @param {number} seed */
function jarTexture(seed){
  const w=1024, h=512, cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  const Y=(/** @type {number} */ hh)=>(1-vOf(hh))*h;          // 高度 → canvas 行（flipY：v=1 在顶部）
  ctx.fillStyle='#f2f1ea'; ctx.fillRect(0,0,w,h);
  // 内壁：釉色偏灰、往里渐暗
  const gi=ctx.createLinearGradient(0,0,0,(1-V_LIP)*h);
  gi.addColorStop(0,'#5a5a56'); gi.addColorStop(1,'#d9d7cf');
  ctx.fillStyle=gi; ctx.fillRect(0,0,w,(1-V_LIP)*h);
  const ink=(/** @type {number} */ a)=>`rgba(${BLUE},${a})`;
  const line=(/** @type {number} */ hh, /** @type {number} */ lw, /** @type {number} */ a=0.85)=>{ ctx.fillStyle=ink(a); ctx.fillRect(0, Y(hh)-lw/2, w, lw); };
  const ph=(seed%97)/97*Math.PI*2;
  // 足部双弦纹、口沿弦纹
  line(HJ*0.03,5); line(HJ*0.065,3);
  line(HJ*0.985,6); line(HJ*0.83,4); line(HJ*0.8,2.5);
  // 下腹蕉叶：一圈尖叶，叶脉留白
  {
    const y0=Y(HJ*0.08), y1=Y(HJ*0.22), n=16;
    for(let i=0;i<n;i++){
      const x=(i+0.5)/n*w, hw=w/n*0.38;
      ctx.beginPath(); ctx.moveTo(x-hw,y0); ctx.quadraticCurveTo(x-hw*0.6,(y0+y1)/2,x,y1); ctx.quadraticCurveTo(x+hw*0.6,(y0+y1)/2,x+hw,y0); ctx.closePath();
      ctx.fillStyle=ink(0.55); ctx.fill(); ctx.strokeStyle=ink(0.9); ctx.lineWidth=2; ctx.stroke();
      ctx.strokeStyle='rgba(242,241,234,.9)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(x,y0-2); ctx.lineTo(x,y1+6); ctx.stroke();
    }
    line(HJ*0.235,3);
  }
  // 腹部缠枝莲：一条波状主藤，波峰波谷各开一朵莲，藤上生卷须与叶
  {
    const yc=Y(HJ*0.5), amp=(Y(HJ*0.36)-Y(HJ*0.64))/2, n=4;
    const vy=(/** @type {number} */ x)=>yc+Math.sin(x/w*n*Math.PI*2+ph)*amp;
    ctx.strokeStyle=ink(0.85); ctx.lineWidth=4; ctx.beginPath();
    for(let x=0;x<=w;x+=4) x===0 ? ctx.moveTo(x,vy(x)) : ctx.lineTo(x,vy(x));
    ctx.stroke();
    for(let k=0;k<n*2;k++){
      const x=((k+0.5)/(n*2)*w-ph/(Math.PI*2)/n*w+w)%w, up=k%2===0;
      const fy=vy(x)+(up?-1:1)*amp*0.55;
      // 莲花：外圈花瓣（深）+ 内圈（浅）+ 花心留白
      for(const [rr,a,np] of [[34,0.75,8],[22,0.45,6]]){
        for(let j=0;j<np;j++){
          const t=j/np*Math.PI*2+0.3;
          ctx.beginPath(); ctx.ellipse(x+Math.cos(t)*rr*0.55, fy+Math.sin(t)*rr*0.5, rr*0.5, rr*0.24, t, 0, Math.PI*2);
          ctx.fillStyle=ink(a); ctx.fill();
        }
      }
      ctx.beginPath(); ctx.arc(x,fy,7,0,Math.PI*2); ctx.fillStyle='#f2f1ea'; ctx.fill();
      ctx.beginPath(); ctx.arc(x,fy,7,0,Math.PI*2); ctx.strokeStyle=ink(0.9); ctx.lineWidth=2; ctx.stroke();
      // 卷须与叶
      ctx.strokeStyle=ink(0.8); ctx.lineWidth=2.5;
      for(const s of [-1,1]){
        const lx=x+s*60, ly=vy(lx);
        ctx.beginPath(); ctx.moveTo(lx,ly); ctx.bezierCurveTo(lx+s*10,ly+(up?1:-1)*30, lx+s*40,ly+(up?1:-1)*24, lx+s*34,ly+(up?1:-1)*10); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(lx+s*18, ly+(up?1:-1)*16, 14, 6, s*(up?0.7:-0.7), 0, Math.PI*2);
        ctx.fillStyle=ink(0.6); ctx.fill();
      }
    }
  }
  // 肩部如意云头：一圈倒垂的云头纹
  {
    line(HJ*0.7,3);
    const y0=Y(HJ*0.79), n=8;
    for(let i=0;i<n;i++){
      const x=(i+0.5)/n*w, r=w/n*0.22;
      ctx.beginPath();
      ctx.moveTo(x-r*1.6,y0); ctx.arc(x-r*0.9,y0+r*0.7,r*0.75,Math.PI*1.2,Math.PI*0.3,true);
      ctx.arc(x,y0+r*1.5,r*0.7,Math.PI*1.1,Math.PI*-0.1,true);
      ctx.arc(x+r*0.9,y0+r*0.7,r*0.75,Math.PI*0.7,Math.PI*-0.2,true); ctx.lineTo(x+r*1.6,y0);
      ctx.fillStyle=ink(0.5); ctx.fill(); ctx.strokeStyle=ink(0.9); ctx.lineWidth=2.5; ctx.stroke();
    }
  }
  // 颈部回纹：连续的方折回旋
  {
    const yA=Y(HJ*0.97), yB=Y(HJ*0.85), hh=yB-yA, n=24, s=w/n;
    ctx.strokeStyle=ink(0.85); ctx.lineWidth=3;
    for(let i=0;i<n;i++){
      const x=i*s, m=hh*0.18;
      ctx.beginPath();
      ctx.moveTo(x+m, yB-m); ctx.lineTo(x+m, yA+m); ctx.lineTo(x+s-m, yA+m); ctx.lineTo(x+s-m, yB-m*2.2);
      ctx.lineTo(x+m*2.4, yB-m*2.2); ctx.lineTo(x+m*2.4, yA+m*2.4); ctx.lineTo(x+s-m*2.4, yA+m*2.4);
      ctx.stroke();
    }
  }
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=8;
  return tex;
}

/** 纹样按 seed 变体缓存（3 种），材质随之共享、永不释放 */
const MATS=new Map();
function jarMat(/** @type {number} */ seed){
  const k=seed%3;
  if(!MATS.has(k)){
    const m=new THREE.MeshPhysicalMaterial({ map:jarTexture(k*31+7), roughness:0.16, clearcoat:0.85, clearcoatRoughness:0.08, side:THREE.DoubleSide });
    injectCaustics(m, 0.4, 'jar');
    MATS.set(k, m);
  }
  return MATS.get(k);
}

export function buildPorcelain(/** @type {any} */ rng, /** @type {number} */ seed){
  const prof=[new THREE.Vector2(0,0), ...OUTER.map(([r,h])=>new THREE.Vector2(r,h)), ...INNER.map(([r,h])=>new THREE.Vector2(r,h))];
  const g=new THREE.LatheGeometry(prof, 48);
  g.computeVertexNormals();
  const jar=new THREE.Mesh(g, jarMat(seed));
  // 侧卧：罐身轴线转到水平，罐口略上扬；底部沉进沙里约 3 cm
  const tilt=rrange(rng,0.08,0.22);
  jar.rotation.z=-Math.PI/2+tilt;
  jar.position.set(-HJ*0.42, 0.15-0.03, 0);
  const group=new THREE.Group();
  group.add(jar);
  castAll(group);
  const c=new THREE.Vector3(0, HJ*0.45, 0).applyEuler(jar.rotation).add(jar.position);
  return { object:group, obstacles:[{ c, r:0.17 }] };
}
