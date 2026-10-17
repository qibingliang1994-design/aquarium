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

/** 3D 值噪声（0..1）：岩石/木纹等需要无接缝的立体噪声 @param {number} x @param {number} y @param {number} z */
export function vnoise3(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
  /** @param {number} i @param {number} j @param {number} k */
  const h=(i,j,k)=>{ const s=Math.sin(i*127.1+j*311.7+k*74.7)*43758.5453; return s-Math.floor(s); };
  const l=(/** @type {number} */ a,/** @type {number} */ b,/** @type {number} */ t)=>a+(b-a)*t;
  const x00=l(h(xi,yi,zi),h(xi+1,yi,zi),u), x10=l(h(xi,yi+1,zi),h(xi+1,yi+1,zi),u);
  const x01=l(h(xi,yi,zi+1),h(xi+1,yi,zi+1),u), x11=l(h(xi,yi+1,zi+1),h(xi+1,yi+1,zi+1),u);
  return l(l(x00,x10,v), l(x01,x11,v), w);
}

/** 分形叠加（octaves 层，每层频率 ×2、幅度 ×0.5），结果约 0..1
 * @param {number} x @param {number} y @param {number} z @param {number} [octaves] */
export function fbm3(x,y,z,octaves=4){
  let sum=0, amp=0.5, norm=0, f=1;
  for(let i=0;i<octaves;i++){ sum+=vnoise3(x*f,y*f,z*f)*amp; norm+=amp; amp*=0.5; f*=2.03; }
  return sum/norm;
}
