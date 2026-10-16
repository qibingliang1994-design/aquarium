import { clamp } from '../utils.js';

/* ================================================================
 * 设置弹层：开关行（音效 / 自动昼夜 / 特效），锚定在 Dock 设置按钮上方
 * ================================================================ */
const TOGGLES = [
  ['setSound','sound'], ['setCycle','cycle'], ['setRays','rays'],
  ['setBubbles','bubbles'], ['setSnow','snow'], ['setCaustics','caustics'],
];
const GAP = 12;

export function createSettingsPanel({ settings, onChange }){
  const pop = document.getElementById('settingsPop');
  const btn = document.getElementById('bSettings');
  const boxes = {};
  for(const [id,key] of TOGGLES){
    const box = document.getElementById(id);
    boxes[key] = box;
    box.checked = !!settings[key];               // 初始状态与已存设置同步
    box.addEventListener('change',()=>onChange(key, box.checked));
  }

  function place(){
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = `${clamp(r.left+r.width/2-w/2, GAP, innerWidth-w-GAP)}px`;
    pop.style.bottom = `${innerHeight-r.top+GAP}px`;
  }
  function setOpen(on){
    pop.hidden = !on;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', String(on));
    if(on) place();
  }
  btn.addEventListener('click',()=>setOpen(pop.hidden));
  document.addEventListener('click',e=>{
    if(!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
  addEventListener('resize',()=>{ if(!pop.hidden) place(); });

  return {
    close:()=>setOpen(false),
    set:(key,on)=>{ if(boxes[key]) boxes[key].checked = on; },
  };
}
