import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, vnoise } from '../utils.js';
import { U } from '../uniforms.js';
import { injectCaustics, causticsTex, causticsOn } from '../scene/caustics.js';

export function createScenery({ tankGroup, sandHeight }){
  const obstacles=[];
  const _v1=new THREE.Vector3();   // 共享临时向量
function makeRock(r, seed){
  const g=new THREE.IcosahedronGeometry(r,3);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    _v1.set(p.getX(i),p.getY(i),p.getZ(i));
    const n=vnoise(_v1.x*2.2+seed, _v1.y*2.2+_v1.z*1.7+seed*2.1);
    _v1.multiplyScalar(1+ (n-0.5)*0.5);
    _v1.y*=0.8;
    p.setXYZ(i,_v1.x,_v1.y,_v1.z);
  }
  g.computeVertexNormals();
  const nrm=g.attributes.normal;
  const col=new Float32Array(p.count*3);
  const c1=new THREE.Color(0x71695c), c2=new THREE.Color(0x45413a), cm=new THREE.Color(0x51633c), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    tmp.copy(c1).lerp(c2, vnoise(p.getX(i)*3+seed, p.getZ(i)*3));
    if(nrm.getY(i)>0.45){ tmp.lerp(cm, Math.min(1,(nrm.getY(i)-0.45)*1.6)*(0.4+0.6*vnoise(p.getX(i)*5+seed*3, p.getZ(i)*5))); }
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  return g;
}
{
  const rockMat=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.92, metalness:0.02});
  injectCaustics(rockMat, 0.55, 'rock');
  const rocks=[
    [-1.22,-0.35,0.34],[-0.94,-0.42,0.2],[-1.5,-0.2,0.15],
    [1.14,-0.32,0.28],[1.42,-0.4,0.17],[0.74,-0.22,0.12],
    [1.58,0.3,0.09],[-1.56,0.33,0.08],[-0.24,0.45,0.06],
    [-0.7,-0.6,0.34],[0.45,-0.66,0.28],
  ];
  let seed=1;
  for(const [x,z,r] of rocks){
    const m=new THREE.Mesh(makeRock(r,seed++), rockMat);
    m.position.set(x, sandHeight(x,z)+r*0.35, z);
    m.scale.set(rand(0.9,1.25), rand(0.7,0.9), rand(0.9,1.2));
    m.rotation.y=rand(6.283);
    m.castShadow=m.receiveShadow=true;
    tankGroup.add(m);
    obstacles.push({ c:new THREE.Vector3(x, m.position.y+r*0.15, z), r:r*0.95 });
  }
}

{ /* 沉木拱 */
  const woodMat=new THREE.MeshStandardMaterial({color:0x5a4030, roughness:0.85, metalness:0.05});
  injectCaustics(woodMat, 0.4, 'wood');
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.72,0.34,-0.54), new THREE.Vector3(-0.42,0.8,-0.6),
    new THREE.Vector3(0,1.0,-0.58), new THREE.Vector3(0.42,0.78,-0.6),
    new THREE.Vector3(0.72,0.32,-0.54),
  ]);
  const wood=new THREE.Mesh(new THREE.TubeGeometry(curve,40,0.045,8), woodMat);
  wood.castShadow=wood.receiveShadow=true;
  tankGroup.add(wood);
  const branch=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18,0.86,-0.58), new THREE.Vector3(-0.4,1.1,-0.6),
    new THREE.Vector3(-0.52,1.24,-0.56),
  ]);
  const branchMesh=new THREE.Mesh(new THREE.TubeGeometry(branch,16,0.026,7), woodMat);
  branchMesh.castShadow=branchMesh.receiveShadow=true;
  tankGroup.add(branchMesh);
  const moss=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32,1),
    new THREE.MeshStandardMaterial({color:0x4a6b2f, roughness:1, flatShading:true}), 10);
  const mm=new THREE.Matrix4(), mq=new THREE.Quaternion(), ms=new THREE.Vector3(), mp=new THREE.Vector3();
  [0.18,0.32,0.46,0.6,0.74].forEach((t,i)=>{
    mp.copy(curve.getPoint(t)); mp.y+=0.02;
    mp.x+=rand(-0.05,0.05); mp.z+=rand(-0.04,0.04);
    const s=rand(0.035,0.06);
    ms.set(s*1.5,s*0.55,s*1.2);
    mq.setFromAxisAngle(_v1.set(0,1,0), rand(6.283));
    moss.setMatrixAt(i, mm.compose(mp,mq,ms));
  });
  moss.count=5;   // 只用前 5 个实例
  moss.castShadow=true;
  tankGroup.add(moss);
  for(const t of [0.25,0.5,0.75])
    obstacles.push({ c:curve.getPoint(t), r:0.13 });
}

