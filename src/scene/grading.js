import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { U } from '../uniforms.js';

/* ================================================================
 * 输出调色 pass（链尾，直接上屏）
 * v2.2.4 吸收了 OutputPass 的职责：ACES 色调映射 + sRGB 编码在本 pass 一次完成，
 * 省掉一个全屏 pass。公式与 three 内置逐字一致（渲染器固定 ACESFilmic + sRGB 输出，
 * toneMappingExposure 固定 0.98，运行期都不变——变了我也要跟着变）。
 * 之后做显示空间调色：轻微对比/饱和 + 冷暗部暖高光的分离色调 + 细颗粒（抑制暗部色带）
 * ================================================================ */
const GradeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uTime:     U.time,
    uSat:      { value: 1.08 },
    uContrast: { value: 1.06 },
    uShadow:   { value: new THREE.Color(0.0, 0.05, 0.08) },
    uHigh:     { value: new THREE.Color(0.06, 0.03, 0.0) },
    uGrain:    { value: 0.018 },
  },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSat, uContrast, uGrain;
    uniform vec3 uShadow, uHigh; varying vec2 vUv;
    // ACESFilmicToneMapping / sRGBTransferOETF 与 toneMappingExposure uniform 都在
    // ShaderMaterial 的内置前奏里（toneMapped 默认开），直接调用，不要再 include（会重复定义）
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = ACESFilmicToneMapping(col);            // 线性 HDR → 显示
      col = sRGBTransferOETF(vec4(col,1.0)).rgb;   // → sRGB（与 OutputPass 输出逐位一致）
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col-0.5)*uContrast + 0.5;
      col += uShadow*(1.0-l)*(1.0-l) + uHigh*l*l;
      float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime)*91.7, vec2(12.9898,78.233)))*43758.5453);
      col += (n-0.5)*uGrain;
      gl_FragColor = vec4(clamp(col,0.0,1.0), c.a);
    }`,
};

export function createGradePass(){
  return new ShaderPass(GradeShader);
}
