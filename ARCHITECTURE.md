# 项目架构决策

## 结论

项目需要开始模块化，但不需要立刻切换 React 或 Vue。当前更合适的路线是保留 Three.js 场景和现有 DOM UI，逐步迁移到 Vite + 原生 ES 模块；当模块数量稳定后再补 TypeScript。React/Vue 只在后续需要复杂表单、编辑器或多人协作 UI 时引入。

## 判断依据

- `index.html` 同时包含 HTML、CSS、Three.js 场景、鱼体建模、鱼群行为、灯光、喂食、图鉴和渲染循环，已经超过一次性原型的合理边界。
- 鱼类、水草、造景都会需要独立的资源注册、加载、创建、销毁和交互生命周期；继续追加到单文件会让改动互相影响。
- 现有 Three.js 场景已经能稳定运行，直接改成 UI 框架不能解决 3D 实体管理问题，也会增加迁移风险。

## 已落地的进度

- 新增 `src/fish-model-catalog.js`，集中登记网络鱼类模型路径、来源和许可。
- 图鉴新增网络模型库，使用 `GLTFLoader` 加载本地 GLB；现有四种鱼的程序化图鉴预览继续作为稳定回退。
- Kenney 外置纹理遵循 GLB 内的 `Textures/colormap.png` 相对路径，Gobkit 模型保留原始内嵌纹理和动画。
- 拆出第一批纯逻辑模块：`src/utils.js`（工具函数）、`src/uniforms.js`（全局 uniform）、
  `src/scene/caustics.js`（焦散）、`src/fish/textures.js`（鳞片/鱼鳍贴图）、
  `src/fish/body.js`（鱼体/鱼鳍建模与游动着色）；`index.html` 通过 import 引用，
  场景与 UI 逻辑仍在入口文件中，等下一批拆分。
- 拆出鱼类实体模块：`src/entities/fish/species.js`（鱼种数据与着色）、
  `src/entities/fish/school.js`（Boids 鱼群行为类）。
- 拆出图鉴 UI：`src/ui/encyclopedia.js`（图鉴数据、卡片渲染、程序化/GLB 模型预览、
  调试状态查询）；入口文件移除全部失效 import。
- 拆出 `src/scene/tank.js`（TANK 尺寸、沙面高度场、`createTank(scene)` 工厂：玻璃/水面/沙底/底柜）
  与 `src/systems/effects.js`（气泡/光柱/悬浮物/涟漪，`createEffects` 工厂，依赖显式传参）。
  剩余：喂食器、交互与主循环仍在入口文件。
- 拆出水景：`src/entities/scenery.js`（`createScenery({ tankGroup, sandHeight })` 工厂，
  岩石/沉木/水草/气石，`obstacles` 与 `AIR` 作为返回值）。
- 完成入口收敛：`src/scene/setup.js`（`createWorld` 工厂：渲染器/相机/灯光/后期）、
  `src/systems/feeder.js`（喂食器，依赖显式传参）、`src/main.js`（组装、交互、主循环）；
  `index.html` 只保留 HTML/CSS 与一个 module 入口，架构第 1 步（入口拆分）完成。
- 引入 Vite（`npm run dev/build/preview`，three@0.180.0 本地依赖）：模型资源迁至 `public/fish-models`，
  `_serve.js` 改名 `_serve.cjs`（package.json `type:module` 所需）并加 `public/` 回退；
  构建产物已无 CDN 依赖（可离线运行），架构第 3 步（构建链）完成。
  实体生命周期统一（原第 2 步）暂缓：暂无动态增删实体的需求，避免投机抽象。
- 产品功能批次 v1.5：点击识鱼卡片（射线拾取 InstancedMesh + 图鉴数据联动）、
  WebAudio 程序合成环境音效（`src/systems/sound.js`，无音频素材）、⚙️ 设置面板
  （音效 / 自动昼夜循环）、localStorage 偏好持久化。
- 鱼类视觉 v2：截面指数上调（侧扁→纺锤）、四种鱼轮廓重塑（金鱼蛋形圆腹+纱尾、
  鼠鱼隆背扁腹）、鳍条纹理增强、鱼体叠加焦散（与游动着色合成，夜间衰减）；
  权衡：现有 GLB（Kenney/Gobkit）同为低多边形风格化模型，替换无法达成"真实"，
  故优先打磨可控的程序化管线路径。
- 鱼类视觉 v3（GLB 接入）：接入 Quaternius「Animated Cute Fish Pack」CC0 骨骼动画模型
  （Tetra/Goldfish/ButterflyFish/ArmoredCatfish，经 poly.pizza 分发），School 新增 GLB 模式：
  SkeletonUtils.clone 逐条实例化 + AnimationMixer 游动动画（timeScale 随速度/兴奋度加快），
  识鱼射线拾取与图鉴卡片兼容；GLB 加载失败自动回退程序化鱼。实体生命周期的创建/销毁
  路径在此部分落地。
- 锦鲤接入（v1.5.1）：用户提供的 81.5MB 高模（27 万面 + 3 张 4K PNG）经 gltf-transform
  优化为 717KB Web 版（6321 面 + WebP 1024 + KHR_mesh_quantization，零额外运行时依赖），
  以 2 条展示鱼入缸（38 条鱼）；School GLB 模式兼容无动画模型（静态网格靠 Boids 位移）。
- 造景 v2 + 缸体扩容：TANK 4.6×2.2×1.8（体积 +90%），全系统联动
  （边界/水层带/相机/喂食范围）；沙地颗粒纹理+bump、碎石点缀、岩石细分+苔绿顶面+主景石、
  水草 V 折叶片+十字片几何+阔叶/红草/前景草三层景深、沉木副枝+莫斯、渐变背景幕+冷色背光。
