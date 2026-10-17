import * as THREE from 'three';
import { rand, clamp, wrapPI } from '../../utils.js';
import { scaleNormalTex, finAlphaTex } from '../../fish/textures.js';
import { buildFishBody, buildFishFins, profileSampler, injectSwim, fishEyeLayout } from '../../fish/body.js';
import { decorateFishMaterial } from '../../fish/glb-style.js';
import { injectCaustics } from '../../scene/caustics.js';
import { sandHeight } from '../../scene/tank.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* ---------- 鱼群（Boids + 转弯侧倾） ---------- */
const _v1=new THREE.Vector3(), _v2=new THREE.Vector3(), _v3=new THREE.Vector3(),
      _acc=new THREE.Vector3(), _sep=new THREE.Vector3(), _ali=new THREE.Vector3(),
      _coh=new THREE.Vector3(), _dummy=new THREE.Object3D();
const _eyeLocal=new THREE.Matrix4(), _eyeM=new THREE.Matrix4();

const BITE_DUR=0.35;                // 咬食动作时长（秒）
const REGROUP_SECS=6;               // 惊散后向鱼群中心回聚的时长
const _center=new THREE.Vector3();

export class School {
  constructor(spec, obstacles, glbData, { growth }={}){
    this.spec=spec;
    this.glbMode=!!glbData;
    const N=spec.count;
    this.group=new THREE.Group();
    this.causticK=null;
    if(this.glbMode){
      // —— 骨骼动画模型模式 ——
      const clips=glbData.animations||[];
      // 无动画模型（如静态雕塑）也能跑：仅靠 Boids 位移
      const swimClip=clips.find(c=>/Swimming_Normal/i.test(c.name))
        ||clips.find(c=>/swim/i.test(c.name))||clips[0]||null;
      const fastClip=clips.find(c=>/Swimming_Fast/i.test(c.name))||null;   // 受惊冲刺
      const biteClip=clips.find(c=>/Attack/i.test(c.name))||null;          // 咬食
      this.fishes=[]; this.mixers=[]; this.actions=[]; this.swimUniforms=[];
      this.phaseU={ value: rand(10) };
      this.causticK={ value:0.22 };            // 鱼体焦散强度（applyNight 调节）
      for(let i=0;i<N;i++){
        const obj=SkeletonUtils.clone(glbData.template);
        obj.userData.fishIndex=i;
        // 仅无骨骼动画的静态模型（锦鲤）做程序化尾摆，每条鱼独立相位
        const ph={ value:0 };
        const sway=swimClip ? null : { phaseU:ph, L:spec.L, amp:spec.amp, waveK:spec.waveK };
        obj.traverse(o=>{
          if(!o.isMesh) return;
          o.castShadow=true; o.frustumCulled=false;
          const deco=m=>{
            const c=m.clone();
            c.side=THREE.DoubleSide;               // 鳍片是单面几何：双面渲染，避免背向时整片消失
            decorateFishMaterial(c, { causticK:this.causticK, sway });
            return c;
          };
          o.material=Array.isArray(o.material)?o.material.map(deco):deco(o.material);
        });
        if(sway) this.swimUniforms.push({ u:ph, off:rand(6.283) });
        if(swimClip){
          const mixer=new THREE.AnimationMixer(obj);
          const swim=mixer.clipAction(swimClip);
          swim.time=rand((swimClip.duration||1)*0.8);     // 个体相位错开
          swim.play();
          const fast=fastClip?mixer.clipAction(fastClip):null;
          if(fast){ fast.time=rand(fastClip.duration*0.8); fast.setEffectiveWeight(0); fast.play(); }
          const bite=biteClip?mixer.clipAction(biteClip):null;
          if(bite) bite.setLoop(THREE.LoopOnce,1);
          this.mixers.push(mixer);
          this.actions.push({ swim, fast, bite });
        }
        this.fishes.push(obj);
        this.group.add(obj);
      }
    } else {
    // —— 程序化模式（GLB 加载失败的兜底） ——
    const bodyGeo=buildFishBody(spec);          // 眼睛已烘入体网格
    const finGeo=buildFishFins(spec, profileSampler(spec.profileH), profileSampler(spec.profileW));
    const anim=new Float32Array(N*2);
    for(let i=0;i<N;i++){ anim[i*2]=rand(6.283); anim[i*2+1]=rand(0.8,1.2); }
    for(const g of [bodyGeo, finGeo])
      g.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim,2));

