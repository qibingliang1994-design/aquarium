// @ts-check
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ================================================================
 * ADA 水景缸外壳：超白无框玻璃 + 透明硅胶缝 + 一对玻璃出入水管（Lily Pipe）
 * + 两盏方形铝壳吊灯 + 白蜡木柜。造型参照 ADA 自然水景缸的经典器材组合：
 * 缸外越简洁越好，玻璃管是唯一的"器材"点缀。
 * 由 tank-shells.js 调用（尺寸与小工具从那边传入，避免循环依赖）
 * ================================================================ */

/** 玻璃管：超白玻璃的淡青、薄而透，环境反射给出高光轮廓 */
const glassTube=()=>new THREE.MeshPhysicalMaterial({ color:0xe6f6f2, roughness:0.04, metalness:0,
  transparent:true, opacity:0.3, clearcoat:1, clearcoatRoughness:0.03, envMapIntensity:1.4, depthWrite:false, side:THREE.DoubleSide });

/** 一根挂在后玻璃上沿的 J 形玻璃管：缸外竖管 → 翻过玻璃 → 缸内下行；返回缸内末端位置与方向
 * @param {THREE.Group} group @param {THREE.Material} mat @param {number} x @param {number} H @param {number} D @param {number} drop */
function hookPipe(group, mat, x, H, D, drop){
  const back=-D/2, r=0.011;
  const pts=[
    new THREE.Vector3(x, H-0.42, back-0.075), new THREE.Vector3(x, H-0.05, back-0.075),
    new THREE.Vector3(x, H+0.055, back-0.06), new THREE.Vector3(x, H+0.075, back),
    new THREE.Vector3(x, H+0.055, back+0.06), new THREE.Vector3(x, H-0.05, back+0.075),
    new THREE.Vector3(x, H-drop, back+0.075),
  ];
  const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 64, r, 12), mat);
  group.add(tube);
  // 缸外接的软管：深绿半透明，顺着竖管往下没入柜子后方
  const hose=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, H-0.4, back-0.075), new THREE.Vector3(x, H-1.2, back-0.09), new THREE.Vector3(x+0.04*Math.sign(x), -0.05, back-0.12),
  ]), 24, 0.014, 10), new THREE.MeshPhysicalMaterial({ color:0x1d3a2c, roughness:0.35, transparent:true, opacity:0.85, clearcoat:0.6 }));
  hose.castShadow=true; group.add(hose);
  return new THREE.Vector3(x, H-drop, back+0.075);
}

/** @param {THREE.Group} group @param {any} k { W,H,D,T,CAB_H,CAB_Y, box, woodTexture, lightPanel, cabinet, glassEdges, siliconeSeams, cables } */
export function buildAda(group, k){
  const { W, H, D, box }=k;
  k.glassEdges(group, new THREE.MeshPhysicalMaterial({ color:0x8fd6c2, roughness:0.1, transparent:true, opacity:0.55, clearcoat:1 }));
  k.siliconeSeams(group, new THREE.MeshPhysicalMaterial({ color:0xa9c9c2, roughness:0.25, transparent:true, opacity:0.32, depthWrite:false }));
  box(new THREE.MeshStandardMaterial({ color:0x1b1d20, roughness:0.95 }), W+0.02, 0.022, D+0.02, 0, -0.009, 0);   // 缸底发泡垫

  // ---- Lily Pipe：左后角出水口（喇叭口朝前），右后角进水口（下端带竖条滤网）----
  const glass=glassTube();
  const outEnd=hookPipe(group, glass, -W/2+0.22, H, D, 0.62);
  const bend=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    outEnd, outEnd.clone().add(new THREE.Vector3(0,-0.05,0.01)), outEnd.clone().add(new THREE.Vector3(0.015,-0.08,0.07)),
  ]), 16, 0.011, 12), glass);
  group.add(bend);
  // 百合花形喇叭口：车出来的薄壁喇叭，口沿外翻
  const prof=[];
  for(let i=0;i<=10;i++){ const t=i/10; prof.push(new THREE.Vector2(0.011+0.04*Math.pow(t,2.2), t*0.075)); }
  const lip=new THREE.Mesh(new THREE.LatheGeometry(prof, 28), glass);
  lip.rotation.x=Math.PI/2;
  lip.position.copy(outEnd).add(new THREE.Vector3(0.015,-0.08,0.065));
  group.add(lip);
  const inEnd=hookPipe(group, glass, W/2-0.22, H, D, 1.2);
  const strainer=new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 20, 1, true), glass);
  strainer.position.copy(inEnd).add(new THREE.Vector3(0,-0.1,0));
  group.add(strainer);
  const slotMat=new THREE.MeshBasicMaterial({ color:0x9fc8c0, transparent:true, opacity:0.35, depthWrite:false });
  for(let i=0;i<6;i++){            // 滤网的竖向细缝：几道淡色细条，转一圈
    const a=i/6*Math.PI*2;
    const s=new THREE.Mesh(new THREE.PlaneGeometry(0.003, 0.17), slotMat);
    s.position.copy(strainer.position).add(new THREE.Vector3(Math.sin(a)*0.0185, 0, Math.cos(a)*0.0185));
    s.rotation.y=a;
    group.add(s);
  }

  // ---- 两盏方形吊灯：圆角铝壳 + 下方乳白发光面 + 吊线 ----
  const alu=new THREE.MeshStandardMaterial({ color:0xc8ccd1, roughness:0.28, metalness:0.92 });
  const lightMat=k.lightPanel(0xf4f8ff);
  const ly=H+0.55;
  for(const x of [-1.15, 1.15]){
    const housing=new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.07, 0.6, 4, 0.03), alu);
    housing.position.set(x, ly, -0.05); housing.castShadow=true; group.add(housing);
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), lightMat);
    panel.rotation.x=Math.PI/2; panel.position.set(x, ly-0.036, -0.05); group.add(panel);
  }
  k.cables(group, [-1.15-0.24, -1.15+0.24, 1.15-0.24, 1.15+0.24], ly, -0.05);

  // ---- 白蜡木柜：浅色直纹木、两扇无把手平板门、深色内凹踢脚 ----
  const ash=k.woodTexture('ash', 0xe2d3b8, 0xb59c78, { lines:34, warp:1.4 });
  const body=new THREE.MeshStandardMaterial({ map:ash, roughness:0.58 });
  const door=new THREE.MeshStandardMaterial({ map:ash, roughness:0.5 });
  k.cabinet(group, { body, door, doors:2, kick:0x15120e });
  return lightMat;
}
