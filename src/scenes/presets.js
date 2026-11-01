// @ts-check
/* ================================================================
 * 预设水景（纯数据）。首次运行时复制进存档；"恢复预设"按 presetId 回到这里
 * 致敬 IAPLC 冠军：苔石山（2008 Mount. Donha）/ 悠然（2018 Yururi）/ 灰色山脉（2007 Ashy Range），只取构图，homage 字段记原作
 * ADA 岩组：ADA 水景缸（超白 + 玻璃 Lily Pipe + 方形吊灯）+ 背光磨砂屏主题，青龙石岩组 + 牛毛毡草原 + 化妆砂，三角灯鱼群
 * 大户外池塘：不规则石岸（tank outdoor），锦鲤 / 金鱼 / 鼠鱼，睡莲（含荷花）与香蒲，岸上松、秋枫、岸草和石灯
 * v2.1.11 新增：江南园林（明式红木缸 + 太湖石 / 石拱桥 / 青花瓷罐 + 水墨远山背景）
 * v2.0 新增：荷兰草缸（无边框缸）+ 三个自然水域（睡莲池塘 / 山间溪流 / 林间小河）
 * classic = v1.7 之前写死的布局逐项转换而来（同位置、同鱼群），保证老玩家无感升级
 * ================================================================ */

/** @typedef {import('./scene-doc.js').SceneDoc} SceneDoc */

/** 紧凑写法 → 物件 @param {string} type @param {number} x @param {number} z @param {number} [s] @param {number} [rot] @param {number} [seed] */
const it = (type, x, z, s=1, rot=0, seed) => ({ type, x, z, s, rot, seed: seed ?? Math.round((x*7.3+z*13.1+s*3.7)*1000+5000) });

