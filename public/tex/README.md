# tex/ — 照片级 PBR 贴图

来源：[SkentSun/aquarium-editor](https://github.com/SkentSun/aquarium-editor)（MIT License，见仓库根目录 LICENSE）。
本项目为 MIT 授权的水景造景工具，以下贴图按原样拷贝、未经修改。

| 文件 | 内容 | 用途（本项目） |
|---|---|---|
| `r_seiryu(.webp/_n.webp)` | 青龙石灰蓝底白筋，1024²，albedo+法线 | 造景「青龙石」立石 |
| `r_lava(.webp/_n.webp)` | 火山岩多孔红褐，1024²，albedo+法线 | 造景「活石」海水礁岩 |
| `r_ryuoh(.webp/_n.webp)` | 龙王石灰质孔石，1024²，albedo+法线 | 造景「太湖石」 |
| `w_drift(.webp/_n.webp)` | 漂木木纹，1024²，albedo+法线 | 造景「沉木拱」 |
| `s_oiso(.webp/_n.webp)` | 大磯沙混合砾石，1024²，albedo+法线 | 缸底沙面（pond/stream 主题） |
| `s_aquasoil(.webp/_n.webp)` | 水草泥深褐圆粒，1024²，albedo+法线 | 缸底沙面（fresh/river 主题） |
| `s_white(.webp/_n.webp)` | 白沙细砾，1024²，albedo+法线 | 缸底沙面（reef/garden 主题） |

`_n` 后缀为切线空间法线贴图（线性色彩空间）；其余为 albedo（sRGB）。三平面映射按世界/物件坐标采样，无需 UV。

## 岸边景物（Poly Haven，CC0）

以下三组与上面的 MIT 贴图分开。来源 [Poly Haven](https://polyhaven.com)（CC0），取 1K JPG 后用 ffmpeg 转成 1024² WebP（质量 76），没有其它修改。树皮和地衣走三平面（`injectSurfaceTex`）；岸草只用 albedo 的 UV，法线文件仍随对子一起放着。

| 文件 | Poly Haven | 用途 |
|---|---|---|
| `b_pine(.webp/_n.webp)` | [pine_bark](https://polyhaven.com/a/pine_bark) diff + nor_gl | 松与秋枫的树皮 |
| `g_leaf(.webp/_n.webp)` | [leafy_grass](https://polyhaven.com/a/leafy_grass) diff + nor_gl | 岸草叶片 |
| `r_lichen(.webp/_n.webp)` | [lichen_rock](https://polyhaven.com/a/lichen_rock) diff + nor_gl | 石灯笼 |

下载原件示例：`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/pine_bark/pine_bark_diff_1k.jpg`（法线把 `diff` 换成 `nor_gl`）。