    this.phaseU={ value: rand(10) };
    const matBody=new THREE.MeshPhysicalMaterial({
      vertexColors:true, roughness:spec.rough, metalness:spec.metal, envMapIntensity:0.9,
      normalMap:scaleNormalTex, normalScale:new THREE.Vector2(spec.scaleI,spec.scaleI),
      iridescence:spec.irid, iridescenceIOR:1.3,
      clearcoat:0.55, clearcoatRoughness:0.35 });
    injectSwim(matBody, spec, this.phaseU, spec.id, false);
    const matFin=new THREE.MeshStandardMaterial({
      vertexColors:true, roughness:0.6, metalness:0.05,
      transparent:true, opacity:spec.finOpacity, alphaMap:finAlphaTex,
      side:THREE.DoubleSide, depthWrite:false });
    injectSwim(matFin, spec, this.phaseU, spec.id, true);

    // 焦散叠加到鱼体（与游动形变合成同一个 onBeforeCompile）
    const swimCompile=matBody.onBeforeCompile;
    injectCaustics(matBody, 0.22, 'fish_'+spec.id);
    const causticCompile=matBody.onBeforeCompile;
    matBody.onBeforeCompile=(sh)=>{ causticCompile(sh); swimCompile(sh); };
    matBody.customProgramCacheKey=()=> 'swimcau_'+spec.id;
    const depthMat=new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking });
    injectSwim(depthMat, spec, this.phaseU, spec.id, false);

    this.mesh=new THREE.InstancedMesh(bodyGeo, matBody, N);
    this.mesh.castShadow=true;
    this.mesh.customDepthMaterial=depthMat;
    this.mesh.frustumCulled=false;
    this.finMesh=new THREE.InstancedMesh(finGeo, matFin, N);
    this.finMesh.frustumCulled=false;
    const eye=fishEyeLayout(spec);
    const eyeGeo=new THREE.SphereGeometry(1,10,8);
    const eyeMat=new THREE.MeshPhysicalMaterial({color:0x111216,roughness:0.22,metalness:0.05,clearcoat:0.9,clearcoatRoughness:0.12});
    this.eyeMesh=new THREE.InstancedMesh(eyeGeo, eyeMat, N*2);
    this.eyeMesh.castShadow=true;
    this.eyeMesh.frustumCulled=false;
    this.eyeInfo=eye;
    this.causticK=matBody.userData.causticK||null;
    this.group.add(this.mesh); this.group.add(this.finMesh); this.group.add(this.eyeMesh);
    }

    this.avgSpeed=spec.minSpeed*2;
    this.pos=[]; this.vel=[]; this.yaw=[]; this.bank=[]; this.smv=[];
    for(let i=0;i<N;i++){
      const p=new THREE.Vector3(rand(-1.7,1.7), rand(spec.band[0]+0.05,spec.band[1]-0.05), rand(-0.5,0.5));
      for(let k=0;k<8;k++){                       // 避免出生在岩石里
        if(!obstacles.some(o=>p.distanceTo(o.c)<o.r+0.12)) break;
        p.set(rand(-1.3,1.3), rand(spec.band[0]+0.05,spec.band[1]-0.05), rand(-0.4,0.4));
      }
      this.pos.push(p);
      const a=rand(6.283);
      this.vel.push(new THREE.Vector3(Math.sin(a),0,Math.cos(a)).multiplyScalar(spec.minSpeed*2));
      this.smv.push(new THREE.Vector3(Math.sin(a),0,Math.cos(a)));   // 平滑朝向（单位向量）
      this.yaw.push(a); this.bank.push(0);
    }
    // 底栖贴底停顿状态（bottomRest 物种启用）
    this.rest = spec.bottomRest
      ? Array.from({length:N},()=>({t:rand(4,10),on:0,dur:0,p:new THREE.Vector3()}))
      : null;
    // 成长体型（当前值缓动到目标值）与咬食计时
    this.growth=Float32Array.from({length:N},(_,i)=>growth?.[i]??1);
    this.growthTarget=Float32Array.from(this.growth);
    this.biteT=new Float32Array(N);
    this.gulpCool=new Float32Array(N);         // 刚吃过：短暂不抢，饲料分散到更多鱼
    this.regroupT=0;
    this.baseScale=this.glbMode ? (this.fishes[0]?.scale.x??1) : 1;
    this.update(0.016, { obstacles, pellets:[], excite:0, time:0, schools:[] });
  }

  setGrowth(i,g){ this.growthTarget[i]=g; }

  // 场景切换/改鱼群时释放：GLB 模式只释放克隆出来的材质（几何与模板共享），程序化模式全部释放
  dispose(){
    this.group.removeFromParent();
    if(this.glbMode){
      for(const m of this.mixers) m.stopAllAction();
      for(const f of this.fishes) f.traverse(o=>{
        if(!o.isMesh) return;
        (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());
      });
      return;
    }
    for(const mesh of [this.mesh, this.finMesh, this.eyeMesh]){
      mesh.geometry.dispose(); mesh.material.dispose(); mesh.customDepthMaterial?.dispose(); mesh.dispose();
    }
  }

  // 敲玻璃惊吓：背离敲击点的冲量（越近越猛），趴底的鱼一并惊醒
  startle(point){
    const spec=this.spec;
    this.regroupT=REGROUP_SECS;
    for(let i=0;i<spec.count;i++){
      _v1.subVectors(this.pos[i],point);
      const d=Math.max(_v1.length(),0.05);
      _v1.divideScalar(d); _v1.y*=0.4;
      _v1.x+=rand(-0.35,0.35); _v1.z+=rand(-0.35,0.35); _v1.normalize();
      const k=spec.maxSpeed*(1.2+1.6*clamp(1.2-d*0.4,0,1));
      this.vel[i].addScaledVector(_v1,k);
      if(this.rest){ const R=this.rest[i]; R.on=0; R.dur=0; R.t=rand(6,12); }
    }
  }

  // 咬食：向前小冲刺 + （GLB）Attack 动作单次播放
  _bite(i){
    this.biteT[i]=BITE_DUR;
    this.gulpCool[i]=rand(1.4,2.4);
    this.vel[i].addScaledVector(this.smv[i], this.spec.maxSpeed*0.5);
    this.actions?.[i]?.bite?.reset().play();
  }

  update(dt, ctx){
    const spec=this.spec, N=spec.count;
    const fear=ctx.fear??0, sleep=ctx.sleep??0, appetite=ctx.appetite??1, flow=ctx.current??0;
    // 摆频耦合游速（Strouhal 关系）：速度快 → 摆尾快；睡眠减缓、惊吓加快
    this.phaseU.value += dt*spec.beat
      *(0.55+0.95*this.avgSpeed/spec.maxSpeed)*(1+0.7*ctx.excite)*(1-0.5*sleep)*(1+fear);
    const calm=1-0.6*sleep;                       // 夜间睡眠：整体减速 60%
    const maxS=spec.maxSpeed*(1+0.8*ctx.excite+1.6*fear)*calm;
    const minS=spec.minSpeed*calm*(1+2*fear);
    const social=1-0.85*fear;                     // 惊吓削弱群聚 → 四散，衰减后重新聚拢
    const wander=spec.wander*(1-0.85*sleep);
    // 食欲决定是否觅食与感知半径；惊吓期间不觅食
    const hunting=spec.hunts && ctx.pellets.length>0 && fear<0.15 && appetite>0.02;
    const senseR=spec.senseR*appetite;
    const sleepY=spec.band[0]+(spec.band[1]-spec.band[0])*0.3;
    // 惊吓消退后：短时向全群中心回聚（局部 Boids 聚合半径不足以把散开的鱼拉回）
    let regroup=0;
    if(this.regroupT>0){
      this.regroupT-=dt;
      if(fear<0.2){
        regroup=0.9*spec.wCoh*Math.min(1,this.regroupT/REGROUP_SECS*2);
        _center.set(0,0,0); for(const q of this.pos) _center.add(q); _center.divideScalar(N);
      }
    }
    let speedSum=0;

    for(let i=0;i<N;i++){
      const p=this.pos[i], v=this.vel[i];
      _acc.set(0,0,0); _sep.set(0,0,0); _ali.set(0,0,0); _coh.set(0,0,0);
      let cnt=0;
      // 底栖贴底停顿：定时趴沙 2~3 秒
      const R=this.rest?this.rest[i]:null;
      let resting=false;
      if(R){
        R.t-=dt;
        if(!R.on){
          if(R.t<=0 && p.y<spec.band[0]+0.25){ R.on=1; R.dur=rand(2,3.2);
            R.p.set(p.x,0,p.z); R.p.y=sandHeight(p.x,p.z)+0.03; }
          else if(R.t<=0){ R.t=2; }
        }
        if(R.on){ R.dur-=dt; resting=R.dur>0; if(!resting){ R.on=0; R.t=rand(9,18); } }
      }

      for(let j=0;j<N;j++){                       // 同种：分离/对齐/聚合
        if(j===i) continue;
        const q=this.pos[j], d=p.distanceTo(q);
        if(d<0.16) _sep.add(_v1.subVectors(p,q).multiplyScalar(1/Math.max(d,0.02)));
        if(d<spec.schoolRad){ _ali.add(this.vel[j]); _coh.add(q); cnt++; }
      }
      if(cnt){
        _acc.addScaledVector(_sep, spec.wSep);
        _ali.divideScalar(cnt); _acc.addScaledVector(_v1.subVectors(_ali,v), spec.wAli*social);
        _coh.divideScalar(cnt); _acc.addScaledVector(_v1.subVectors(_coh,p), spec.wCoh*social);
      }
      for(const other of ctx.schools){            // 异种：仅分离（体型悬殊时小鱼推不动大鱼）
        if(other===this) continue;
        if(other.spec.L < spec.L*0.7) continue;
        for(const q of other.pos){
          const d=p.distanceTo(q);
          if(d<0.2 && d>1e-4) _acc.addScaledVector(_v1.subVectors(p,q), 3.0/d);
        }
      }
      {                                           // 漫游：低频缓变，直线巡航为主
        const wT=ctx.time*0.3+i*2.1;
        _acc.x+=Math.sin(wT*1.1+i*2.7)*wander*0.4;
        _acc.y+=Math.sin(wT*0.5+i*1.7)*wander*0.1;
        _acc.z+=Math.cos(wT*0.9+i*3.3)*wander*0.4;
      }
      if(flow && !resting){                       // 顶流（趋流性）：在溪流里转头迎着水流缓游，几乎原地"悬停"
        _acc.x+=(-Math.sign(flow)*minS*2.2-v.x)*Math.min(1.2,Math.abs(flow)*5)*social;
      }
      if(sleep>0) _acc.y+=(sleepY-p.y)*0.8*sleep;  // 夜间沉向水层带下部休息
      if(regroup>0) _acc.addScaledVector(_v1.subVectors(_center,p), regroup);
      if(spec.territory && !hunting){                // 领地盘旋（觅食时让位）
        const [tx, , tz, tr]=spec.territory;            // [x, y(未用), z, 半径]
        const dx=p.x-tx, dz=p.z-tz;
        const d=Math.hypot(dx,dz)||1e-4;
        if(d>tr){ const s=(d-tr)*3; _acc.x-=dx/d*s; _acc.z-=dz/d*s; }   // 越界弹簧拉回
        else if(d<tr*0.5){ _acc.x+=dx/d*0.5; _acc.z+=dz/d*0.5; } // 防塌中心
        _acc.x+=(-dz/d)*0.24; _acc.z+=(dx/d)*0.24;             // 切向绕圈
      }
      {                                           // 边界软约束
        const m=0.14, k=7;
        if(p.x<-1.5+m) _acc.x+=k*((-1.5+m)-p.x);
        if(p.x> 1.5-m) _acc.x-=k*(p.x-(1.5-m));
        if(p.z> 0.48-m) _acc.z-=k*(p.z-(0.48-m));
        if(p.z<-0.48+m) _acc.z+=k*((-0.48+m)-p.z);
        if(p.y>spec.band[1]-0.08) _acc.y-=k*(p.y-(spec.band[1]-0.08));
        if(p.y<spec.band[0]+0.08) _acc.y+=k*((spec.band[0]+0.08)-p.y);
      }
      for(const o of ctx.obstacles){              // 障碍
        const d=p.distanceTo(o.c), rr=o.r+0.13;
        if(d<rr) _acc.add(_v1.subVectors(p,o.c).normalize().multiplyScalar((rr-d)*16));
      }
      if(resting){                                // 趴底：忽略社交力，弹簧锚定沙面
        _acc.set(0,0,0);
        _acc.add(_v1.subVectors(R.p,p).multiplyScalar(3));
      }
      if(this.gulpCool[i]>0) this.gulpCool[i]-=dt;
      if(hunting && !resting && this.gulpCool[i]<=0){   // 觅食
        let best=null, bd=senseR;
        for(const pel of ctx.pellets){
          if(pel.eaten) continue;
          const d=p.distanceTo(pel.p);
          if(d<bd){ bd=d; best=pel; }
        }
        if(best){
          _acc.addScaledVector(_v1.subVectors(best.p,p).normalize(), 2.6);
          if(bd<0.13 && ctx.feeder.consume(best)){ this._bite(i); ctx.onEat?.(this,i); }
        }
      }

      v.addScaledVector(_acc, dt);
      let s=v.length();
      if(s<1e-5){ v.set(rand(-1,1),0,rand(-1,1)).normalize().multiplyScalar(spec.minSpeed); s=v.length(); }
      if(s>maxS) v.multiplyScalar(maxS/s);
      else if(!resting && s<minS) v.multiplyScalar(minS/s);
      v.y*=1-Math.min(0.5, dt*0.8);               // 保持水平姿态
      p.addScaledVector(v, dt);
      if(flow && !resting) p.x+=flow*dt*0.55;     // 水流推送（鱼要一直逆游才能保持位置）
      if(resting) v.multiplyScalar(1-Math.min(1,dt*3));   // 趴底阻尼
      p.x=clamp(p.x,-2.0,2.0); p.y=clamp(p.y,(resting?0.25:0.4),1.66); p.z=clamp(p.z,-0.68,0.68);
      speedSum+=v.length();

      // 平滑朝向：速度方向低通滤波（帧率无关），转弯呈弧线而非瞬时甩头
      const sLen=v.length();
      if(sLen>1e-5){
        _v3.copy(v).divideScalar(sLen);
        this.smv[i].lerp(_v3, 1-Math.exp(-dt*(spec.turn||3.2))).normalize();
      }
      const hd=this.smv[i];
      const yaw=Math.atan2(hd.x,hd.z);
      const yawRate=wrapPI(yaw-this.yaw[i])/Math.max(dt,1e-4);
      this.yaw[i]=yaw;
      const bankT=clamp(-yawRate*0.45,-0.6,0.6);
      this.bank[i]+=(bankT-this.bank[i])*Math.min(1,dt*5);
      this.growth[i]+=(this.growthTarget[i]-this.growth[i])*Math.min(1,dt*1.5);
      if(this.biteT[i]>0) this.biteT[i]=Math.max(0,this.biteT[i]-dt);

      if(this.glbMode){
        const obj=this.fishes[i];
        obj.position.copy(p);
        obj.scale.setScalar(this.baseScale*this.growth[i]);
        _v2.copy(p).add(hd);
        obj.lookAt(_v2);
        obj.rotateZ(this.bank[i]*0.5);
      } else {
      _dummy.position.copy(p);
      _dummy.scale.setScalar(this.growth[i]);
      _v2.copy(p).add(hd);
      _dummy.lookAt(_v2);
      _dummy.rotateZ(this.bank[i]);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i,_dummy.matrix);
      this.finMesh.setMatrixAt(i,_dummy.matrix);
      for(let ei=0;ei<2;ei++){
        const side=ei===0?1:-1;
        _eyeLocal.makeTranslation(side*this.eyeInfo.x,this.eyeInfo.y,this.eyeInfo.z);
        _eyeLocal.scale(_v3.set(this.eyeInfo.re*0.74,this.eyeInfo.re*0.74,this.eyeInfo.re*0.74));
        _eyeM.multiplyMatrices(_dummy.matrix,_eyeLocal);
        this.eyeMesh.setMatrixAt(i*2+ei,_eyeM);
      }
      }
    }
    this.avgSpeed+=((speedSum/N)-this.avgSpeed)*Math.min(1,dt*2);
    if(this.glbMode){
      // 摆尾频率随速度/兴奋度加快（对应程序化模式的 Strouhal 逻辑）
      const ts=(0.75+1.5*(this.avgSpeed/spec.maxSpeed)+0.9*ctx.excite)*(1-0.5*sleep);
      // 动作混合：游动 ↔ 冲刺按惊吓度，咬食按包络临时压过两者（权重归一化混合）
      const fastW=clamp(fear*1.5,0,1);
      for(let i=0;i<this.mixers.length;i++){
        const a=this.actions[i], b=this.biteT[i]>0 ? Math.sin(Math.PI*(1-this.biteT[i]/BITE_DUR)) : 0;
        if(a.fast){ a.fast.setEffectiveWeight(fastW*(1-b)); a.swim.setEffectiveWeight((1-fastW)*(1-b)); }
        else a.swim.setEffectiveWeight(1-b);
        a.bite?.setEffectiveWeight(b);
        const m=this.mixers[i]; m.timeScale=ts; m.update(dt);
      }
      for(const s of this.swimUniforms) s.u.value=this.phaseU.value+s.off;
      return;
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    this.finMesh.instanceMatrix.needsUpdate=true;
    this.eyeMesh.instanceMatrix.needsUpdate=true;
  }
}