- 图鉴调整（v1.5.2）：移除“网络模型素材”库——删除 `src/fish-model-catalog.js` 及图鉴底部的 Kenney/Gobkit
  模型卡片、其渲染逻辑与样式；图鉴鱼种预览统一改用侧身视角（鱼种 GLB 绕 Y 轴旋转 90°，避免正对镜头
  只见鱼头，加载失败仍回退程序化鱼）。
- 核心循环 v2（v1.6，DESIGN P1）：新增 `src/systems/care.js`（`createCare(species)`：全缸饱食度/食欲/
  个体成长，`aquarium.care` 持久化，离线按时间戳衰减）与 `src/ui/fish-card.js`（识鱼拾取+卡片，
  从 `main.js` 拆出）。鱼群行为改由每帧 `ctx` 注入的 `appetite / fear / sleep / onEat` 调制，
  School 不直接依赖 care；GLB 鱼每条持有 `{swim, fast, bite}` 三个 action，按惊吓度/咬食包络
  每帧设权重混合。`Feeder.consume()` 改为返回是否真正吃到，并在内部生成碎屑。
- 美术打磨（v1.7）：
  - 鱼：新增 `src/fish/glb-style.js`，加载后重塑 Quaternius 模型——折角平滑法线、按物种调色板换成湿润非金属
    皮肤（clearcoat + 轻虹彩）、腹→背渐变与霓虹带自发光、鱼体焦散与逆光轮廓；水族箱与图鉴共用。顺带修复：
    程序化尾摆原本作用于所有 GLB 鱼（骨骼鱼本地坐标不匹配，表现为整体横向抖动），现只用于无动画的锦鲤。
  - 场景：柳叶形水草 + 中脉 + 透光/绒光/焦散；光柱改为细光束并在侧视/近距淡出；悬浮颗粒改圆形柔边；
    水面仰视加全内反射与流动亮纹；背光幕、圆角柜体与地面漏光；OutputPass 后加调色 pass（`src/scene/grading.js`）。
  - UI：样式拆到 `src/ui/styles/`，统一设计令牌；控制区改为底部居中磨砂 Dock + SVG 线性图标（替代 emoji），
    饱食度改右上角圆环，设置改开关并锚定 Dock 按钮（`src/ui/settings-panel.js`，同时修复特效开关初始状态
    不同步、昼夜按钮文案不随存档的问题），识鱼卡/帮助/图鉴/加载页统一重做；加载超时判定改为有报错或 25 秒。
- 工程化（v1.7）：ESLint 9（只查正确性，不引入格式化器——保留紧凑代码风格）、Vitest 单测（`tests/`：utils / care /
  Feeder，Node 环境 + 按用例 stub 浏览器全局）、渐进式类型检查（`jsconfig.json` + 文件级 `// @ts-check` + JSDoc）、
  `npm run check` 一键串联、本地 pre-commit 钩子（`.githooks/`，提交前跑 lint/typecheck/test；项目仅本地开发，不设远程 CI）、`.editorconfig` / `.nvmrc` / `engines`。
  顺带修掉 lint 发现的空 catch（设置读写失败现在会告警）与几处未用变量。
- 多场景 + 造景编辑器（v1.8）：
  - 场景即文档：`src/scenes/` 下 `scene-doc.js`（`{id,name,theme,fish,items[]}` + 清洗校验，存档一律视为不可信）、
    `item-meta.js` / `themes.js` / `presets.js`（纯数据）、`scene-store.js`（`aquarium.scenes` + 缩略图 `aquarium.thumbs`，
    首次运行播种 3 个预设，旧版 `aquarium.care` 迁移给"经典混养"）。以上全部 `// @ts-check` 且有单测。
  - 原 `entities/scenery.js` 拆成按 seed 确定性生成的物件构建器（`scenes/items/`：岩石沉木苔球气石 / 水草丛 / 珊瑚），
    由 `scenes/catalog.js` 按 type 分发；材质按类型共享、几何每件独有。新增立石、苔球、细叶草、鹿角珊瑚、脑珊瑚、海扇、海葵。
  - `scenes/scene-runtime.js` 把文档落到场景里并做差量更新：物件挪动只改变换，换 type/seed 才重建；`obstacles`、
    `schools` 两个数组原地维护（鱼群/识鱼卡持有同一引用）；鱼群按数量变化重建（`School.dispose()`）；
    饲养存档按场景隔离（`aquarium.care.<场景id>`，`createCare(species, { key })`）；气泡从第一个气石冒出。
  - 主题只改日间水色/雾/辉光 + 沙色（沙贴图改近白底，颜色走顶点色）+ 背光幕 + 碎石色；`scene/daynight.js` 从 main 拆出。
  - `src/editor/`：`scene-editor.js`（拾取/沙面拖拽/快捷键/撤销重做，所有改动走 commit → runtime.apply）、
    `editor-panel.js`（DOM）、`history.js`（JSON 快照栈）。`ui/scene-picker.js` 为"我的水景"弹层。
  - `main.js` 继续瘦身：画布交互 → `ui/tank-input.js`，拍照 → `ui/photo-mode.js`，调试钩子 → `src/debug.js`。

## 后续拆分顺序

1. 把当前入口拆成 `src/main.js`、`scene/`、`entities/fish/`、`entities/flora/`、`entities/scenery/`、`systems/` 和 `ui/`。
2. ~~将鱼、水草、石头、沉木都统一为可创建/销毁的场景实体~~（v1.8 已完成造景部分：`scenes/catalog.js`）；鱼的资源注册表待做。
3. ~~引入 Vite 开发/构建脚本，保留现有静态服务作为兼容入口~~（已完成）；后续视需要补 TypeScript。
4. 只有当图鉴、编辑器或配置面板变成复杂应用时，才评估 React/Vue。
