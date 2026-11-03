// @ts-check
/* ================================================================
 * 宣传片画面文字层（2D 合成，叠在 WebGL 帧上）
 * 视觉只有三样：左上角的"第 NN 天"计数器（数字滚动）、计数器下一行口语短句、收尾一句话。
 * 不画装饰线、不居中喊口号；颗粒 + 暗角压掉数码味。
 * ================================================================ */
import { SEC } from './timeline.js';

const SANS='"Microsoft YaHei UI Light","HarmonyOS Sans SC","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
const NUM='"Bahnschrift Light","Bahnschrift","DIN Alternate","Helvetica Neue",sans-serif';
const INK='rgba(250,248,242,0.97)';
const X=84, Y_NUM=262;                  // 计数器基线（竖屏顶部，避开抖音顶栏）

const clamp01=(/** @type {number} */ x)=>x<0?0:x>1?1:x;

/** @param {CanvasRenderingContext2D} c2 @param {number} W @param {number} H */
export function createOverlay(c2, W, H){
  const setLS=(/** @type {string} */ v)=>{ try{ (/** @type {any} */ (c2)).letterSpacing=v; }catch{ /* 旧浏览器无字距 */ } };
  /* 颗粒：预生成噪点图，每帧随机错位叠一层（种子固定，重录逐像素一致） */
  let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const grain=document.createElement('canvas'); grain.width=grain.height=256;
  { const g=grain.getContext('2d'); if(g){ const im=g.createImageData(256,256);
    for(let i=0;i<im.data.length;i+=4){ const v=rnd()*255|0; im.data[i]=im.data[i+1]=im.data[i+2]=v; im.data[i+3]=255; }
    g.putImageData(im,0,0); } }
  const vig=c2.createRadialGradient(W/2,H*0.47,H*0.28,W/2,H*0.5,H*0.72);
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,5,9,0.42)');
  const scrim=c2.createLinearGradient(0,0,0,H*0.27);              // 顶部压暗：计数器在亮背光屏前也读得清
  scrim.addColorStop(0,'rgba(0,6,10,0.55)'); scrim.addColorStop(1,'rgba(0,6,10,0)');

  let lastLabel='', labelAt=-9;

  function film(){
    c2.globalCompositeOperation='overlay'; c2.globalAlpha=0.08;
    const ox=-(rnd()*256|0), oy=-(rnd()*256|0);
    for(let y=oy;y<H;y+=256) for(let x=ox;x<W;x+=256) c2.drawImage(grain,x,y);
    c2.globalCompositeOperation='source-over'; c2.globalAlpha=1;
    c2.fillStyle=vig; c2.fillRect(0,0,W,H);
  }
  function topScrim(/** @type {number} */ a){ if(a<=0) return; c2.globalAlpha=a; c2.fillStyle=scrim; c2.fillRect(0,0,W,H*0.27); c2.globalAlpha=1; }
  function shadow(/** @type {number} */ blur){ c2.shadowColor='rgba(0,6,10,0.5)'; c2.shadowBlur=blur; c2.shadowOffsetY=2; }
  function noShadow(){ c2.shadowBlur=0; c2.shadowOffsetY=0; }

  /** 滚动数字：v 是浮点天数，整数位之间上下滑动（像翻页计数器），两位补零 */
  function counter(/** @type {number} */ v, /** @type {number} */ a){
    c2.globalAlpha=a; shadow(26); c2.fillStyle=INK; c2.textBaseline='alphabetic'; c2.textAlign='left';
    c2.font=`300 46px ${SANS}`; setLS('0px');
    c2.fillText('第', X, Y_NUM);
    const nx=X+62, size=188, boxH=size*0.78;
    c2.font=`300 ${size}px ${NUM}`; setLS('-4px');
    const n=Math.floor(v+1e-4), f=v-n;
    const wNum=c2.measureText('00').width;
    c2.save(); c2.beginPath(); c2.rect(nx-10, Y_NUM-boxH-8, wNum+30, boxH+22); c2.clip();
    const pad=(/** @type {number} */ x)=>String(Math.max(0,x)).padStart(2,'0');
    c2.fillText(pad(n), nx, Y_NUM-f*boxH);
    if(f>1e-3) c2.fillText(pad(n+1), nx, Y_NUM+(1-f)*boxH);
    c2.restore();
    c2.font=`300 46px ${SANS}`; setLS('0px');
    c2.fillText('天', nx+wNum+14, Y_NUM);
    noShadow(); c2.globalAlpha=1;
  }
  function line(/** @type {string} */ s, /** @type {number} */ b){
    if(s!==lastLabel){ lastLabel=s; labelAt=b; }
    if(!s) return;
    const a=clamp01((b-labelAt)/0.5);
    c2.globalAlpha=a*0.9; shadow(18); c2.fillStyle=INK; c2.textAlign='left'; c2.textBaseline='alphabetic';
    c2.font=`300 44px ${SANS}`; setLS('3px');
    c2.fillText(s, X+(1-a)*-12, Y_NUM+78);
    setLS('0px'); noShadow(); c2.globalAlpha=1;
  }
  function ending(/** @type {number} */ b){
    const a=clamp01((b-(SEC.night+1))/1.2);
    if(a<=0) return;
    const y=Y_NUM-40;                                              // 与计数器同一个位置：计数器退场后它接上
    c2.globalAlpha=a; shadow(24); c2.fillStyle=INK; c2.textAlign='left'; c2.textBaseline='alphabetic';
    c2.font=`300 66px ${SANS}`; setLS('4px');
    c2.fillText('浏览器打开就能养', X, y+(1-a)*14);
    const a2=clamp01((b-(SEC.night+2.2))/1.2);
    c2.globalAlpha=a2*0.62; c2.font=`300 32px ${SANS}`; setLS('10px');
    c2.fillText('AQUARIUM  ·  免费  ·  无需安装', X, y+74);
    setLS('0px'); noShadow(); c2.globalAlpha=1;
  }
  /** 关灯：ADA 的背光屏不随昼夜变暗，在合成层按"曝光"压下去，带一点夜里的蓝 */
  function dusk(/** @type {number} */ k){
    if(k<=0) return;
    c2.globalCompositeOperation='multiply'; c2.globalAlpha=k*0.88;
    c2.fillStyle='rgb(46,66,98)'; c2.fillRect(0,0,W,H);
    c2.globalCompositeOperation='source-over'; c2.globalAlpha=1;
  }
  function black(/** @type {number} */ k){ if(k<=0) return; c2.globalAlpha=Math.min(1,k); c2.fillStyle='#000'; c2.fillRect(0,0,W,H); c2.globalAlpha=1; }

  /** 合成一帧：b = 当前拍位；day / label 来自分镜 */
  function draw(/** @type {number} */ b, /** @type {number} */ day, /** @type {string} */ label){
    dusk(clamp01((b-SEC.night)/4)**1.4);
    film();
    const cut=SEC.empty;                                            // 倒带后眨一下眼切到空缸
    const blink=b<cut ? clamp01((b-(cut-0.3))/0.3) : clamp01(1-(b-cut)/0.35);
    const ca=b<SEC.macro ? 1 : clamp01(1-(b-SEC.macro)/1.2);
    topScrim(Math.max(ca, clamp01((b-(SEC.night+1))/1.2)));
    if(ca>0) counter(day, ca*(1-blink*0.6));
    line(label, b);
    ending(b);
    black(blink*0.92);
    black(clamp01((b-(SEC.end-0.7))/0.7));                          // 结尾落黑
  }
  return { draw };
}
