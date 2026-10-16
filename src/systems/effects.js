import * as THREE from 'three';
import { rand, lerp } from '../utils.js';
import { U } from '../uniforms.js';

class Bubbles {
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
  }
  update(dt, t){
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

class LightRays {
  constructor({ tankGroup }){
    this.group=new THREE.Group();
    this.mats=[];
    for(let i=0;i<6;i++){
      const mat=new THREE.ShaderMaterial({
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
        uniforms:{
          uTime:U.time,
          uPhase:{value:rand(6.283)},
          uColor:{value:new THREE.Color(0.5,0.72,0.85)},
          uIntensity:{value:0.34},
        },
        // 侧对镜头或镜头贴近时淡出，避免出现"白色板子"
        vertexShader:`varying vec2 vUv; varying float vFade;
          void main(){ vUv=uv;
            vec4 mv=modelViewMatrix*vec4(position,1.0);
            float facing=abs(dot(normalize(normalMatrix*vec3(0.0,0.0,1.0)), normalize(-mv.xyz)));
            vFade=smoothstep(0.08,0.55,facing)*smoothstep(0.5,2.4,-mv.z);
            gl_Position=projectionMatrix*mv; }`,
        // 多条细光束 + 缓慢漂移，顶部亮、向下衰减
        fragmentShader:`
          uniform float uTime,uPhase,uIntensity; uniform vec3 uColor;
          varying vec2 vUv; varying float vFade;
          void main(){
            float x=vUv.x;
            float edge=smoothstep(0.0,0.28,x)*smoothstep(1.0,0.72,x);
            float s1=0.5+0.5*sin(x*21.0+uPhase+sin(uTime*0.27+uPhase)*2.2);
            float s2=0.5+0.5*sin(x*8.0-uTime*0.35+uPhase*1.7);
            float streak=pow(s1*s2,1.6)*0.85+0.15;
            float vert=pow(vUv.y,1.4)*smoothstep(0.0,0.2,vUv.y)*smoothstep(1.0,0.94,vUv.y);
            float a=edge*streak*vert*(0.7+0.3*sin(uTime*0.8+uPhase));
            gl_FragColor=vec4(uColor*a*uIntensity*vFade,1.0);
          }`,
      });
      this.mats.push(mat);
      const w=rand(0.3,0.8);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,1.5), mat);
      m.position.set(rand(-1.35,1.35), 0.9, rand(-0.4,0.35));
      m.rotation.z=rand(-0.14,-0.05);
      this.group.add(m);
    }
    tankGroup.add(this.group);
  }
  setNight(k){
    for(const m of this.mats){
      m.uniforms.uIntensity.value=lerp(0.34,0.12,k);
      m.uniforms.uColor.value.setRGB(lerp(0.5,0.35,k),lerp(0.72,0.5,k),lerp(0.85,0.9,k));
    }
  }
}

class MarineSnow {
  constructor({ tankGroup }){
    this.N=300;
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
  }
  update(dt,t){
    const p=this.geo.attributes.position.array;
    for(let i=0;i<this.N;i++){
      p[i*3+1]-=this.sp[i]*dt*8;
      p[i*3]+=Math.sin(t*0.4+i)*0.00012;
      if(p[i*3+1]<0.42) p[i*3+1]=1.62;
    }
    this.geo.attributes.position.needsUpdate=true;
  }
}

class Ripples {
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
  spawn(x,z){
    for(const it of this.pool) if(!it.m.visible){
      it.m.visible=true; it.t=0;
      it.m.position.x=x; it.m.position.z=z;
      return;
    }
  }
  update(dt){
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

export function createEffects({ tankGroup, air, sandHeight, waterY }){
  const bubbles=new Bubbles({ tankGroup, air, sandHeight, waterY });
  const rays=new LightRays({ tankGroup });
  const snow=new MarineSnow({ tankGroup });
  const ripples=new Ripples({ tankGroup, waterY });
  return { bubbles, rays, snow, ripples };
}
