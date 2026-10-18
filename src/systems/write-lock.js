// @ts-check
/* ================================================================
 * 多窗口单写者：同一个水族箱在两个标签页/窗口里同时打开时，各自用内存里的整份快照写回 localStorage，
 * 后写的会悄悄抹掉另一个刚建好的水景、改名和饲养进度。
 * 第一个打开的窗口持有 Web Lock 'aquarium-writer' 直到关闭；之后打开的窗口拿不到锁 → 只读（照常观赏，不落盘）。
 * 不支持 Web Locks 的环境（Node 单测、很老的浏览器）一律可写。
 * ================================================================ */

let writable=true;

/** 本窗口能否写存档（scene-store / care / 设置都先问它） */
export const canWrite=()=>writable;

/** 启动时调用一次（要在第一次写存档之前）；返回是否拿到写锁 @returns {Promise<boolean>} */
export function acquireWriter(){
  const locks=globalThis.navigator?.locks;
  if(!locks) return Promise.resolve(true);
  return new Promise(resolve=>{
    locks.request('aquarium-writer', { ifAvailable:true }, lock=>{
      if(!lock){ writable=false; resolve(false); return undefined; }
      resolve(true);
      return new Promise(()=>{});                // 一直持有，页面关闭时浏览器自动释放
    }).catch(err=>{ console.warn('[lock] 获取写锁失败，按可写处理', err); resolve(true); });
  });
}
