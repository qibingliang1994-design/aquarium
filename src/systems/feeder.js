// @ts-check
import * as THREE from 'three';
import { clamp, rand } from '../utils.js';

export class Feeder {
  /** @param {{ tankGroup:any, sandHeight:any, waterY:number, ripples:any }} opts */
  constructor({ tankGroup, sandHeight, waterY, ripples }){
    this.ripples=ripples; this.sandHeight=sandHeight; this.waterY=waterY;
    this.flow=0;                 // 水流速度（+x），溪流/小河场景由 main 每帧设置
    this.N=90;
    this.mesh=new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.021),
      new THREE.MeshStandardMaterial({color:0x9c6a33, roughness:0.9}), this.N);
    this.mesh.frustumCulled=false;
    tankGroup.add(this.mesh);
    /** @type {any[]} */ this.items=new Array(this.N).fill(null);
    this.head=0;
    this._m=new THREE.Matrix4();
    // 进食碎屑：饲料被咬中时崩出几粒小碎屑，缓慢下沉淡出
    this.CN=60;
    this.crumbMesh=new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.0075), this.mesh.material, this.CN);
    this.crumbMesh.frustumCulled=false;
    tankGroup.add(this.crumbMesh);
    /** @type {any[]} */ this.crumbs=new Array(this.CN).fill(null);
    this.crumbHead=0;
  }
  // 切换场景时清空水中饲料与碎屑
  clear(){ this.items.fill(null); this.crumbs.fill(null); }
  get pellets(){ return this.items.filter(it=>it && !it.eaten && it.age<28); }
  spawn(/** @type {THREE.Vector3} */ center){
    this.ripples.spawn(center.x, center.z);
    setTimeout(()=>this.ripples.spawn(center.x+0.06, center.z-0.05), 260);
    for(let k=0;k<10;k++){
      this.items[this.head]={
        p:new THREE.Vector3(clamp(center.x+rand(-0.14,0.14),-2.15,2.15), this.waterY-0.03,
                            clamp(center.z+rand(-0.12,0.12),-0.82,0.82)),
        v:new THREE.Vector3(rand(-0.03,0.03),-0.05,rand(-0.03,0.03)),
        age:0, eaten:0, ph:rand(6.283),
      };      this.head=(this.head+1)%this.N;
    }
  }
  // 返回是否真的吃到（同帧多条鱼抢同一颗时只算第一条）
  consume(/** @type {any} */ p){
    if(p.eaten) return false;
    p.eaten=1e-6;
    for(let k=0;k<3;k++){
      this.crumbs[this.crumbHead]={
        p:p.p.clone(), life:0,
        v:new THREE.Vector3(rand(-0.09,0.09), rand(0,0.05), rand(-0.09,0.09)) };
      this.crumbHead=(this.crumbHead+1)%this.CN;
    }
    return true;
  }
  _updateCrumbs(/** @type {number} */ dt){
    const LIFE=1.6;
    for(let i=0;i<this.CN;i++){
      const c=this.crumbs[i];
      if(c){
        c.life+=dt;
        c.v.x*=1-Math.min(1,dt*2.5); c.v.z*=1-Math.min(1,dt*2.5);
        c.v.y+=(-0.07-c.v.y)*Math.min(1,dt*3);
        c.p.addScaledVector(c.v,dt);
        c.p.y=Math.max(c.p.y, this.sandHeight(c.p.x,c.p.z)+0.006);
        if(c.life>=LIFE) this.crumbs[i]=null;
      }
      const s=c && c.life<LIFE ? 1-c.life/LIFE : 0;
      this._m.makeScale(s,s,s).setPosition(c?c.p.x:0, c?c.p.y:0, c?c.p.z:0);
      this.crumbMesh.setMatrixAt(i,this._m);
    }
    this.crumbMesh.instanceMatrix.needsUpdate=true;
  }
  update(/** @type {number} */ dt, /** @type {number} */ t){
    this._updateCrumbs(dt);
    for(let i=0;i<this.N;i++){
      const it=this.items[i];
      if(!it){ this._m.makeScale(0,0,0); this.mesh.setMatrixAt(i,this._m); continue; }
      it.age+=dt;
      let scale=1;
      if(it.eaten){
        it.eaten+=dt;
        scale=Math.max(0,1-it.eaten*8);
        if(scale<=0){ this.items[i]=null; scale=0; }
      } else if(it.age>26){
        scale=Math.max(0,1-(it.age-26)/2);
        if(scale<=0){ this.items[i]=null; scale=0; }
      }
      if(it && !it.eaten){
        if(it.p.y>this.sandHeight(it.p.x,it.p.z)+0.018){        // 下沉
          it.v.y+=(-0.1-it.v.y)*dt*2.2;
          it.p.x+=Math.sin(t*1.7+it.ph)*dt*0.02+this.flow*dt*0.8;   // 下沉途中顺流漂走
          if(Math.abs(it.p.x)>2.2) it.age=Math.max(it.age,26);     // 漂出水域：淡出
          it.p.addScaledVector(it.v,dt);
        } else it.p.y=this.sandHeight(it.p.x,it.p.z)+0.018;      // 落底
      }
      const s=scale;
      this._m.makeScale(s,s,s).setPosition(it?it.p.x:0, it?it.p.y:0, it?it.p.z:0);
      this.mesh.setMatrixAt(i,this._m);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
  }
}
