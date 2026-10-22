// @ts-check
import * as THREE from 'three';
import { vnoise } from '../utils.js';
import { U } from '../uniforms.js';
import { WAVE_GLSL } from './water-wave.js';
import { injectCaustics, causticsTex } from './caustics.js';
import { buildShell, disposeShell } from './tank-shells.js';
import { DEPTH_MAX } from './natural-shells.js';
import { createSkirtMaterial } from './substrate.js';
import { surfacePair, onTexPair } from '../scenes/items/surface-tex.js';
import { boundsFor } from '../scenes/tank-bounds.js';
import { setGround, setGroundBase } from './ground.js';

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
setGroundBase(sandHeight);

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
  uChop:U.chop,              // 波浪倍率（晴天 = 1）。水体合成 pass 共用同一个对象
  uMurk:{value:0},           // 额外茶色 0 = 不改水色；只在网格水面（自然水域）里混
  uDepthTex:{value:/** @type {THREE.Texture|null} */ (null)},   // 自然水域的水深贴图（natural-shells bakeDepth）
  uDepthBox:{value:new THREE.Vector4(0,0,1,1)},  // 贴图覆盖范围：x0, z0, 1/宽, 1/深
  uDepthOn:{value:0},
  // 灯带实形反射（学自 aquarium-editor 的 roomEnv）：各款式灯具发光面的矩形，水面着色器
  // 把经波面反射的视线打到灯平面、落在矩形内才亮——反射有"形状"而不是一团解析光斑
  uLampY:{value:2.24}, uLampHalf:{value:new THREE.Vector2(2.12,0.21)},
  uLampXZ:{value:new THREE.Vector2(0,-0.62)},     // 灯带中心 A（reef 双灯盘用 A/B 两块）
  uLampXZ2:{value:new THREE.Vector2(0,-0.62)},    // 灯带中心 B（单灯款式与 A 相同，max() 后等价单块）
  uLampCol:{value:new THREE.Color(0xfff2dd)},
  uLampK:{value:1},               // 灯带亮度（daynight 昼夜调光写，跟随灯具发光面变暗）
  uLampOn:{value:1},              // 玻璃缸才有灯带反射；自然水域 = 0
};
// 各款式灯带矩形（贴合 tank-shells.js / ming-shell.js 里发光面的真实位置与尺寸）
/** @type {Record<string, { y:number, half:[number,number], xz:[number,number], xz2?:[number,number], col:number }>} */
const LAMP_RECT={
  classic:{ y:2.24, half:[2.12,0.21], xz:[0,-0.62], col:0xfff2dd },   // 灯罩条 W*0.92×0.42 @H+0.039
  rimless:{ y:2.70, half:[2.07,0.075], xz:[0,-0.05], col:0xfff8ee },  // 吊灯细条 W*0.9×0.15 @H+0.504
  reef:{ y:2.63, half:[0.20,0.20], xz:[-1.15,-0.05], xz2:[1.15,-0.05], col:0xcfe0ff },  // 双灯盘 r0.2 @x±1.15
  zen:{ y:2.37, half:[2.12,0.25], xz:[0,-0.60], col:0xffdcae },       // 木质灯檐条 W*0.92×0.5 @H+0.168
  ming:{ y:2.41, half:[2.07,0.18], xz:[0,-0.55], col:0xffd6a0 },      // 翘头灯檐下的暖光条 W*0.9×0.36
};
const waterMesh=new THREE.Mesh(
  new THREE.PlaneGeometry(TANK.W-2*TANK.glass-0.01, TANK.D-2*TANK.glass-0.01, 48, 24).rotateX(-Math.PI/2),
  new THREE.ShaderMaterial({
    uniforms:waterUniforms, transparent:true, opacity:0.55, side:THREE.DoubleSide,
    depthWrite:false,          // 不写深度：镜头 pass（景深/水体纵深）要的是水面下物体的深度，俯视自然水域时尤其如此
    vertexShader:`
      uniform float uTime, uFlow, uChop;
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
      uniform float uTime, uClear, uDepthOn, uLampY, uLampK, uLampOn, uChop, uMurk;
      uniform vec3 uSky, uDeep, uLightColor, uLampCol;
      uniform sampler2D uCMap, uDepthTex;
      uniform vec4 uDepthBox;
      uniform vec2 uLampHalf, uLampXZ, uLampXZ2;
      varying vec3 vW; varying vec2 vXZ;
      void main(){
        float depth=1.0;                                   // 水深（自然水域按贴图，缸里视为很深）
        if(uDepthOn>0.5) depth=texture2D(uDepthTex, (vW.xz-uDepthBox.xy)*uDepthBox.zw).r*${DEPTH_MAX.toFixed(2)};
        float t=uTime;
        vec2 g=uChop*vec2(
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
        // 灯带实形反射：视线经波面反射打到灯平面，落在灯具发光面矩形内才亮（双灯盘查 A/B 两块）。
        // 掠射角（菲涅尔高）反射强、俯视弱；距离衰减防远灯带过亮
        if(uLampOn>0.5){
          vec3 rr=reflect(-v,n);
          if(rr.y>0.03){
            float tt=(uLampY-vW.y)/rr.y;
            vec2 q=vW.xz+rr.xz*tt;
            vec2 e1=abs(q-uLampXZ)-uLampHalf, e2=abs(q-uLampXZ2)-uLampHalf;
            float hit=max(1.0-smoothstep(0.0,0.04,max(e1.x,e1.y)), 1.0-smoothstep(0.0,0.04,max(e2.x,e2.y)));
            col+=uLampCol*uLampK*hit*(gl_FrontFacing?mix(0.22,1.1,fres):0.6)*2.4*exp(-tt*0.1);
          }
        }
        // 弯月线：水面贴玻璃处一条银线收边（学自 aquarium-editor 的 meniscus），亮度随灯带昼夜调光
        if(uLampOn>0.5 && gl_FrontFacing){
          float edge=min(${(TANK.W/2-TANK.glass-0.005).toFixed(3)}-abs(vW.x), ${(TANK.D/2-TANK.glass-0.005).toFixed(3)}-abs(vW.z));
          float men=1.0-smoothstep(0.0,0.02,edge);
          col+=(uLampCol*uLampK*0.8+vec3(0.22))*vec3(0.55,0.6,0.62)*men*(0.5+0.5*fres);
          alpha=mix(alpha,0.95,men*0.8);
        }
        vec3 r=reflect(normalize(vec3(-0.05,-1.0,-0.22)),n);
        col+=uLightColor*pow(max(dot(r,v),0.0),90.0)*2.2;
        float mk=clamp(uMurk, 0.0, 0.85);          // 0 时 mix 的系数是 0，水色与改前逐值相同
        col=mix(col, vec3(0.42, 0.50, 0.38), mk);
        alpha=mix(alpha, min(alpha+0.12, 0.96), mk);
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
injectCaustics(sandMat, 0.38, 'sand');   // 日间强度由 daynight 的 SAND_CAUSTIC 接管
// 照片级底砂（public/tex/，MIT · SkentSun/aquarium-editor）：上面的程序化砂粒先顶场，
// 贴图到位后热替换 albedo+法线；沙色仍由顶点色按主题调，贴图自带明暗用 color 增益找平
/** @type {Record<string, number>} */
const SAND_GAIN={ s_oiso:1.8, s_aquasoil:2.2, s_white:1.25 };   // 按各贴图平均亮度补偿，平均沙面亮度回到原水平
let sandPhotoName='';
function setSandPhoto(/** @type {string} */ name){
  if(name===sandPhotoName && sandMat.normalMap) return;          // 同贴图且已换装：只刷顶点色即可
  sandPhotoName=name;
  const p=surfacePair(name);
  onTexPair(p,(/** @type {any} */ t)=>{
    if(sandPhotoName!==name) return;                             // 等加载期间主题已切走：本次作废
    t.map.repeat.set(4.6,1.75); t.nor.repeat.set(4.6,1.75);      // 沙面 4.54×1.71，一张贴图约 1m
    sandMat.map=t.map; sandMat.bumpMap=null;
    sandMat.normalMap=t.nor; sandMat.normalScale.set(0.55,0.55);
    sandMat.color.setScalar(SAND_GAIN[name] ?? 1.8);
    sandMat.needsUpdate=true;                                    // bumpMap→normalMap 是宏变化，重编译一次
    sandTex.dispose();
  });
}
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
// tex：底砂照片贴图名（public/tex/，缺省大磯沙），由主题 sandTex 传入
function setSandColors(/** @type {number} */ a, /** @type {number} */ b, /** @type {string|undefined} */ tex){
  setSandPhoto(tex ?? 's_oiso');
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
setSandColors(0xa28862, 0x7e6647, 's_aquasoil');
const sand=new THREE.Mesh(sandGeo, sandMat);
sand.receiveShadow=true;
tankGroup.add(sand);
sandParts.push(sand);

/* ---------- 背景幕（渐变，增加纵深） ---------- */
// 水景缸常见的"背光幕"：缸体正后方柔和青色辉光，四周压暗，鱼与水草在其上形成剪影层次
const bgCanvas=document.createElement('canvas'); bgCanvas.width=512; bgCanvas.height=256;
const bgTex=new THREE.CanvasTexture(bgCanvas); bgTex.colorSpace=THREE.SRGBColorSpace;
// 背光幕重绘（主题色 'r,g,b'）：外圈辉光取主题色的 45% 亮度；art='ink' 画水墨远山（inkMountains）
function setBackdrop(/** @type {string} */ rgb, /** @type {string} */ art=''){
  const ctx=/** @type {CanvasRenderingContext2D} */ (bgCanvas.getContext('2d'));
  if(art==='ink'){ inkMountains(ctx, rgb); bgTex.needsUpdate=true; return; }
  const g=ctx.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#0c1824'); g.addColorStop(0.55,'#071220'); g.addColorStop(1,'#030507');
  ctx.fillStyle=g; ctx.fillRect(0,0,512,256);
  const dim=rgb.split(',').map((/** @type {string} */ v)=>Math.round(+v*0.45)).join(',');
  const r=ctx.createRadialGradient(256,150,10,256,150,250);
  r.addColorStop(0,`rgba(${rgb},0.55)`); r.addColorStop(0.45,`rgba(${dim},0.28)`); r.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=r; ctx.fillRect(0,0,512,256);
  bgTex.needsUpdate=true;
}
/** 水墨远山：雾色天光底 + 三重山（由远及近墨色渐浓，山脚化入雾里留白）+ 一轮淡日。
 * 透过水体与缸壁看过去是一幅压暗的山水立轴；四周仍压暗，与其他主题的"背光幕"同一个亮度结构
 * @param {CanvasRenderingContext2D} ctx @param {string} rgb */
function inkMountains(ctx, rgb){
  const [r,g,b]=rgb.split(',').map(Number);
  const sky=ctx.createLinearGradient(0,0,0,256);
  sky.addColorStop(0,`rgb(${r*0.42|0},${g*0.42|0},${b*0.42|0})`); sky.addColorStop(0.62,`rgb(${r*0.7|0},${g*0.7|0},${b*0.7|0})`);
  sky.addColorStop(1,`rgb(${r*0.5|0},${g*0.5|0},${b*0.5|0})`);
  ctx.fillStyle=sky; ctx.fillRect(0,0,512,256);
  ctx.fillStyle=`rgba(${Math.min(255,r+70)},${Math.min(255,g+60)},${Math.min(255,b+40)},0.35)`;   // 淡日
  ctx.beginPath(); ctx.arc(352,70,20,0,Math.PI*2); ctx.fill();
  const ridge=(/** @type {number} */ x, /** @type {number} */ base, /** @type {number} */ hgt, /** @type {number} */ f, /** @type {number} */ o)=>
    base - hgt*(0.55*vnoise(x*f+o, o)+0.3*vnoise(x*f*2.3+o, o*1.7)+0.15*vnoise(x*f*6+o, o*2.3))
      - hgt*0.6*Math.max(0, 1-Math.abs(x-o*37%512)/140)**2;     // 每重山一座主峰
  const layers=[
    { base:170, hgt:110, f:0.012, o:3.1, ink:0.32, mist:0.55 },
    { base:200, hgt:95,  f:0.017, o:8.7, ink:0.5,  mist:0.5 },
    { base:236, hgt:70,  f:0.024, o:15.3, ink:0.72, mist:0.45 },
  ];
  for(const L of layers){
    // 山体：墨色自山脊向下渐淡（山腰起雾），山脊一道略深的皴线
    const top=L.base-L.hgt*1.2;
    const grad=ctx.createLinearGradient(0,top,0,L.base+10);
    const d=1-L.ink;
    grad.addColorStop(0,`rgba(${r*d*0.35|0},${g*d*0.4|0},${b*d*0.4|0},${0.55+L.ink*0.4})`);
    grad.addColorStop(L.mist,`rgba(${r*d*0.5|0},${g*d*0.55|0},${b*d*0.55|0},${0.25+L.ink*0.3})`);
    grad.addColorStop(1,`rgba(${r*0.7|0},${g*0.7|0},${b*0.7|0},0)`);
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.moveTo(0,256);
    for(let x=0;x<=512;x+=4) ctx.lineTo(x, ridge(x, L.base, L.hgt, L.f, L.o));
    ctx.lineTo(512,256); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=`rgba(${r*0.12|0},${g*0.15|0},${b*0.15|0},${0.18+L.ink*0.3})`; ctx.lineWidth=1.2;
    ctx.beginPath();
    for(let x=0;x<=512;x+=4) x ? ctx.lineTo(x, ridge(x, L.base, L.hgt, L.f, L.o)) : ctx.moveTo(x, ridge(x, L.base, L.hgt, L.f, L.o));
    ctx.stroke();
  }
  // 四周压暗（与其他主题同样的暗角，避免整面墙发亮抢戏）
  const v=ctx.createRadialGradient(256,140,60,256,140,300);
  v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,0.75)');
  ctx.fillStyle=v; ctx.fillRect(0,0,512,256);
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
  const vol=boundsFor(id).volume;
  const built=buildShell(id, vol, { waterY:vol.waterY, sandHeight });
  setGround(typeof built.group.userData.bed==='function' ? built.group.userData.bed : null);
  waterMesh.position.y=vol.waterY;
  Object.assign(shell, { id, ...built });
  tankGroup.add(built.group);
  const nat=built.natural;
  for(const m of glassPanes) m.visible=!nat;
  for(const m of room) m.visible=!nat;
  for(const m of sandParts) m.visible=!nat;
  const wx=built.group.userData.water;          // 自然水域：水面铺到浅滩上（河道铺满），岸线由地形自然遮挡
  waterMesh.scale.set(nat ? wx.x*2/TANK.W : 1, 1, nat ? wx.z*2/TANK.D : 1);
  waterUniforms.uClear.value=nat ? 1 : 0;
  // 灯带反射矩形跟随款式（几何取自各外壳的发光面；自然水域没有灯具，反射与弯月线一并关闭）
  const lr=LAMP_RECT[id] ?? LAMP_RECT.classic;
  waterUniforms.uLampOn.value=nat ? 0 : 1;
  if(!nat){
    waterUniforms.uLampY.value=lr.y;
    waterUniforms.uLampHalf.value.set(/** @type {[number,number]} */ (lr.half)[0], /** @type {[number,number]} */ (lr.half)[1]);
    waterUniforms.uLampXZ.value.set(/** @type {[number,number]} */ (lr.xz)[0], /** @type {[number,number]} */ (lr.xz)[1]);
    const b=/** @type {[number,number]} */ (lr.xz2 ?? lr.xz);
    waterUniforms.uLampXZ2.value.set(b[0], b[1]);
    waterUniforms.uLampCol.value.set(lr.col);
  }
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
