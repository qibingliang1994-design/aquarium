// @ts-check
/* ================================================================
 * 拍照模式：H / Dock「拍照」隐藏 UI · 再按 H 或点「拍摄」保存高清 PNG · Esc / 「退出」离开
 * 底部的拍摄条只是 DOM 浮层，不进画布，拍出来的照片里没有它
 * ================================================================ */

const MAX_SHOT_PIXELS=24e6;          // 约 6500×3700：再大显存吃紧，核显可能直接丢上下文

/** @param {{ renderer:any, composer:any, hideTargets:string[], onEnter?:()=>void, onShot?:(ok:boolean)=>void }} opts */
export function createPhotoMode({ renderer, composer, hideTargets, onEnter, onShot }){
  let on=false;
  /** @type {HTMLElement[]} */
  const targets=hideTargets.flatMap((/** @type {string} */ id)=>{ const el=document.getElementById(id); return el?[el]:[]; });
  const tip=document.createElement('div');
  tip.id='photoTip';
  tip.className='glass';
  tip.setAttribute('role','toolbar');
  tip.setAttribute('aria-label','拍照模式');
  tip.innerHTML='<span>拍照模式<small> · H 拍摄 · Esc 退出</small></span>'
    +'<button type="button" class="btn-primary" data-act="shoot">拍摄</button>'
    +'<button type="button" class="btn-ghost" data-act="exit">退出</button>';
  tip.addEventListener('click',e=>{
    const act=e.target instanceof Element ? e.target.closest('button')?.dataset.act : null;
    if(act==='shoot') shoot();
    if(act==='exit') set(false);
  });
  document.body.appendChild(tip);

  function set(/** @type {boolean} */ v){
    on=v;
    targets.forEach((/** @type {HTMLElement} */ el)=>{ el.style.visibility=v?'hidden':'visible'; });
    tip.classList.toggle('on',v);
    if(v){ onEnter?.(); tip.querySelector('button')?.focus({ preventScroll:true }); }   // Dock 按钮被藏起来了，焦点交给「拍摄」
  }
  // 拍摄中（toBlob 异步编码）不接受新的拍摄：否则第二次会把放大后的像素比当成"原值"恢复，渲染器永久卡在高分辨率
  let busy=false;
  function shoot(){
    if(busy) return;
    busy=true;
    const w=innerWidth,h=innerHeight;
    const prevPR=renderer.getPixelRatio();
    // 放大倍率：至多 2 倍、3x，且总像素不超过 MAX_SHOT_PIXELS、单边不超过 GPU 纹理上限
    const maxTex=renderer.capabilities?.maxTextureSize ?? 8192;
    const hi=Math.max(prevPR, Math.min(3, prevPR*2, Math.sqrt(MAX_SHOT_PIXELS/(w*h)), maxTex/Math.max(w,h)));
    const restore=()=>{
      renderer.setPixelRatio(prevPR); renderer.setSize(w,h,false);
      composer.setPixelRatio(prevPR); composer.setSize(w,h);
      busy=false;
    };
    try{
      renderer.setPixelRatio(hi); renderer.setSize(w,h,false);
      composer.setPixelRatio(hi); composer.setSize(w,h);
      composer.render();
      renderer.domElement.toBlob((/** @type {Blob|null} */ blob)=>{
        try{
          if(!blob){ onShot?.(false); return; }
          const a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download=`aquarium-${Date.now()}.png`;
          a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href),3000);
          onShot?.(true);
        } finally { restore(); }
      });
    } catch(err){
      console.warn('[photo] 拍摄失败', err);
      restore();
      onShot?.(false);
    }
  }
  return {
    get on(){ return on; },
    get busy(){ return busy; },
    set,
    /** H 键：未进入则进入，已进入则拍摄 */
    press(){ if(!on) set(true); else shoot(); },
  };
}
