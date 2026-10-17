import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rrange } from '../../utils.js';

/* ================================================================
 * 写实叶片几何：沿中脉弯曲的叶片（叶柄 + 叶身 + 中脉 V 折 + 可选扭转），
 * 以及由叶片组合的植株单元（莲座丛 / 带状叶丛 / 茎生对叶 / 矮生地毯簇）。
 * 植株单元以原点为根、+Y 向上，交给 plants.js 实例化成一丛
 * ================================================================ */

const _c=new THREE.Color(), _a=new THREE.Color(), _b=new THREE.Color(), _v=new THREE.Color();

/**
 * 单片叶：len 长、width 宽；petiole 叶柄占比；tilt 起始外倾角、bend 总弯曲角（弧度）；
 * twist 沿长度扭转圈数（带状叶）；round=true 叶身更圆（矮生草）
 */
export function makeLeaf({ len, width, petiole=0, tilt=0.2, bend=0.6, twist=0, fold=0.22, round=false,
  cBase, cTip, cVein=null, segs=14, cols=4 }){
  const g=new THREE.PlaneGeometry(1, 1, cols, segs);   // cols=2 用于极小的叶片（省三角形）
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  _a.set(cBase); _b.set(cTip);
  // 预先积分中脉曲线（YZ 平面内，角度从 tilt 线性增加到 tilt+bend）
  const cy=[0], cz=[0];
  for(let i=1;i<=segs;i++){
    const th=tilt+bend*((i-0.5)/segs), ds=len/segs;
    cy.push(cy[i-1]+Math.cos(th)*ds); cz.push(cz[i-1]+Math.sin(th)*ds);
  }
  for(let i=0;i<p.count;i++){
    const side=p.getX(i)*2;                                         // -1..1（中列为中脉）
    const t=Math.min(1,Math.max(0,p.getY(i)+0.5));                  // 0..1，夹紧防 NaN
    const k=Math.min(segs, Math.round(t*segs));
    // 叶宽轮廓：叶柄细、叶身两头尖（round 更钝圆）
    const u=petiole>0 ? Math.max(0,(t-petiole)/(1-petiole)) : t;
    const blade=round ? Math.sin(Math.PI*Math.min(1,u*0.92+0.08))**0.5 : Math.sin(Math.PI*Math.min(1,u*0.9+0.1))**0.8;
    const w=(t<petiole ? 0.07 : 0.07+0.93*blade)*width/2;
    const th=tilt+bend*t, ang=twist*Math.PI*2*t;
    // 横截面：沿局部 X，带 V 折，再绕中脉扭转
    const lx=side*w, lz=(1-Math.abs(side))*w*fold;
    const x=lx*Math.cos(ang)-lz*Math.sin(ang), zz=lx*Math.sin(ang)+lz*Math.cos(ang);
    // 法向偏移（垂直于中脉、在 YZ 平面内）
    p.setXYZ(i, x, cy[k]-Math.sin(th)*zz, cz[k]+Math.cos(th)*zz);
    // 颜色：叶基→叶尖渐变，中脉提亮，叶缘略暗
    _c.copy(_a).lerp(_b, Math.pow(t,0.85));
    if(cVein && Math.abs(side)<0.01) _c.lerp(_v.set(cVein), 0.55);
    else if(Math.abs(side)>0.99) _c.multiplyScalar(0.82);
    col[i*3]=_c.r; col[i*3+1]=_c.g; col[i*3+2]=_c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}

/** 莲座丛：叶片绕中心螺旋排布，外圈更外倾（皇冠草 / 椒草） */
export function rosette(rng, { n, len:[l0,l1], width, petiole, tilt:[t0,t1], bend, colors, vein }){
  const parts=[];
  for(let i=0;i<n;i++){
    const k=i/(n-1||1), [cb,ct]=colors[Math.floor(rng()*colors.length)];
    const leaf=makeLeaf({ len:rrange(rng,l0,l1)*(1-k*0.25), width:width*rrange(rng,0.85,1.15), petiole,
      tilt:t0+(t1-t0)*k+rrange(rng,-0.08,0.08), bend:bend*rrange(rng,0.7,1.2), cBase:cb, cTip:ct, cVein:vein });
    leaf.rotateY(i*2.39996+rrange(rng,-0.2,0.2));                   // 黄金角，避免叶片叠在一起
    parts.push(leaf);
  }
  return mergeGeometries(parts);
}

/** 带状叶丛：细长扭转的缎带叶（苦草 / 海草） */
export function ribbons(rng, { n, len:[l0,l1], width, twist, colors, spread=0.03, segs=18, cols=4 }){   // segs/cols 调低用于成片的岸草
  const parts=[];
  for(let i=0;i<n;i++){
    const [cb,ct]=colors[Math.floor(rng()*colors.length)];
    const leaf=makeLeaf({ len:rrange(rng,l0,l1), width:width*rrange(rng,0.8,1.2), tilt:rrange(rng,0.02,0.18),
      bend:rrange(rng,0.15,0.55), twist:twist*rrange(rng,0.6,1.3), fold:0.08, cBase:cb, cTip:ct, segs, cols });
    leaf.rotateY(rng()*Math.PI*2);
    leaf.translate(rrange(rng,-spread,spread), 0, rrange(rng,-spread,spread));
    parts.push(leaf);
  }
  return mergeGeometries(parts);
}

/** 茎生植物：细茎 + 每节一对对生叶，叶色自下而上由绿转红（红宫廷 / 丁香） */
export function stemPlant(rng, { height, nodes, leafLen, leafW, cStem, cLow, cHigh }){
  const parts=[];
  const stem=new THREE.CylinderGeometry(0.0035,0.005,height,5,nodes).translate(0,height/2,0);
  const sc=new Float32Array(stem.attributes.position.count*3);
  _c.set(cStem); for(let i=0;i<sc.length;i+=3){ sc[i]=_c.r; sc[i+1]=_c.g; sc[i+2]=_c.b; }
  stem.setAttribute('color', new THREE.BufferAttribute(sc,3));
  stem.deleteAttribute('uv'); parts.push(stem);
  for(let j=1;j<=nodes;j++){
    const y=height*j/(nodes+0.4), k=j/nodes;
    _a.set(cLow).lerp(_b.set(cHigh), Math.pow(k,1.4));
    const hex=_a.getHex();
    for(const side of [0,Math.PI]){
      const leaf=makeLeaf({ len:leafLen*(1.1-k*0.45), width:leafW*(1.05-k*0.3), tilt:0.9-k*0.5, bend:0.5,
        cBase:hex, cTip:hex, fold:0.3, segs:4, cols:2 });
      leaf.deleteAttribute('uv');
      leaf.rotateY(side+j*1.5708+rrange(rng,-0.15,0.15));         // 十字对生：相邻两节转 90°
      leaf.translate(0,y,0);
      parts.push(leaf);
    }
  }
  return mergeGeometries(parts);
}

/** 矮生地毯：一簇圆叶小草（叶片多、几乎平铺），整体半球形 */
export function carpetClump(rng, { n, radius, colors }){
  const parts=[];
  for(let i=0;i<n;i++){
    const r=Math.sqrt(rng())*radius, a=rng()*Math.PI*2, [cb,ct]=colors[Math.floor(rng()*colors.length)];
    const h=0.05*(1-r/radius*0.6);
    const leaf=makeLeaf({ len:rrange(rng,0.032,0.05), width:rrange(rng,0.02,0.03), tilt:rrange(rng,0.5,1.3), bend:0.3,
      round:true, fold:0.15, cBase:cb, cTip:ct, segs:2, cols:2 });
    leaf.deleteAttribute('uv');
    leaf.rotateY(rng()*Math.PI*2);
    leaf.translate(Math.cos(a)*r, h*rrange(rng,0.3,1), Math.sin(a)*r);
    parts.push(leaf);
  }
  return mergeGeometries(parts);
}
