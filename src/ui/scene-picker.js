// @ts-check
import { THEMES, THEME_IDS } from '../scenes/themes.js';
import { fishTotal } from '../scenes/scene-doc.js';
import { TANK_STYLES } from '../scenes/tank-styles.js';

/* ================================================================
 * "我的水景"弹层：场景卡片（缩略图 / 名称 / 统计）+ 切换、造景、复制、改名、恢复预设、删除、新建
 * 所有写操作经 store；切换/编辑交给 main 提供的回调
 * ================================================================ */

const $=(/** @type {string} */ id)=>{ const el=document.getElementById(id); if(!el) throw new Error(`missing #${id}`); return el; };

/** @param {{ store:any, onSwitch:any, onEdit:any, toast:any }} opts */
export function createScenePicker({ store, onSwitch, onEdit, toast }){
  const modal=$('scenes'), grid=$('sceneGrid');
  /** @type {string|null} */ let confirmId=null;
  /** @type {string|null} */ let renameId=null;

  const open=()=>{ confirmId=null; renameId=null; render(); modal.hidden=false; };
  const close=()=>{ modal.hidden=true; };
  $('scenesClose').addEventListener('click', close);
  modal.addEventListener('click',e=>{ if(e.target===modal) close(); });

  const btn=(/** @type {string} */ label, /** @type {string} */ cls, /** @type {()=>void} */ fn, /** @type {string} */ title)=>{
    const b=document.createElement('button');
    b.type='button'; b.className=`chip-btn ${cls}`; b.textContent=label;
    if(title) b.title=title;
    b.addEventListener('click',e=>{ e.stopPropagation(); fn(); });
    return b;
  };

  function card(/** @type {any} */ doc){
    const active=doc.id===store.activeId, theme=THEMES[doc.theme] ?? THEMES.fresh;
    const el=document.createElement('article');
    el.className=`scene-card${active?' active':''}`;
    el.style.setProperty('--th', theme.backdrop);

    const thumb=document.createElement('button');
    thumb.type='button'; thumb.className='scene-thumb';
    thumb.title=active ? '当前水景' : `切换到「${doc.name}」`;
    const src=store.thumb(doc.id);
    if(src){ const img=document.createElement('img'); img.alt=''; img.src=src; thumb.appendChild(img); }
    else thumb.insertAdjacentHTML('beforeend','<span class="ph"><svg class="icon"><use href="#i-fish"/></svg></span>');
    thumb.insertAdjacentHTML('beforeend', `<span class="scene-badge${active?' now':''}">${active?'当前':theme.label}</span><span class="go">进入</span>`);
    thumb.addEventListener('click',()=>{ if(!active){ close(); onSwitch(doc.id); } });

    const body=document.createElement('div');
    body.className='scene-body';
    const name=document.createElement('div');
    name.className='scene-name';
    if(renameId===doc.id){
      const input=document.createElement('input');
      input.maxLength=16; input.value=doc.name;
      const done=(/** @type {boolean} */ ok)=>{
        if(ok && store.rename(doc.id, input.value)) onRenamed(doc.id);
        renameId=null; render();
      };
      input.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') done(true); if(e.key==='Escape') done(false); });
      input.addEventListener('blur',()=>done(true));
      name.appendChild(input);
      requestAnimationFrame(()=>{ input.focus(); input.select(); });
    } else name.textContent=doc.name;
    const meta=document.createElement('div');
    meta.className='scene-meta';
    meta.textContent=`${TANK_STYLES[doc.tank]?.label ?? ''} · ${fishTotal(doc)} 条鱼 · ${doc.items.length} 件造景${doc.presetId?' · 预设':''}`;
    body.append(name, meta);

    const acts=document.createElement('div');
    acts.className='scene-actions';
    if(confirmId===doc.id){
      acts.className='scene-confirm';
      acts.append('删除后无法找回，确定？',
        btn('删除','danger',()=>{ const wasActive=store.activeId===doc.id; store.remove(doc.id); confirmId=null;
          if(wasActive) onSwitch(store.activeId, { force:true }); render(); toast(`已删除「${doc.name}」`); }),
        btn('取消','',()=>{ confirmId=null; render(); }));
    } else {
      acts.append(
        btn('造景','primary',()=>{ close(); onEdit(doc.id); }, '进入造景编辑'),
        btn('复制','',()=>{ const c=store.duplicate(doc.id); if(c){ render(); toast(`已复制为「${c.name}」`); } else toast('水景数量已达上限'); }),
        btn('改名','',()=>{ renameId=doc.id; render(); }),
      );
      if(doc.presetId) acts.append(btn('恢复预设','',()=>{
        const d=store.reset(doc.id);
        if(d && doc.id===store.activeId) onSwitch(doc.id, { force:true });
        render(); toast(`「${doc.name}」已恢复为预设布局`);
      }, '造景与鱼群回到最初的样子'));
      const del=btn('删除','danger',()=>{ confirmId=doc.id; render(); });
      del.disabled=store.list().length<=1;
      acts.append(del);
    }
    body.appendChild(acts);
    el.append(thumb, body);
    return el;
  }

  function newCard(){
    const el=document.createElement('article');
    el.className='scene-card scene-new';
    el.innerHTML='<h3><svg class="icon"><use href="#i-plus"/></svg>新建空缸</h3><p>从一缸清水开始：选一种水体风格，然后亲手摆放岩石、水草、珊瑚，再放入喜欢的鱼。</p>';
    const opts=document.createElement('div');
    opts.className='opts';
    for(const id of THEME_IDS) opts.appendChild(btn(THEMES[id].label,'',()=>{
      const d=store.create(`我的${THEMES[id].label}`, id);
      if(!d){ toast('水景数量已达上限'); return; }
      close(); onEdit(d.id);
    }));
    if(!store.canAdd()) opts.querySelectorAll('button').forEach(b=>{ b.disabled=true; });
    el.appendChild(opts);
    return el;
  }

  /** @type {(id:string)=>void} */ let onRenamed=()=>{};
  function render(){
    grid.replaceChildren(...store.list().map(card), newCard());
  }

  return {
    open, close,
    get isOpen(){ return !modal.hidden; },
    /** 当前场景改名后让 HUD 同步 @param {(id:string)=>void} fn */
    set onRenamed(fn){ onRenamed=fn; },
  };
}
