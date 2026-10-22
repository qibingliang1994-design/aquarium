# 物种动画模型

## Quaternius（CC0）

经 poly.pizza 分发的 Quaternius「Animated Cute Fish Pack」模型，license: CC0 1.0
（公共领域，可任意使用，无需署名）。原打包页：https://quaternius.com/packs/cutefish.html

| 文件 | 模型 | 用途 |
| --- | --- | --- |
| species-tetra.glb | Tetra | 霓虹脂鲤群（24 条群游） |
| species-goldfish.glb | Goldfish | 金鱼 |
| species-butterfly.glb | Butterfly Fish | 蝴蝶鱼（原神仙鱼位） |
| species-cory.glb | Armored Catfish | 鼠鱼（底栖） |
| species-clown.glb | Clownfish | 小丑鱼 |
| species-lion.glb | Lionfish | 狮子鱼 |
| species-mandarin.glb | Mandarin Fish | 麒麟鱼（花斑连鳍䲗） |
| species-parrot.glb | Parrot Fish | 鹦鹉鱼 |

每个模型含 6 段动画（Swimming_Normal / Swimming_Fast / Attack / Death /
Out_Of_Water / Swimming_Impulse），当前使用 Swimming_Normal，timeScale 随游速
与喂食兴奋度加快。模型朝向 +Z，经包围盒归一化到物种体长。

## 锦鲤（用户提供的高模）

`species-koi.glb` 由用户提供的 `锦鲤.glb`（81 MB / 150 万三角面）优化而来：
减面到 33k 三角面、贴图压到 2048²（基础色/法线）与 1024²（金属-粗糙度），
并从零绑定骨骼、烘焙三段循环/单次动画。原模型授权由提供者确认；源文件与
Blender 构建脚本放在本地 `_koi_build/`（已在 .gitignore 中，不进构建产物）。

- 骨架 9 根：`root` → `spine1..3` → `caudal` → `tail`，外加左右胸鳍 `finR/finL`
  与下颌 `jaw`；沿鱼体长轴用平滑权重渐变蒙皮，胸鳍/下颌按区域单独加权。
- 动画 3 段（幅度与时序对标 Quaternius 鱼的实测数据，观感与其他鱼一致）：
  `Swimming_Normal`（2.3 s 巡游，尾摆 ±17.5°、头部反摆 ±4°，头→尾行波）、
  `Swimming_Fast`（1.07 s 受惊冲刺，尾摆 ±24.5°）、
  `Attack`（0.63 s 咬食：甩头 + 身体单侧 C 弯 + 张嘴、胸鳍外展）。
  与 Quaternius 模型使用同一套 School 动作混合接口。

## 照片皮模型（aquarium-editor，MIT）

来自 [SkentSun/aquarium-editor](https://github.com/SkentSun/aquarium-editor)（MIT License），
由侧面照片生成的单网格静态模型（一张嵌入式照片贴图、无骨骼动画），按原样解码收录。

| 文件 | 物种 | 用途 |
| --- | --- | --- |
| species-guppy.glb | 孔雀鱼（雄） | 上层松散小群（≤10 条） |
| species-betta.glb | 半月斗鱼 | 缓游独行（≤2 条） |
| species-harlequin.glb | 金三角灯 | 整齐群游（≤24 条） |

无动画片段：School 走 `decorateFishMaterial` 的顶点尾摆路径（`amp/beat/waveK` 来自
物种表）；材质走锦鲤同款"保留照片贴图 + 压镜面高光"路径（物种表无 PALETTES 条目即生效）。
- 朝向 +Z；模型尺寸 1.14 单位长，运行时按物种 `L=0.42` 归一化。
