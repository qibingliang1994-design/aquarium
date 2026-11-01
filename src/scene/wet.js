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
    sh.uniforms.uWet = U.wet; sh.uniforms.uSnow = U.snow; sh.uniforms.uSnowY = U.snowY;
    sh.fragmentShader = 'uniform float uWet, uSnow, uSnowY;\n'+sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.70, 0.74, 0.72), clamp(uWet, 0.0, 1.0));
        #ifndef FLAT_SHADED
        if(uSnow>0.001){                         // 积雪：朝上的面、水线以上才白（uSnow=0 时整段跳过，和改前逐值相同）
          vec3 sWN = inverseTransformDirection( normalize( vNormal ), viewMatrix );
          // 注意 inverseTransformDirection 会归一化，不能拿来还原位移；行向量右乘 viewMatrix = 乘它的逆旋转
          float sY = cameraPosition.y + ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).y;
          float sCover = smoothstep( 0.5, 0.88, sWN.y ) * smoothstep( uSnowY, uSnowY+0.12, sY ) * uSnow;
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.9, 0.94, 1.0 ), sCover*0.88 );
        }
        #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.55, clamp(uWet, 0.0, 1.0)), 0.0, 1.0);`);
  };
}
