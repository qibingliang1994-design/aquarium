// @ts-check
/* ================================================================
 * 存档备份：导出 / 导入 localStorage 里全部 'aquarium.*' 键
 * （场景与缩略图、每缸饲养存档、设置——换浏览器 / 清缓存前保底）
 * collectSave / applySave 是纯函数（可单测）；文件读写与按钮在 installBackup 里
 * ================================================================ */

const PREFIX='aquarium.', MAGIC='aquarium-save', VERSION=1;

/** @typedef {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem(k:string):void,
 *   length:number, key(i:number):string|null }} StorageLike */

/** 把全部 aquarium.* 键收进一份可 JSON 化的对象 @param {StorageLike} ls */
export function collectSave(ls){
  /** @type {Record<string,string>} */
  const items={};
  for(let i=0;i<ls.length;i++){
    const k=ls.key(i);
    if(k && k.startsWith(PREFIX)) items[k]=ls.getItem(k)??'';
  }
  return { app:MAGIC, version:VERSION, exportedAt:new Date().toISOString(), items };
}

/** @param {unknown} raw */
export function validateSave(raw){
  if(!raw || typeof raw!=='object') return null;
  const r=/** @type {Record<string, unknown>} */ (raw);
  if(r.app!==MAGIC || !r.items || typeof r.items!=='object' || Array.isArray(r.items)) return null;
  /** @type {Record<string,string>} */
  const items={};
  for(const [k,v] of Object.entries(r.items)){
    if(k.startsWith(PREFIX) && typeof v==='string') items[k]=v;
  }
  return Object.keys(items).length ? { app:MAGIC, version:VERSION, items } : null;
}

/** 用存档整体替换现有 aquarium.* 键（先清后写，避免新旧场景混杂）。
 * 写入失败（存储满）时抛错，由调用方提示。
 * @param {StorageLike} ls @param {{ items:Record<string,string> }} payload @returns {number} 写入的键数 */
export function applySave(ls, payload){
  for(let i=ls.length-1;i>=0;i--){
    const k=ls.key(i);
    if(k && k.startsWith(PREFIX)) ls.removeItem(k);
  }
  for(const [k,v] of Object.entries(payload.items)) ls.setItem(k,v);
  return Object.keys(payload.items).length;
}

/** 导出文件名：aquarium-存档-YYYYMMDD-HHmm */
function saveFileName(){
  const d=new Date(), p=(/** @type {number} */ n)=>String(n).padStart(2,'0');
  return `aquarium-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** 接线设置弹层里的导出 / 导入按钮（导入需再点一次确认，全程不弹系统对话框）
 * @param {{ toast?:(msg:string)=>void }} [opts] */
export function installBackup({ toast=(/** @type {string} */ m)=>console.info('[backup]',m) }={}){
  const bExport=/** @type {HTMLButtonElement} */ (document.getElementById('bExport'));
  const bImport=/** @type {HTMLButtonElement} */ (document.getElementById('bImport'));
  const fileInput=/** @type {HTMLInputElement} */ (document.getElementById('importFile'));
  if(!bExport || !bImport || !fileInput) return;
  /** @type {{ app:string, version:number, items:Record<string,string> } | null} */
  let staged=null, stageTimer=0;

  bExport.addEventListener('click', ()=>{
    try{
      const blob=new Blob([JSON.stringify(collectSave(localStorage))], { type:'application/json' });
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=saveFileName();
      a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      toast('存档已导出');
    }catch(err){ console.warn('[backup] 导出失败', err); toast('导出失败'); }
  });

  /** @param {string} label @param {boolean} armed */
  const setImportLabel=(label, armed)=>{ bImport.textContent=label; bImport.classList.toggle('danger', armed); };
  function clearStaged(){ staged=null; clearTimeout(stageTimer); fileInput.value=''; setImportLabel('导入存档', false); }

  bImport.addEventListener('click', ()=>{
    if(!staged){ fileInput.click(); return; }         // 第一步：选文件
    try{                                            // 第二步：确认覆盖
      const count=applySave(localStorage, staged);
      clearStaged();
      toast(count ? `已导入 ${count} 项存档，即将刷新 …` : '存档是空的');
      if(count) setTimeout(()=>location.reload(), 900);
    }catch(err){ console.warn('[backup] 导入失败', err); toast('导入失败：存储空间可能已满'); clearStaged(); }
  });

  fileInput.addEventListener('change', ()=>{
    const file=fileInput.files?.[0];
    fileInput.value='';
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      let payload=null;
      try{ payload=validateSave(JSON.parse(String(reader.result))); }catch(err){ payload=null; }
      if(!payload){ toast('不是有效的水族箱存档文件'); return; }
      staged=payload;                                // 待确认：再点一次才覆盖
      setImportLabel('覆盖现有进度？再点一次确认', true);
      clearTimeout(stageTimer);
      stageTimer=setTimeout(clearStaged, 5000);
    };
    reader.readAsText(file);
  });
}
