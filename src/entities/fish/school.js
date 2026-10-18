import * as THREE from 'three';
import { rand, clamp, wrapPI } from '../../utils.js';
import { scaleNormalTex, finAlphaTex } from '../../fish/textures.js';
import { buildFishBody, buildFishFins, profileSampler, injectSwim, fishEyeLayout } from '../../fish/body.js';
import { boidsAccumulate, crossSeparate, wanderAcc, boundaryAcc, obstacleAcc, huntTarget, swimLimits } from './steering.js';
import { decorateFishMaterial } from '../../fish/glb-style.js';
import { injectCaustics } from '../../scene/caustics.js';
import { sandHeight, TANK } from '../../scene/tank.js';
// @ts-check
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** @typedef {import('./species.js').FishSpec} FishSpec */
/** @typedef {{ c:THREE.Vector3, r:number }} Obstacle */
/** @typedef {{ template:THREE.Object3D, animations:any[] }} GlbData */
/** @typedef {{ growth?:number[], capacity?:number, gloss?:number }} SchoolOpts */

/* ---------- 鱼群（Boids + 转弯侧倾） ---------- */
const _v1=new THREE.Vector3(), _v2=new THREE.Vector3(), _v3=new THREE.Vector3(),
      _acc=new THREE.Vector3(), _sep=new THREE.Vector3(), _ali=new THREE.Vector3(),
      _coh=new THREE.Vector3(), _dummy=new THREE.Object3D();
const _eyeLocal=new THREE.Matrix4(), _eyeM=new THREE.Matrix4();

const BITE_DUR=0.35;                // 咬食动作时长（秒）
const FLOW_PUSH=0.55;               // 水流把鱼往下游推的比例（相对 env.current）
const REGROUP_SECS=6;               // 惊散后向鱼群中心回聚的时长
const _center=new THREE.Vector3();

export class School {
  /** GLB 模式与程序化模式的实例字段在两个分支里分别赋值，统一声明避免模式耦合的类型纠缠 */
  /** @type {any} */ mesh;          // 程序化：体网格 InstancedMesh
  /** @type {any} */ finMesh;
  /** @type {any} */ eyeMesh;
  /** @type {any} */ template;      // GLB 模板与动画片段（GLB 模式）
  /** @type {any} */ swimClip=null;
  /** @type {any} */ fastClip=null;
  /** @type {any} */ biteClip=null;
  /** @type {any[]} */ swimUniforms=[];
  /** @type {{ value:number }} */ phaseU={ value:0 };
  /** @type {any} */ causticK=null;
  /** @type {any} */ rest=null;
  /** @type {THREE.Object3D[]} */ fishes=[];
  /** @type {THREE.AnimationMixer[]} */ mixers=[];
  /** @type {{ swim:any, fast:any, bite:any }[]} */ actions=[];

  // capacity：可容纳的最大条数（预分配实例/状态数组，addFish 原地入缸不用重建）
  /** @param {FishSpec} spec @param {Obstacle[]} obstacles @param {GlbData|null} glbData @param {SchoolOpts} [opts] */
  constructor(spec, obstacles, glbData, { growth, capacity, gloss }={}){
    this.spec=spec;
    this.glbMode=!!glbData;
    const N=spec.count;
    this.capacity=Math.max(N, Math.floor(capacity??N), 1);
    this.spawnObstacles=obstacles;               // addFish 出生避让岩石时复用
    this.lim=swimLimits(spec.L);                 // 水平活动半宽（按体长离玻璃留距）
    this.group=new THREE.Group();
    this.causticK=null;
    if(this.glbMode){
      // —— 骨骼动画模型模式 ——
      const clips=(/** @type {GlbData} */ (glbData)).animations||[];
      // 无动画模型（如静态雕塑）也能跑：仅靠 Boids 位移
      this.template=(/** @type {GlbData} */ (glbData)).template;
      this.swimClip=clips.find((/** @type {any} */ c)=>/Swimming_Normal/i.test(c.name))
        ||clips.find((/** @type {any} */ c)=>/swim/i.test(c.name))||clips[0]||null;
      this.fastClip=clips.find((/** @type {any} */ c)=>/Swimming_Fast/i.test(c.name))||null;   // 受惊冲刺
      this.biteClip=clips.find((/** @type {any} */ c)=>/Attack/i.test(c.name))||null;          // 咬食
      this.fishes=[]; this.mixers=[]; this.actions=[]; this.swimUniforms=[];
      this.phaseU={ value: rand(10) };
      this.causticK={ value:0.22 };            // 鱼体焦散强度（applyNight 调节）
      for(let i=0;i<N;i++) this._glbFish(i);
    } else {
    // —— 程序化模式（GLB 加载失败的兜底） ——
    const bodyGeo=buildFishBody(spec);          // 眼睛已烘入体网格
    const finGeo=buildFishFins(spec, profileSampler(spec.profileH), profileSampler(spec.profileW));
    const anim=new Float32Array(this.capacity*2);
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
    matBody.onBeforeCompile=(/** @type {any} */ sh)=>{ (/** @type {any} */ (causticCompile))(sh); (/** @type {any} */ (swimCompile))(sh); };
    matBody.customProgramCacheKey=()=> 'swimcau_'+spec.id;
    const depthMat=new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking });
    injectSwim(depthMat, spec, this.phaseU, spec.id, false);

