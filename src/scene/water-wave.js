// @ts-check
import { U } from '../uniforms.js';

/* ================================================================
 * 水面波形（世界坐标）：水面网格与浮在水面上的东西（睡莲叶、浮叶）共用同一个函数，
 * 叶片逐顶点贴着波面起伏，不会被浪头淹没或悬空
 * ================================================================ */

/** GLSL：waterWave(xz, t, flow) → 相对静水面的高度；波形顺流（+x）平移。
 *  调用方必须声明 uniform float uChop（晴天 = 1，与改前逐值相同） */
export const WAVE_GLSL = `
float waterWave(vec2 xz, float t, float flow){
  vec2 q=vec2(xz.x-flow*t*0.9, xz.y);
  return ( sin(q.x*7.0+t*1.3) + sin(q.y*9.0+t*1.7) + sin((q.x+q.y)*5.0+t*0.9) )*0.006*uChop;
}
`;

/** 让材质的顶点随水面波动（物件在模型空间平放、贴在静水面上）。key 区分着色器程序缓存
 * @param {any} mat @param {string} key */
export function injectFloat(mat, key){
  const prev=mat.onBeforeCompile, prevKey=mat.customProgramCacheKey?.() ?? '';
  mat.customProgramCacheKey=()=>`${prevKey}_float_${key}`;
  mat.onBeforeCompile=(/** @type {any} */ sh)=>{
    prev?.(sh);
    sh.uniforms.uTimeW=U.time; sh.uniforms.uFlowW=U.flow; sh.uniforms.uChop=U.chop;
    sh.vertexShader='uniform float uTimeW, uFlowW, uChop;\n'+WAVE_GLSL
      +sh.vertexShader.replace('#include <project_vertex>', `
      {
        mat4 toW = modelMatrix;
        #ifdef USE_BATCHING
          toW = modelMatrix * batchingMatrix;
        #endif
        #ifdef USE_INSTANCING
          toW = modelMatrix * instanceMatrix;
        #endif
        vec3 wp = ( toW * vec4( transformed, 1.0 ) ).xyz;
        // 世界 y 的增量换回局部空间（缩放/旋转后的物件也一样）
        transformed += inverse( mat3( toW ) ) * vec3( 0.0, waterWave( wp.xz, uTimeW, uFlowW ), 0.0 );
      }
      #include <project_vertex>`);
  };
}
