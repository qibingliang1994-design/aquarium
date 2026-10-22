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
