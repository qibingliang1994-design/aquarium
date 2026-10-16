import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, sstep } from '../utils.js';
import { U } from '../uniforms.js';

/* ================================================================
 * 鱼类 2.0
 *  - 形体：高度/宽度双轮廓放样 + 超椭圆截面（头圆尾扁），UV 供鳞片贴图
 *  - 游动：行波沿体长后传、包络向尾部增大（鲹形类运动学，
 *          Di Santo et al. 2021），截面按波面斜率刚性转动（保长度），
 *          摆频随游速耦合（Strouhal 数约 0.2~0.4）
 *  - 皮肤：程序化鳞片法线贴图（六边形高度场→有限差分法线）
 * ================================================================ */
export function profileSampler(points){
  const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],0)));
  return u=> curve.getPoint(clamp(u,0,1)).y;
}
/* ---------- 鱼体网格：双轮廓 + 超椭圆截面放样；眼部烘入网格 ---------- */
export function buildFishBody(spec){
  const NL=50, NR=40, L=spec.L, H=spec.H;
  const hAt=profileSampler(spec.profileH), wAt=profileSampler(spec.profileW);
  const pos=[], col=[], uv=[], idx=[];
  const tmp=new THREE.Color();
  const tiles=spec.scaleTiles;
  const IRIS=new THREE.Color(0.30,0.21,0.10), PUPIL=new THREE.Color(0.015,0.015,0.022);

  // 沿体长非均匀采样：头/眼区加密，保证眼睛有足够顶点分辨率
  const uSample=v=>{
    const a=0.10, b=0.24, wa=0.16, wb=0.30;
    if(v<wa) return v/wa*a;
    if(v<wa+wb) return a+(v-wa)/wb*(b-a);
    return b+(v-wa-wb)/(1-wa-wb)*(1-b);
  };

  // 眼睛参数（烘入表面：凸起 + 虹膜/瞳孔顶点色）
  const uE=0.155, re=H*spec.eyeSize*1.15, zE=L/2-uE*L;
  const hRe=Math.max(hAt(uE),0.02)*H/2, wRe=hRe*wAt(uE);
  const eyeSide=[Math.PI/2-0.24, Math.PI*1.5+0.24];   // 两侧、侧线上方

  for(let i=0;i<=NL;i++){
    const u=uSample(i/NL);          // 0 头 → 1 尾
    const z=L/2-u*L;
    const hR=Math.max(hAt(u),0.02)*H/2;
    const wR=hR*wAt(u);
    const m=1.95+0.5*(1-sstep(0,0.45,u));   // 截面指数：头圆身丰（指数越高越圆润）
    for(let j=0;j<=NR;j++){
      const th=j/NR*Math.PI*2;       // 0 背部
      const c=Math.cos(th), s2=Math.sin(th);
      let x=wR*Math.sign(s2)*Math.pow(Math.abs(s2),2/m);
      const yb=hR*Math.sign(c)*Math.pow(Math.abs(c),2/m);
      let y=yb*(c>=0?spec.topK:spec.botK);
      uv.push(j/NR*tiles*0.6, u*tiles);
      spec.paint(u,c,y,z,tmp);
      const gill=sstep(0.17,0.20,u)*(1-sstep(0.23,0.26,u))*(1-sstep(0.05,0.62,Math.abs(c))); // 鳃盖两侧阴影
      const mouth=(1-sstep(0.02,0.08,u))*0.45;                // 口鼻端变暗
      tmp.multiplyScalar(1-0.22*gill-0.4*mouth);
      if(Math.abs(u-uE)<0.14){                                 // 眼部
        const dz=z-zE;
        let de=1e9;
        for(const tE of eyeSide){
          let dth=th-tE;
          while(dth> Math.PI)dth-=Math.PI*2;
          while(dth<-Math.PI)dth+=Math.PI*2;
          de=Math.min(de, Math.hypot(dz, dth*wRe));
        }
        const kI=1-sstep(0.72*re,1.02*re,de);                  // 虹膜
        if(kI>0) tmp.lerp(IRIS,kI*0.92);
        const kP=1-sstep(0.30*re,0.46*re,de);                  // 瞳孔
        if(kP>0) tmp.lerp(PUPIL,kP);
        const kB=1-sstep(0,1.25*re,de);                        // 眼球弧面凸起
        if(kB>0){
          const amt=0.55*re*kB*kB, len=Math.hypot(x,y)||1;
          x+=x/len*amt; y+=y/len*amt;
        }
      }
      pos.push(x,y,z);
      col.push(tmp.r,tmp.g,tmp.b);
    }
  }
  for(let i=0;i<NL;i++) for(let j=0;j<NR;j++){
    const a=i*(NR+1)+j, b=a+NR+1;
    idx.push(a,b,a+1, a+1,b,b+1);
  }
  // 封闭头/尾端面（避免鼻端与尾柄透空）
  {
    const nose=pos.length/3;
    pos.push(0,0,L/2);
    spec.paint(0,0,0,L/2,tmp); tmp.multiplyScalar(0.45);
    col.push(tmp.r,tmp.g,tmp.b); uv.push(0.5,0);
    for(let j=0;j<NR;j++){
      const a=j;
      idx.push(nose, a+1, a);
    }
    const tail=pos.length/3;
    pos.push(0,0,-L/2);
    spec.paint(1,0,0,-L/2,tmp); tmp.multiplyScalar(0.45);
    col.push(tmp.r,tmp.g,tmp.b); uv.push(0.5,tiles);
    for(let j=0;j<NR;j++){
      const a=NL*(NR+1)+j;
      idx.push(tail, a, a+1);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 鱼鳍：Shape 曲线轮廓 → 合并；每片鳍独立 UV（u=1 附着边）供辐条透明贴图
export function buildFishFins(spec, hAt, wAt){
  const L=spec.L, H=spec.H;
  const fins=[];
  const finColor=new THREE.Color(spec.finColor);
  function addFin(shape, place){
    const g=new THREE.ShapeGeometry(shape, 7);
    g.applyMatrix4(place);
    const p=g.attributes.position, n=p.count;
    const c=new Float32Array(n*3);
    for(let i=0;i<n;i++){ c[i*3]=finColor.r; c[i*3+1]=finColor.g; c[i*3+2]=finColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c,3));
    let zmin=1e9,zmax=-1e9,ymin=1e9,ymax=-1e9;   // 该鳍自身包围盒
    for(let i=0;i<n;i++){
      const z=p.getZ(i), y=p.getY(i);
      if(z<zmin)zmin=z; if(z>zmax)zmax=z; if(y<ymin)ymin=y; if(y>ymax)ymax=y;
    }
    const uv=new Float32Array(n*2);
    for(let i=0;i<n;i++){
      uv[i*2]=(p.getZ(i)-zmin)/((zmax-zmin)||1);
      uv[i*2+1]=(p.getY(i)-ymin)/((ymax-ymin)||1);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    fins.push(g);
  }
  const M=new THREE.Matrix4(), RY=new THREE.Matrix4().makeRotationY(-Math.PI/2);

  /* 尾鳍（x 负方向 = 尾后）；tailVeil：双叶纱尾（波浪后缘，金鱼） */
  {
    const tl=L*spec.tailLen, sp=spec.tailSpread*H*0.5, ped=H*0.09, fk=spec.tailFork;
    const s=new THREE.Shape();
    if(spec.tailVeil){
      s.moveTo(0,ped);
      s.quadraticCurveTo(-tl*0.30, sp*0.92, -tl*0.72, sp*1.00);
      s.quadraticCurveTo(-tl*0.92, sp*0.96, -tl,     sp*0.60);
      s.quadraticCurveTo(-tl*0.86, sp*0.40, -tl*0.72, sp*0.32);
      s.quadraticCurveTo(-tl*0.60, sp*0.24, -tl*0.54, sp*0.10);
      s.quadraticCurveTo(-tl*0.50, 0,       -tl*0.54, -sp*0.10);
      s.quadraticCurveTo(-tl*0.60, -sp*0.24, -tl*0.72, -sp*0.32);
      s.quadraticCurveTo(-tl*0.86, -sp*0.40, -tl,     -sp*0.60);
      s.quadraticCurveTo(-tl*0.92, -sp*0.96, -tl*0.72, -sp*1.00);
      s.quadraticCurveTo(-tl*0.30, -sp*0.92, 0, -ped);
    } else {
    s.moveTo(0, ped);
    s.quadraticCurveTo(-tl*0.35,  sp*0.75, -tl,  sp);
    s.quadraticCurveTo(-tl*0.42,  sp*0.16, -tl*fk, 0);
    s.quadraticCurveTo(-tl*0.42, -sp*0.16, -tl, -sp);
    s.quadraticCurveTo(-tl*0.35, -sp*0.75, 0, -ped);
    }
      addFin(s, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(0,0,-L/2+L*0.055)));
  }
  /* 背鳍 */
  {
    const dl=L*spec.dorsalL, dh=H*spec.dorsalH*0.5, z0=L*0.3;
    const s=new THREE.Shape();
    s.moveTo(0,0);
    s.quadraticCurveTo(-dl*0.28, dh*0.92, -dl*0.55, dh);
    s.quadraticCurveTo(-dl*0.86, dh*0.5,  -dl, 0);
    const y=hAt(0.3)*H/2*spec.topK-H*0.035;
    addFin(s, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(0,y,z0)));
  }
  /* 鼠鱼背鳍后方的小脂鳍 */
  if(spec.id==='cory'){
    const s=new THREE.Shape();
    s.moveTo(0,0);
    s.quadraticCurveTo(-L*0.06,H*0.22,-L*0.14,H*0.03);
    s.quadraticCurveTo(-L*0.07,H*0.02,0,0);
    const y=hAt(0.58)*H/2*spec.topK-H*0.025;
    addFin(s, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(0,y,-L*0.05)));
  }
  /* 臀鳍 */
  {
    const al=L*spec.analL, ah=H*spec.analH*0.5, z0=-L*0.16;
    const s=new THREE.Shape();
    s.moveTo(0,0);
    s.quadraticCurveTo(-al*0.3, -ah*0.8, -al*0.6, -ah);
    s.quadraticCurveTo(-al*0.8, -ah*0.4, -al, 0);
    const y=-hAt(0.9)*H/2*spec.botK+H*0.035;
    addFin(s, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(0,y,z0)));
  }
  /* 胸鳍 ×2 */
  for(const side of [1,-1]){
    const pw=L*spec.pectL, ph=H*0.32;
    const s=new THREE.Shape();
    s.moveTo(0,0);
    s.quadraticCurveTo(pw*0.5, -ph*0.25, pw, -ph*0.85);
    s.quadraticCurveTo(pw*0.25, -ph*0.45, 0, -ph*0.12);
    const m=new THREE.Matrix4().makeRotationY(side*0.9)
      .multiply(new THREE.Matrix4().makeRotationZ(side*-0.35))
      .multiply(new THREE.Matrix4().makeTranslation(-pw*0.4,0,0))
      .multiply(new THREE.Matrix4().makeScale(side,1,1));
    const x=hAt(0.22)*H/2*wAt(0.22)*0.92*side, y=-H*0.05, z=L*0.2;
    addFin(s, M.copy(new THREE.Matrix4().makeTranslation(x,y,z)).multiply(m));
  }
  /* 底栖鼠鱼的两对触须：从吻端向前下方伸出，增强底栖鱼辨识度 */
  if(spec.id==='cory'){
    const barbelL=L*0.58, barbelW=H*0.026;
    for(const side of [1,-1]){
      const s=new THREE.Shape();
      s.moveTo(0,0);
      s.quadraticCurveTo(barbelL*0.30,-H*0.10,barbelL*0.72,-H*0.16);
      s.quadraticCurveTo(barbelL*0.88,-H*0.18,barbelL,-H*0.18);
      s.lineTo(barbelL,-H*0.18-barbelW);
      s.quadraticCurveTo(barbelL*0.78,-H*0.18-barbelW,barbelL*0.62,-H*0.15);
      s.quadraticCurveTo(barbelL*0.28,-H*0.10,0,-barbelW);
      s.closePath();
      const h0=hAt(0.06)*H/2, w0=h0*wAt(0.06);
      addFin(s, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(side*w0*0.72,-H*0.11,L*0.47)));
      const innerL=L*0.34, innerW=H*0.020;
      const inner=new THREE.Shape();
      inner.moveTo(0,0);
      inner.quadraticCurveTo(innerL*0.32,-H*0.08,innerL*0.92,-H*0.13);
      inner.lineTo(innerL*0.92,-H*0.13-innerW);
      inner.quadraticCurveTo(innerL*0.30,-H*0.08-innerW,0,-innerW);
      inner.closePath();
      addFin(inner, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(side*w0*0.40,-H*0.18,L*0.48)));
    }
  }
  /* 神仙鱼的腹丝：两条细长下垂的腹鳍软条 */
  if(spec.id==='angel'){
    const filamentL=H*1.10, filamentW=H*0.035;
    for(const side of [1,-1]){
      const s=new THREE.Shape();
      s.moveTo(0,0);
      s.quadraticCurveTo(L*0.025,-filamentL*0.28,L*0.018,-filamentL*0.72);
      s.quadraticCurveTo(L*0.012,-filamentL*0.95,0,-filamentL);
      s.lineTo(-filamentW,-filamentL);
      s.quadraticCurveTo(-L*0.008,-filamentL*0.72,-L*0.012,-filamentL*0.28);
      s.quadraticCurveTo(-L*0.015,-filamentL*0.08,-filamentW*0.6,0);
      s.closePath();
      addFin(s, M.copy(RY).multiply(new THREE.Matrix4().makeTranslation(side*H*0.16,-H*0.37,L*0.08)));
    }
  }
  return mergeGeometries(fins);
}
/* ---------- 游动形变注入（身体/鱼鳍/深度材质共用） ----------
 * 行波 X(s)=A·env(s)·sin(ωt−ks)，env 向尾部增大；
 * 截面按波面斜率 ψ=atan(A·env·k·cos) 刚性转动（保持体长、法线随动） */
