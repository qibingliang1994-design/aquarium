// @ts-check
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { vnoise } from '../utils.js';
import { isNatural } from '../scenes/tank-styles.js';
import { buildNaturalShell } from './natural-shells.js';
import { buildMing } from './ming-shell.js';

/* ================================================================
 * 缸体外壳（随场景切换）：框 / 玻璃边 / 灯具 / 底柜
 * 玻璃面板、水面、沙床、房间地面在 tank.js 里，所有款式共用
 * 每个 build 返回 { group, lightMat }；lightMat = 灯具发光面（昼夜调光用）
 * ================================================================ */

let W=0, H=0, D=0, T=0;                 // 缸体外尺寸，由 buildShell 传入（避免与 tank.js 循环依赖）
const CAB_H=0.72, CAB_Y=-0.38;          // 柜体高度与中心（顶面 ≈ -0.02，地面 -0.75）

/* ---------- 程序化木纹（按 key 缓存，跨场景复用） ---------- */
const TEX=new Map();
/** @param {string} key @param {number} base @param {number} dark @param {any} [opts] */
function woodTexture(key, base, dark, { lines=26, warp=2.2 }={}){
  if(TEX.has(key)) return TEX.get(key);
  const w=1024, h=256, cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')), img=ctx.createImageData(w,h), d=img.data;
  const a=new THREE.Color(base), b=new THREE.Color(dark);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    // 顺长方向（贴图 x 方向）的纤维：年轮线被低频噪声轻微扭动，叠加细纤维与色块
    const v=y/h*lines + vnoise(x*0.004, y*0.02)*warp + vnoise(x*0.02,y*0.05)*0.25;
    const ring=Math.pow(Math.abs(Math.sin(v*Math.PI)), 6);
    const fib=vnoise(x*0.05, y*0.9);
    const k=Math.min(1, ring*0.55 + fib*0.22 + vnoise(x*0.003,y*0.01)*0.3);
    const i=(y*w+x)*4;
    d[i]=(a.r+(b.r-a.r)*k)*255; d[i+1]=(a.g+(b.g-a.g)*k)*255; d[i+2]=(a.b+(b.b-a.b)*k)*255; d[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=8;
  TEX.set(key, tex);
  return tex;
}

/* ---------- 小工具 ---------- */
function kit(/** @type {any} */ group){
  const box=(/** @type {any} */ mat,/** @type {number} */ w,/** @type {number} */ h,/** @type {number} */ d,/** @type {number} */ x,/** @type {number} */ y,/** @type {number} */ z,/** @type {number} */ round=0)=>{
    const g=round ? new RoundedBoxGeometry(w,h,d,3,round) : new THREE.BoxGeometry(w,h,d);
    const m=new THREE.Mesh(g,mat); m.position.set(x,y,z);
    m.castShadow=m.receiveShadow=true; group.add(m); return m;
  };
  return { box };
}
const lightPanel=(/** @type {any} */ color)=>new THREE.MeshStandardMaterial({ color:0x111111, emissive:color, emissiveIntensity:2.8 });
// 底柜通用：柜体 + 三扇门板（门缝即阴影）+ 内凹踢脚
/** @param {any} group @param {any} opts */
function cabinet(group, { body, door, kick=0x050506, doors=3, handle=null, inset=0.04, CW=W+0.3, CD=D+0.3 }){
  const { box }=kit(group);
  box(body, CW, CAB_H-0.06, CD, 0, CAB_Y+0.03, 0, 0.02);
  box(new THREE.MeshStandardMaterial({ color:kick, roughness:0.9 }), CW-inset*2, 0.06, CD-inset*2, 0, CAB_Y-CAB_H/2+0.03, 0);
  const dw=(CW-0.04)/doors;
  for(let i=0;i<doors;i++){
    const x=-CW/2+0.02+dw*(i+0.5);
    box(door, dw-0.012, CAB_H-0.11, 0.022, x, CAB_Y+0.035, CD/2+0.011, 0.006);
    if(handle) box(handle, 0.012, 0.16, 0.018, x+(i<doors/2?dw/2-0.07:-dw/2+0.07), CAB_Y+0.12, CD/2+0.03, 0.005);
  }
}
// 超白玻璃的边：迎光处透出淡淡的青绿色（低铁玻璃的真实特征）
function glassEdges(/** @type {any} */ group, /** @type {any} */ mat){
  const { box }=kit(group);
  for(const sz of [-1,1]) box(mat, W, 0.006, T, 0, H+0.003, sz*(D/2-T/2));
  for(const sx of [-1,1]) box(mat, T, 0.006, D-2*T, sx*(W/2-T/2), H+0.003, 0);
  for(const sx of [-1,1]) for(const sz of [-1,1]) box(mat, T*0.9, H, 0.004, sx*(W/2-T/2), H/2, sz*(D/2+0.001));
}
// 玻璃内角的黑色硅胶缝
function siliconeSeams(/** @type {any} */ group, /** @type {any} */ mat){
  const { box }=kit(group);
  const r=0.012;
  for(const sx of [-1,1]) for(const sz of [-1,1]) box(mat, r, H-0.01, r, sx*(W/2-T-r/2), H/2, sz*(D/2-T-r/2));
  for(const sz of [-1,1]) box(mat, W-2*T, r, r, 0, T+r/2, sz*(D/2-T-r/2));
  for(const sx of [-1,1]) box(mat, r, r, D-2*T, sx*(W/2-T-r/2), T+r/2, 0);
}
// 吊线：从灯具两端直上天花（画面外）
function cables(/** @type {any} */ group, /** @type {any} */ xs, /** @type {number} */ y0, /** @type {number} */ z){
  const mat=new THREE.MeshStandardMaterial({ color:0x2a2c30, roughness:0.4, metalness:0.6 });
  for(const x of xs){
    const c=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,6,5), mat);
    c.position.set(x, y0+3, z); group.add(c);
  }
}

