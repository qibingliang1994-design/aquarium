// @ts-check
import * as THREE from 'three';
import { TANK_STYLES, isNatural } from '../scenes/tank-styles.js';

/* ================================================================
 * 水景缩略图：固定正面机位渲染一帧、裁成 16:9 小图（与玩家当前视角无关）
 * 没有缩略图的场景在开场运镜结束后自动补拍；页面不可见 / 编辑器 / 拍照 / 开缸浊度期间推迟
 * ================================================================ */

/**
 * @param {{ camera:any, composer:any, renderer:any, store:any, runtime:any, ambience:any,
 *   isEditorActive:()=>boolean, isPhotoOn:()=>boolean }} deps
 */
export function createThumbnails({ camera, composer, renderer, store, runtime, ambience, isEditorActive, isPhotoOn }){
  /** @type {number|undefined} */ let timer;

  /** 固定正面机位渲一帧并裁成 16:9，返回 dataURL；画布尺寸为 0 时返回 null @returns {string|null} */
  function capture(){
    const keepP=camera.position.clone(), keepQ=camera.quaternion.clone();
    const halfTan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(camera.aspect, 16/9);
    const thumb=TANK_STYLES[runtime.doc.tank]?.thumb;
    if(thumb){ camera.position.set(thumb.pos[0], thumb.pos[1], thumb.pos[2]); camera.lookAt(thumb.tgt[0], thumb.tgt[1], thumb.tgt[2]); }
    else if(isNatural(runtime.doc.tank)){ camera.position.set(0, 3.4, 4.4); camera.lookAt(0, 1.3, 0); }   // 自然水域：俯拍水面
    else { camera.position.set(0, 1.2, 2.45/halfTan); camera.lookAt(0, 0.98, 0); }           // 缸：缸宽刚好填满裁切框
    composer.render();
    camera.position.copy(keepP); camera.quaternion.copy(keepQ);
    const src=renderer.domElement, w=320, h=180, c=document.createElement('canvas');
    if(!src.width || !src.height){ composer.render(); return null; }   // 画布尺寸为 0 时不拍，但把画面画回去
    c.width=w; c.height=h;
    let sw=src.width, sh=src.height, sx=0, sy=0;
    if(sw/sh>w/h){ sw=sh*w/h; sx=(src.width-sw)/2; } else { sh=sw*h/w; sy=(src.height-sh)/2; }
    /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const url=c.toDataURL('image/jpeg', 0.8);
    composer.render();                             // 同一轮里把画面画回玩家机位，避免缩略图闪一帧
    return url;
  }

  /** 没有缩略图的场景：开场运镜结束后自动补拍一张（页面不可见时主循环不跑，粒子矩阵还没初始化，晚点再拍） */
  function schedule(){
    clearTimeout(timer);
    const id=store.activeId;
    if(store.thumb(id)) return;
    timer=setTimeout(()=>{
      if(store.activeId!==id || store.thumb(id)) return;
      if(!(/** @type {any} */ (window)).__aqReady || document.hidden || isEditorActive() || isPhotoOn() || ambience.turbidity>0){ schedule(); return; }
      const shot=capture();
      if(shot) store.setThumb(id, shot); else schedule();
    }, 3200);
  }

  return { capture, schedule };
}