    this.mesh=new THREE.InstancedMesh(bodyGeo, matBody, this.capacity);
    this.mesh.count=N;
    this.mesh.castShadow=true;
    this.mesh.customDepthMaterial=depthMat;
    this.mesh.frustumCulled=false;
    this.finMesh=new THREE.InstancedMesh(finGeo, matFin, this.capacity);
    this.finMesh.count=N;
    this.finMesh.frustumCulled=false;
    const eye=fishEyeLayout(spec);
    const eyeGeo=new THREE.SphereGeometry(1,10,8);
    const eyeMat=new THREE.MeshPhysicalMaterial({color:0x111216,roughness:0.22,metalness:0.05,clearcoat:0.9,clearcoatRoughness:0.12});
    this.eyeMesh=new THREE.InstancedMesh(eyeGeo, eyeMat, this.capacity*2);
    this.eyeMesh.count=N*2;
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
    // 成长体型（当前值缓动到目标值）与咬食计时（容量预分配，addFish 原地追加）
    const cap=this.capacity;
    this.growth=new Float32Array(cap).fill(1);
    if(growth) for(let i=0;i<N;i++) this.growth[i]=growth[i]??1;
    this.growthTarget=new Float32Array(this.growth);
    this.biteT=new Float32Array(cap); this.gulpCool=new Float32Array(cap);   // 刚吃过：短暂不抢，饲料分散到更多鱼
    // 个性统计：均速/转向频率/水层 的指数滑动平均（identity.js 据此出标签）
    this.pSpd=new Float32Array(cap).fill(0.5);
    this.pTurn=new Float32Array(cap).fill(0.3);
    this.pY=new Float32Array(cap).fill(0.5);
    this.obsT=0;
    this.regroupT=0;
    this.baseScale=this.glbMode ? (this.fishes[0]?.scale.x??1) : 1;
    this.glossK=-1; this.setGloss(gloss??0);
    this.update(0.016, { obstacles, pellets:[], excite:0, time:0, schools:[] });
  }

  // 克隆一条 GLB 鱼并接好动画（构造与 addFish 共用）
  _glbFish(/** @type {number} */ i){
    const spec=this.spec;
    const obj=SkeletonUtils.clone(this.template);
    obj.userData.fishIndex=i;
    // 无骨骼动画的静态模型才做程序化尾摆，每条鱼独立相位
    const ph={ value:0 };
    const sway=this.swimClip ? null : { phaseU:ph, L:spec.L, amp:spec.amp, waveK:spec.waveK };
    obj.traverse((/** @type {any} */ o)=>{
      if(!o.isMesh) return;
      o.castShadow=true; o.frustumCulled=false;
      const deco=(/** @type {any} */ m)=>{
        const c=m.clone();
        c.side=THREE.DoubleSide;               // 鳍片是单面几何：双面渲染，避免背向时整片消失
        if(spec.id==='koi'){                   // 同一张贴图克隆出多条锦鲤：冷暖微调，避免"复制粘贴"
          const w=(i%2)?-1:1;
          c.color.setRGB(1+w*0.035, 1+w*0.004, 1-w*0.03);
        }
        decorateFishMaterial(c, { causticK:this.causticK, sway });
        return c;
      };
      o.material=Array.isArray(o.material)?o.material.map(deco):deco(o.material);
    });
    if(sway) this.swimUniforms.push({ u:ph, off:rand(6.283) });
    if(this.swimClip){
      const mixer=new THREE.AnimationMixer(obj);
      const swim=mixer.clipAction(this.swimClip);
      swim.time=rand((this.swimClip.duration||1)*0.8);     // 个体相位错开
      swim.play();
      const fast=this.fastClip?mixer.clipAction(this.fastClip):null;
      if(fast){ fast.time=rand(this.fastClip.duration*0.8); fast.setEffectiveWeight(0); fast.play(); }
      const bite=this.biteClip?mixer.clipAction(this.biteClip):null;
      if(bite) bite.setLoop(THREE.LoopOnce,1);
      this.mixers.push(mixer);
      this.actions.push({ swim, fast, bite });
    }
    this.fishes.push(obj);
    this.group.add(obj);
  }

  // 亲密度入缸：原地追加一条（容量内），从小长大完成"入缸动画"；返回新鱼下标，满了返回 -1
  addFish(){
    const spec=this.spec, i=spec.count;
    if(i>=this.capacity) return -1;
    spec.count=i+1;
    const p=new THREE.Vector3(rand(-0.6,0.6), spec.band[1]-0.18, rand(-0.3,0.3));
    for(let k=0;k<8;k++){                       // 与出生时一样避开岩石
      if(!this.spawnObstacles.some(o=>p.distanceTo(o.c)<o.r+0.12)) break;
      p.set(rand(-1.3,1.3), spec.band[1]-0.18, rand(-0.4,0.4));
    }
    const a=rand(6.283);
    this.pos.push(p);
    this.vel.push(new THREE.Vector3(Math.sin(a),0,Math.cos(a)).multiplyScalar(spec.minSpeed*2));
    this.smv.push(new THREE.Vector3(Math.sin(a),0,Math.cos(a)));
    this.yaw.push(a); this.bank.push(0);
    this.rest?.push({t:rand(4,10),on:0,dur:0,p:new THREE.Vector3()});
    this.growth[i]=0.45; this.growthTarget[i]=1;   // 0.45 → 1：几秒内长大
    this.biteT[i]=0; this.gulpCool[i]=rand(0.5,1.5);
    this.pSpd[i]=0.5; this.pTurn[i]=0.3;
    this.pY[i]=(p.y-0.35)/(TANK.waterY-0.35);
    if(this.glbMode) this._glbFish(i);
    else { this.mesh.count=i+1; this.finMesh.count=i+1; this.eyeMesh.count=(i+1)*2; }
    return i;
  }

  // 亲密度的"光泽度"加成：环境反射与水膜清漆随 k 增强（0..1）
  setGloss(/** @type {number} */ k){
    k=clamp(k,0,1);
    if(k===this.glossK) return;
    this.glossK=k;
    if(this.glbMode){
      this.group.traverse((/** @type {any} */ o)=>{
        if(!o.isMesh) return;
        (Array.isArray(o.material)?o.material:[o.material]).forEach((/** @type {any} */ m)=>{
          if(!m || !('envMapIntensity' in m)) return;
          m.userData._g0??={ env:m.envMapIntensity, cc:m.clearcoat??0 };
          const g0=m.userData._g0;
          m.envMapIntensity=g0.env*(1+0.9*k);
          if('clearcoat' in m) m.clearcoat=Math.min(1, g0.cc+(1-g0.cc)*0.6*k);
        });
      });
      return;
    }
    this.mesh.material.envMapIntensity=0.9+0.7*k;
    this.mesh.material.clearcoat=Math.min(1,0.55+0.3*k);
  }

  /** 个体行为统计（归一化） @param {number} i */
  persona(/** @type {number} */ i){ return { spd:this.pSpd[i], turn:this.pTurn[i], layer:this.pY[i], obs:this.obsT }; }
  /** 全群平均（个性标签的相对基准） */
  personaAvg(){
    const n=this.spec.count;
    if(!n) return { spd:0, turn:0 };
    let s=0,t=0;
    for(let i=0;i<n;i++){ s+=this.pSpd[i]; t+=this.pTurn[i]; }
    return { spd:s/n, turn:t/n };
  }

  setGrowth(/** @type {number} */ i,/** @type {number} */ g){ this.growthTarget[i]=g; }

  // 场景切换/改鱼群时释放：GLB 模式只释放克隆出来的材质（几何与模板共享），程序化模式全部释放
  dispose(){
    this.group.removeFromParent();
    if(this.glbMode){
      for(const m of this.mixers) m.stopAllAction();
      for(const f of this.fishes) f.traverse((/** @type {any} */ o)=>{
        if(!o.isMesh) return;
        (Array.isArray(o.material)?o.material:[o.material]).forEach((/** @type {any} */ m)=>m.dispose());
        o.skeleton?.dispose();                   // SkeletonUtils.clone 给每个 SkinnedMesh 一份骨架：骨骼纹理不释放会一直累积
      });
      return;
    }
    for(const mesh of [this.mesh, this.finMesh, this.eyeMesh]){
      mesh.geometry.dispose(); mesh.material.dispose(); mesh.customDepthMaterial?.dispose(); mesh.dispose();
    }
  }

  // 敲玻璃惊吓：背离敲击点的冲量（越近越猛），趴底的鱼一并惊醒
  startle(/** @type {THREE.Vector3} */ point){
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
  _bite(/** @type {number} */ i){
    this.biteT[i]=BITE_DUR;
    this.gulpCool[i]=rand(1.4,2.4);
    this.vel[i].addScaledVector(this.smv[i], this.spec.maxSpeed*0.5);
    this.actions?.[i]?.bite?.reset().play();
  }

  update(/** @type {number} */ dt, /** @type {any} */ ctx){
    const spec=this.spec, N=spec.count;
    this.obsT+=dt;
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
      _acc.set(0,0,0);
      // 底栖贴底停顿：定时趴沙 2~3 秒
      const R=this.rest?this.rest[i]:null;
      // 水层下界：底栖种（hug）贴着沙面起伏，其余按 band
      const floorY=spec.hug!=null ? sandHeight(p.x,p.z)+spec.hug+spec.H*0.5 : spec.band[0];
      let resting=false;
      if(R){
        R.t-=dt;
        if(!R.on){
          if(R.t<=0 && p.y<floorY+0.25){ R.on=1; R.dur=rand(2,3.2);
            R.p.set(p.x,0,p.z); R.p.y=sandHeight(p.x,p.z)+0.03; }
          else if(R.t<=0){ R.t=2; }
        }
        if(R.on){ R.dur-=dt; resting=R.dur>0; if(!resting){ R.on=0; R.t=rand(9,18); } }
      }

      boidsAccumulate(i, this.pos, this.vel, spec, social, _acc, _sep, _ali, _coh, ctx.grid, this);
      crossSeparate(this, i, ctx.schools, _acc, ctx.grid);   // 异种：仅分离（体型悬殊时小鱼推不动大鱼）
      wanderAcc(_acc, ctx.time, i, wander);       // 漫游：低频缓变，直线巡航为主
      if(flow && !resting){                       // 顶流（趋流性）：迎着水流游、对地速度约为 0，前后缓缓进退
        // 相对水的目标速度 = 水流推送量 ×(1±0.35)：平均对地静止（此前恒逆游 minS×2.2，比水流快，全挤到上游玻璃）
        const hold=FLOW_PUSH*Math.abs(flow)*(1+0.35*Math.sin(ctx.time*0.35+i*2.3));
        _acc.x+=(-Math.sign(flow)*hold-v.x)*1.2*social;
      }
      if(sleep>0) _acc.y+=(sleepY-p.y)*0.8*sleep;  // 夜间沉向水层带下部休息
      if(regroup>0) _acc.addScaledVector(_v1.subVectors(_center,p), regroup);
      if(spec.territory && !hunting){                // 领地盘旋（觅食时让位）：椭圆，缸深方向窄，整圈都在活动范围内
        const [tx, , tz, rx, rzRaw]=spec.territory;     // [x, y(未用), z, x 半径, z 半径]
        const rz=rzRaw??rx;
        const ex=(p.x-tx)/rx, ez=(p.z-tz)/rz;           // 归一化到单位圆
        const d=Math.hypot(ex,ez)||1e-4;
        if(d>1){ const s=(d-1)*3; _acc.x-=ex/d*s*rx; _acc.z-=ez/d*s*rz; }     // 越界弹簧拉回
        else if(d<0.5){ _acc.x+=ex/d*0.5; _acc.z+=ez/d*0.5; }                  // 防塌中心
        _acc.x+=(-ez/d)*0.45*rx/Math.max(rx,rz); _acc.z+=(ex/d)*0.45*rz/Math.max(rx,rz);   // 切向绕圈
      }
      boundaryAcc(p, spec.band, _acc, this.lim, floorY);   // 边界软约束
      obstacleAcc(p, ctx.obstacles, _acc);        // 障碍
      if(resting){                                // 趴底：忽略社交力，弹簧锚定沙面
        _acc.set(0,0,0);
        _acc.add(_v1.subVectors((/** @type {any} */ R).p,p).multiplyScalar(3));
      }
      if(this.gulpCool[i]>0) this.gulpCool[i]-=dt;
      if(hunting && !resting && this.gulpCool[i]<=0){   // 觅食
        const bottomFeeder=spec.hug!=null;
        const best=huntTarget(p, ctx.pellets, senseR, bottomFeeder ? -Infinity : spec.band[0]+0.05, bottomFeeder);
        if(best){
          const bd=p.distanceTo(best.p);
          _acc.addScaledVector(_v1.subVectors(best.p,p).normalize(), 2.6);
          if(bd<0.13 && ctx.feeder.consume(best)){ this._bite(i); ctx.onEat?.(this,i); }
        }
      }

      v.addScaledVector(_acc, dt);
      let s=v.length();
      if(s<1e-5){ v.set(rand(-1,1),0,rand(-1,1)).normalize().multiplyScalar(spec.minSpeed); s=v.length(); }
      if(s>maxS) v.multiplyScalar(maxS/s);
      else if(!resting && s<minS){
        // 顶流时最低游速放宽到水流推送量附近：否则被抬到 minS，又变成整群往上游挤
        const lo=flow ? Math.min(minS, FLOW_PUSH*Math.abs(flow)*0.65) : minS;
        if(s<lo) v.multiplyScalar(lo/s);
      }
      v.y*=1-Math.min(0.5, dt*0.8);               // 保持水平姿态
      p.addScaledVector(v, dt);
      if(flow && !resting) p.x+=flow*dt*FLOW_PUSH; // 水流推送（鱼要一直逆游才能保持位置）
      if(resting) v.multiplyScalar(1-Math.min(1,dt*3));   // 趴底阻尼
      // 硬约束：不出玻璃、不钻沙（沙面按高度场，趴底时可以贴近）
      const sandY=sandHeight(p.x,p.z);
      p.x=clamp(p.x,-this.lim.x-0.06,this.lim.x+0.06);
      p.y=clamp(p.y, resting ? sandY+0.03 : Math.max(sandY+spec.H*0.5+0.02, spec.hug!=null ? 0 : 0.4), 1.66);
      p.z=clamp(p.z,-this.lim.z-0.06,this.lim.z+0.06);
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
      // 个性统计：均速/转向频率/水层 的滑动平均（≈12 秒时间常数，帧率无关）
      // 水层按整个水柱归一（0.35≈沙面 .. 水面），底栖种的"底栖宅"才名副其实
      const pk=1-Math.exp(-dt*0.085);
      this.pSpd[i]+=(Math.min(s/spec.maxSpeed,1.5)-this.pSpd[i])*pk;
      this.pTurn[i]+=(Math.min(Math.abs(yawRate),8)/8-this.pTurn[i])*pk;
      this.pY[i]+=((p.y-0.35)/(TANK.waterY-0.35)-this.pY[i])*pk;
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
        const eye=(/** @type {any} */ (this.eyeInfo));
        _eyeLocal.makeTranslation(side*eye.x,eye.y,eye.z);
        _eyeLocal.scale(_v3.set(eye.re*0.74,eye.re*0.74,eye.re*0.74));
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
      for(const s of /** @type {any[]} */ (this.swimUniforms)) s.u.value=this.phaseU.value+s.off;
      return;
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    this.finMesh.instanceMatrix.needsUpdate=true;
    this.eyeMesh.instanceMatrix.needsUpdate=true;
  }
}
