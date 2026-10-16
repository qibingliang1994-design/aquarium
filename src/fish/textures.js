import * as THREE from 'three';
import { clamp, sstep } from '../utils.js';

/* ---------- 程序化鳞片法线贴图（可平铺） ---------- */
function makeScaleNormalMap(size=256){
  const H=new Float32Array(size*size);
  const cols=10, rows=12, cw=size/cols, rh=size/rows, r=Math.min(cw,rh)*0.66;
  for(let y=0;y<size;y++){
    const row=Math.floor(y/rh), off=(row%2)*0.5*cw;
    for(let x=0;x<size;x++){
      const cx0=Math.floor((x-off)/cw);
      let dmin=1e9;
      for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
        const px=(cx0+i)*cw+off+cw*0.5, py=row*rh+rh*0.5+j*rh;
        let dx=x-px; dx-=Math.round(dx/size)*size;
        let dy=y-py; dy-=Math.round(dy/size)*size;
        const d=Math.hypot(dx,dy);
        if(d<dmin) dmin=d;
      }
      H[y*size+x]=1-sstep(0,r,dmin);
    }
  }
  const cv=document.createElement('canvas'); cv.width=cv.height=size;
  const ctx=cv.getContext('2d'); const img=ctx.createImageData(size,size);
  const at=(x,y)=>H[((y+size)%size)*size+((x+size)%size)];
  const str=2.4;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const dx=(at(x+1,y)-at(x-1,y))*str, dy=(at(x,y+1)-at(x,y-1))*str;
    const inv=1/Math.sqrt(dx*dx+dy*dy+1);
    const i=(y*size+x)*4;
    img.data[i]  =Math.round((-dx*inv*0.5+0.5)*255);
    img.data[i+1]=Math.round((-dy*inv*0.5+0.5)*255);
    img.data[i+2]=Math.round(( inv*0.5+0.5)*255);
    img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(cv);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}

/* ---------- 鱼鳍辐条透明贴图 ---------- */
function makeFinAlphaMap(w=256,h=128){
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=cv.getContext('2d'); const img=ctx.createImageData(w,h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const u=x/(w-1), v=y/(h-1);   // u=1 附着边，u=0 尾缘
    const ray=Math.pow(0.5+0.5*Math.sin(v*Math.PI*56+Math.sin(v*9)*4+u*1.5),1.6);
    const a=(0.32+0.68*Math.pow(u,1.25))*(0.68+0.32*ray);
    const i=(y*w+x)*4, g=Math.round(clamp(a,0,1)*255);
    img.data[i]=img.data[i+1]=img.data[i+2]=g; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  return new THREE.CanvasTexture(cv);
}
export const scaleNormalTex=makeScaleNormalMap();
export const finAlphaTex=makeFinAlphaMap();
