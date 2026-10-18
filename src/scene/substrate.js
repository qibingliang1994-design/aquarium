// @ts-check
import * as THREE from 'three';

/* ================================================================
 * 底砂截面（缸体四面玻璃后的竖直侧裙）：程序化分层底砂
 * 顶层细沙（波浪形分界）→ 下层卵石，越深颗粒越大、越暗；石缝深色、石头顶面受光。
 * 颜色基调仍来自顶点色（随主题切换），这里只调制明暗与少量色偏。
 * 不注入焦散：竖直面上的焦散会被拉成一道道竖条纹。
 * ================================================================ */

/** aSkD：侧裙顶点的纵向比例（0 = 缸底，1 = 沙面），由 tank.js 写入 */
export function createSkirtMaterial(){
  const mat=new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.92, metalness:0 });
  mat.customProgramCacheKey=()=>'skirt';
  mat.onBeforeCompile=(/** @type {any} */ sh)=>{
    sh.vertexShader='attribute float aSkD;\nvarying float vSkD;\nvarying vec3 vSkW;\n'
      +sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSkD = aSkD;
        vSkW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    sh.fragmentShader='varying float vSkD;\nvarying vec3 vSkW;\n'+`
vec2 skH2(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
float skN(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(skH2(i).x, skH2(i+vec2(1,0)).x, f.x), mix(skH2(i+vec2(0,1)).x, skH2(i+vec2(1,1)).x, f.x), f.y); }
// 卵石：Voronoi 取最近的格点，返回 (到石心距离, 本颗随机值, 石心相对的纵向偏移, 第二随机值)
vec4 skPebble(vec2 p){
  vec2 i=floor(p), f=fract(p); float f1=8.0; vec2 best=vec2(0.0), off=vec2(0.0);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y)), o=0.2+0.6*skH2(i+g), r=g+o-f;
    float d=dot(r,r);
    if(d<f1){ f1=d; best=i+g; off=r; }
  }
  vec2 h=skH2(best*1.37);
  return vec4(sqrt(f1), h.x, -off.y, h.y);
}
`+sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        float depth = 1.0 - vSkD;                                   // 0 = 沙面，1 = 缸底
        vec2 q = vec2( vSkW.x + vSkW.z, vSkW.y );                   // 沿玻璃的展开坐标
        float edge = 0.2 + 0.07*sin( q.x*5.3 ) + 0.06*skN( q*vec2(9.0,1.0) );   // 细沙层下沿（波浪起伏）
        float grain = skN( q*vec2(260.0,320.0) )*0.6 + skN( q*vec2(90.0,110.0) )*0.4;
        vec3 sandC = diffuseColor.rgb * ( 0.9 + (grain-0.5)*0.28 );
        float sc = mix( 38.0, 20.0, smoothstep( edge, 1.0, depth ) );   // 越深卵石越大
        vec4 pb = skPebble( q*vec2(sc, sc*1.2) );
        float rad = 0.36 + 0.16*pb.w;                               // 每颗大小不一，石间露出细沙
        float r = pb.x / rad;
        float inside = 1.0 - smoothstep( 0.86, 1.0, r );
        float dome = sqrt( max( 0.0, 1.0 - r*r ) );
        vec3 stone = diffuseColor.rgb * mix( vec3(0.6,0.58,0.56), vec3(1.2,1.12,1.02), pb.y );
        stone = mix( stone, vec3( dot(stone, vec3(0.33)) ), 0.3 + 0.3*pb.w );   // 卵石比细沙更灰
        stone *= 0.55 + 0.35*dome + 0.3*clamp( pb.z/rad, -1.0, 1.0 )*dome;      // 圆润 + 顶面受光
        vec3 between = sandC * ( 0.5 + 0.25*smoothstep( 1.0, 1.6, r ) );         // 石缝里的沙，贴近石头处偏暗
        stone = mix( between, stone, inside );
        float layer = smoothstep( edge-0.02, edge+0.03, depth );
        diffuseColor.rgb = mix( sandC, stone, layer );
        diffuseColor.rgb *= 1.0 - 0.18*smoothstep( 0.04, 0.0, abs( depth-edge ) );   // 分层处一线暗影
      }`);
  };
  return mat;
}
