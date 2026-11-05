# 物种动画模型

## Quaternius（CC0）

经 poly.pizza 分发的 Quaternius「Animated Cute Fish Pack」模型，license: CC0 1.0
（公共领域，可任意使用，无需署名）。原打包页：https://quaternius.com/packs/cutefish.html

| 文件 | 模型 | 用途 |
| --- | --- | --- |
| species-butterfly.glb | Butterfly Fish | 蝴蝶鱼（海水；已由照片皮替代，未引用） |
| species-clown.glb | Clownfish | 小丑鱼 |
| species-mandarin.glb | Mandarin Fish | 麒麟鱼（花斑连鳍䲗） |

每个模型含 6 段动画（Swimming_Normal / Swimming_Fast / Attack / Death /
Out_Of_Water / Swimming_Impulse），当前使用 Swimming_Normal，timeScale 随游速
与喂食兴奋度加快。模型朝向 +Z，经包围盒归一化到物种体长。原包里的 Tetra / Goldfish / Armored Catfish
已换成下面的照片皮模型（霓虹脂鲤 / 琉金 / 熊猫鼠），文件已删除。

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

来自 [SkentSun/aquarium-editor](https://github.com/SkentSun/aquarium-editor)（MIT License，
Copyright (c) 2026 SkentSun），由侧面照片生成的单网格模型：一张嵌入式照片贴图（webp），
顶点属性 `_FIN`（部位/权重/收拢角）与 `_PIV`（鳍条/鳍基/眼球的转动中心），节点 `extras.swim`
（吻端、体长、波长、摆尾频率、幅度、包络、胸鳍贴体角）。头朝 +X、米制真实尺寸。
用 `node scripts/fish-import.mjs <源id>:<文件名>` 从 `../aquarium-editor/fish/<源id>.glb.b64.txt` 解码收录，不改内容。

| 文件 | 源 id | 物种 | 用途 |
| --- | --- | --- | --- |
| species-neon.glb | neon | 霓虹脂鲤 | `tetra`：中层大群 |
| species-ryukin.glb | ryukin | 琉金 | `gold`：中上层慢游 |
| species-panda.glb | cory | 熊猫鼠 | `cory`：底栖小群 |
| species-guppy.glb | guppy | 孔雀鱼（雄） | 上层松散小群 |
| species-betta.glb | betta | 半月斗鱼 | 缓游独行，上水面换气 |
| species-harlequin.glb | harlequin | 金三角灯 | 整齐群游 |
| species-rummy.glb | rummynose | 红鼻剪刀 | 紧密群游 |
| species-ember.glb | ember | 火焰灯 | 两厘米的小灯，松散成群 |
| species-oto.glb | oto | 小精灵 | 吸侧玻璃 / 趴沙啃藻 |
| species-ram.glb | ram | 荷兰凤凰 | 成对守着沙面一小片地盘 |
| species-scalare.glb | angel | 神仙鱼 | 中层优雅缓游 |
| species-gourami.glb | dwarfgourami | 丽丽 | 上层踱步，上水面换气 |

渲染走 `src/fish/photo-fish.js`（游动着色器移植自原项目 fishlib.js）：每物种一个 InstancedMesh，
顶点着色器按逐实例状态摆尾、弯身、开合各鳍、转眼、鼓鳃；贴图透明度只有 0/1，按 alphaTest 镂空。
步态由 `src/fish/photo-gait.js` 从鱼的真实运动推出，School 按物种体长 `L` 缩放（模型米制 → 场景）。

## 照片生成的照片皮模型（本项目 `scripts/photo-fish/`）

aquarium-editor 只有淡水鱼；海水鱼用同一格式从一张侧面照片生成，游动、鳍透光与上面的照片皮模型完全一致。

| 文件 | 物种 | 照片来源与授权 |
| --- | --- | --- |
| species-clown-photo.glb | 公子小丑（*Amphiprion ocellaris*） | [Nick Hobgood，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Amphiprion_ocellaris_(Clown_anemonefish)_Nemo.jpg)，**CC BY-SA 3.0**——本文件（含贴图）是该照片的衍生作品，按 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 发布；改动：抠图、摆正、裁切缩放、生成网格 |
| species-butterfly-photo.glb | 丝蝴蝶鱼（*Chaetodon auriga*），物种 id `angel` | [Totti，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chaetodon_auriga_Shibukawa.jpg)，**CC BY-SA 4.0**——衍生作品，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 发布；改动同上 |
| species-mandarin-photo.glb | 花斑连鳍䲗（*Synchiropus splendidus*） | [H. Zell，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Synchiropus_splendidus_02.JPG)，**CC BY-SA 3.0**——衍生作品，按 CC BY-SA 3.0 发布；改动同上 |
| species-ytang-photo.glb | 黄高鳍刺尾鱼（*Zebrasoma flavescens*） | [Luc Viatour，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Zebrasoma_flavescens_Luc_Viatour.jpg)，**CC BY-SA 3.0**——衍生作品，按 CC BY-SA 3.0 发布；改动同上 |
| species-btang-photo.glb | 拟刺尾鲷 / 蓝倒吊（*Paracanthurus hepatus*） | [Karelj，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Paracanthurus_hepatus_Prague_2011_3.jpg)，**CC BY-SA 3.0**——衍生作品，按 CC BY-SA 3.0 发布；改动同上 |
| species-idol-photo.glb | 镰鱼 / 角蝶（*Zanclus cornutus*） | [Philippe Bourjon，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Idole_des_Maures_(Zanclus_cornutus).jpg)，**CC BY-SA 3.0**——衍生作品，按 CC BY-SA 3.0 发布；改动同上 |

生成流程（源照片放在 `_fish_build/photos/`，不进仓库）：

```bash
python -I -X utf8 scripts/photo-fish/build.py scripts/photo-fish/clown.json
blender -b --factory-startup --python scripts/photo-fish/blender_export.py -- _fish_build/out/clown/mesh.json public/fish-models/species/species-clown-photo.glb
```

每种鱼一份配置 `scripts/photo-fish/<id>.json`（`photoCredit` 字段记照片出处）。胸鳍 / 腹鳍是从照片里剪下的单独鳍片（贴图下方的图集条），左右各一片绕鳍基离开体侧，游动时划水开合。
上面 Quaternius 剩下的三个卡通海鱼 glb 已全部被照片皮版本替代（狮子鱼、鹦鹉鱼两个物种已下架，文件删除），`species-models.js` 不再引用，暂留作对照。
