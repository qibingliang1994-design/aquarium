// @ts-check
import { U } from '../uniforms.js';

/* ================================================================
 * 地面 / 石块潮湿度。uWet=0 时 diffuse ×1、roughness ×1，和干燥材质逐值相同。
 * 必须接在 injectCaustics、injectSurfaceDetail 之后——它们会换成自己的 onBeforeCompile。
 * ================================================================ */

/** @param {any} mat @param {string} key */
export function injectWet(mat, key){
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.() ?? '';
  mat.customProgramCacheKey = () => `${prevKey}_wet_${key}`;
  mat.onBeforeCompile = (/** @type {any} */ sh) => {
    prev?.(sh);
    sh.uniforms.uWet = U.wet;
    sh.fragmentShader = 'uniform float uWet;\n'+sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.70, 0.74, 0.72), clamp(uWet, 0.0, 1.0));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.55, clamp(uWet, 0.0, 1.0)), 0.0, 1.0);`);
  };
}
