/* ================================================================
 * 共享工具函数（纯函数）
 * ================================================================ */
export const rand    = (a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a);
export const clamp   = (v,a,b)=> v<a?a:(v>b?b:v);
export const lerp    = (a,b,t)=> a+(b-a)*t;
export const sstep   = (a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export const wrapPI  = a=>{ while(a> Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; };

function hash2(x,y){ const s=Math.sin(x*127.1+y*311.7)*43758.5453; return s-Math.floor(s); }
export function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
