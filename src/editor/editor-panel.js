import { ITEM_GROUPS, ITEM_META, ITEM_TYPES, MAX_ITEMS } from '../scenes/item-meta.js';
import { THEMES, THEME_IDS } from '../scenes/themes.js';
import { FISH_IDS, FISH_MAX, FISH_TOTAL_MAX, fishTotal } from '../scenes/scene-doc.js';
import { SPECIES_META } from '../ui/encyclopedia.js';

/* ================================================================
 * 造景编辑器的 DOM 层：顶栏、三个页签（造景/鱼群/水体）、检视器
 * 只负责渲染与转发事件，所有改动经 handlers 交给 scene-editor.js
 * ================================================================ */

const $=id=>document.getElementById(id);
const DEG=180/Math.PI;
const hex=n=>`#${n.toString(16).padStart(6,'0')}`;

export function createEditorPanel(h){
  const root=$('editor');
  const nameEl=$('edName'), undoEl=$('edUndo'), redoEl=$('edRedo'), saveEl=$('edSave'), cancelEl=$('edCancel');
  const itemsEl=$('edItems'), fishEl=$('edFish'), themeEl=$('edTheme'), countEl=$('edCount');
  const ins=$('edInspector'), rotEl=$('insRot'), scaleEl=$('insScale');

  /* ---------- 顶栏 ---------- */
  nameEl.addEventListener('change',()=>h.onName(nameEl.value));
  nameEl.addEventListener('keydown',e=>{ if(e.key==='Enter') nameEl.blur(); e.stopPropagation(); });
  undoEl.addEventListener('click',h.onUndo);
  redoEl.addEventListener('click',h.onRedo);
  saveEl.addEventListener('click',h.onSave);
  // 放弃：有未保存改动时需要二次确认（按钮文字变红，3 秒内再点一次）
  let cancelArmed=null;
  const disarm=()=>{ clearTimeout(cancelArmed); cancelArmed=null; cancelEl.textContent='放弃'; cancelEl.classList.remove('danger'); };
  cancelEl.addEventListener('click',()=>{
    if(!saveEl.classList.contains('dirty') || cancelArmed){ disarm(); h.onCancel(); return; }
    cancelEl.textContent='确认放弃改动？'; cancelEl.classList.add('danger');
    cancelArmed=setTimeout(disarm,3000);
  });

  /* ---------- 页签 ---------- */
  const tabs=[...root.querySelectorAll('.ed-tabs button')];
  for(const t of tabs) t.addEventListener('click',()=>{
    for(const b of tabs) b.classList.toggle('on', b===t);
    for(const p of root.querySelectorAll('.ed-pane')) p.hidden=p.dataset.pane!==t.dataset.tab;
  });

  /* ---------- 造景：物件调色板 ---------- */
  itemsEl.innerHTML='';
  for(const g of ITEM_GROUPS){
    const title=document.createElement('p');
    title.className='ed-group'; title.textContent=g.label;
    const grid=document.createElement('div');
    grid.className='palette';
    for(const type of ITEM_TYPES.filter(t=>ITEM_META[t].group===g.id)){
      const b=document.createElement('button');
      b.className='pal-item'; b.dataset.group=g.id; b.dataset.type=type;
      b.title=`添加${ITEM_META[type].label}`;
      b.innerHTML='<i></i><span></span>';
      b.querySelector('span').textContent=ITEM_META[type].label;
      b.addEventListener('click',()=>h.onAdd(type));
      grid.appendChild(b);
    }
    itemsEl.append(title, grid);
  }

  /* ---------- 鱼群：步进器 ---------- */
  const fishRows={};
  fishEl.innerHTML='<p class="ed-group">放养数量</p>';
  for(const id of FISH_IDS){
    const m=SPECIES_META[id];
    const row=document.createElement('div');
    row.className='fish-row'; row.dataset.sp=id;
    row.innerHTML=`<i></i><div><b></b><small></small></div>
      <div class="stepper"><button data-d="-1" aria-label="减少"><svg class="icon"><use href="#i-minus"/></svg></button>
      <output></output><button data-d="1" aria-label="增加"><svg class="icon"><use href="#i-plus"/></svg></button></div>`;
    row.querySelector('b').textContent=m?.name ?? id;
    row.querySelector('small').textContent=`${m?.zone ?? ''} · 最多 ${FISH_MAX[id]} 条`;
    for(const b of row.querySelectorAll('button')) b.addEventListener('click',()=>h.onFish(id, +b.dataset.d));
    fishRows[id]=row;
    fishEl.appendChild(row);
  }

  /* ---------- 水体：主题 ---------- */
  const themeBtns={};
  themeEl.innerHTML='<p class="ed-group">水体风格</p>';
  for(const id of THEME_IDS){
    const t=THEMES[id], b=document.createElement('button');
    b.className='theme-opt';
    b.style.setProperty('--th', t.backdrop);
    b.style.setProperty('--sand', hex(t.sand[0]));
    b.innerHTML='<i></i><div><b></b><small></small></div>';
    b.querySelector('b').textContent=t.label;
    b.querySelector('small').textContent=t.hint ?? '';
    b.addEventListener('click',()=>h.onTheme(id));
    themeBtns[id]=b;
    themeEl.appendChild(b);
  }

  /* ---------- 检视器 ---------- */
  rotEl.addEventListener('input',()=>h.onTransform({ rot:+rotEl.value/DEG }));
  scaleEl.addEventListener('input',()=>h.onTransform({ s:+scaleEl.value }));
  for(const el of [rotEl, scaleEl]){
    el.addEventListener('change',h.onTransformEnd);
    el.addEventListener('keydown',e=>e.stopPropagation());   // 方向键调滑块，不移动物件
  }
  $('insSeed').addEventListener('click',h.onSeed);
  $('insDup').addEventListener('click',h.onDup);
  $('insDel').addEventListener('click',h.onDel);

  function inspect(item){
    ins.hidden=!item;
    if(!item) return;
    const m=ITEM_META[item.type];
    $('insName').textContent=m.label;
    $('insHint').textContent=m.hint ?? '拖动可移动位置';
    rotEl.value=String(Math.round(item.rot*DEG)%360);
    $('insRotV').textContent=`${rotEl.value}°`;
    scaleEl.min=String(m.scale[0]); scaleEl.max=String(m.scale[1]);
    scaleEl.disabled=m.scale[0]===m.scale[1];
    scaleEl.value=String(item.s);
    $('insScaleV').textContent=`×${item.s.toFixed(2)}`;
  }

  function render(doc){
    if(document.activeElement!==nameEl) nameEl.value=doc.name;
    const total=fishTotal(doc);
    for(const id of FISH_IDS){
      const n=doc.fish[id] ?? 0, row=fishRows[id];
      row.querySelector('output').textContent=String(n);
      const [dec,inc]=row.querySelectorAll('button');
      dec.disabled=n<=0;
      inc.disabled=n>=FISH_MAX[id] || total>=FISH_TOTAL_MAX;
    }
    for(const id of THEME_IDS) themeBtns[id].classList.toggle('on', doc.theme===id);
    const full=doc.items.length>=MAX_ITEMS;
    for(const b of itemsEl.querySelectorAll('.pal-item')) b.disabled=full;
    countEl.textContent=`造景 ${doc.items.length}/${MAX_ITEMS} 件 · 鱼 ${total}/${FISH_TOTAL_MAX} 条`;
  }

  return {
    show(on){ root.hidden=!on; if(!on){ ins.hidden=true; disarm(); } },
    render,
    inspect,
    setHistory(canUndo, canRedo){ undoEl.disabled=!canUndo; redoEl.disabled=!canRedo; },
    setDirty(on){ saveEl.classList.toggle('dirty', on); },
  };
}
