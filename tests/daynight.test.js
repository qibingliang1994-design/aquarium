import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createDayNight } from '../src/scene/daynight.js';

/** 最小可运行的昼夜系统：真实 three 灯光对象，Node 下可直接构造 */
const makeDayNight = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.05);
  const lights = {
    hoodSpot: new THREE.SpotLight(0xffffff, 16),
    hemi: new THREE.HemisphereLight(0xffffff, 0x222222, 0.35),
    fillLight: new THREE.DirectionalLight(0xffffff, 0.5),
    waterGlow: new THREE.PointLight(0x2e8fb0, 0.9),
    rim: new THREE.DirectionalLight(0xffffff, 0.35),
  };
  const waterUniforms = { uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uLampK: { value: 1 } };
  const lightMat = { emissiveIntensity: 2.8 };
  const floorGlowMat = { opacity: 1 };
  const dn = createDayNight({ scene, lights, waterUniforms, sandMat: { userData: {} }, shell: { lightMat },
    floorGlowMat, schools: [], fishRim: { k: { value: 0.42 } } });
  return { dn, ...lights, waterUniforms, lightMat, floorGlowMat };
};

describe('dayNight 灯光亮度', () => {
  it('默认 lamp=1：亮度就是昼夜表原值', () => {
    const { dn, hoodSpot, waterUniforms, lightMat } = makeDayNight();
    dn.jump(0);
    expect(dn.lamp).toBe(1);
    expect(hoodSpot.intensity).toBeCloseTo(16, 5);            // DAY.spot 默认基值
    expect(waterUniforms.uLampK.value).toBeCloseTo(1, 5);
    expect(lightMat.emissiveIntensity).toBeCloseTo(2.8, 5);
  });

  it('setLamp 只缩放缸灯本体，昼夜状态之上再乘', () => {
    const { dn, hoodSpot, waterUniforms, lightMat, floorGlowMat } = makeDayNight();
    dn.setLamp(0.5);
    dn.jump(0);
    expect(hoodSpot.intensity).toBeCloseTo(8, 5);             // 16 × 0.5
    expect(lightMat.emissiveIntensity).toBeCloseTo(1.4, 5);
    expect(waterUniforms.uLampK.value).toBeCloseTo(0.5, 5);
    expect(floorGlowMat.opacity).toBeCloseTo(0.5, 5);
    // 夜间同样按倍率缩放（月光表 × 倍率）
    dn.jump(1);
    expect(hoodSpot.intensity).toBeCloseTo(1.5, 5);           // 3 × 0.5
    expect(waterUniforms.uLampK.value).toBeCloseTo(0.11, 5);  // 0.22 × 0.5
  });

  it('倍率夹在 0 ~ 1.5，坏值回落 1', () => {
    const { dn, hoodSpot } = makeDayNight();
    dn.setLamp(99);
    expect(dn.lamp).toBe(1.5);
    dn.jump(0);
    expect(hoodSpot.intensity).toBeCloseTo(24, 5);
    dn.setLamp(-3);
    expect(dn.lamp).toBe(0);
    dn.setLamp(Number.NaN);
    expect(dn.lamp).toBe(1);
  });

  it('环境光/补光/鱼体轮廓不受灯光倍率影响（那是昼夜与主题的领域）', () => {
    const { dn, hemi, fillLight, rim } = makeDayNight();
    dn.jump(0);
    const hemi0 = hemi.intensity, fill0 = fillLight.intensity, rim0 = rim.intensity;
    dn.setLamp(0.2);
    expect(hemi.intensity).toBeCloseTo(hemi0, 5);
    expect(fillLight.intensity).toBeCloseTo(fill0, 5);
    expect(rim.intensity).toBeCloseTo(rim0, 5);
  });
});
