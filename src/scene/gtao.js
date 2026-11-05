// @ts-check
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ================================================================
 * 屏幕空间环境光遮蔽（GTAO，学自 tidewater src/post/GTAO.js ← three GTAONode ← Activision 2016 / XeGTAO）
 *
 * 只读场景 RT 的深度：法线从深度重建（左右/上下取深度差小的一侧，轮廓处不糊），每像素沿若干个
 * 屏幕方向切片向两侧找"地平线"，按余弦加权的闭式积分求可见度——石缝、水草根部、沉木拱下、
 * 鱼贴近沙面处自然变暗，物件像长在沙里而不是摆在上面。
 * - 半分辨率（场景 RT 的一半）计算；噪声是 4×4 固定图样（切片角 + 步进偏移），随后 4×4 深度感知
 *   盒式模糊恰好把图样抹平（本项目没有 TAA，不能靠时间累积去噪）
 * - 世界空间半径（随相机距离换算成像素，近景封顶），超出半径的样本按距离渐隐回"无遮挡"，
 *   前景物和远处背光幕之间不会出现黑晕
 * - 天空 / 远平面（深度 = 1）不算
 * 输出 texture：r = 可见度（1 = 无遮挡）。合成在 edge-aa.js（FXAA 收尾时乘上去）。
 * 深度里没有玻璃、水面（不写深度），正好只遮蔽实体。
 * ================================================================ */

const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';

