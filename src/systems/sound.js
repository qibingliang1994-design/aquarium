// 环境音效：WebAudio 程序合成（无音频素材，无版权负担）
export class SoundEngine {
  constructor(){ this.ctx=null; this.master=null; this.enabled=true; this._blipTimer=1; }
  ensure(){                       // 必须在用户手势后调用（浏览器自动播放策略）
    if(this.ctx) return;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain();
    this.master.gain.value=this.enabled?1:0;
    this.master.connect(this.ctx.destination);
    // 水底低鸣：棕噪声 → 低通，缓慢起伏模拟水流
    const len=this.ctx.sampleRate*2, buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=buf.getChannelData(0); let last=0;
    for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.5; }
    const src=this.ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const lp=this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=220;
    const g=this.ctx.createGain(); g.gain.value=0.05;
    src.connect(lp).connect(g).connect(this.master); src.start();
    const lfo=this.ctx.createOscillator(); lfo.frequency.value=0.07;
    const lg=this.ctx.createGain(); lg.gain.value=0.02;
    lfo.connect(lg).connect(g.gain); lfo.start();
  }
  setEnabled(on){ this.enabled=on; if(this.master) this.master.gain.value=on?1:0; }
  _tone(f0,f1,dur,peak){
    if(!this.ctx||!this.enabled) return;
    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(f1,t+dur*0.8);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+dur*0.15);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t+dur+0.02);
  }
  blip(){ this._tone(400+Math.random()*500,(400+Math.random()*500)*2.2,0.12,0.04+Math.random()*0.03); }
  plop(){ this._tone(700,180,0.2,0.12); }
  // 短促带通噪声：咬食的“咔”
  _noise(dur,freq,q,peak){
    if(!this.ctx||!this.enabled) return;
    if(!this._noiseBuf){
      const n=Math.ceil(this.ctx.sampleRate*0.1);
      this._noiseBuf=this.ctx.createBuffer(1,n,this.ctx.sampleRate);
      const d=this._noiseBuf.getChannelData(0);
      for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    }
    const t=this.ctx.currentTime, src=this.ctx.createBufferSource();
    src.buffer=this._noiseBuf;
    const bp=this.ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq; bp.Q.value=q;
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(peak,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t+dur+0.02);
  }
  crunch(){                       // 抢食时可能一帧多次：限流 60ms
    if(!this.ctx) return;
    if(this.ctx.currentTime-(this._lastCrunch??-1)<0.06) return;
    this._lastCrunch=this.ctx.currentTime;
    this._noise(0.05, 2200+Math.random()*1400, 3, 0.09);
  }
  knock(){                        // 敲玻璃：低沉闷响 + 玻璃高频脆响
    this._tone(170,70,0.22,0.32);
    this._tone(1300,700,0.06,0.05);
  }
  update(dt){                     // 随机气泡声
    if(!this.ctx||!this.enabled) return;
    this._blipTimer-=dt;
    if(this._blipTimer<=0){ this.blip(); this._blipTimer=0.4+Math.random()*2.4; }
  }
}
