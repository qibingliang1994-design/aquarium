import * as THREE from 'three';
import { sstep, vnoise } from '../../utils.js';

/* ---------- 鱼种定义 ---------- */
export const SPECIES = [
  { // 霓虹脂鲤：银色 + 霓虹蓝条纹 + 红色后腹
    id:'tetra', count:24, L:0.17, H:0.052, glb:'fish-models/species/species-tetra.glb',
    profileH:[[0,0.05],[0.1,0.58],[0.28,0.94],[0.42,1],[0.6,0.88],[0.78,0.52],[0.92,0.30],[1,0.15]],
    profileW:[[0,0.52],[0.1,0.78],[0.28,0.66],[0.5,0.50],[0.75,0.30],[1,0.18]],
    topK:1.06, botK:0.94,
    tailLen:0.42, tailSpread:1.1, tailFork:0.55,
    dorsalH:0.68, dorsalL:0.25, analH:0.42, analL:0.20, pectL:0.15,
    finOpacity:0.58, finColor:0x9ddce3,
    rough:0.42, metal:0.35, scaleI:0.48, irid:0.5, scaleTiles:30, eyeSize:0.064,
    amp:0.105, beat:9.5, waveK:5.8,
    schoolRad:0.6, wSep:2.4, wAli:1.15, wCoh:0.85,
    minSpeed:0.16, maxSpeed:0.62, wander:0.28,
    band:[0.73,1.6], senseR:2.4, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.62,0.70,0.75);
      out.lerp(new THREE.Color(0.10,0.16,0.20), sstep(0.25,0.9,c)*0.85);
      if(c<-0.5) out.lerp(new THREE.Color(0.88,0.92,0.94), sstep(-0.5,-1,c));
      const sideMask=1-sstep(0.02,0.23,Math.abs(c));
      const blue=sideMask*sstep(0.08,0.18,u)*(1-sstep(0.78,0.90,u));
      if(blue>0) out.lerp(new THREE.Color(0.02,0.78,0.96), blue*0.98);
      const red=sstep(0.44,0.56,u)*(1-sstep(0.90,0.98,u))*(1-sstep(-0.15,0.52,c));
      if(red>0) out.lerp(new THREE.Color(0.86,0.08,0.045), red*0.86);
    },
  },
  { // 金鱼：橙白斑块，圆润高身
    id:'gold', count:4, L:0.34, H:0.17, glb:'fish-models/species/species-goldfish.glb',
    profileH:[[0,0.12],[0.14,0.58],[0.32,1],[0.5,0.96],[0.66,0.76],[0.82,0.42],[1,0.14]],
    profileW:[[0,0.5],[0.14,0.85],[0.34,0.74],[0.56,0.5],[0.78,0.30],[1,0.20]],
    topK:1.08, botK:1.04,
    tailLen:0.62, tailSpread:1.45, tailFork:0.15, tailVeil:true,
    dorsalH:0.55, dorsalL:0.30, analH:0.5, analL:0.22, pectL:0.2,
    finOpacity:0.62, finColor:0xf6b27a,
    rough:0.42, metal:0.16, scaleI:0.65, irid:0.3, scaleTiles:20, eyeSize:0.072,
    amp:0.085, beat:4.6, waveK:4.4,
    schoolRad:0.95, wSep:2.2, wAli:0.3, wCoh:0.3,
    minSpeed:0.08, maxSpeed:0.4, wander:0.12, turn:2.4,
    band:[0.68,1.53], senseR:2.6, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.95,0.30,0.045);
      out.lerp(new THREE.Color(0.58,0.13,0.018), sstep(0.15,0.9,c)*0.78);
      if(c<-0.28) out.lerp(new THREE.Color(0.98,0.82,0.62), sstep(-0.28,-1,c)*0.88);
      const n=vnoise(u*1.35+4.2, y*1.8+1.1);
      if(n>0.62) out.lerp(new THREE.Color(0.98,0.91,0.76), sstep(0.62,0.78,n)*0.78);
    },
  },
  { // 神仙鱼：银底黑竖带，极高身长鳍
    id:'angel', count:3, L:0.3, H:0.26, glb:'fish-models/species/species-butterfly.glb',
    profileH:[[0,0.10],[0.14,0.5],[0.34,1],[0.55,0.92],[0.75,0.5],[1,0.18]],
    profileW:[[0,0.42],[0.1,0.5],[0.3,0.44],[0.55,0.32],[1,0.24]],
    topK:1.12, botK:1.06,
    tailLen:0.55, tailSpread:0.9, tailFork:0.15,
    dorsalH:1.8, dorsalL:0.72, analH:1.75, analL:0.68, pectL:0.30,
    finOpacity:0.58, finColor:0xbac5c8,
    rough:0.45, metal:0.3, scaleI:0.6, irid:0.35, scaleTiles:24, eyeSize:0.058,
    amp:0.07, beat:3.2, waveK:4.0,
    schoolRad:1.1, wSep:2.0, wAli:0.25, wCoh:0.35,
    minSpeed:0.06, maxSpeed:0.3, wander:0.1, turn:2.4, territory:[0,0.8,-0.45,0.5],
    band:[0.73,1.58], senseR:2.2, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.8,0.84,0.88);
      out.lerp(new THREE.Color(0.22,0.26,0.3), sstep(0.2,0.9,c)*0.8);
      if(c<-0.5) out.lerp(new THREE.Color(0.92,0.94,0.95), sstep(-0.5,-1,c));
      const b1=sstep(0.3,0.35,u)*(1-sstep(0.42,0.47,u));
      const b2=sstep(0.58,0.63,u)*(1-sstep(0.7,0.75,u));
      const b3=sstep(0.79,0.82,u)*(1-sstep(0.88,0.92,u));
      out.lerp(new THREE.Color(0.05,0.06,0.07), Math.max(b1,b2,b3)*0.92);
    },
  },
  { // 鼠鱼：底栖，保护色斑点，宽体扁腹
    id:'cory', count:5, L:0.15, H:0.075, glb:'fish-models/species/species-cory.glb',
    profileH:[[0,0.14],[0.1,0.75],[0.24,1],[0.45,0.95],[0.65,0.66],[0.85,0.34],[1,0.2]],
    profileW:[[0,0.62],[0.1,0.92],[0.28,0.84],[0.5,0.62],[0.75,0.44],[1,0.30]],
    topK:1.12, botK:0.62,
    tailLen:0.45, tailSpread:0.92, tailFork:0.5,
    dorsalH:1.3, dorsalL:0.28, analH:0.52, analL:0.20, pectL:0.24,
    finOpacity:0.58, finColor:0x8a7a60,
    rough:0.55, metal:0.15, scaleI:1.0, irid:0.12, scaleTiles:22, eyeSize:0.082,
    amp:0.115, beat:11, waveK:6.4,
    schoolRad:0.45, wSep:2.6, wAli:0.35, wCoh:0.2,
    minSpeed:0.04, maxSpeed:0.5, wander:0.5, bottomRest:true,
    band:[0.6,0.96], senseR:1.6, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.60,0.49,0.34);
      out.lerp(new THREE.Color(0.24,0.19,0.13), sstep(0.1,0.85,c)*0.72);
      if(c<-0.20) out.lerp(new THREE.Color(0.82,0.75,0.61), sstep(-0.20,-1,c)*0.9);
      const n=vnoise(u*2.2+9.3, y*2.0+2.6);
      if(n>0.54) out.lerp(new THREE.Color(0.18,0.14,0.10), sstep(0.54,0.72,n)*0.88);
      const eyeBand=sstep(0.10,0.16,u)*(1-sstep(0.22,0.30,u));
      if(eyeBand>0) out.lerp(new THREE.Color(0.12,0.10,0.08), eyeBand*0.72);
    },
  },
  { // 锦鲤：白底红斑展示鱼，成对悠游
    id:'koi', count:2, L:0.42, H:0.15, glb:'fish-models/species/species-koi.glb',
    profileH:[[0,0.10],[0.15,0.6],[0.35,1],[0.55,0.9],[0.75,0.55],[1,0.18]],
    profileW:[[0,0.5],[0.15,0.8],[0.35,0.7],[0.58,0.5],[0.78,0.3],[1,0.2]],
    topK:1.08, botK:0.98,
    tailLen:0.5, tailSpread:1.1, tailFork:0.4,
    dorsalH:0.6, dorsalL:0.35, analH:0.45, analL:0.22, pectL:0.2,
    finOpacity:0.6, finColor:0xe8e0d0,
    rough:0.38, metal:0.1, scaleI:0.5, irid:0.25, scaleTiles:26, eyeSize:0.05,
    amp:0.06, beat:3.4, waveK:3.8,
    schoolRad:1.4, wSep:1.6, wAli:0.15, wCoh:0.5,
    minSpeed:0.05, maxSpeed:0.28, wander:0.18, turn:1.7,
    band:[0.63,1.53], senseR:2.8, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.96,0.95,0.93);
      const n=vnoise(u*2.0+3.3, y*1.6+7.7);
      if(n>0.55) out.lerp(new THREE.Color(0.85,0.15,0.08), sstep(0.55,0.75,n)*0.9);
      if(n<0.3) out.lerp(new THREE.Color(0.15,0.15,0.18), sstep(0.3,0.15,n)*0.5);
      if(c<-0.4) out.lerp(new THREE.Color(0.98,0.96,0.94), sstep(-0.4,-1,c)*0.7);
    },
  },
  { // 小丑鱼：橙白条纹珊瑚礁明星
    id:'clown', count:4, L:0.2, H:0.1, glb:'fish-models/species/species-clown.glb',
    profileH:[[0,0.12],[0.15,0.6],[0.35,1],[0.55,0.9],[0.75,0.55],[1,0.2]],
    profileW:[[0,0.5],[0.15,0.75],[0.35,0.62],[0.58,0.48],[0.78,0.3],[1,0.2]],
    topK:1.05, botK:0.98,
    tailLen:0.4, tailSpread:1.0, tailFork:0.35,
    dorsalH:0.7, dorsalL:0.3, analH:0.45, analL:0.2, pectL:0.18,
    finOpacity:0.6, finColor:0xf0a050,
    rough:0.4, metal:0.2, scaleI:0.5, irid:0.35, scaleTiles:24, eyeSize:0.062,
    amp:0.09, beat:8, waveK:5.2,
    schoolRad:0.7, wSep:2.0, wAli:0.6, wCoh:0.5,
    minSpeed:0.1, maxSpeed:0.45, wander:0.22, turn:2.6,
    band:[0.73,1.53], senseR:2.4, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.95,0.45,0.12);
      const b1=sstep(0.28,0.33,u)*(1-sstep(0.38,0.43,u));
      const b2=sstep(0.55,0.6,u)*(1-sstep(0.65,0.7,u));
      out.lerp(new THREE.Color(0.98,0.96,0.9), Math.max(b1,b2)*0.95);
    },
  },
  { // 狮子鱼：红白条纹 + 张扬鳍条
    id:'lion', count:2, L:0.26, H:0.15, glb:'fish-models/species/species-lion.glb',
    profileH:[[0,0.1],[0.18,0.62],[0.4,1],[0.6,0.85],[0.8,0.5],[1,0.18]],
    profileW:[[0,0.48],[0.18,0.72],[0.4,0.6],[0.6,0.44],[0.8,0.3],[1,0.2]],
    topK:1.06, botK:1.0,
    tailLen:0.42, tailSpread:1.05, tailFork:0.4,
    dorsalH:0.9, dorsalL:0.4, analH:0.6, analL:0.28, pectL:0.26,
    finOpacity:0.62, finColor:0xc07a6a,
    rough:0.42, metal:0.18, scaleI:0.5, irid:0.3, scaleTiles:22, eyeSize:0.058,
    amp:0.055, beat:3.2, waveK:3.6,
    schoolRad:1.3, wSep:1.8, wAli:0.2, wCoh:0.4,
    minSpeed:0.04, maxSpeed:0.22, wander:0.16, turn:1.9,
    band:[0.68,1.48], senseR:2.6, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.72,0.32,0.25);
      const st=sstep(0.3,0.38,u)*(1-sstep(0.55,0.62,u));
      out.lerp(new THREE.Color(0.92,0.88,0.84), st*0.85);
      if(c<-0.4) out.lerp(new THREE.Color(0.9,0.86,0.82), sstep(-0.4,-1,c)*0.6);
    },
  },
  { // 麒麟鱼（花斑连鳍䲗）：蓝橙花纹底栖
    id:'mandarin', count:2, L:0.16, H:0.09, glb:'fish-models/species/species-mandarin.glb',
    profileH:[[0,0.14],[0.16,0.68],[0.38,1],[0.58,0.9],[0.78,0.55],[1,0.22]],
    profileW:[[0,0.52],[0.16,0.78],[0.38,0.66],[0.6,0.48],[0.8,0.3],[1,0.2]],
    topK:1.06, botK:0.96,
    tailLen:0.38, tailSpread:0.95, tailFork:0.3,
    dorsalH:0.75, dorsalL:0.3, analH:0.5, analL:0.22, pectL:0.16,
    finOpacity:0.6, finColor:0xe8a03c,
    rough:0.4, metal:0.2, scaleI:0.55, irid:0.4, scaleTiles:22, eyeSize:0.066,
    amp:0.08, beat:9, waveK:5.6,
    schoolRad:0.5, wSep:2.2, wAli:0.2, wCoh:0.3,
    minSpeed:0.03, maxSpeed:0.18, wander:0.12, turn:2.2,
    band:[0.63,1.13], senseR:2.0, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.12,0.35,0.5);
      const n=vnoise(u*3.0+1.7, y*2.4+5.1);
      if(n>0.5) out.lerp(new THREE.Color(0.95,0.55,0.1), sstep(0.5,0.72,n)*0.92);
      if(n<0.34) out.lerp(new THREE.Color(0.05,0.1,0.28), sstep(0.34,0.18,n)*0.8);
    },
  },
  { // 鹦鹉鱼：青蓝礁石种
    id:'parrot', count:3, L:0.24, H:0.13, glb:'fish-models/species/species-parrot.glb',
    profileH:[[0,0.11],[0.16,0.64],[0.36,1],[0.56,0.9],[0.76,0.55],[1,0.2]],
    profileW:[[0,0.5],[0.16,0.76],[0.36,0.64],[0.58,0.48],[0.78,0.3],[1,0.2]],
    topK:1.06, botK:1.0,
    tailLen:0.44, tailSpread:1.05, tailFork:0.3,
    dorsalH:0.7, dorsalL:0.34, analH:0.5, analL:0.24, pectL:0.2,
    finOpacity:0.6, finColor:0x7fc4b8,
    rough:0.4, metal:0.18, scaleI:0.5, irid:0.32, scaleTiles:24, eyeSize:0.058,
    amp:0.07, beat:5.5, waveK:4.6,
    schoolRad:0.85, wSep:2.0, wAli:0.4, wCoh:0.45,
    minSpeed:0.07, maxSpeed:0.32, wander:0.2, turn:2.4,
    band:[0.68,1.48], senseR:2.4, hunts:true,
    paint(u,c,y,z,out){
      out.setRGB(0.2,0.55,0.58);
      if(c>0.3) out.lerp(new THREE.Color(0.1,0.28,0.34), sstep(0.3,0.9,c)*0.6);
      if(c<-0.4) out.lerp(new THREE.Color(0.75,0.85,0.8), sstep(-0.4,-1,c)*0.5);
    },
  },
];
