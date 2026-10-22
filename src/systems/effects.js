// @ts-check
import * as THREE from 'three';
import { rand, makeRng } from '../utils.js';
import { precipBudget } from './weather.js';
import { U } from '../uniforms.js';

class Bubbles {
  /** @param {any} opts */
  constructor({ tankGroup, air, sandHeight, waterY }){
    this.air=air; this.sandHeight=sandHeight; this.waterY=waterY;
    this.N=130;
    this.mesh=new THREE.InstancedMesh(
      new THREE.SphereGeometry(1,10,8),
      new THREE.ShaderMaterial({
        transparent:true, depthWrite:false,
        vertexShader:`
          varying vec3 vN; varying vec3 vV;
          void main(){
            vN=normalize(normalMatrix*normal);
            vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.0);
            vV=normalize(-mv.xyz);
            gl_Position=projectionMatrix*mv;
          }`,
        fragmentShader:`
          varying vec3 vN; varying vec3 vV;
          void main(){
            float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),1.6);
            vec3 col=mix(vec3(0.45,0.7,0.82),vec3(1.0),f);
            float hl=pow(max(dot(normalize(vN),normalize(vec3(0.4,0.8,0.55))),0.0),40.0)*0.9;
            col+=hl;
            gl_FragColor=vec4(col,0.07+0.7*f);
          }`,
      }), this.N);
    this.mesh.frustumCulled=false;
    tankGroup.add(this.mesh);
    this.items=new Array(this.N).fill(null);
    this.head=0;
    this.timer=0;
    this._m=new THREE.Matrix4();
    this.reset();
  }
  // 清空气泡（实例缩放置零：首帧前就截图也不会出现单位球）；切换场景时调用
  reset(){
    this.items.fill(null);
    this._m.makeScale(0,0,0);
    for(let i=0;i<this.N;i++) this.mesh.setMatrixAt(i,this._m);
    this.mesh.instanceMatrix.needsUpdate=true;
  }
  update(/** @type {number} */ dt, /** @type {number} */ t){
    this.timer+=dt;
    while(this.timer>0.04){
      this.timer-=0.04;
      this.items[this.head]={
        p:new THREE.Vector3(this.air.x+rand(-0.045,0.045), this.sandHeight(this.air.x,this.air.z)+0.05, this.air.z+rand(-0.045,0.045)),
        r:rand(0.009,0.022), ph:rand(6.283), sp:rand(0.8,1.3),
      };
      this.head=(this.head+1)%this.N;
    }
    for(let i=0;i<this.N;i++){
      const it=this.items[i];
      if(!it){ this._m.makeScale(0,0,0); this.mesh.setMatrixAt(i,this._m); continue; }
      it.p.y+=dt*(0.32+it.r*9)*it.sp;
      it.p.x+=Math.sin(t*3.1+it.ph)*dt*0.05;
      it.p.z+=Math.cos(t*2.6+it.ph)*dt*0.05;
      it.r+=dt*0.004;
      if(it.p.y>=this.waterY-0.015){ this.items[i]=null; this._m.makeScale(0,0,0); }
      else this._m.makeScale(it.r,it.r,it.r).setPosition(it.p.x,it.p.y,it.p.z);
      this.mesh.setMatrixAt(i,this._m);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
  }
}

class MarineSnow {
  flow=0;                        // 水流速度（+x）
  /** @param {any} opts */
  constructor({ tankGroup }){
    this.N=900;                    // 池子按开缸浊度的 3 倍分配；平时只画前 BASE 颗（setDensity）
    this.BASE=300;
    const pos=new Float32Array(this.N*3), size=new Float32Array(this.N), seed=new Float32Array(this.N);
    this.sp=new Float32Array(this.N);
    for(let i=0;i<this.N;i++){
      pos[i*3]=rand(-1.7,1.7); pos[i*3+1]=rand(0.4,1.6); pos[i*3+2]=rand(-0.62,0.62);
      this.sp[i]=rand(0.006,0.02);
      size[i]=rand(0.006,0.018); seed[i]=rand(10);
    }
    this.geo=new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(size,1));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed,1));
    // 圆形柔边粒子：世界尺寸透视缩放，贴近镜头/远处淡出，缓慢闪烁
    const uScale={ value:1 };
    const fit=()=>{ uScale.value=Math.min(devicePixelRatio,2)*innerHeight*0.5/Math.tan(THREE.MathUtils.degToRad(22.5)); };
    fit(); addEventListener('resize',fit);
    this.pts=new THREE.Points(this.geo, new THREE.ShaderMaterial({
      transparent:true, depthWrite:false,
      uniforms:{ uScale, uTime:U.time, uColor:{value:new THREE.Color(0xd6e8ee)} },
      vertexShader:`
        attribute float aSize, aSeed; uniform float uScale, uTime; varying float vA;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=clamp(aSize*uScale/-mv.z, 1.0, 14.0);
          vA=(0.45+0.35*sin(uTime*1.3+aSeed*6.0))*smoothstep(0.25,1.2,-mv.z)*(1.0-smoothstep(7.0,11.0,-mv.z));
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader:`
        uniform vec3 uColor; varying float vA;
        void main(){
          float d=length(gl_PointCoord-0.5);
          float a=smoothstep(0.5,0.05,d);
          gl_FragColor=vec4(uColor, a*a*vA*0.55);
        }`,
    }));
    this.pts.frustumCulled=false;
    tankGroup.add(this.pts);
    this.setDensity(1);
  }
  /** 悬浮颗粒可见数量倍率 1..3（开缸浊度） @param {number} k */
  setDensity(k){ this.geo.setDrawRange(0, Math.round(this.BASE*Math.min(3, Math.max(1, k)))); }
  update(/** @type {number} */ dt, /** @type {number} */ t){
    const p=this.geo.attributes.position.array;
    for(let i=0;i<this.N;i++){
      p[i*3+1]-=this.sp[i]*dt*8;
      p[i*3]+=Math.sin(t*0.4+i)*0.00012+this.flow*dt;
      if(p[i*3]>1.8) p[i*3]-=3.6; else if(p[i*3]<-1.8) p[i*3]+=3.6;   // 顺流漂出一侧后从另一侧回来
      if(p[i*3+1]<0.42) p[i*3+1]=1.62;
    }
    this.geo.attributes.position.needsUpdate=true;
  }
}

class Ripples {
  /** @param {any} opts */
  constructor({ tankGroup, waterY }){
    this.pool=[];
    for(let i=0;i<10;i++){
      const m=new THREE.Mesh(new THREE.RingGeometry(0.85,1,32).rotateX(-Math.PI/2),
        new THREE.MeshBasicMaterial({color:0xbfe8f2, transparent:true, opacity:0,
          blending:THREE.AdditiveBlending, depthWrite:false}));
      m.visible=false; m.position.y=waterY+0.004;
      tankGroup.add(m);
      this.pool.push({m, t:1e9});
    }
  }
  spawn(/** @type {number} */ x, /** @type {number} */ z){
    for(const it of this.pool) if(!it.m.visible){
      it.m.visible=true; it.t=0;
      it.m.position.x=x; it.m.position.z=z;
      return;
    }
  }
  update(/** @type {number} */ dt){
    for(const it of this.pool){
      if(!it.m.visible) continue;
      it.t+=dt;
      const k=it.t/1.3;
      if(k>=1){ it.m.visible=false; continue; }
      const s=0.04+k*0.5;
      it.m.scale.set(s,1,s);
      it.m.material.opacity=0.35*(1-k)*(1-k);
    }
  }
}

/** 雨丝 / 雪花。数量按现有五档画质缩（precipBudget），只模拟 drawRange 里的那一部分。
 *  不写深度、不投影。落在水面上的涟漪每秒几圈，不按每一滴去生成（涟漪池只有 10 个）。
 * @param {THREE.Scene} scene @param {{ spawn:(x:number,z:number)=>void }} ripples */
function createPrecip(scene, ripples){
  const RAIN_N=1600, SNOW_N=700, rng=makeRng(91);
  const rPos=new Float32Array(RAIN_N*3), rVel=new Float32Array(RAIN_N);
  for(let i=0;i<RAIN_N;i++){
    rPos[i*3]=(rng()*2-1)*16; rPos[i*3+1]=rng()*14+1; rPos[i*3+2]=(rng()*2-1)*12;
    rVel[i]=8+rng()*6;
  }
  const rGeo=new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  rGeo.setAttribute('aVel', new THREE.BufferAttribute(rVel, 1));
  const drop=(()=>{
    const c=document.createElement('canvas'); c.width=16; c.height=64;
    const g=/** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const grd=g.createLinearGradient(8,0,8,64);
    grd.addColorStop(0,'rgba(200,220,255,0)'); grd.addColorStop(0.2,'rgba(210,230,255,0.85)');
    grd.addColorStop(1,'rgba(220,235,255,0)');
    g.fillStyle=grd; g.fillRect(4,0,8,64);
    const t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
  })();
  const rain=new THREE.Points(rGeo, new THREE.ShaderMaterial({
    uniforms:{ uOpacity:{value:0}, uSize:{value:90}, uMap:{value:drop} },
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`attribute float aVel; uniform float uSize;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(uSize*aVel*0.08/max(-mv.z,0.25), 2.0, 48.0); }`,
    fragmentShader:`uniform float uOpacity; uniform sampler2D uMap;
      void main(){ vec4 t=texture2D(uMap, gl_PointCoord); float a=t.a*uOpacity;
        if(a<0.02) discard; gl_FragColor=vec4(mix(vec3(0.75,0.84,0.95), t.rgb, 0.45), a); }`,
  }));
  rain.frustumCulled=false; rain.visible=false; scene.add(rain);

  const nPos=new Float32Array(SNOW_N*3), nPh=new Float32Array(SNOW_N);
  for(let i=0;i<SNOW_N;i++){
    nPos[i*3]=(rng()*2-1)*18; nPos[i*3+1]=rng()*12+1; nPos[i*3+2]=(rng()*2-1)*14;
    nPh[i]=rng()*6.283;
  }
  const nGeo=new THREE.BufferGeometry();
  nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  nGeo.setAttribute('aPh', new THREE.BufferAttribute(nPh, 1));
  const flake=(()=>{
    const c=document.createElement('canvas'); c.width=32; c.height=32;
    const g=/** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const grd=g.createRadialGradient(16,16,0,16,16,14);
    grd.addColorStop(0,'rgba(255,255,255,1)'); grd.addColorStop(0.5,'rgba(255,255,255,0.55)');
    grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grd; g.fillRect(0,0,32,32);
    const t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
  })();
  const snow=new THREE.Points(nGeo, new THREE.ShaderMaterial({
    uniforms:{ uOpacity:{value:0}, uSize:{value:28}, uMap:{value:flake}, uTime:{value:0} },
    transparent:true, depthWrite:false,
    vertexShader:`attribute float aPh; uniform float uSize, uTime;
      void main(){ vec3 p=position; p.x+=sin(uTime*0.6+aPh)*0.35; p.z+=cos(uTime*0.45+aPh)*0.35;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(uSize/max(-mv.z,0.25), 2.0, 18.0); }`,
    fragmentShader:`uniform float uOpacity; uniform sampler2D uMap;
      void main(){ vec4 t=texture2D(uMap, gl_PointCoord); float a=t.a*uOpacity;
        if(a<0.03) discard; gl_FragColor=vec4(1.0,1.0,1.0,a); }`,
  }));
  snow.frustumCulled=false; snow.visible=false; scene.add(snow);

  let rainN=RAIN_N, snowN=SNOW_N, rippleAcc=0;
  rGeo.setDrawRange(0, rainN); nGeo.setDrawRange(0, snowN);
  return {
    /** @param {number} level */
    setLevel(level){
      const b=precipBudget(level);
      rainN=b.rain; snowN=b.snow;
      rGeo.setDrawRange(0, rainN); nGeo.setDrawRange(0, snowN);
    },
    parts:[rain, snow],
    /** @param {number} dt @param {{ rain:number, snow:number, wind:number }} st @param {number} time */
    update(dt, st, time){
      const rainK=st.rain>0.02 ? Math.min(1, 0.35+st.rain) : 0;
      const snowK=st.snow>0.02 ? Math.min(1, 0.4+st.snow) : 0;
      const rCount=Math.max(0, Math.round(rainN*rainK));
      const sCount=Math.max(0, Math.round(snowN*snowK));
      rain.visible=rCount>0; snow.visible=sCount>0;
      rGeo.setDrawRange(0, rCount); nGeo.setDrawRange(0, sCount);
      /** @type {any} */ (rain.material).uniforms.uOpacity.value=Math.min(1, st.rain*1.15);
      /** @type {any} */ (snow.material).uniforms.uOpacity.value=Math.min(1, st.snow*0.95);
      /** @type {any} */ (snow.material).uniforms.uTime.value=time;
      if(rCount){
        const pos=/** @type {Float32Array} */ (rGeo.attributes.position.array);
        for(let i=0;i<rCount;i++){
          let y=pos[i*3+1]-rVel[i]*dt*(0.85+st.rain*0.4);
          let x=pos[i*3]+st.wind*dt*2.2;
          let z=pos[i*3+2];
          if(!Number.isFinite(y) || y<0.15){
            x=(Math.random()*2-1)*16; z=(Math.random()*2-1)*12; y=10+Math.random()*8;
          }
          pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
        }
        rGeo.attributes.position.needsUpdate=true;
        rippleAcc+=dt*st.rain*3.5;
        let n=0;
        while(rippleAcc>=1 && n<3){ rippleAcc-=1; n++; ripples.spawn((Math.random()*2-1)*6, (Math.random()*2-1)*4); }
      }else rippleAcc=0;
      if(sCount){
        const pos=/** @type {Float32Array} */ (nGeo.attributes.position.array);
        for(let i=0;i<sCount;i++){
          let y=pos[i*3+1]-(1.1+(i%5)*0.12)*dt;
          if(!Number.isFinite(y) || y<0.2){
            pos[i*3]=(Math.random()*2-1)*18; pos[i*3+2]=(Math.random()*2-1)*14; y=8+Math.random()*8;
          }
          pos[i*3+1]=y;
        }
        nGeo.attributes.position.needsUpdate=true;
      }
    },
  };
}

/** @param {any} opts */
export function createEffects({ tankGroup, air, sandHeight, waterY, scene }){
  const bubbles=new Bubbles({ tankGroup, air, sandHeight, waterY });
  const snow=new MarineSnow({ tankGroup });
  const ripples=new Ripples({ tankGroup, waterY });
  const precip=createPrecip(scene, ripples);
  return { bubbles, snow, ripples, precip };   // 旧的光柱网格（LightRays）已删：光柱由水体合成 pass 按阴影 march
}
