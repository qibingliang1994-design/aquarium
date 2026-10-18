// @ts-check
import * as THREE from 'three';
import { vnoise } from '../utils.js';
import { U } from '../uniforms.js';
import { WAVE_GLSL } from './water-wave.js';
import { injectCaustics, causticsTex } from './caustics.js';
import { buildShell, disposeShell } from './tank-shells.js';
import { DEPTH_MAX } from './natural-shells.js';
import { createSkirtMaterial } from './substrate.js';

/* ================================================================
 * 水族箱尺寸
 * ================================================================ */
export const TANK = {
  W: 4.6, H: 2.2, D: 1.8,          // 玻璃外尺寸
  glass: 0.035,                    // 玻璃厚
  waterY: 1.84,                    // 水面高度
};

// 沙面高度场（沙地网格与查询共用同一函数）
export function sandHeight(/** @type {number} */ x, /** @type {number} */ z){
  return 0.20 + vnoise(x*1.5+3.7, z*1.5+7.2)*0.10 + (z*0.5+0.5)*0.10;
}

export function createTank(/** @type {any} */ scene){
/* ================================================================
 * 水族箱本体：玻璃 / 边框 / 灯罩 / 水面 / 沙底
 * ================================================================ */
const tankGroup=new THREE.Group();
scene.add(tankGroup);

// 经典透明玻璃（非 transmission）：透射材质会把透明物体（气泡/光柱/悬浮物）
// 从缸外视角剔除，改为普通透明后全部可见，且省掉透射 pass 提升性能
const glassHigh=new THREE.MeshPhysicalMaterial({
  color:0xcfeef0, roughness:0.04, metalness:0, transparent:true, opacity:0.018,
  envMapIntensity:0.8, clearcoat:1, clearcoatRoughness:0.06,
  specularIntensity:1, depthWrite:false });
const glassLow=new THREE.MeshPhysicalMaterial({
  color:0xdff2f4, transparent:true, opacity:0.035, roughness:0.08, metalness:0, envMapIntensity:0.9, depthWrite:false });
// 玻璃不写深度：几乎全透明，写了反而让水体纵深后期（water-haze.js）只"看到"前玻璃
const glassMat=glassHigh;
/** @type {any[]} */ const glassPanes=[];      // 自然水域时隐藏
{
  const W=TANK.W, H=TANK.H, D=TANK.D, t=TANK.glass;
  const front=new THREE.Mesh(new THREE.BoxGeometry(W,H,t), glassMat);
  front.position.set(0,H/2, D/2-t/2);
  const back=front.clone(); back.position.z=-(D/2-t/2);
  const left=new THREE.Mesh(new THREE.BoxGeometry(t,H,D-2*t), glassMat);
  left.position.set(-(W/2-t/2),H/2,0);
  const right=left.clone(); right.position.x=W/2-t/2;
  const bottom=new THREE.Mesh(new THREE.BoxGeometry(W-2*t,t,D-2*t),
    new THREE.MeshStandardMaterial({color:0x0c1013, roughness:0.9}));
  bottom.position.y=t/2;
  tankGroup.add(front,back,left,right,bottom);
  glassPanes.push(front,back,left,right,bottom);

}

/* ---------- 水面 ---------- */
const waterUniforms={
  uTime:U.time,
  uSky:{value:new THREE.Color(0.45,0.62,0.72)},
  uDeep:{value:new THREE.Color(0.02,0.09,0.13)},
  uLightColor:{value:new THREE.Color(1.0,0.95,0.85)},
  uCMap:{value:causticsTex},
  uClear:{value:0},          // 0 = 缸（水面近乎不透明，主要从侧面看）；1 = 自然水域（俯视时清澈见底，掠射角才反光）
  uFlow:U.flow,              // 水流速度：波纹沿 +x 漂移（与水草倒伏、浮叶共用）
  uDepthTex:{value:/** @type {THREE.Texture|null} */ (null)},   // 自然水域的水深贴图（natural-shells bakeDepth）
  uDepthBox:{value:new THREE.Vector4(0,0,1,1)},  // 贴图覆盖范围：x0, z0, 1/宽, 1/深
  uDepthOn:{value:0},
};
const waterMesh=new THREE.Mesh(
  new THREE.PlaneGeometry(TANK.W-2*TANK.glass-0.01, TANK.D-2*TANK.glass-0.01, 48, 24).rotateX(-Math.PI/2),
  new THREE.ShaderMaterial({
    uniforms:waterUniforms, transparent:true, opacity:0.55, side:THREE.DoubleSide,
    vertexShader:`
      uniform float uTime, uFlow;
      varying vec3 vW; varying vec2 vXZ;
      ${WAVE_GLSL}
      void main(){
        float t=uTime;
        vec4 wp=modelMatrix*vec4(position,1.0);          // 波形按世界坐标算：自然水域放大水面时波长不变
        vec2 q=vec2(wp.x-uFlow*t*0.9, wp.z);              // 顺流平移的波形坐标
        wp.y += waterWave(wp.xz, t, uFlow);               // 与浮叶共用（water-wave.js）
        vW=wp.xyz; vXZ=q;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader:`
      uniform float uTime, uClear, uDepthOn; uniform vec3 uSky, uDeep, uLightColor; uniform sampler2D uCMap, uDepthTex;
      uniform vec4 uDepthBox;
      varying vec3 vW; varying vec2 vXZ;
      void main(){
        float depth=1.0;                                   // 水深（自然水域按贴图，缸里视为很深）
        if(uDepthOn>0.5) depth=texture2D(uDepthTex, (vW.xz-uDepthBox.xy)*uDepthBox.zw).r*${DEPTH_MAX.toFixed(2)};
        float t=uTime;
        vec2 g=vec2(
          7.0*cos(vXZ.x*7.0+t*1.3)*0.006 + 5.0*cos((vXZ.x+vXZ.y)*5.0+t*0.9)*0.006,
          9.0*cos(vXZ.y*9.0+t*1.7)*0.006 + 5.0*cos((vXZ.x+vXZ.y)*5.0+t*0.9)*0.006);
        // 法线 y 分量太小（此前缸模式 0.02，而波斜率可达 0.07）会让法线几乎水平，俯视时菲涅尔变成大块条纹
        vec3 n=normalize(vec3(-g.x,mix(0.25,0.4,uClear),-g.y));
        if(!gl_FrontFacing) n=-n;
        vec3 v=normalize(cameraPosition-vW);
        float fres=pow(1.0-max(dot(n,v),0.0),3.0);
        // 正面（俯视）：天光渐变；背面（仰视）：掠射角全内反射变亮 + 灯光透过波面的流动亮纹
        vec3 col;
        float alpha=0.93;
        if(gl_FrontFacing){
          col = mix(uDeep, uSky, fres*0.95);
          // 按视角：侧看（掠射）仍是反光的水面，俯视时透出缸里（此前缸模式恒 0.93，俯视机位和编辑器都被一块深色板挡住）
          alpha = mix(mix(0.32, 0.93, pow(fres,0.7)), mix(0.2, 0.92, pow(fres,0.8)), uClear);
          if(uDepthOn>0.5){
            // 岸线：越浅越透、贴岸处淡出到 0（不再是平面插进地形的硬边）；浅滩微微提亮
            float shallow=1.0-smoothstep(0.04, 0.5, depth);
            alpha *= smoothstep(0.0, 0.16, depth)*mix(1.0, 0.55, shallow);
            col = mix(col, uSky*0.85, shallow*0.22);
            // 湿边白沫：岸线内侧一窄条，焦散纹理当碎沫噪声，随时间缓慢流动
            // 带宽要比地形网格的三角面大，否则水深贴图（平滑插值）与分段线性的地形对不齐，白沫成锯齿折线
            float fo=(1.0-smoothstep(0.0, 0.09, depth))*smoothstep(0.0, 0.025, depth);
            float nz=texture2D(uCMap, vXZ*1.6+vec2(t*0.04, -t*0.03)).r;
            fo*=smoothstep(0.2, 0.8, nz);
            col += vec3(0.85,0.9,0.92)*fo*0.3;
            alpha = max(alpha, fo*0.28);
          }
        }
        else {
          float graze = pow(1.0-abs(dot(n,v)), 2.2);
          float s1 = texture2D(uCMap, vXZ*0.8 + vec2(t*0.031, t*0.022)).r;
          float s2 = texture2D(uCMap, vXZ*1.3 - vec2(t*0.024,-t*0.017)).r;
          col = mix(uDeep*1.5, uSky*0.62, graze) + uLightColor*pow(s1*s2,0.7)*0.32*(1.0-graze*0.6);
          alpha = 0.82 + 0.15*graze;
        }
        vec3 r=reflect(normalize(vec3(-0.05,-1.0,-0.22)),n);
        col+=uLightColor*pow(max(dot(r,v),0.0),90.0)*2.2;
        gl_FragColor=vec4(col,alpha);
      }`,
  }));
waterMesh.position.y=TANK.waterY;
tankGroup.add(waterMesh);

/* ---------- 沙底（颗粒纹理） ---------- */
const sandTex=(()=>{
  const s=512, cv=document.createElement('canvas'); cv.width=cv.height=s;
  const ctx=/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  ctx.fillStyle='#f4f1ea'; ctx.fillRect(0,0,s,s);          // 近白底：沙色交给顶点色（随主题切换）
  const img=ctx.getImageData(0,0,s,s), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*26;
    d[i]+=n; d[i+1]+=n*0.9; d[i+2]+=n*0.8;
  }
  ctx.putImageData(img,0,0);
  for(let i=0;i<1400;i++){                      // 深浅砂粒
    ctx.fillStyle=Math.random()<0.5?'rgba(90,75,55,.5)':'rgba(255,248,230,.45)';
    const r=Math.random()*1.4+0.4;
    ctx.beginPath(); ctx.arc(Math.random()*s,Math.random()*s,r,0,7); ctx.fill();
  }
  const tex=new THREE.CanvasTexture(cv);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(3,1.6);
  tex.anisotropy=8; tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
})();
const sandMat=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, metalness:0, map:sandTex, bumpMap:sandTex, bumpScale:0.12});
injectCaustics(sandMat, 0.7, 'sand');
const sandGeo=new THREE.PlaneGeometry(TANK.W-2*TANK.glass-0.02, TANK.D-2*TANK.glass-0.02, 72, 32).rotateX(-Math.PI/2);
{
  const p=sandGeo.attributes.position;
  for(let i=0;i<p.count;i++) p.setY(i, sandHeight(p.getX(i),p.getZ(i)));
  sandGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count*3),3));
  sandGeo.computeVertexNormals();
}
// 底砂侧壁：贴着四面玻璃、从缸底到沙面的竖直截面——透过前玻璃看到的是一层层底砂，而不是缸底
const skirtGeo=(()=>{
  const iw=TANK.W/2-TANK.glass-0.004, id=TANK.D/2-TANK.glass-0.004;
  /** @type {any[]} */ const parts=[];
  const side=(/** @type {number} */ x0,/** @type {number} */ z0,/** @type {number} */ x1,/** @type {number} */ z1)=>{
    const n=48, g=new THREE.PlaneGeometry(1,1,n,3), p=g.attributes.position, sk=new Float32Array(p.count);
    for(let i=0;i<p.count;i++){
      const u=p.getX(i)+0.5, v=p.getY(i)+0.5, x=x0+(x1-x0)*u, z=z0+(z1-z0)*u;
      p.setXYZ(i, x, TANK.glass+(sandHeight(x,z)-TANK.glass)*v, z);
      sk[i]=v;                                      // 纵向比例：着色器据此分层
    }
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count*3),3));
    g.setAttribute('aSkD', new THREE.BufferAttribute(sk,1));
    g.computeVertexNormals();
    parts.push(g);
  };
  side(-iw,id, iw,id); side(iw,-id, -iw,-id); side(-iw,-id, -iw,id); side(iw,id, iw,-id);
  return parts;
})();
/** @type {any[]} */ const sandParts=[];        // 沙床 + 侧裙：自然水域时由地形接管
const skirtMat=createSkirtMaterial();             // 分层底砂截面（substrate.js）
for(const g of skirtGeo){ const m=new THREE.Mesh(g, skirtMat); m.receiveShadow=true; tankGroup.add(m); sandParts.push(m); }
// 沙色（主题切换时重刷顶点色）：两色按噪声斑驳混合；侧壁越深越暗（湿砂 + 光线衰减）
function setSandColors(/** @type {number} */ a, /** @type {number} */ b){
  const c1=new THREE.Color(a), c2=new THREE.Color(b), tmp=new THREE.Color();
  for(const g of [sandGeo, ...skirtGeo]){
    const p=g.attributes.position, col=g.attributes.color, skirt=g!==sandGeo;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i), z=p.getZ(i);
      tmp.copy(c1).lerp(c2, vnoise(x*2.3+11,z*2.3+5)*0.8);
      if(skirt){
        const depth=1-(p.getY(i)-TANK.glass)/Math.max(0.01,sandHeight(x,z)-TANK.glass);
        tmp.multiplyScalar(0.92-depth*0.45);         // 越深越暗（颗粒与分层在 skirtMat 着色器里）
      }
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate=true;
  }
}
setSandColors(0xa28862, 0x7e6647);
const sand=new THREE.Mesh(sandGeo, sandMat);
sand.receiveShadow=true;
tankGroup.add(sand);
sandParts.push(sand);

/* ---------- 背景幕（渐变，增加纵深） ---------- */
// 水景缸常见的"背光幕"：缸体正后方柔和青色辉光，四周压暗，鱼与水草在其上形成剪影层次
const bgCanvas=document.createElement('canvas'); bgCanvas.width=512; bgCanvas.height=256;
const bgTex=new THREE.CanvasTexture(bgCanvas); bgTex.colorSpace=THREE.SRGBColorSpace;
// 背光幕重绘（主题色 'r,g,b'）：外圈辉光取主题色的 45% 亮度
function setBackdrop(/** @type {string} */ rgb){
  const ctx=/** @type {CanvasRenderingContext2D} */ (bgCanvas.getContext('2d'));
  const g=ctx.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#0c1824'); g.addColorStop(0.55,'#071220'); g.addColorStop(1,'#030507');
  ctx.fillStyle=g; ctx.fillRect(0,0,512,256);
  const dim=rgb.split(',').map((/** @type {string} */ v)=>Math.round(+v*0.45)).join(',');
  const r=ctx.createRadialGradient(256,150,10,256,150,250);
  r.addColorStop(0,`rgba(${rgb},0.55)`); r.addColorStop(0.45,`rgba(${dim},0.28)`); r.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=r; ctx.fillRect(0,0,512,256);
  bgTex.needsUpdate=true;
}
setBackdrop('58,138,160');
const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(8.6,4.6),
  new THREE.MeshBasicMaterial({map:bgTex, fog:false}));
backdrop.position.set(0,1.5,-2.5);
scene.add(backdrop);

/* ---------- 缸体外壳（框 / 灯具 / 底柜，随场景款式切换，见 tank-shells.js） ---------- */
const shell={ id:'', group:null, lightMat:null };
/** @type {any[]} */ const room=[];             // 房间地面 / 漏光 / 背光幕：自然水域时隐藏（换成户外地形与天空）
function setShell(/** @type {string} */ id){
  if(shell.id===id) return;
  if(shell.group){ tankGroup.remove(shell.group); disposeShell(shell.group); }
  const built=buildShell(id, TANK, { waterY:TANK.waterY, sandHeight });
  Object.assign(shell, { id, ...built });
  tankGroup.add(built.group);
  const nat=built.natural;
  for(const m of glassPanes) m.visible=!nat;
  for(const m of room) m.visible=!nat;
  for(const m of sandParts) m.visible=!nat;
  const wx=built.group.userData.water;          // 自然水域：水面铺到浅滩上（河道铺满），岸线由地形自然遮挡
  waterMesh.scale.set(nat ? wx.x*2/TANK.W : 1, 1, nat ? wx.z*2/TANK.D : 1);
  waterUniforms.uClear.value=nat ? 1 : 0;
  waterUniforms.uDepthTex.value?.dispose();      // 上一个自然水域的水深贴图
  const dp=built.group.userData.depth;
  waterUniforms.uDepthTex.value=dp?.tex ?? null;
  if(dp) waterUniforms.uDepthBox.value.copy(dp.box);
  waterUniforms.uDepthOn.value=dp ? 1 : 0;
}

/* ---------- 房间地面 ---------- */
let floorGlowMat;
{
  const floor=new THREE.Mesh(new THREE.CircleGeometry(14,48).rotateX(-Math.PI/2),
    new THREE.MeshStandardMaterial({color:0x0e0f12, roughness:0.62, metalness:0.2}));
  floor.position.y=-0.75;
  floor.receiveShadow=true;
  scene.add(floor); room.push(floor);
  // 地面光晕：缸体透出的水色漏光，把柜子"落"在地上
  const glowTex=(()=>{
    const cv=document.createElement('canvas'); cv.width=cv.height=256;
    const ctx=/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    const r=ctx.createRadialGradient(128,128,0,128,128,128);
    r.addColorStop(0,'rgba(70,170,200,0.32)'); r.addColorStop(0.5,'rgba(40,110,140,0.12)'); r.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=r; ctx.fillRect(0,0,256,256);
    const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  })();
  floorGlowMat=new THREE.MeshBasicMaterial({map:glowTex, transparent:true, depthWrite:false,
    blending:THREE.AdditiveBlending, fog:false});
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(9,5).rotateX(-Math.PI/2), floorGlowMat);
  glow.position.y=-0.748;
  scene.add(glow); room.push(glow);
}
room.push(backdrop);
setShell('classic');
  return { tankGroup, waterUniforms, glassHigh, glassLow, sandMat, waterMesh, floorGlowMat, setSandColors, setBackdrop, shell, setShell };
}