/* ---------- 水草（实例化 + 顶点摆动） ---------- */
// 摆动 + 叶片透光（逆光时微微发亮）+ 焦散；深度材质只做摆动
function injectSway(mat, amp, freq, key, shade=false){
  mat.customProgramCacheKey=()=> `sway_${key}${shade?'_s':''}`;
  mat.onBeforeCompile=(sh)=>{
    sh.uniforms.uTimeS=U.time;
    sh.uniforms.uAmp={value:amp};
    sh.uniforms.uFreq={value:freq};
    sh.vertexShader='uniform float uTimeS, uAmp, uFreq;\nattribute float aPhase;\nvarying vec3 vSwW;\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float hh = clamp( transformed.y / 1.1, 0.0, 1.0 );
        float ss = pow( hh, 1.45 );
        transformed.x += sin( uTimeS*1.15 + aPhase + transformed.y*uFreq ) * ss * uAmp;
        transformed.z += cos( uTimeS*0.93 + aPhase*1.31 + transformed.y*uFreq*0.9 ) * ss * uAmp * 0.6;
      }
      #ifdef USE_INSTANCING
        vSwW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
      #else
        vSwW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      #endif`);
    if(!shade) return;
    Object.assign(sh.uniforms, { uCMap:{value:causticsTex}, uCOn:causticsOn });
    sh.fragmentShader='uniform sampler2D uCMap; uniform float uTimeS, uCOn;\nvarying vec3 vSwW;\n'
      + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float c1=texture2D(uCMap, vSwW.xz*0.55+vec2(uTimeS*0.021, uTimeS*0.017)).r;
          float c2=texture2D(uCMap, vSwW.xz*0.92-vec2(uTimeS*0.013,-uTimeS*0.019)).r;
          diffuseColor.rgb += diffuseColor.rgb*pow(min(c1,c2),1.4)*smoothstep(1.75,1.0,vSwW.y)*1.6*uCOn;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.1;`);
  };
}
// 叶片：两端收尖的柳叶轮廓 + 中脉 V 折（宽 2 段，中线顶点前凸），中脉颜色稍亮
function makeBlade(width, height, cBase, cTip, bend){
  const g=new THREE.PlaneGeometry(width,height,2,12).translate(0,height/2,0);
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  const cb=new THREE.Color(cBase), ct=new THREE.Color(cTip), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    // 夹紧：translate 后底边 y 可能是 -1e-17，负数开小数次幂会得到 NaN（NaN 像素经泛光扩散成大片黑块）
    const t=Math.min(1,Math.max(0,p.getY(i)/height));
    const side=p.getX(i)/(width/2);                       // -1 / 0 / 1
    const w=Math.pow(Math.max(0,Math.sin(Math.PI*Math.min(1,0.14+0.86*t))),0.7); // 叶基略窄、中部最宽、叶尖收尖
    p.setX(i, side*width/2*w);
    p.setZ(i, t*t*bend + (1-Math.abs(side))*width*0.18*w); // 弯曲 + 中脉前凸
    tmp.copy(cb).lerp(ct,Math.pow(t,0.8));
    if(side===0) tmp.multiplyScalar(1.18);
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}
function makeBladeX(width, height, cBase, cTip, bend){
  const a=makeBlade(width,height,cBase,cTip,bend);
  const b=makeBlade(width,height,cBase,cTip,bend); b.rotateY(Math.PI/2);
  return mergeGeometries([a,b]);
}
function plantCluster(geo, positions, tint){
  const n=positions.length;
  const mesh=new THREE.InstancedMesh(geo,
    new THREE.MeshPhysicalMaterial({vertexColors:true, roughness:0.55, metalness:0, side:THREE.DoubleSide,
      sheen:0.6, sheenRoughness:0.45, sheenColor:new THREE.Color(0xb8f08a), specularIntensity:0.5}), n);
  injectSway(mesh.material, 0.1, 2.1, 'blade', true);
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  injectSway(depth, 0.1, 2.1, 'blade_d');
  mesh.customDepthMaterial=depth;
  mesh.castShadow=true;
  mesh.frustumCulled=false;
  const phases=new Float32Array(n);
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pv=new THREE.Vector3();
  const col=new THREE.Color();
  positions.forEach(([x,z,h],i)=>{
    phases[i]=rand(6.283);
    q.setFromAxisAngle(_v1.set(0,1,0), rand(6.283));
    s.set(rand(0.75,1.2), h, 1);
    pv.set(x, sandHeight(x,z)-0.015, z);
    mesh.setMatrixAt(i, m.compose(pv,q,s));
    col.setRGB(tint[0]*rand(0.85,1.12), tint[1]*rand(0.85,1.12), tint[2]*rand(0.85,1.12));
    mesh.setColorAt(i,col);
  });
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases,1));
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  tankGroup.add(mesh);
  return mesh;
}
{
  const kelpPos=[];
  for(let i=0;i<18;i++) kelpPos.push([-1.25+rand(-0.22,0.22), -0.45+rand(-0.16,0.16), rand(0.85,1.55)]);
  for(let i=0;i<14;i++) kelpPos.push([0.12+rand(-0.22,0.22), -0.52+rand(-0.14,0.14), rand(0.8,1.4)]);
  for(let i=0;i<12;i++) kelpPos.push([1.08+rand(-0.18,0.18), -0.44+rand(-0.12,0.12), rand(0.7,1.25)]);
  for(let i=0;i<8;i++) kelpPos.push([-1.78+rand(-0.15,0.15), -0.62+rand(-0.1,0.1), rand(0.3,0.7)]);
  for(let i=0;i<8;i++) kelpPos.push([1.78+rand(-0.15,0.15), -0.62+rand(-0.1,0.1), rand(0.3,0.7)]);
  plantCluster(makeBladeX(0.08,1.15,0x123c1c,0x4f9c3a,0.16), kelpPos, [1,1,1]);

  const bushPos=[];
  for(let i=0;i<12;i++) bushPos.push([-1.1+rand(-0.24,0.24), 0.3+rand(-0.16,0.16), rand(0.62,1.05)]);
  for(let i=0;i<8;i++)  bushPos.push([0.82+rand(-0.18,0.18), 0.34+rand(-0.12,0.12), rand(0.55,0.98)]);
  plantCluster(makeBladeX(0.17,0.6,0x0f3016,0x3b7a2c,0.22), bushPos, [0.95,1.05,0.9]);

  // 阔叶皇冠草（后景两丛）
  const crownPos=[];
  for(let i=0;i<7;i++) crownPos.push([-1.85+rand(-0.14,0.14), -0.68+rand(-0.1,0.1), rand(0.35,0.75)]);
  for(let i=0;i<7;i++) crownPos.push([1.85+rand(-0.14,0.14), -0.68+rand(-0.1,0.1), rand(0.3,0.7)]);
  plantCluster(makeBladeX(0.15,1.4,0x0e3520,0x59a845,0.1), crownPos, [1,1,1]);

  // 红宫廷（中景点缀）
  const redPos=[];
  for(let i=0;i<6;i++) redPos.push([-0.55+rand(-0.1,0.1), 0.1+rand(-0.12,0.12), rand(0.15,0.45)]);
  for(let i=0;i<6;i++) redPos.push([0.15+rand(-0.1,0.1), 0.14+rand(-0.12,0.12), rand(0.1,0.4)]);
  plantCluster(makeBladeX(0.035,0.55,0x4a1a14,0xc4503a,0.09), redPos, [1,1,1]);

  // 前景矮草
  const carpetPos=[];
  for(let i=0;i<26;i++) carpetPos.push([rand(-2.0,2.0), rand(-0.15,0.1), rand(0.4,0.78)]);
  plantCluster(makeBladeX(0.022,0.14,0x1c4a24,0x5da23e,0.04), carpetPos, [1,1,1]);
}

/* ---------- 碎石点缀 ---------- */
{
  const mesh=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),
    new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9}), 56);
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pv=new THREE.Vector3();
  const palette=[0xbcb09b,0x9d9281,0xd6cab4,0xab8d6c,0x857b6e].map(c=>new THREE.Color(c));   // 偏浅的河卵石色，避免像杂质黑点
  for(let i=0;i<56;i++){
    const x=rand(-2.1,2.1), z=rand(-0.78,0.78);
    const sc=rand(0.012,0.034);
    q.setFromAxisAngle(_v1.set(rand(-1,1),rand(-1,1),rand(-1,1)).normalize(), rand(6.283));
    s.set(sc,sc*rand(0.55,0.8),sc);
    pv.set(x, sandHeight(x,z)+sc*0.35, z);
    mesh.setMatrixAt(i, m.compose(pv,q,s));
    mesh.setColorAt(i, palette[Math.floor(rand(0,palette.length))]);
  }
  mesh.receiveShadow=true;
  tankGroup.add(mesh);
}

/* ---------- 气石 + 气管 ---------- */
const AIR={ x:1.6, z:0.5 };
{
  const stoneY=sandHeight(AIR.x,AIR.z);
  const stone=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.045,0.035,10),
    new THREE.MeshStandardMaterial({color:0x3a3f45, roughness:0.9}));
  stone.position.set(AIR.x, stoneY+0.02, AIR.z);
  tankGroup.add(stone);
  const tube=new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.44,0.9,0.48), new THREE.Vector3(AIR.x,stoneY+0.05,AIR.z),
      new THREE.Vector3(1.44,0.9,0.48), new THREE.Vector3(AIR.x,stoneY+0.05,AIR.z),
    ]), 24, 0.012, 6),
    new THREE.MeshStandardMaterial({color:0x14181c, roughness:0.6}));
  tankGroup.add(tube);
}
  return { obstacles, AIR };
}
