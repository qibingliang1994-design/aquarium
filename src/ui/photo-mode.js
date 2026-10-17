/* ================================================================
 * 拍照模式：H 隐藏 UI · 再按 H 拍摄保存高清 PNG · Esc 退出
 * ================================================================ */

export function createPhotoMode({ renderer, composer, hideTargets, onEnter }){
  let on=false;
  const targets=hideTargets.map(id=>document.getElementById(id)).filter(Boolean);
  const tip=document.createElement('div');
  tip.id='photoTip';
  tip.textContent='拍照模式 · H 拍摄保存 · Esc 退出';
  document.body.appendChild(tip);

  function set(v){
    on=v;
    targets.forEach(el=>{ el.style.visibility=v?'hidden':'visible'; });
    tip.classList.toggle('on',v);
    if(v) onEnter?.();
  }
  function shoot(){
    const w=innerWidth,h=innerHeight;
    const prevPR=renderer.getPixelRatio();
    const hi=Math.min(3,prevPR*2);
    renderer.setPixelRatio(hi); renderer.setSize(w,h,false);
    composer.setPixelRatio(hi); composer.setSize(w,h);
    composer.render();
    renderer.domElement.toBlob(blob=>{
      if(blob){
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=`aquarium-${Date.now()}.png`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),3000);
      }
      renderer.setPixelRatio(prevPR); renderer.setSize(w,h,false);
      composer.setPixelRatio(prevPR); composer.setSize(w,h);
    });
  }
  return {
    get on(){ return on; },
    set,
    /** H 键：未进入则进入，已进入则拍摄 */
    press(){ if(!on) set(true); else shoot(); },
  };
}
