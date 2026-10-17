// @ts-check
/* ================================================================
 * 共享工具函数（纯函数）
 * ================================================================ */
/** 单参数：[0,a)；双参数：[a,b) @type {(a?:number, b?:number)=>number} */
export const rand    = (a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a);
/** @type {(v:number, a:number, b:number)=>number} */
export const clamp   = (v,a,b)=> v<a?a:(v>b?b:v);
/** @type {(a:number, b:number, t:number)=>number} */
export const lerp    = (a,b,t)=> a+(b-a)*t;
/** @type {(a:number, b:number, x:number)=>number} */
export const sstep   = (a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
/** 折回 (-π, π] @type {(a:number)=>number} */
export const wrapPI  = a=>{ while(a> Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; };

/** @param {number} x @param {number} y */
function hash2(x,y){ const s=Math.sin(x*127.1+y*311.7)*43758.5453; return s-Math.floor(s); }
/** 2D 值噪声，返回 [0,1] @param {number} x @param {number} y */
export function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}

/** 可复现随机数（mulberry32）：同一 seed 生成同一序列，场景物件据此"同种子同模样"
 * @param {number} seed @returns {()=>number} [0,1) */
export function makeRng(seed){
  let a=(seed>>>0)||0x9e3779b9;
  return ()=>{
    a=(a+0x6d2b79f5)>>>0;
    let t=a;
    t=Math.imul(t^(t>>>15), t|1);
    t^=t+Math.imul(t^(t>>>7), t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/** 区间随机 @param {()=>number} rng @param {number} a @param {number} b */
export const rrange=(rng,a,b)=> a+rng()*(b-a);
