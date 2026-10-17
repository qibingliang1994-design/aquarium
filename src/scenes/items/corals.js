import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rrange, vnoise } from '../../utils.js';
import { injectCaustics } from '../../scene/caustics.js';
import { shared, injectSway, setPhase, paintGradient, castAll, UP } from './common.js';

/* ================================================================
 * 珊瑚：鹿角珊瑚（立体分叉）/ 海扇（平面分叉 + 摆动）/ 脑珊瑚（沟回半球）/ 海葵（触手摆动）
 * 配色按 seed 从调色板里挑，同一预设每次打开都长得一样
 * ================================================================ */

const pick = (rng, arr) => arr[Math.floor(rng()*arr.length)];
const _q=new THREE.Quaternion(), _d=new THREE.Vector3(), _axis=new THREE.Vector3();

/** 递归分叉：返回线段 { a, b, r0, r1, k }（k = 末梢程度 0..1） */
function growBranches(rng, { len, rad, depth, kids, spread, planar }){
  const segs=[];
  const grow=(a, dir, l, r, d)=>{
    const b=a.clone().addScaledVector(dir, l);
    segs.push({ a, b, r0:r, r1:r*0.72, k0:d/(depth+1), k1:(d+1)/(depth+1) });
    if(d>=depth) return;
    const n = d===0 ? kids[0] : (rng()<kids[2] ? kids[1] : 1);
    for(let i=0;i<n;i++){
      const nd=dir.clone();
      if(planar){ nd.applyAxisAngle(_axis.set(0,0,1), (n===1?0:(i/(n-1)-0.5)*2)*spread + rrange(rng,-0.25,0.25)); }
      else{
        _axis.set(rng()-0.5, 0, rng()-0.5).normalize();
        nd.applyAxisAngle(_axis, rrange(rng,0.3,1)*spread);
        nd.y+=0.35; nd.normalize();
      }
      grow(b, nd, l*rrange(rng,0.7,0.88), r*0.72, d+1);
    }
  };
  grow(new THREE.Vector3(0,-0.02,0), UP.clone(), len, rad, 0);
  return segs;
}

/** 线段 → 合并的圆柱 + 末梢圆头，按 k 上渐变色 */
function branchGeometry(segs, cBase, cTip, radial){
  const a=new THREE.Color(cBase), b=new THREE.Color(cTip), tmp=new THREE.Color();
  const parts=[];
  const paint=(g, k0, k1, y0, y1)=>{
    const p=g.attributes.position, col=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const t=Math.min(1,Math.max(0,(p.getY(i)-y0)/(y1-y0||1)));
      tmp.copy(a).lerp(b, Math.pow(k0+(k1-k0)*t, 1.3));
      col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col,3));
  };
  for(const s of segs){
    _d.subVectors(s.b, s.a); const l=_d.length(); _d.normalize();
    _q.setFromUnitVectors(UP, _d);
    const cyl=new THREE.CylinderGeometry(s.r1, s.r0, l, radial, 1, true).translate(0,l/2,0);
    paint(cyl, s.k0, s.k1, 0, l);
    cyl.applyQuaternion(_q).translate(s.a.x, s.a.y, s.a.z);
    parts.push(cyl);
    const cap=new THREE.SphereGeometry(s.r1, radial, 3);
    paint(cap, s.k1, s.k1, -1, 1);
    cap.translate(s.b.x, s.b.y, s.b.z);
    parts.push(cap);
  }
  const g=mergeGeometries(parts);           // 圆柱与圆头都是索引几何，法线随变换保留（不重算，免得接缝出棱）
  parts.forEach(p=>p.dispose());
  return g;
}

const coralMat = () => shared('mat:coral', ()=>{
  const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.62, metalness:0, emissive:0x000000});
  injectCaustics(m, 0.5, 'coral');
  return m;
});

/** 鹿角珊瑚 */
export function buildCoralBranch(rng){
  const [c0,c1]=pick(rng, [[0xb2486e,0xffb6cc],[0x6a46b0,0xd6bcff],[0xc0702e,0xffd8a0],[0x2e9a86,0xb6f6e2]]);
  const segs=growBranches(rng, { len:0.16, rad:0.034, depth:3, kids:[3,2,0.7], spread:0.7, planar:false });
  const mesh=castAll(new THREE.Mesh(branchGeometry(segs, c0, c1, 6), coralMat()));
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,0.22,0), r:0.22 }] };
}

