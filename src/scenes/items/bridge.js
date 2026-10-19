// @ts-check
import * as THREE from 'three';
import { rrange } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, castAll, injectSurfaceDetail } from './common.js';

/* ================================================================
 * 石拱桥：江南园林的驼峰单孔桥——桥面隆起成弧，桥洞是半圆券，两侧栏板 + 望柱（莲苞柱头）。
 * 侧面轮廓（桥面驼峰 + 半圆桥洞）一笔画成 Shape 挤出；鱼可以从桥洞穿过（避障球只放在桥墩与券顶）。
 * 长度沿局部 x，原点 = 沙面中点
 * ================================================================ */

const L=1.0, W=0.24;                          // 桥长 / 桥宽
const R=0.27, ARCH_Y=-0.03;                   // 桥洞半径与圆心高度（略低于沙面，像券脚埋在沙里）
const deckY=(/** @type {number} */ x)=>0.1+0.34*(0.5+0.5*Math.cos(Math.PI*x/(L/2)));   // 驼峰桥面

let _tex=/** @type {THREE.CanvasTexture|null} */ (null);
/** 条石砌块：错缝的长条石 + 灰缝，块块色差 */
function stoneTex(){
  if(_tex) return _tex;
  const w=512, h=512, cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  ctx.fillStyle='#4a4a44'; ctx.fillRect(0,0,w,h);       // 灰缝
  const rows=7, bh=h/rows;
  let s=7;
  const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
  for(let r=0;r<rows;r++){
    let x=-(r%2)*50-rnd()*40;
    while(x<w){
      const bw=90+rnd()*110, l=146+rnd()*40, tint=rnd()*12-6;
      ctx.fillStyle=`rgb(${l+tint},${l+tint*0.6+2},${l-5})`;
      ctx.fillRect(x+3, r*bh+3, bw-6, bh-6);
      // 风化：几团低透明度的柔和深浅斑（径向渐变，不是硬边小方块）
      for(let k=0;k<5;k++){
        const cx=x+rnd()*bw, cy=r*bh+rnd()*bh, rr=10+rnd()*28, dark=rnd()<0.6;
        const g=ctx.createRadialGradient(cx,cy,0,cx,cy,rr);
        g.addColorStop(0, dark ? 'rgba(70,72,62,.22)' : 'rgba(225,222,210,.18)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g; ctx.fillRect(Math.max(x+3,cx-rr), Math.max(r*bh+3,cy-rr), Math.min(2*rr, bw-6), Math.min(2*rr, bh-6));
      }
      x+=bw;
    }
  }
  _tex=new THREE.CanvasTexture(cv);
  _tex.wrapS=_tex.wrapT=THREE.RepeatWrapping;
  _tex.repeat.set(1.5, 1.5);
  _tex.colorSpace=THREE.SRGBColorSpace; _tex.anisotropy=8;
  return _tex;
}

export function buildBridge(/** @type {any} */ rng){
  const mat=shared('mat:bridge', ()=>{
    const m=new THREE.MeshStandardMaterial({ map:stoneTex(), color:0xd8d6cb, roughness:0.88, metalness:0 });
    injectCaustics(m, 0.5, 'bridge');
    injectSurfaceDetail(m, { freq:16, k:0.35, ao:0.3, key:'bridgedet' });
    return m;
  });
  const capMat=shared('mat:bridgeCap', ()=>{
    const m=new THREE.MeshStandardMaterial({ color:0xb9b7ab, roughness:0.8 });
    injectCaustics(m, 0.5, 'bridgecap');
    return m;
  });
  const group=new THREE.Group();

  // 侧面轮廓：左脚 → 驼峰桥面 → 右脚 → 沿半圆桥洞回到左脚
  const sh=new THREE.Shape();
  const foot=-0.06, N=28;
  sh.moveTo(-L/2, foot);
  for(let i=0;i<=N;i++){ const x=-L/2+L*i/N; sh.lineTo(x, deckY(x)); }
  sh.lineTo(L/2, foot);
  sh.lineTo(R+0.035, foot);
  for(let i=0;i<=24;i++){ const a=Math.PI*i/24; sh.lineTo(Math.cos(a)*R, ARCH_Y+Math.sin(a)*R); }
  sh.lineTo(-R-0.035, foot);
  const body=new THREE.ExtrudeGeometry(sh, { depth:W, bevelEnabled:true, bevelSize:0.008, bevelThickness:0.008, bevelSegments:2, curveSegments:4 });
  body.translate(0,0,-W/2);
  group.add(new THREE.Mesh(body, mat));

  // 券脸：桥洞外沿一圈略凸出的拱石（两侧各一道），让半圆券读得出来
  for(const sz of [-1,1]){
    const ring=new THREE.Shape();
    ring.absarc(0, ARCH_Y, R+0.045, 0, Math.PI, false);
    ring.lineTo(-R, ARCH_Y);
    ring.absarc(0, ARCH_Y, R, Math.PI, 0, true);
    const rg=new THREE.ExtrudeGeometry(ring, { depth:0.014, bevelEnabled:false, curveSegments:28 });
    rg.translate(0,0,sz>0 ? W/2+0.006 : -W/2-0.02);
    group.add(new THREE.Mesh(rg, capMat));
  }

  // 栏板：沿桥面的一条带状轮廓挤出成薄板，两侧各一道；望柱均布，柱头是莲苞
  const PH=0.065, PT=0.022, X0=-L/2+0.06, X1=L/2-0.06;
  for(const sz of [-1,1]){
    const band=new THREE.Shape();
    band.moveTo(X0, deckY(X0));
    for(let i=1;i<=N;i++){ const x=X0+(X1-X0)*i/N; band.lineTo(x, deckY(x)); }
    for(let i=N;i>=0;i--){ const x=X0+(X1-X0)*i/N; band.lineTo(x, deckY(x)+PH); }
    const bg=new THREE.ExtrudeGeometry(band, { depth:PT, bevelEnabled:true, bevelSize:0.004, bevelThickness:0.004, bevelSegments:1 });
    bg.translate(0,0,sz*(W/2-PT/2)-PT/2);
    group.add(new THREE.Mesh(bg, mat));
    const posts=5;
    for(let i=0;i<posts;i++){
      const x=X0+(X1-X0)*i/(posts-1), y=deckY(x);
      const post=new THREE.Mesh(new THREE.BoxGeometry(0.03, PH+0.035, 0.032), capMat);
      post.position.set(x, y+(PH+0.035)/2, sz*(W/2-PT/2));
      const bud=new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8).scale(1,1.35,1), capMat);
      bud.position.set(x, y+PH+0.035+0.018, sz*(W/2-PT/2));
      group.add(post, bud);
    }
  }
  // 两端抱鼓石般的小石墩，压住栏板尾端
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const g=new THREE.CylinderGeometry(0.03, 0.036, 0.05, 12).rotateX(Math.PI/2);
    const m=new THREE.Mesh(g, capMat);
    m.position.set(sx*(L/2-0.025), deckY(L/2-0.025)+0.03, sz*(W/2-PT/2));
    group.add(m);
  }
  group.rotation.y=rrange(rng,-0.04,0.04);
  castAll(group);
  const obstacles=[
    { c:new THREE.Vector3(-0.4,0.06,0), r:0.13 }, { c:new THREE.Vector3(0.4,0.06,0), r:0.13 },
    { c:new THREE.Vector3(0,0.38,0), r:0.12 }, { c:new THREE.Vector3(-0.22,0.3,0), r:0.1 }, { c:new THREE.Vector3(0.22,0.3,0), r:0.1 },
  ];
  return { object:group, obstacles };
}