export function injectSwim(mat, spec, phaseU, key, isFin){
  mat.customProgramCacheKey = ()=> 'swim2_'+key+(isFin?'_f':'_b');
  mat.onBeforeCompile = (sh)=>{
    sh.uniforms.uPhase  = phaseU;
    sh.uniforms.uExcite = U.excite;
    sh.uniforms.uAmp    = { value: spec.amp };
    sh.uniforms.uLen    = { value: spec.L };
    sh.uniforms.uK      = { value: spec.waveK };
    const head='uniform float uPhase, uExcite, uAmp, uLen, uK;\nattribute vec2 aAnim;\n';
    const envGLSL='( 0.07 + 1.1*pow(min(se,1.0),1.7) + 0.3*pow(max(se-1.0,0.0),1.3) )*(1.0+0.3*uExcite)';
    const deformPos=`
      {
        float se=clamp(( uLen*0.5 - transformed.z )/uLen, 0.0, 1.45);
        float env=${envGLSL};
        float arg=uPhase*aAnim.y + aAnim.x - uK*se;
        float X=uAmp*uLen*env*sin(arg);
        float yaw=atan(uAmp*env*uK*cos(arg));
        float ca=cos(yaw), sa=sin(yaw);
        float ox=transformed.x;
        transformed.x=ox*ca + X;
        transformed.z-=ox*sa;`;
    const flutter=isFin?`
        float k=clamp(( uLen*0.4 - transformed.z )/uLen, 0.0, 1.0 );
        transformed.x+=sin(uPhase*1.6+aAnim.x*2.0+transformed.y*7.0)*0.02*uLen*k*k;`:'';
    const deformNrm=`
      {
        float se=clamp(( uLen*0.5 - position.z )/uLen, 0.0, 1.45 );
        float env=${envGLSL};
        float arg=uPhase*aAnim.y + aAnim.x - uK*se;
        float yaw=atan(uAmp*env*uK*cos(arg));
        float ca=cos(yaw), sa=sin(yaw);
        objectNormal=vec3(objectNormal.x*ca+objectNormal.z*sa, objectNormal.y,
                          -objectNormal.x*sa+objectNormal.z*ca);
      }`;
    sh.vertexShader = head + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>'+deformNrm)
      .replace('#include <begin_vertex>', '#include <begin_vertex>'+deformPos+flutter+'}');
  };
}

/* ---------- 图鉴模型预览：复用场景中的真实鱼体网格 ---------- */
export function fishEyeLayout(spec){
  const hAt=profileSampler(spec.profileH), wAt=profileSampler(spec.profileW);
  const uE=0.155, hR=Math.max(hAt(uE),0.02)*spec.H/2;
  const wR=hR*wAt(uE), re=spec.H*spec.eyeSize*1.15;
  return {re,z:spec.L/2-uE*spec.L,x:wR*0.97,y:hR*0.24*spec.topK};
}