/** 海扇：同一平面内的细密分叉，随水流整体轻摆 */
export function buildCoralFan(rng){
  const mat=shared('mat:fan', ()=>{
    const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.7, side:THREE.DoubleSide});
    injectSway(m, 0.045, 3.0, 'fan', true, 0.7);
    return m;
  });
  const [c0,c1]=pick(rng, [[0x9a2a40,0xff7a6a],[0x5e3496,0xc890ff],[0xb07f26,0xffe08a]]);
  const segs=growBranches(rng, { len:0.14, rad:0.016, depth:4, kids:[3,2,0.85], spread:0.55, planar:true });
  const g=branchGeometry(segs, c0, c1, 4);
  setPhase(g, rng()*6.283);
  const mesh=new THREE.Mesh(g, mat);
  mesh.receiveShadow=true;
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,0.3,0), r:0.2 }] };
}

/** 脑珊瑚：半球 + 噪声沟回，沟深色、脊浅色 */
export function buildCoralBrain(rng, seed){
  const [cg,cr]=pick(rng, [[0x4f5a26,0xc9d07a],[0x6e3452,0xf0a8c8],[0x6a4a2a,0xe8c890]]);
  const r=0.17, g=new THREE.SphereGeometry(r, 64, 32, 0, Math.PI*2, 0, Math.PI*0.56);
  const p=g.attributes.position, v=new THREE.Vector3(), o=(seed%613)*0.71;
  const col=new Float32Array(p.count*3), a=new THREE.Color(cg), b=new THREE.Color(cr), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    v.set(p.getX(i),p.getY(i),p.getZ(i));
    const n=vnoise(v.x*16+o, v.z*16+v.y*11)*0.7+vnoise(v.x*7+o, v.z*7-v.y*5)*0.3;
    const ridge=Math.pow(Math.abs(Math.sin(n*22)), 0.6);
    v.multiplyScalar(1+ridge*0.05);
    v.y*=0.72;
    p.setXYZ(i,v.x,v.y,v.z);
    tmp.copy(a).lerp(b, ridge);
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  g.translate(0,-0.025,0);
  const mesh=castAll(new THREE.Mesh(g, coralMat()));
  return { object:mesh, obstacles:[{ c:new THREE.Vector3(0,0.04,0), r:0.15 }] };
}

/** 海葵：短柱 + 一圈向外弯的发光触手（实例化，各自摆动），小丑鱼最爱 */
export function buildAnemone(rng){
  const [cb,ct]=pick(rng, [[0xa03c78,0xffb4e4],[0x2f8a5c,0xc0ffd6],[0xb85030,0xffd2a6]]);
  const tentMat=shared('mat:tentacle', ()=>{
    const m=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.45});
    injectSway(m, 0.03, 7.0, 'tentacle', true, 0.2);
    return m;
  });
  const colMat=shared('mat:anemoneCol', ()=>new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.7}));
  const group=new THREE.Group();
  const column=paintGradient(new THREE.CylinderGeometry(0.07,0.09,0.09,16).translate(0,0.025,0), cb, ct, -0.02, 0.16);
  group.add(new THREE.Mesh(column, colMat));
  const n=60;
  const geo=paintGradient(new THREE.CylinderGeometry(0.005,0.012,0.2,5,6).translate(0,0.1,0), cb, ct, 0, 0.2);
  const mesh=new THREE.InstancedMesh(geo, tentMat, n);
  mesh.frustumCulled=false;
  const phases=new Float32Array(n);
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pv=new THREE.Vector3(), c=new THREE.Color();
  for(let i=0;i<n;i++){
    const ring=Math.sqrt((i+0.5)/n), ang=i*2.39996+rng()*0.3;   // 黄金角铺满顶盘
    pv.set(Math.cos(ang)*ring*0.07, 0.07, Math.sin(ang)*ring*0.07);
    _axis.set(-Math.sin(ang), 0, Math.cos(ang));
    q.setFromAxisAngle(_axis, -(0.15+ring*0.9));                   // 外圈触手更外翻
    s.setScalar(rrange(rng,0.75,1.15));
    mesh.setMatrixAt(i, m.compose(pv,q,s));
    phases[i]=ang*1.7+rng();
    c.setScalar(rrange(rng,0.85,1.1));
    mesh.setColorAt(i, c);
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases,1));
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  group.add(mesh);
  castAll(group);
  return { object:group, obstacles:[{ c:new THREE.Vector3(0,0.08,0), r:0.13 }] };
}
