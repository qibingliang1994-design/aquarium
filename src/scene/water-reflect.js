// @ts-check
import * as THREE from 'three';
import { reflectTier } from '../systems/reflect.js';

/* ================================================================
 * 自然水域的平面反射：每帧把镜像相机画进一张贴图，水面着色器按波法线取样。
 * 斜裁剪面切在水面上（水下的河床不进反射）。鱼群由调用方藏掉。
 * 不写主场景的深度，也不在这里打开阴影（主循环照旧按档刷新）。
 * 最低画质档不渲。隔帧更新会闪，所以开着就每帧都渲。
 * ================================================================ */

const CLIP_BIAS = 0.003;

/** @param {{ renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.PerspectiveCamera,
 *   waterMesh:THREE.Object3D, waterUniforms:any, sky:{ place:(v:THREE.Vector3)=>void, dome:THREE.Object3D },
 *   hideRoots:()=>THREE.Object3D[] }} opts */
export function createWaterReflect({ renderer, scene, camera, waterMesh, waterUniforms, sky, hideRoots }){
  /** @type {boolean[]} */ const rootVis = [];
  const rt = new THREE.WebGLRenderTarget(16, 16, {
    type:THREE.UnsignedByteType, depthBuffer:true, samples:0,
  });
  rt.texture.generateMipmaps = false;
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  waterUniforms.uReflectMap.value = rt.texture;

  const virtual = new THREE.PerspectiveCamera();
  const anchor = new THREE.Object3D();
  anchor.rotation.x = -Math.PI/2;
  const reflectorPlane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const reflectorWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  const lookAtPosition = new THREE.Vector3();
  const clipPlane = new THREE.Vector4();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const q = new THREE.Vector4();
  const textureMatrix = new THREE.Matrix4();
  const savedSky = new THREE.Vector3();
  const viewport = new THREE.Vector4();

  let tier = reflectTier(0);
  /** @type {boolean|null} */ let force = null;
  let parity = 0;            // 隔帧渲染倒影内容的相位（首个奇/偶由 0 起：第一帧就渲，避免空纹理）

  function setOn(/** @type {number} */ v){ waterUniforms.uReflectOn.value = v; }
  function fitTarget(){
    const aspect = Math.max(0.2, camera.aspect || 1);
    const w = tier.size, h = Math.max(8, Math.round(tier.size/aspect));
    if(rt.width!==w || rt.height!==h) rt.setSize(w, h);
  }

  return {
    /** @param {number} level 画质档，最低档关闭并停渲 */
    setLevel(level){
      tier = reflectTier(level);
      if(tier.on) fitTarget();
      else setOn(0);
    },
    get on(){ return waterUniforms.uReflectOn.value; },
    /** @param {number} v 0..1，雨雾夜压暗 */
    setDim(v){ waterUniforms.uReflectDim.value = v; },
    /** 调试：false 强制不渲 @param {boolean|null} on */
    setForce(on){ force = on; if(on===false) setOn(0); },
    /** @param {boolean} active 当前是自然水域并且水面可见 */
    render(active){
      if(force===false || !tier.on || !active || !waterMesh.visible){ setOn(0); return; }
      fitTarget();
      const waterY = waterMesh.position.y;
      anchor.position.y = waterY;
      anchor.updateMatrixWorld();
      camera.updateMatrixWorld();

      reflectorWorldPosition.setFromMatrixPosition(anchor.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(anchor.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      if(view.dot(normal)>0){ setOn(0); return; }

      view.reflect(normal).negate().add(reflectorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate().add(reflectorWorldPosition);

      virtual.position.copy(view);
      virtual.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtual.lookAt(target);
      virtual.near = camera.near;
      virtual.far = Math.max(camera.far, 80);
      virtual.fov = camera.fov;
      virtual.aspect = camera.aspect;
      virtual.updateProjectionMatrix();
      virtual.updateMatrixWorld();
      const me = virtual.matrixWorld.elements;
      if(!Number.isFinite(me[0]+me[5]+me[10])){ setOn(0); return; }

      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0);
      textureMatrix.multiply(virtual.projectionMatrix);
      textureMatrix.multiply(virtual.matrixWorldInverse);

      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
      reflectorPlane.applyMatrix4(virtual.matrixWorldInverse);
      clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
      const pe = virtual.projectionMatrix.elements;
      q.set(
        (Math.sign(clipPlane.x)+pe[8])/pe[0],
        (Math.sign(clipPlane.y)+pe[9])/pe[5],
        -1,
        (1.0+pe[10])/pe[14]);
      const denom = clipPlane.dot(q);
      if(!(Math.abs(denom)>1e-5)){ setOn(0); return; }
      clipPlane.multiplyScalar(2.0/denom);
      pe[2] = clipPlane.x;
      pe[6] = clipPlane.y;
      pe[10] = clipPlane.z+1.0-CLIP_BIAS;
      pe[14] = clipPlane.w;
      if(!Number.isFinite(pe[2]+pe[6]+pe[10]+pe[14])){ setOn(0); return; }

      const roots = hideRoots();
      // 隔帧渲倒影内容：RT 里只有静态景物（鱼群在本 pass 中隐藏），30Hz 更新视觉无差，
      // 省一半的全场景重渲；采样矩阵仍每帧更新，转动视角时倒影照常贴合
      if((parity++ & 1)===0){
        for(let i=0;i<roots.length;i++){ rootVis[i] = roots[i].visible; roots[i].visible = false; }
        const waterWas = waterMesh.visible;
        waterMesh.visible = false;
        savedSky.copy(sky.dome.position);
        sky.place(virtual.position);

        const prevTarget = renderer.getRenderTarget();
        const prevNu = renderer.shadowMap.needsUpdate;
        const prevXr = renderer.xr.enabled;
        renderer.getViewport(viewport);
        renderer.shadowMap.needsUpdate = false;
        renderer.xr.enabled = false;
        renderer.setRenderTarget(rt);
        renderer.clear();
        try{ renderer.render(scene, virtual); }
        finally {
          renderer.xr.enabled = prevXr;
          renderer.shadowMap.needsUpdate = prevNu;
          renderer.setRenderTarget(prevTarget);
          renderer.setViewport(viewport);
          for(let i=0;i<roots.length;i++) roots[i].visible = rootVis[i];
          waterMesh.visible = waterWas;
          sky.place(savedSky);
        }
      }
      waterUniforms.uReflectMtx.value.copy(textureMatrix);
      setOn(1);
    },
  };
}
