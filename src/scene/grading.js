import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { U } from '../uniforms.js';

/* ================================================================
 * 调色（放在 OutputPass 之后，处理显示空间颜色）
 * 轻微对比/饱和 + 冷暗部暖高光的分离色调 + 细颗粒（抑制暗部渐变色带）
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
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
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