/** @type {SceneDoc[]} */
const RAW = [
  {
    id:'classic', presetId:'classic', name:'经典混养', theme:'fresh', tank:'classic',
    fish:{ tetra:24, gold:4, angel:3, cory:5, koi:2, clown:4, lion:2, mandarin:2, parrot:3 },
    items:[
      // 岩石：原 [x,z,r]，圆石基准半径 0.2 → s=r/0.2
      it('rock',-1.22,-0.35,1.7,0.4), it('rock',-0.94,-0.42,1.0,2.1), it('rock',-1.5,-0.2,0.75,4.0),
      it('rock',1.14,-0.32,1.4,1.2), it('rock',1.42,-0.4,0.85,3.3), it('rock',0.74,-0.22,0.6,5.1),
      it('rock',1.58,0.3,0.45,0.9), it('rock',-1.56,0.33,0.4,2.7), it('rock',-0.24,0.45,0.3,1.6),
      it('rock',-0.7,-0.6,1.7,5.6), it('rock',0.45,-0.66,1.4,3.9),
      it('wood',0,-0.57),
      it('kelp',-1.25,-0.45,1.05), it('kelp',0.12,-0.52,0.95), it('kelp',1.08,-0.44,0.85),
      it('kelp',-1.78,-0.62,0.42), it('kelp',1.78,-0.62,0.42),
      it('bush',-1.1,0.3,1.05), it('bush',0.82,0.34,0.95),
      it('crown',-1.85,-0.68,0.85), it('crown',1.85,-0.68,0.8),
      it('red',-0.55,0.1), it('red',0.15,0.14),
      it('carpet',-1.6,-0.02), it('carpet',-0.8,0.05), it('carpet',0,-0.04), it('carpet',0.8,0.02), it('carpet',1.6,-0.05),
      it('airstone',1.6,0.5),
    ].map((o,i)=>({ id:`classic-${i}`, ...o })),
  },
  {
    id:'reef', presetId:'reef', name:'珊瑚礁', theme:'reef', tank:'reef',
    fish:{ clown:6, angel:4, lion:2, mandarin:3, parrot:4 },
    items:[
      // 礁岩骨架：左右两座礁台 + 中后方矮礁，前景留白沙给鱼活动
      it('liveRock',-1.3,-0.48,2.0,0.3), it('liveRock',-0.92,-0.6,1.5,1.9), it('liveRock',-1.65,-0.2,1.2,3.1),
      it('rockTall',-1.15,-0.62,1.3,0.7),
      it('liveRock',1.25,-0.5,1.9,4.4), it('liveRock',0.86,-0.62,1.3,2.2), it('liveRock',1.62,-0.22,1.1,5.3),
      it('rockTall',1.45,-0.6,1.1,2.0),
      it('liveRock',0.0,-0.66,1.4,0.8), it('liveRock',-0.32,-0.7,0.9,2.6),
      // 珊瑚：礁台上鹿角与脑珊瑚，后排海扇，前中景海葵
      it('coralBranch',-1.25,-0.36,1.3,0.5), it('coralBranch',-0.7,-0.5,0.9,2.9), it('coralBranch',1.18,-0.38,1.2,2.4),
      it('coralBranch',0.15,-0.5,1.0,1.3), it('coralBranch',1.75,0.05,0.7,4.1),
      it('coralBrain',-0.55,-0.2,1.1), it('coralBrain',0.62,-0.25,1.0,1.7), it('coralBrain',1.62,0.32,0.75,3.0),
      it('coralBrain',-1.75,0.25,0.8,0.9),
      it('coralFan',-1.0,-0.74,1.4,0.2), it('coralFan',0.9,-0.74,1.5,-0.3), it('coralFan',-0.15,-0.75,1.2,0.4),
      it('coralFan',1.85,-0.7,1.1,0.9), it('coralFan',-1.85,-0.7,1.0,-0.6),
      it('anemone',-0.35,0.2,1.3), it('anemone',0.38,0.28,1.1), it('anemone',-1.3,0.3,1.0),
      it('anemone',1.05,0.18,1.2), it('anemone',0.05,-0.05,0.9),
      it('airstone',1.85,0.6),
    ].map((o,i)=>({ id:`reef-${i}`, ...o })),
  },
  {
    id:'pond', presetId:'pond', name:'锦鲤石庭', theme:'pond', tank:'zen',
    fish:{ koi:4, gold:6, cory:4 },
    items:[
      // 岩组（石组造景）：主石偏左三分线，副石、从石依次递减，彼此朝向主石
      it('rockTall',-0.72,-0.3,1.8,0.4), it('rockTall',-0.36,-0.46,1.3,1.2), it('rockTall',-1.12,-0.5,1.1,2.2),
      it('rockTall',0.92,-0.42,1.4,3.0), it('rockTall',1.28,-0.56,1.0,4.1), it('rockTall',0.56,-0.6,0.8,0.7),
      it('rock',-0.05,0.22,0.5,1.0), it('rock',0.32,0.36,0.4,2.4), it('rock',1.62,0.3,0.5,5.2), it('rock',-1.58,0.26,0.6,3.6),
      // 前景草坪 + 后景细叶草
      it('carpet',-1.75,0.3,1.2), it('carpet',-1.3,0.05,1.3), it('carpet',-0.85,0.3,1.2), it('carpet',-0.4,0.05,1.3),
      it('carpet',0.05,0.38,1.1), it('carpet',0.5,0.08,1.3), it('carpet',0.95,0.3,1.2), it('carpet',1.4,0.05,1.3),
      it('carpet',1.8,0.35,1.1), it('carpet',-0.15,-0.2,1.0), it('carpet',0.3,-0.25,1.0),
      it('seagrass',-1.8,-0.66,1.3), it('seagrass',1.78,-0.66,1.25), it('seagrass',0.15,-0.72,1.0), it('seagrass',-0.3,-0.72,0.9),
      it('mossBall',-0.95,0.12,1.1), it('mossBall',1.12,0.15,1.0), it('mossBall',0.7,-0.12,0.9),
      it('airstone',-1.85,0.55),
    ].map((o,i)=>({ id:`pond-${i}`, ...o })),
  },
  {
    id:'planted', presetId:'planted', name:'荷兰草缸', theme:'fresh', tank:'rimless',
    fish:{ tetra:26, angel:4, cory:6 },
    items:[
      // 荷兰式：后景高茎成墙，中景红草点缀，前景草坪渐低，沉木斜出
      it('kelp',-1.8,-0.66,1.2), it('kelp',-1.35,-0.68,1.1), it('kelp',1.4,-0.68,1.15), it('kelp',1.85,-0.64,1.2),
      it('red',-0.9,-0.6,1.4), it('red',-0.55,-0.68,1.2), it('red',0.95,-0.6,1.3),
      it('seagrass',0.3,-0.7,1.4), it('seagrass',-0.15,-0.72,1.3), it('seagrass',0.6,-0.72,1.2),
      it('bush',-1.55,-0.15,1.1), it('bush',1.6,-0.1,1.0), it('crown',-0.95,-0.2,1.1), it('crown',1.05,-0.18,1.0),
      it('wood',0.1,-0.35,0.9,0.25),
      it('carpet',-1.7,0.38,1.2), it('carpet',-1.1,0.3,1.3), it('carpet',-0.5,0.4,1.2), it('carpet',0.1,0.3,1.3),
      it('carpet',0.7,0.4,1.2), it('carpet',1.3,0.32,1.3), it('carpet',1.85,0.4,1.1),
      it('rock',-0.3,0.12,0.5,1.1), it('rock',0.55,0.1,0.4,3.2),
      it('airstone',1.85,0.6),
    ].map((o,i)=>({ id:`planted-${i}`, ...o })),
  },
  {
    id:'lotus', presetId:'lotus', name:'睡莲池塘', theme:'pond', tank:'pond',
    fish:{ koi:5, gold:6, cory:4 },
    items:[
      // 静水池塘：睡莲铺半个水面，岸角香蒲丛，池底苔球与零星卵石
      it('lily',-1.35,-0.35,1.3), it('lily',-0.7,0.25,1.0,1.4), it('lily',1.1,-0.5,1.4,2.2), it('lily',1.65,0.3,0.9,0.6),
      it('lily',0.25,-0.62,1.1,3.3),
      it('reeds',-1.9,-0.68,1.2), it('reeds',-1.6,-0.72,1.0,1.7), it('reeds',1.92,-0.66,1.1,0.4), it('reeds',0.75,-0.74,0.9,2.6),
      it('seagrass',-1.0,-0.66,1.1), it('seagrass',1.45,-0.62,1.0), it('seagrass',-0.2,-0.7,1.0),
      it('rock',-0.25,0.1,1.2,0.9), it('rock',0.6,0.3,0.8,2.2), it('rock',-1.7,0.2,0.9,4.4),
      it('pebbles',0.2,0.45,1.2), it('pebbles',1.3,0.45,1.0,1.5),
      it('mossBall',-0.9,-0.05,1.2), it('mossBall',0.95,0.05,1.0), it('mossBall',-0.45,0.5,0.9),
      it('carpet',-1.25,0.35,1.2), it('carpet',-0.45,-0.25,1.1), it('carpet',1.7,-0.15,1.0),
    ].map((o,i)=>({ id:`lotus-${i}`, ...o })),
  },
  {
    id:'stream', presetId:'stream', name:'山间溪流', theme:'stream', tank:'stream',
    fish:{ tetra:22, cory:6, gold:2 },
    items:[
      // 溪床：大小卵石滩铺底，几块河石破开水流，石缝里长细叶草与苔球
      it('pebbles',-1.6,0.2,1.8), it('pebbles',-0.8,-0.35,1.6,1.2), it('pebbles',0.1,0.3,1.9,2.3), it('pebbles',0.95,-0.3,1.7,0.6),
      it('pebbles',1.75,0.25,1.6,3.8), it('pebbles',-0.2,-0.6,1.3,4.6), it('pebbles',1.5,-0.62,1.2,5.4),
      it('rock',-1.15,-0.45,1.9,0.5), it('rock',-0.85,-0.6,1.1,2.4), it('rock',0.55,-0.5,1.6,3.6), it('rock',1.3,0.0,1.0,1.1),
      it('rock',-0.35,0.15,0.7,5.0), it('rock',1.9,-0.5,1.3,4.0),
      it('seagrass',-1.4,-0.68,1.1), it('seagrass',0.2,-0.7,1.0), it('seagrass',1.0,-0.68,0.9),
      it('mossBall',-0.6,-0.32,1.0), it('mossBall',0.8,-0.18,0.9),
      it('wood',-0.15,-0.62,0.7,0.35),
    ].map((o,i)=>({ id:`stream-${i}`, ...o })),
  },
  {
    id:'river', presetId:'river', name:'林间小河', theme:'river', tank:'river',
    fish:{ koi:2, gold:4, tetra:14, cory:5 },
    items:[
      // 河湾：沉木倒伏在后岸，水草顺着缓流摆动，岸边一丛香蒲、一小片睡莲
      it('wood',-0.55,-0.5,1.2,0.2), it('wood',0.9,-0.6,0.8,2.9),
      it('kelp',-1.6,-0.62,1.0), it('kelp',0.2,-0.68,1.1), it('kelp',1.55,-0.6,0.95),
      it('crown',-1.15,-0.25,1.1), it('crown',1.2,-0.2,1.0), it('bush',-1.85,0.1,1.0),
      it('rock',-0.15,0.2,1.1,1.3), it('rock',0.55,0.35,0.7,3.0), it('rock',1.75,0.15,1.2,4.8),
      it('pebbles',-0.8,0.4,1.4), it('pebbles',1.1,0.45,1.3,2.0),
      it('reeds',-1.95,-0.7,1.2), it('reeds',-1.7,-0.5,1.0,2.0),
      it('lily',1.7,-0.35,1.1,0.8),
      it('carpet',-1.35,0.42,1.1), it('carpet',0.25,0.0,1.0),
    ].map((o,i)=>({ id:`river-${i}`, ...o })),
  },
  {
    id:'garden', presetId:'garden', name:'江南园林', theme:'garden', tank:'ming',
    fish:{ koi:4, gold:6, cory:3 },
    items:[
      // 园林小景：后景一座驼峰石桥居中偏右，左侧太湖石主峰与配石成"三远"，右后孤石呼应；
      // 前景青花罐半埋、两丛睡莲浮于水面，石缝与桥脚生细叶草，前景草坪留白
      it('bridge',0.2,-0.4,1.15,0.0),
      it('taihu',-1.28,-0.42,1.65,0.3), it('taihu',-0.86,-0.6,1.05,1.7), it('taihu',-1.66,-0.18,0.72,4.1),
      it('taihu',1.52,-0.5,1.3,2.6),
      it('porcelain',1.05,0.35,1.2,-0.5),
      it('lily',-0.4,0.12,1.1,0.8), it('lily',1.6,-0.02,0.9,2.0),
      it('seagrass',-0.3,-0.7,1.2), it('seagrass',0.95,-0.72,1.1), it('seagrass',-1.9,-0.66,1.2), it('seagrass',1.92,-0.66,1.1),
      it('crown',-1.6,0.22,0.9),
      it('rock',0.75,-0.08,0.5,1.2), it('rock',-0.15,0.28,0.4,3.1),
      it('mossBall',0.55,0.12,1.0), it('mossBall',-1.02,0.15,0.9),
      it('carpet',-1.45,0.42,1.1), it('carpet',-0.7,0.38,1.2), it('carpet',0.15,0.45,1.0), it('carpet',1.82,0.42,1.0),
      it('airstone',-1.9,0.58),
    ].map((o,i)=>({ id:`garden-${i}`, ...o })),
  },
  {
    id:'iwagumi', presetId:'iwagumi', name:'ADA 岩组', theme:'nature', tank:'ada',
    fish:{ harlequin:22 },
    items:[
      // 岩组（Iwagumi）：主石立在左侧黄金分割点附近，副石倚着它、添石压阵；石纹朝向一致（rot≈0.5），像一道山脊
      it('rockTall',-0.6,-0.26,3.0,0.5), it('rockTall',-0.12,-0.4,2.1,0.62), it('rockTall',-1.02,-0.04,1.5,0.42),
      it('rockTall',-1.42,-0.46,1.3,0.55), it('rockTall',-0.34,0.06,0.8,0.48),
      // 右侧副组更低更散，与主石遥相呼应，中间留出空
      it('rockTall',1.08,-0.42,2.2,0.7), it('rockTall',1.48,-0.24,1.5,0.6), it('rockTall',0.74,-0.12,1.1,0.8),
      // 捨石：前景零星小石
      it('rock',0.32,0.3,0.45,1.1), it('rock',-1.55,0.4,0.4,2.3), it('rock',1.72,0.35,0.35,0.4), it('rock',-0.35,0.42,0.3,3.2),
      // 化妆砂：从前景偏右蜿蜒流进两组岩石之间
      it('sandPath',0.32,0.4,1.5,-0.3), it('sandPath',0.36,-0.02,1.0,-1.05),
      // 牛毛毡草原：后排高、前排矮，绕开砂道；岩脚点几丛矮珍珠
      it('hairgrass',-1.85,-0.55,1.4), it('hairgrass',-1.45,-0.66,1.5), it('hairgrass',-0.9,-0.6,1.5), it('hairgrass',-0.3,-0.66,1.4),
      it('hairgrass',0.22,-0.64,1.3), it('hairgrass',0.75,-0.66,1.5), it('hairgrass',1.3,-0.64,1.5), it('hairgrass',1.85,-0.55,1.4),
      it('hairgrass',-1.8,-0.1,1.2), it('hairgrass',-1.35,0.05,1.1), it('hairgrass',-0.55,0.14,1.0), it('hairgrass',-0.05,-0.14,1.0),
      it('hairgrass',0.88,0.1,1.0), it('hairgrass',1.32,0.06,1.1), it('hairgrass',1.82,-0.04,1.2),
      it('hairgrass',-1.92,0.5,0.8), it('hairgrass',-1.05,0.46,0.8), it('hairgrass',-0.6,0.56,0.75),
      it('hairgrass',1.0,0.5,0.8), it('hairgrass',1.48,0.54,0.75), it('hairgrass',1.95,0.5,0.8),
      it('carpet',-0.85,0.24,0.8), it('carpet',1.12,0.22,0.7),
    ].map((o,i)=>({ id:`iwagumi-${i}`, ...o })),
  },
  // ---------- 致敬 IAPLC 历届冠军（只取构图与意境，素材全部程序生成；都用 ADA 缸） ----------
  {
    id:'donha', presetId:'donha', name:'苔石山', theme:'azure', tank:'ada', homage:'IAPLC 2008 冠军《Mount. Donha》· Cheng Siu Wai',
    fish:{ tetra:30 },
    items:[
      // 按原作横向比例排布：一道横贯全缸的苔石山脉——左组低、中间主峰最高、右组中等，石块彼此相挨连成一体
      // 中央主峰
      it('mossRock',0.1,-0.3,2.3,0.3), it('mossRock',-0.28,-0.22,1.8,1.4), it('mossRock',0.48,-0.26,1.9,2.2),
      it('mossRock',-0.05,-0.02,1.3,0.9), it('mossRock',0.32,0.02,1.1,3.1), it('mossRock',-0.5,-0.4,1.4,4.4),
      // 左组
      it('mossRock',-1.95,-0.3,1.4,5.0), it('mossRock',-1.62,-0.16,1.1,2.0), it('mossRock',-1.32,-0.34,1.3,2.6),
      it('mossRock',-1.02,-0.12,1.0,0.7), it('mossRock',-0.78,-0.32,1.15,3.6), it('mossRock',-1.22,0.06,0.8,1.1), it('mossRock',-0.62,0.02,0.7,2.9),
      // 右组
      it('mossRock',0.86,-0.3,1.7,0.2), it('mossRock',1.16,-0.12,1.2,4.1), it('mossRock',1.36,-0.34,1.5,5.4),
      it('mossRock',1.62,-0.16,1.1,1.6), it('mossRock',1.86,-0.34,1.0,3.3), it('mossRock',0.7,0.06,0.8,2.4), it('mossRock',1.45,0.1,0.7,0.5),
      // 右端一丛红草
      it('red',1.95,-0.05,1.4), it('red',1.9,0.2,1.1), it('bush',1.95,0.4,0.9),
      // 前景：又高又密的草原，盖住岩脚
      ...[-1.9,-1.45,-1.0,-0.55,-0.1,0.35,0.8,1.25,1.7].flatMap((x,k)=>[
        it('hairgrass',x,0.56,1.55), it('hairgrass',x+0.22,0.36,1.6), it('hairgrass',x+(k%2 ? 0.1 : -0.1),0.18,1.6)]),
      // 后景石缝间也冒草
      it('hairgrass',-1.45,-0.6,1.6), it('hairgrass',-0.55,-0.62,1.6), it('hairgrass',0.65,-0.62,1.6), it('hairgrass',1.6,-0.6,1.6),
    ].map((o,i)=>({ id:`donha-${i}`, ...o })),
  },
  {
    id:'yururi', presetId:'yururi', name:'悠然', theme:'nature', tank:'ada', homage:'IAPLC 2018 冠军《Yururi》· Hironori Handa',
    fish:{ harlequin:18 },
    items:[
      // 原作是"左低右高"的斜坡：左侧大片留白，右侧三分之二的水草从底一直堆到水面
      // 左：一支低平的沉木枝向右伸，后面几丛稀疏细高草
      it('branchWood',-2.0,-0.12,1.4,0.05), it('branchWood',-1.75,-0.35,0.9,-0.4),
      it('hairgrass',-1.75,-0.5,1.6), it('hairgrass',-1.3,-0.56,1.6), it('hairgrass',-0.95,-0.48,1.5), it('seagrass',-1.55,-0.64,1.2),
      // 中：一大团红宫廷，沉木枝从这里斜向右上方伸出
      it('red',-0.5,-0.5,1.8), it('red',-0.25,-0.58,1.8), it('red',-0.7,-0.38,1.6), it('red',-0.05,-0.45,1.7), it('red',-0.4,-0.28,1.5),
      it('branchWood',-0.85,-0.18,1.8,0.0), it('branchWood',-0.55,-0.3,1.7,-0.35), it('branchWood',0.15,-0.32,1.5,-0.1),
      it('branchWood',0.95,-0.4,1.3,2.9), it('branchWood',1.6,-0.3,1.2,3.3),
      // 右：后排高大的绿宫廷长到水面，中排蕨类与灌丛，层层往左下收
      it('stemGreen',0.35,-0.6,1.5), it('stemGreen',0.65,-0.64,1.6), it('stemGreen',0.95,-0.58,1.6), it('stemGreen',1.25,-0.64,1.6),
      it('stemGreen',1.55,-0.58,1.6), it('stemGreen',1.85,-0.64,1.6), it('stemGreen',1.05,-0.42,1.5), it('stemGreen',1.7,-0.4,1.6),
      it('kelp',1.95,-0.5,1.0), it('seagrass',1.4,-0.5,1.3),
      it('fern',0.1,-0.12,1.6), it('fern',0.5,-0.08,1.6), it('fern',0.9,-0.15,1.6), it('fern',1.3,-0.1,1.6), it('fern',1.7,-0.12,1.6),
      it('fern',0.7,0.12,1.3), it('fern',1.15,0.15,1.3), it('fern',1.6,0.14,1.4), it('fern',1.95,0.05,1.2),
      it('bush',0.3,0.1,1.1), it('bush',1.85,-0.25,1.3), it('bush',-0.2,0.0,0.9),
      // 前景矮珍珠全幅铺满
      it('carpet',-1.8,0.52,1.4), it('carpet',-1.2,0.52,1.4), it('carpet',-0.6,0.5,1.4), it('carpet',0,0.52,1.4),
      it('carpet',0.6,0.5,1.4), it('carpet',1.2,0.52,1.4), it('carpet',1.8,0.5,1.4),
      it('carpet',-1.6,0.26,1.3), it('carpet',-1.0,0.24,1.3), it('carpet',-0.4,0.28,1.3), it('carpet',0.2,0.32,1.2),
      it('carpet',-1.9,0.0,1.2), it('carpet',-1.3,-0.05,1.2), it('carpet',-0.75,0.02,1.1),
    ].map((o,i)=>({ id:`yururi-${i}`, ...o })),
  },
  {
    id:'ashy', presetId:'ashy', name:'灰色山脉', theme:'nature', tank:'ada', homage:'IAPLC 2007 冠军《Ashy Range》· Chow Wai Sun',
    fish:{ tetra:26 },
    items:[
      // 中央：几根粗壮的深色倒木交错成楔形——左高右低，从左中部一路斜落到右边沙面（rot≈π：从右端扎沙向左上搭起）
      it('logWood',0.6,-0.12,1.8,Math.PI+0.08), it('logWood',0.85,-0.32,1.75,Math.PI-0.18), it('logWood',0.2,-0.42,1.6,Math.PI+0.3),
      it('logWood',0.05,0.02,1.4,Math.PI-0.25), it('logWood',-0.5,-0.22,1.2,0.5), it('logWood',0.4,-0.5,1.5,Math.PI+0.05),
      it('logWood',1.15,-0.05,1.3,Math.PI+0.2),
      it('branchWood',-0.2,-0.35,1.3,Math.PI+0.4),
      // 左：茂密水草一直长到水面，前面一块灰石
      it('kelp',-1.95,-0.5,1.25), it('kelp',-1.7,-0.62,1.2), it('seagrass',-1.4,-0.62,1.5), it('seagrass',-1.1,-0.55,1.4),
      it('kelp',-1.25,-0.66,1.2), it('kelp',-0.85,-0.62,1.1), it('seagrass',-1.75,-0.35,1.4), it('seagrass',-0.6,-0.66,1.3),
      it('crown',-1.5,-0.38,1.3), it('crown',-1.85,-0.15,1.1), it('fern',-1.05,-0.32,1.5), it('fern',-0.75,-0.5,1.3),
      it('bush',-1.6,0.02,1.2), it('hairgrass',-1.85,0.25,1.6), it('hairgrass',-1.55,0.4,1.4), it('hairgrass',-0.95,0.12,1.3),
      it('rock',-1.25,0.26,1.45,0.6), it('rock',-1.6,0.42,0.6,2.2),
      // 右：低矮的深灰石组，石间铺苔草，背景留白
      it('rock',1.05,-0.25,1.3,1.3), it('rock',1.38,-0.42,1.6,4.0), it('rock',1.7,-0.18,1.25,2.8), it('rock',1.95,-0.42,1.05,0.4),
      it('rock',1.3,0.04,0.8,3.3), it('rock',0.6,0.3,0.4,2.8),
      it('carpet',1.1,0.2,1.2), it('carpet',1.6,0.24,1.3), it('carpet',1.95,0.06,1.1), it('carpet',0.85,-0.02,1.0),
      it('hairgrass',1.5,-0.05,1.1), it('hairgrass',1.85,0.3,1.0), it('hairgrass',0.95,-0.5,1.3),
      // 前景：全幅浅色细砂
      it('sandPath',-0.85,0.5,2.2,0.0), it('sandPath',0.45,0.52,2.2,0.05), it('sandPath',1.55,0.5,1.7,-0.05),
    ].map((o,i)=>({ id:`ashy-${i}`, ...o })),
  },
  {
    id:'outdoor', presetId:'outdoor', name:'大户外池塘', theme:'pond', tank:'outdoor',
    fish:{ koi:6, gold:4, cory:5 },
    items:[
      // 睡莲（叶片带荷花）铺在浅滩一侧，不沉到碗心；香蒲贴着岸
      it('lily',-3.2,-1.4,1.35,0.4), it('lily',-2.2,1.1,1.15,1.2), it('lily',2.6,-1.6,1.4,2.1),
      it('lily',3.4,0.8,1.05,0.6), it('lily',0.4,-2.2,1.2,3.0),
      it('reeds',-4.4,-2.4,1.2,0.3), it('reeds',-3.8,-2.6,1.0,1.4), it('reeds',4.5,-2.2,1.15,0.5),
      it('reeds',4.2,1.6,0.95,2.2), it('reeds',-1.2,-2.7,1.1,0.8),
      it('rock',-1.5,0.4,1.3,0.7), it('rock',1.8,0.6,0.9,2.4),
      it('mossBall',-0.6,-0.2,1.1), it('mossBall',1.1,0.1,0.9),
      // 岸上：松与秋枫围着水线外一圈（pondD>1），近岸两盏石灯，草丛 seed%3===0 的是低画质会藏起的加密丛
      it('pine',-7.21,-6.99,1.25,0.4), it('pine',-1.2,-6.5,1.05,1.2), it('pine',3.74,-5.89,1.35,2.1),
      it('pine',4.21,6.65,1.15,0.6), it('pine',-1.76,6.87,1.2,3.0), it('pine',-6.32,4.52,0.95,1.7),
      it('maple',-9.3,-3.95,1.15,0.8), it('maple',8.12,-3.52,1.05,2.4),
      it('maple',9.68,4.19,1.2,1.1), it('maple',-7.32,3.47,1,4.2),
      it('lantern',-4.12,-6.35,1,0.2), it('lantern',1.98,6.23,1,1.6),
      it('bankGrass',-8.95,-2.25,0.9,0.4,9000), it('bankGrass',-8.02,-5.4,1.02,1.1,9001),
      it('bankGrass',-3.92,-6.75,1.14,2.2,9002), it('bankGrass',0.24,-5.43,1.26,0.7,9003),
      it('bankGrass',3.41,-4.97,0.9,1.5,9004), it('bankGrass',6.63,-3.94,1.02,2.8,9005),
      it('bankGrass',8.84,-1.79,1.14,0.3,9006), it('bankGrass',10.8,1.07,1.26,1.9,9007),
      it('bankGrass',8.88,3.93,0.9,3.4,9008), it('bankGrass',4.78,5.03,1.02,0.9,9009),
      it('bankGrass',1.56,6.38,1.14,2.6,9010), it('bankGrass',-2.26,6.28,1.26,1.3,9011),
      it('bankGrass',-5,4.46,0.9,4.0,9012), it('bankGrass',-7.89,2.91,1.02,0.5,9013),
    ].map((o,i)=>({ id:`outdoor-${i}`, ...o })),
  },
];

export const PRESETS = RAW;
export const PRESET_IDS = RAW.map(d=>d.id);
/** @param {string} id */
export const findPreset = id => RAW.find(d=>d.id===id) ?? null;