const AO_FRAG = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec2 uDepthPx, uRes;
uniform float uProj11, uRadius, uMaxPx, uPower, uThin;
varying vec2 vUv;
#define PI 3.14159265
#define SLICES __SLICES__
#define STEPS __STEPS__
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
// 4×4 有序抖动（Bayer）：与模糊核同尺寸，模糊后图样完全抵消
const float B4[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
float bayer4(vec2 px){
  ivec2 p = ivec2(mod(floor(px), 4.0));
  return (B4[p.x + p.y * 4] + 0.5) / 16.0;
}
float fastAcos(float x){
  float ax = abs(x);
  float r = (-0.156583 * ax + PI * 0.5) * sqrt(max(1.0 - ax, 0.0));
  return x >= 0.0 ? r : PI - r;
}
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  if(d0 >= 0.99999){ gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
  vec3 P = viewPos(vUv);
  // 法线：两侧取深度差更小的一侧（轮廓处不把前景和背景连成斜面）
  vec3 l = viewPos(vUv - vec2(uDepthPx.x, 0.0)), r = viewPos(vUv + vec2(uDepthPx.x, 0.0));
  vec3 b = viewPos(vUv - vec2(0.0, uDepthPx.y)), t = viewPos(vUv + vec2(0.0, uDepthPx.y));
  vec3 dx = abs(r.z - P.z) < abs(P.z - l.z) ? r - P : P - l;
  vec3 dy = abs(t.z - P.z) < abs(P.z - b.z) ? t - P : P - b;
  vec3 N = normalize(cross(dx, dy));
  vec3 V = normalize(-P);
  // 世界半径 → 半分辨率像素（近景封顶，太小则没有可遮的）
  float rPx = min(uRadius * uProj11 * 0.5 * uRes.y / max(-P.z, 1e-3), uMaxPx);
  if(rPx < 1.5){ gl_FragColor = vec4(1.0, -P.z, 0.0, 1.0); return; }
  float nA = bayer4(gl_FragCoord.xy), nB = fract(nA * 7.0 + 0.37);
  float fRange = uRadius * 0.615, fFrom = uRadius - fRange;
  float fMul = -1.0 / fRange, fAdd = fFrom / fRange + 1.0;
  float vis = 0.0;
  for(int s = 0; s < SLICES; s++){
    float phi = (float(s) + nA) * PI / float(SLICES);
    vec2 om = vec2(cos(phi), sin(phi));
    vec3 dirV = vec3(om, 0.0);
    vec3 ortho = dirV - dot(dirV, V) * V;
    vec3 axis = normalize(cross(ortho, V));
    vec3 pN = N - axis * dot(N, axis);
    float pLen = length(pN);
    float cosN = clamp(dot(pN, V) / max(pLen, 1e-4), 0.0, 1.0);
    float n = sign(dot(ortho, pN)) * fastAcos(cosN);
    float low0 = cos(n + PI * 0.5), low1 = cos(n - PI * 0.5);
    float h0c = low0, h1c = low1;
    for(int j = 0; j < STEPS; j++){
      float st = (float(j) + nB) / float(STEPS);
      vec2 off = om * max(st * st * rPx, 1.0) / uRes;
      vec3 d0v = viewPos(vUv + off) - P, d1v = viewPos(vUv - off) - P;
      float l0 = length(d0v), l1 = length(d1v);
      // 薄遮挡物补偿（XeGTAO）：渐隐距离里把视深方向的差放大——细草叶、鳍这类前后很薄的东西
      // 不再把身后整片压黑（光会从它们背后绕进来）
      float f0 = length(vec3(d0v.xy, d0v.z * (1.0 + uThin))), f1 = length(vec3(d1v.xy, d1v.z * (1.0 + uThin)));
      float c0 = mix(low0, dot(d0v / max(l0, 1e-5), V), clamp(f0 * fMul + fAdd, 0.0, 1.0));
      float c1 = mix(low1, dot(d1v / max(l1, 1e-5), V), clamp(f1 * fMul + fAdd, 0.0, 1.0));
      h0c = max(h0c, c0); h1c = max(h1c, c1);
    }
    pLen = mix(pLen, 1.0, 0.05);
    float h0 = -fastAcos(h1c), h1 = fastAcos(h0c);
    h0 = n + clamp(h0 - n, -PI * 0.5, PI * 0.5);
    h1 = n + clamp(h1 - n, -PI * 0.5, PI * 0.5);
    float sn = sin(n);
    vis += pLen * ((cosN + 2.0 * h0 * sn - cos(2.0 * h0 - n)) + (cosN + 2.0 * h1 * sn - cos(2.0 * h1 - n))) * 0.25;
  }
  vis = pow(clamp(vis / float(SLICES), 0.0, 1.0), uPower);
  gl_FragColor = vec4(vis, -P.z, 0.0, 1.0);   // g = 视深（模糊的深度权重用）
}`;

// 4×4 深度感知盒式模糊：正好覆盖一个抖动周期
const BLUR_FRAG = /* glsl */`
uniform sampler2D tAO; uniform vec2 uPx;
varying vec2 vUv;
void main(){
  vec2 c = texture2D(tAO, vUv).rg;
  float sum = 0.0, wSum = 0.0;
  float tol = 0.015 + c.y * 0.02;
  for(int y = -2; y < 2; y++) for(int x = -2; x < 2; x++){
    vec2 s = texture2D(tAO, vUv + vec2(x, y) * uPx).rg;   // 整数偏移：最近邻正好取到 4×4 块的每个纹素
    float w = max(1.0 - abs(s.y - c.y) / tol, 0.0) + 1e-3;
    sum += s.x * w; wSum += w;
  }
  gl_FragColor = vec4(sum / wSum, c.y, 0.0, 1.0);
}`;

/** 画质档 → [切片数, 每侧步数]（档位越高越省；超出表的档位不跑 AO） */
export const AO_TIERS = [[3, 6], [3, 5], [2, 5], [2, 4], [2, 4]];
/** 世界半径 → 半分辨率像素（与着色器同式；单测用） */
export function aoRadiusPx(/** @type {{ radius:number, proj11:number, height:number, viewZ:number, maxPx:number }} */ o){
  return Math.min(o.radius * o.proj11 * 0.5 * o.height / Math.max(o.viewZ, 1e-3), o.maxPx);
}

/** @param {{ camera:THREE.PerspectiveCamera }} opts */
export function createGTAO({ camera }){
  const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const rtRaw = new THREE.WebGLRenderTarget(2, 2, opt);
  const rtBlur = new THREE.WebGLRenderTarget(2, 2, opt);
  rtRaw.texture.minFilter = rtRaw.texture.magFilter = THREE.NearestFilter;   // 模糊按纹素中心取
  const u = {
    tDepth: { value: /** @type {THREE.Texture|null} */ (null) }, uProjInv: { value: new THREE.Matrix4() },
    uDepthPx: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() },
    uProj11: { value: 1 }, uRadius: { value: 0.28 }, uMaxPx: { value: 48 }, uPower: { value: 1.3 }, uThin: { value: 2.5 },
  };
  /** @type {Map<string, THREE.ShaderMaterial>} 切片/步数是编译期常量（循环展开），按组合缓存 */
  const mats = new Map();
  const matFor = (/** @type {number} */ slices, /** @type {number} */ steps) => {
    const key = `${slices}x${steps}`;
    let m = mats.get(key);
    if(!m){
      m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, depthTest: false, depthWrite: false,
        fragmentShader: AO_FRAG.replace('__SLICES__', String(slices)).replace('__STEPS__', String(steps)) });
      mats.set(key, m);
    }
    return m;
  };
  const blurMat = new THREE.ShaderMaterial({ uniforms: { tAO: { value: rtRaw.texture }, uPx: { value: new THREE.Vector2() } },
    vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(blurMat);
  let tier = AO_TIERS[0];

  return {
    texture: rtBlur.texture,
    uniforms: u,
    /** @param {number} level 画质档 */
    setLevel(level){ tier = AO_TIERS[Math.min(level, AO_TIERS.length - 1)]; },
    /** @param {THREE.WebGLRenderer} renderer @param {THREE.DepthTexture} depth @param {number} w @param {number} h 场景 RT 尺寸 */
    render(renderer, depth, w, h){
      const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
      if(rtRaw.width !== hw || rtRaw.height !== hh){ rtRaw.setSize(hw, hh); rtBlur.setSize(hw, hh); }
      u.tDepth.value = depth;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uProj11.value = camera.projectionMatrix.elements[5];
      u.uDepthPx.value.set(1 / w, 1 / h);
      u.uRes.value.set(hw, hh);
      quad.material = matFor(tier[0], tier[1]);
      renderer.setRenderTarget(rtRaw);
      quad.render(renderer);
      blurMat.uniforms.uPx.value.set(1 / hw, 1 / hh);
      quad.material = blurMat;
      renderer.setRenderTarget(rtBlur);
      quad.render(renderer);
    },
    dispose(){ rtRaw.dispose(); rtBlur.dispose(); blurMat.dispose(); for(const m of mats.values()) m.dispose(); quad.dispose(); },
  };
}