/* ================================================================ */
const BUILDERS={
  // 经典黑框：金属包边立柱 + 一体灯罩 + 深色烤漆柜（v1.0 以来的外观）
  classic(/** @type {any} */ group){
    const { box }=kit(group);
    const trim=new THREE.MeshStandardMaterial({ color:0x15181c, roughness:0.35, metalness:0.55 });
    box(trim, W+0.06, 0.07, D+0.06, 0, 0.02, 0);
    for(const sx of [-1,1]) for(const sz of [-1,1]) box(trim, 0.06, H, 0.06, sx*(W/2+0.005), H/2, sz*(D/2+0.005));
    box(trim, W+0.08, 0.12, 0.6, 0, H+0.1, -(D/2-0.28));
    const lightMat=lightPanel(0xfff2dd);
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(W*0.92,0.42), lightMat);
    strip.rotation.x=Math.PI/2; strip.position.set(0,H+0.039,-(D/2-0.28)); group.add(strip);
    const paint=new THREE.MeshPhysicalMaterial({ color:0x1a1c21, roughness:0.4, metalness:0.1, clearcoat:0.45, clearcoatRoughness:0.35 });
    cabinet(group, { body:paint, door:paint });
    return lightMat;
  },

  // 超白开缸：无框玻璃 + 硅胶缝 + 发泡垫 + 吊装铝灯 + 橡木柜
  rimless(/** @type {any} */ group){
    const { box }=kit(group);
    glassEdges(group, new THREE.MeshPhysicalMaterial({ color:0x8fd6c2, roughness:0.1, transparent:true, opacity:0.55, clearcoat:1 }));
    siliconeSeams(group, new THREE.MeshStandardMaterial({ color:0x0b0c0d, roughness:0.6 }));
    box(new THREE.MeshStandardMaterial({ color:0x1b1d20, roughness:0.95 }), W+0.02, 0.022, D+0.02, 0, -0.009, 0);
    // 吊灯：拉丝铝灯体 + 下方发光面 + 两根吊线
    const alu=new THREE.MeshStandardMaterial({ color:0xb9bec4, roughness:0.32, metalness:0.9 });
    const ly=H+0.52;
    box(alu, W*0.94, 0.03, 0.2, 0, ly, -0.05, 0.012);
    const lightMat=lightPanel(0xfff8ee);
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(W*0.9,0.15), lightMat);
    panel.rotation.x=Math.PI/2; panel.position.set(0, ly-0.016, -0.05); group.add(panel);
    cables(group, [-W*0.4, W*0.4], ly, -0.05);
    const oak=woodTexture('oak', 0xc9a173, 0x8e653f);
    const body=new THREE.MeshStandardMaterial({ map:oak, roughness:0.62 });
    const door=new THREE.MeshStandardMaterial({ map:oak, roughness:0.55 });
    cabinet(group, { body, door, doors:2, kick:0x1a120b });
    return lightMat;
  },

  // 海水礁缸：加强顶框 + 回水弯管 + 造浪泵 + 双灯盘（蓝白）+ 白色烤漆柜
  reef(/** @type {any} */ group){
    const { box }=kit(group);
    const black=new THREE.MeshStandardMaterial({ color:0x0d0f12, roughness:0.45, metalness:0.2 });
    const bw=0.07;
    for(const sz of [-1,1]) box(black, W+0.02, 0.035, bw, 0, H-0.012, sz*(D/2-bw/2+0.01));
    for(const sx of [-1,1]) box(black, bw, 0.035, D-2*bw+0.02, sx*(W/2-bw/2+0.01), H-0.012, 0);
    box(black, W+0.04, 0.06, D+0.04, 0, 0.015, 0);
    siliconeSeams(group, black);
    // 回水弯管（挂在后玻璃上沿，喷口朝前下）
    const pipe=new THREE.MeshStandardMaterial({ color:0x15171a, roughness:0.5 });
    for(const x of [-1.2, 1.25]){
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,H+0.12,-D/2-0.05), new THREE.Vector3(x,H+0.1,-D/2+0.06),
        new THREE.Vector3(x,H-0.12,-D/2+0.07), new THREE.Vector3(x+0.02,H-0.22,-D/2+0.16)]);
      const m=new THREE.Mesh(new THREE.TubeGeometry(curve,20,0.022,10), pipe); m.castShadow=true; group.add(m);
    }
    // 造浪泵：吸在后玻璃上的圆形泵体 + 格栅
    const pump=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.085,0.09,24).rotateX(Math.PI/2), pipe);
    pump.position.set(-1.75, 1.45, -D/2+T+0.045); pump.castShadow=true; group.add(pump);
    const grill=new THREE.Mesh(new THREE.TorusGeometry(0.055,0.006,6,24), new THREE.MeshStandardMaterial({ color:0x2a2e33, roughness:0.4 }));
    grill.position.set(-1.75, 1.45, -D/2+T+0.092); group.add(grill);
    // 双灯盘：深色灯壳 + 蓝白发光面 + 吊杆
    const shell=new THREE.MeshStandardMaterial({ color:0x1c1f24, roughness:0.35, metalness:0.5 });
    const lightMat=lightPanel(0xcfe0ff);
    const ly=H+0.46;
    for(const x of [-1.15, 1.15]){
      box(shell, 0.62, 0.05, 0.5, x, ly, -0.05, 0.02);
      const p=new THREE.Mesh(new THREE.CircleGeometry(0.2,32), lightMat);
      p.rotation.x=Math.PI/2; p.position.set(x, ly-0.026, -0.05); group.add(p);
    }
    cables(group, [-1.15, 1.15], ly, -0.05);
    const lacquer=new THREE.MeshPhysicalMaterial({ color:0xe6e8eb, roughness:0.28, clearcoat:1, clearcoatRoughness:0.12 });
    cabinet(group, { body:lacquer, door:lacquer, doors:3, kick:0x101114 });
    return lightMat;
  },

  // 和风木框：胡桃木上下框与立柱 + 木质灯檐（暖光）+ 竖格栅柜
  zen(/** @type {any} */ group){
    const { box }=kit(group);
    const walnut=woodTexture('walnut', 0x8c5f3c, 0x4a2c18, { lines:18, warp:3 });
    const wood=new THREE.MeshPhysicalMaterial({ map:walnut, roughness:0.5, clearcoat:0.35, clearcoatRoughness:0.4 });
    for(const sz of [-1,1]) box(wood, W+0.14, 0.09, 0.07, 0, H+0.01, sz*(D/2+0.02), 0.01);
    for(const sx of [-1,1]) box(wood, 0.07, 0.09, D+0.11, sx*(W/2+0.035), H+0.01, 0, 0.01);
    box(wood, W+0.16, 0.12, D+0.14, 0, 0.04, 0, 0.012);
    for(const sx of [-1,1]) for(const sz of [-1,1]) box(wood, 0.07, H, 0.07, sx*(W/2+0.035), H/2, sz*(D/2+0.02), 0.008);
    // 灯檐：架在后框上的木板 + 暖光灯条
    box(wood, W+0.2, 0.06, 0.7, 0, H+0.2, -(D/2-0.3), 0.01);
    for(const sx of [-1,1]) box(wood, 0.06, 0.16, 0.06, sx*(W/2-0.1), H+0.11, -(D/2-0.06));
    const lightMat=lightPanel(0xffdcae);
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(W*0.92,0.5), lightMat);
    strip.rotation.x=Math.PI/2; strip.position.set(0, H+0.168, -(D/2-0.3)); group.add(strip);
    // 格栅柜：深色柜体 + 竖木条
    const dark=new THREE.MeshStandardMaterial({ color:0x140d08, roughness:0.8 });
    const CW=W+0.3, CD=D+0.3;
    box(wood, CW, CAB_H-0.06, CD, 0, CAB_Y+0.03, 0, 0.02);
    box(dark, CW-0.12, CAB_H-0.2, 0.01, 0, CAB_Y+0.03, CD/2+0.002);
    const n=34, gap=(CW-0.12)/n;
    for(let i=0;i<n;i++) box(wood, gap*0.55, CAB_H-0.2, 0.03, -CW/2+0.06+gap*(i+0.5), CAB_Y+0.03, CD/2+0.016);
    box(new THREE.MeshStandardMaterial({ color:0x6f6a62, roughness:0.95 }), CW+0.08, 0.05, CD+0.08, 0, CAB_Y-CAB_H/2+0.02, 0);   // 石材底座
    return lightMat;
  },

  // 明式红木：紫檀推光漆框 + 翘头灯檐 + 宫灯 + 回纹牙板、团花门心、马蹄足的明式柜（ming-shell.js）
  ming(/** @type {any} */ group){
    return buildMing(group, { W, H, D, CAB_H, CAB_Y, box:kit(group).box, woodTexture, lightPanel });
  },
};

/** 构建外壳；未知款式回退经典。自然水域没有灯具发光面（lightMat=null），natural=true 时 tank.js 隐藏玻璃与房间
 * @param {string} id @param {{W:number,H:number,D:number,glass:number}} dims @param {{waterY:number, sandHeight:(x:number,z:number)=>number}} world */
export function buildShell(id, dims, world){
  ({ W, H, D, glass:T }=dims);
  if(isNatural(id)){
    const group=buildNaturalShell(id, dims, world);
    group.name=`tank-shell-${id}`;
    return { group, lightMat:null, natural:true };
  }
  const group=new THREE.Group();
  group.name=`tank-shell-${id}`;
  const lightMat=(/** @type {any} */ (BUILDERS)[id] ?? /** @type {any} */ (BUILDERS).classic)(group);
  return { group, lightMat, natural:false };
}

/** 释放外壳（木纹贴图按 key 缓存，不释放） */
export function disposeShell(/** @type {any} */ group){
  group.traverse((/** @type {any} */ o)=>{
    if(!o.isMesh) return;
    o.geometry.dispose();
    if(!o.userData.sharedMat) o.material.dispose();     // 水草材质是跨物件共享的
    if(o.isInstancedMesh) o.dispose();
  });
}
