// @ts-check
import * as THREE from 'three';

/* ================================================================
 * 明式红木缸体：紫檀色木框（推光漆面）+ 翘头横梁灯檐 + 两盏六角宫灯 + 明式柜
 * （回纹牙板、团花门心、铜面叶拉手、马蹄足）。由 tank-shells.js 的 BUILDERS.ming 调用
 * ================================================================ */

const TEX=new Map();
/** canvas 贴图按 key 缓存，跨场景复用 @param {string} key @param {number} w @param {number} h @param {(ctx:CanvasRenderingContext2D, w:number, h:number)=>void} draw */
function canvasTex(key, w, h, draw){
  if(TEX.has(key)) return TEX.get(key);
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  draw(/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')), w, h);
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=8;
  TEX.set(key, tex);
  return tex;
}

/** 回纹带：深色木底上的浅色阳刻方折回旋 @param {CanvasRenderingContext2D} ctx */
function fret(ctx, /** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ len, /** @type {number} */ hh, /** @type {string} */ col){
  const n=Math.round(len/hh), s=len/n, m=hh*0.16;
  ctx.strokeStyle=col; ctx.lineWidth=Math.max(2, hh*0.09); ctx.lineCap='square';
  for(let i=0;i<n;i++){
    const x=x0+i*s;
    ctx.beginPath();
    ctx.moveTo(x+m, y0+hh-m); ctx.lineTo(x+m, y0+m); ctx.lineTo(x+s-m, y0+m); ctx.lineTo(x+s-m, y0+hh-m*2.3);
    ctx.lineTo(x+m*2.5, y0+hh-m*2.3); ctx.lineTo(x+m*2.5, y0+m*2.5); ctx.lineTo(x+s-m*2.5, y0+m*2.5);
    ctx.stroke();
  }
}

/** 紫檀木纹底 @param {CanvasRenderingContext2D} ctx */
function rosewoodBase(ctx, /** @type {number} */ w, /** @type {number} */ h){
  ctx.fillStyle='#3a1a10'; ctx.fillRect(0,0,w,h);
  for(let i=0;i<h;i+=2){
    const k=0.5+0.5*Math.sin(i*0.21+Math.sin(i*0.037)*3);
    ctx.fillStyle=`rgba(${k>0.6?'92,44,26':'28,10,6'},${0.12+0.1*k})`;
    ctx.fillRect(0,i,w,2);
  }
}

/** @param {THREE.Group} group @param {{ W:number, H:number, D:number, CAB_H:number, CAB_Y:number, box:Function, woodTexture:Function, lightPanel:Function }} k */
export function buildMing(group, { W, H, D, CAB_H, CAB_Y, box, woodTexture, lightPanel }){
  const rose=woodTexture('rosewood', 0x5c2a18, 0x26100a, { lines:30, warp:2.6 });
  const wood=new THREE.MeshPhysicalMaterial({ map:rose, roughness:0.38, clearcoat:0.7, clearcoatRoughness:0.22 });   // 推光漆：温润高光
  const brass=new THREE.MeshStandardMaterial({ color:0xb8913f, roughness:0.32, metalness:0.9 });

  // 木框：上下框 + 四角立柱（立柱略粗，顶端出头）
  for(const sz of [-1,1]) box(wood, W+0.14, 0.08, 0.07, 0, H+0.01, sz*(D/2+0.02), 0.012);
  for(const sx of [-1,1]) box(wood, 0.07, 0.08, D+0.11, sx*(W/2+0.035), H+0.01, 0, 0.012);
  box(wood, W+0.16, 0.1, D+0.14, 0, 0.035, 0, 0.012);
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    box(wood, 0.075, H+0.08, 0.075, sx*(W/2+0.035), H/2+0.03, sz*(D/2+0.02), 0.01);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 8).scale(1,0.7,1), wood);   // 柱头圆帽
    cap.position.set(sx*(W/2+0.035), H+0.085, sz*(D/2+0.02)); group.add(cap);
  }

  // 灯檐横梁：长出缸体两侧、两端上翘（翘头案的线条），下面藏暖光灯条
  const BY=H+0.42, BL=W+0.7, bz=-(D/2-0.25);
  box(wood, BL, 0.07, 0.5, 0, BY, bz, 0.012);
  for(const sx of [-1,1]){
    const tip=new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.5), wood);
    tip.position.set(sx*(BL/2+0.06), BY+0.035, bz); tip.rotation.z=sx*0.32; group.add(tip);
    box(wood, 0.05, 0.38, 0.05, sx*(W/2-0.12), H+0.22, bz);                    // 立柱撑起横梁
  }
  const lightMat=lightPanel(0xffd6a0);
  const strip=new THREE.Mesh(new THREE.PlaneGeometry(W*0.9, 0.36), lightMat);
  strip.rotation.x=Math.PI/2; strip.position.set(0, BY-0.036, bz); group.add(strip);

  // 宫灯：挂在横梁两端，六角木框 + 红纱灯罩（自发光，交给泛光晕开；不加点光源——灯数变化会让所有材质重编译）+ 流苏
  const silk=new THREE.MeshStandardMaterial({ color:0x8a1810, emissive:0xe8241a, emissiveIntensity:1.2, roughness:0.7, side:THREE.DoubleSide });
  const tassel=new THREE.MeshStandardMaterial({ color:0xc8301c, roughness:0.8 });
  for(const sx of [-1,1]){
    const lx=sx*(BL/2-0.02), top=BY-0.04;
    const cord=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,0.3,5), brass); cord.position.set(lx, top-0.15, bz); group.add(cord);
    const lan=new THREE.Group(); lan.position.set(lx, top-0.52, bz); lan.scale.setScalar(1.5);
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6, 1, true), silk); lan.add(body);
    for(const y of [0.11,-0.11]){
      const ring=new THREE.Mesh(new THREE.CylinderGeometry(y>0?0.085:0.11, y>0?0.115:0.085, 0.035, 6), wood);
      ring.position.y=y; lan.add(ring);
    }
    for(let i=0;i<6;i++){                                                   // 六根木骨
      const a=i/6*Math.PI*2+Math.PI/6;
      const rib=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.21,0.012), wood);
      rib.position.set(Math.cos(a)*0.1, 0, Math.sin(a)*0.1); lan.add(rib);
    }
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.03,10,8), wood); knob.position.y=0.14; lan.add(knob);
    for(let i=0;i<6;i++){                                                   // 流苏
      const a=i/6*Math.PI*2;
      const t=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.002,0.14,4), tassel);
      t.position.set(Math.cos(a)*0.03, -0.2, Math.sin(a)*0.03); lan.add(t);
    }
    group.add(lan);
  }

  // 明式柜：柜身 + 回纹牙板 + 两扇团花门心 + 铜面叶 + 马蹄足
  const CW=W+0.3, CD=D+0.3, legH=0.12, bodyH=CAB_H-legH-0.02, bodyY=CAB_Y+CAB_H/2-bodyH/2;
  box(wood, CW, bodyH, CD, 0, bodyY, 0, 0.015);
  const apronTex=canvasTex('ming-apron', 2048, 64, (ctx, w, h)=>{ rosewoodBase(ctx, w, h); fret(ctx, 6, 8, w-12, h-16, 'rgba(201,152,92,.85)'); });
  const apron=new THREE.Mesh(new THREE.PlaneGeometry(CW-0.06, 0.07), new THREE.MeshPhysicalMaterial({ map:apronTex, roughness:0.4, clearcoat:0.6 }));
  apron.position.set(0, bodyY+bodyH/2-0.05, CD/2+0.003); group.add(apron);
  const doorTex=canvasTex('ming-door', 512, 512, (ctx, w, h)=>{
    rosewoodBase(ctx, w, h);
    // 门心：内凹的浅色框线 + 四角回纹 + 中央团花
    ctx.strokeStyle='rgba(18,6,3,.8)'; ctx.lineWidth=10; ctx.strokeRect(26,26,w-52,h-52);
    ctx.strokeStyle='rgba(176,118,66,.55)'; ctx.lineWidth=3; ctx.strokeRect(40,40,w-80,h-80);
    for(const [x,y] of [[52,52],[w-132,52],[52,h-132],[w-132,h-132]]) fret(ctx, x, y, 80, 80, 'rgba(190,135,78,.75)');
    const cx=w/2, cy=h/2;
    ctx.strokeStyle='rgba(198,142,80,.85)'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(cx,cy,92,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,80,0,Math.PI*2); ctx.stroke();
    for(let i=0;i<8;i++){                                                  // 八瓣团花
      const a=i/8*Math.PI*2;
      ctx.beginPath(); ctx.ellipse(cx+Math.cos(a)*44, cy+Math.sin(a)*44, 30, 13, a, 0, Math.PI*2);
      ctx.fillStyle='rgba(176,118,62,.55)'; ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx,cy,16,0,Math.PI*2); ctx.fillStyle='rgba(205,150,86,.9)'; ctx.fill();
  });
  const doorMat=new THREE.MeshPhysicalMaterial({ map:doorTex, roughness:0.4, clearcoat:0.65, clearcoatRoughness:0.25 });
  const doors=4, dw=(CW-0.1)/doors, dh=bodyH-0.16;
  for(let i=0;i<doors;i++){
    const x=-CW/2+0.05+dw*(i+0.5);
    box(doorMat, dw-0.02, dh, 0.02, x, bodyY-0.04, CD/2+0.01, 0.006);
    if(i===1 || i===2){                                                    // 中间两扇对开：圆形铜面叶 + 吊牌拉手
      const sx=i===1 ? 1 : -1;
      const plate=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.006,24).rotateX(Math.PI/2), brass);
      plate.position.set(x+sx*(dw/2-0.06), bodyY-0.02, CD/2+0.024); group.add(plate);
      const pull=new THREE.Mesh(new THREE.TorusGeometry(0.022,0.004,6,16,Math.PI).rotateZ(Math.PI), brass);
      pull.position.set(x+sx*(dw/2-0.06), bodyY-0.035, CD/2+0.03); group.add(pull);
    }
  }
  // 马蹄足：四角方腿，下端向内勾
  const footY=CAB_Y-CAB_H/2;
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    box(wood, 0.08, legH, 0.08, sx*(CW/2-0.05), footY+legH/2, sz*(CD/2-0.05), 0.01);
    const hoof=new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.1), wood);
    hoof.position.set(sx*(CW/2-0.06), footY+0.017, sz*(CD/2-0.06)); group.add(hoof);
  }
  // 腿间的托泥（贴地横枨）
  box(wood, CW-0.12, 0.03, 0.04, 0, footY+0.03, CD/2-0.05);
  return lightMat;
}
