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

- 写实化 + 多缸体（v1.9）：
  - 缸体外壳拆到 `src/scene/tank-shells.js`，四种款式（经典黑框 / 超白开缸 / 海水礁缸 / 和风木框）随场景切换，
    内部尺寸不变；场景文档新增 `tank` 字段（`scenes/tank-styles.js`，旧存档按预设/主题兜底），灯色与主灯高度跟随灯具。
    沙床四周加底砂侧壁，透过前玻璃看到的是砂层截面。
  - 物件写实化：岩石改为"断裂面 + 分形起伏 + 层理/石英脉 + 凹处积暗"（`items/natural-geo.js`），新增活石；
    沉木改为渐细树皮管 + 根须 + 随机细枝；水草改为真实叶形组合（莲座/缎带/茎生对叶/地毯簇，`items/leaf-shapes.js`）；
    海葵触手改为弯曲渐细带圆头；岩石/沉木/珊瑚叠加世界坐标 3D 噪声法线细节（`injectSurfaceDetail`）。

- 自然水域 + 更多默认场景（v2.0）：
  - `tank-styles.js` 的款式分两类：`kind:'tank'`（四种玻璃缸）与 `kind:'natural'`（山野池塘 / 山间溪流 / 林间小河）。
    自然水域没有玻璃和柜子，外壳换成 `scene/natural-shells.js` 生成的地形：鱼的活动矩形不变，矩形内就是河床
    （缸的沙床隐藏，地形按同一个 `sandHeight` 铺），矩形外是水下浅滩 → 岸 → 起伏地面，近岸一侧是宽缓浅滩，俯视时视线不被岸挡住。
    溪流/小河的河道沿 x 延伸出画面并缓缓拐弯；地形边缘压平后接一圈远景地面。水面按外壳给出的范围放大，`uClear` 让俯视清澈见底。
  - 款式可带 `env`（天空/雾/环境光覆盖 + `current` 水流）：`dayNight.setTank` 接管背景与雾；`main` 每帧把 `current`
    交给 `ctx.current`（鱼逆流保持位置并被轻推）、饲料、悬浮颗粒与水面波纹。
  - 新物件 `lily` / `reeds` / `pebbles`（`items/wetland.js`）。睡莲和香蒲要够到水面：构建结果可在 `object.userData.onPlace(H)`
    里按"到水面的局部高度"伸展，`scene-runtime` 每次摆放（含拖动/缩放）后调用。
  - 新预设：荷兰草缸（超白开缸）、睡莲池塘、山间溪流、林间小河。存档记录 `seeded`（已发放过的预设 id），
    老玩家升级时只补发没发过的预设，删掉的不会复活；场景上限 16。
  - 岸上植被用低面数叶片（`ribbons` 的 `segs/cols`），自然水域整场约 33–39 万三角形（玻璃缸约 24 万）。
- 牵挂系统（v2.1，DESIGN P2 交付）：
  - 个体身份：新增 `src/entities/fish/identity.js`（纯逻辑、有单测）——鱼名按（场景 id + 物种 + 序号）
    确定性生成、群内去重，无需持久化、刷新不变；个性标签由 `School` 每帧累计的均速 / 转向频率 / 水层
    滑动平均（≈12 秒时间常数；水层按全水柱 0.35..waterY 归一，底栖种的"底栖宅"名副其实）映射为
    「急性子/慢性子 · 好动/沉稳 · 上层巡游/中层漫游/底栖宅」，观察不足 8 秒显示「观察中」；
    识鱼卡标题改为鱼名 + 「#序号 · 物种名」+ 三个个性标签胶囊。
  - 亲密度：`care` 存档新增 `bond`（全缸累计吃到饲料数，只增不减、离线不衰减）与 `milestones`
    （阈值 80/200/400/700/1100/1600 颗）。主循环轮询 `milestoneDue()`（编辑器或切场景期间暂缓），
    `grantArrival()` → `runtime.addFish()` 原地入缸：School 构造按 `FISH_MAX` 预分配容量（实例矩阵、
    成长/咬食/个性统计数组），`addFish()` 追加一条从 0.45 长到 1 的鱼当入缸动画，**不重建鱼群**；
    计数同步进场景文档并 `store.save` 持久化，配三音琶音提示。全部里程碑领完后 bond 转为光泽度
    （`School.setGloss()`：envMapIntensity / clearcoat 随 k 增强）。图鉴页脚显示亲密度等级与进度。
  - 调试钩子新增：`nameOf` / `personaOf` / `bond` / `addFish` / `restartLoop`（隐藏页面 rAF 停摆时
    重启 three 动画循环，配合把 `window.requestAnimationFrame` 换成 setTimeout 垫片）。
- 存档备份（v2.1）：设置弹层新增「导出 / 导入存档」。`src/ui/backup.js` 把 localStorage 里全部
  `aquarium.*` 键（场景与缩略图、每缸饲养存档、设置）收成一份 JSON 下载；导入时校验
  （`validateSave`：magic 头 + 只收字符串值的 aquarium.* 键）后**整体替换**（先清后写，避免新旧场景
  混杂），两步确认（选文件后再点一次按钮，5 秒不点自动复位）避免误触，完成后自动刷新。
  收集 / 校验 / 应用是纯函数，`tests/backup.test.js` 覆盖（含导出→导入往返一致）。
- 自动画质 v2（v2.1）：`src/systems/quality.js` 纯状态机（有单测）——5 档阶梯
  （高清 → 1.5 → 1.25 → 1+低配玻璃 → 关泛光），每 0.5 秒按**真实帧间隔**喂一次 FPS；
  连续 3 秒 <32 降一级，连续 10 秒 >50 升一级（迟滞防抖）。开场 4 秒不采样；
  页面隐藏回来的大间隔（>0.5s）只重置 FPS 窗口。门槛钟用真实时间而非模拟时间
  （低帧率下模拟时间会被 dt clamp 拖慢）。渲染副作用集中在 main 的 onLevel 回调
  （pixelRatio + composer.setPixelRatio + 玻璃材质切换 + bloom 开关）。
  触屏设备（pointer:coarse）像素比上限从 2 收到 1.5（setup.js 与 quality 基准一致）。
- PWA + 移动端（v2.1）：`public/manifest.webmanifest`（any + maskable 图标，192/512）；
  `public/sw.js` —— 页面导航网络优先（保证更新），静态资源缓存优先 + 后台更新
  （缓存写入必须 await 在 respondWith 内，浮动 promise 会在 SW 空闲时被丢弃）；
  仅生产构建注册（`import.meta.env.PROD`，且直接注册不等 load——顶层 await 加载 GLB 时 load 早已触发）。
  图标由 `scripts/gen-icons.mjs` 程序生成（纯 Node zlib 手写 PNG，`npm run icons` 重新生成）。
  窄屏样式补 ≤420px 档（dock 收紧到 42px 按钮不再溢出 390px 视口）。
- 鱼群转向纯逻辑抽取（v2.1）：`src/entities/fish/steering.js`——同种 Boids 累积、漫游、边界弹簧、
  障碍推离、觅食选靶从 `School.update` 逐行原样抽出为纯函数（传入向量原地写、零分配），
  `School` 只留编排；`tests/steering.test.js` 在 Node 里直接验证力学方向与阈值
  （分离对推、对齐朝均值、social 只削弱对齐聚合、schoolRad 外无力、边界/障碍方向、
  觅食跳过已吃与超感知半径）。抽取后浏览器回归：游动/喂食/敲玻璃惊吓均正常。
- 锦鲤骨骼动画：用户提供的 `锦鲤.glb`（81 MB / 150 万三角面 / 无骨骼）
  在 Blender 里减面到 33k 三角面、贴图压到 2048² 基础色与法线 + 1024² 金属-粗糙度，
  并绑定 9 根骨骼（`root`→`spine1..3`→`caudal`→`tail` + 左右胸鳍 `finR/finL` + 下颌 `jaw`），
  烘焙 `Swimming_Normal`（2.3 s）/`Swimming_Fast`（1.07 s）/`Attack`（0.63 s）三段动画，
  幅度与相位先实测 Quaternius 鱼的 Main1..Main6 通道（巡游尾摆 ±17.8°、头部反摆 ±4.2°、
  头→尾行波每骨滞后 ~35°；冲刺尾摆 ±27.5°），再按锦鲤骨骼映射重烘焙，观感与其他鱼一致；
  导出为 2.5 MB 的 `public/fish-models/species/species-koi.glb`（朝向 +Z，与 Quaternius 模型一致）。
  School 只按现有 `swim/fast/bite` 片段名取用，无需改行为；额外加了同贴图锦鲤的冷暖微调
  （避免两条完全一样）和 `prepareFishModel` 里对 `KHR_materials_specular=2.0` 的压高光处理，
  否则 ACES + 环境光会把白斑冲成高光。图鉴预览原本就会播放第一段游动动画，锦鲤现在也能动。
  原 81 MB 源文件移出 `public/`，构建产物不再携带。
- 鱼群统一网格（v2.1.1）：`steering.js` 新增 `createFishGrid`/`rebuildFishGrid`——全体鱼共享的
  统一网格（0.7 单元格，条目对象与单元格数组全复用），主循环每帧重建并注入 `ctx.grid`；
  同种 Boids 与异种分离提供线性（默认/单测参照）与网格两条等价路径（单测验证输出一致，
  含贴近场景与查询半径边界），pair 距离全部改用平方比较（分离/贴近时才开根号）。
- 启动渐进加载（v2.1.1）：`loadSpeciesModels` 支持 `only/skip`——启动只等"当前场景用到的物种"
  GLB（空缸/少物种场景秒开），其余后台补载进同一个 map，后续建 School 自然用上；
  调试钩子 `glbLoaded`。
- 类型检查转正（v2.1.1，分五批）：src 全部模块补 `// @ts-check` + JSDoc（唯一例外
  `fish/glb-style.js`，留待锦鲤调色改动合入后转正）；安装 `@types/three@0.180`（否则
  checkJs 会直接去检查 three 的 JS 源码）与 `@types/chai`；`species.js` 导出 `FishSpec`
  typedef、`encyclopedia.js` 导出 `SpeciesMeta`；UI 层 `$` 取元素改为缺失即抛错（启动期
  快速失败）；tests 不参与类型检查（由 vitest 运行时验证）。中途一次自动标注脚本事故
  （双括号/坏默认参）以回退到提交点 + 纯手工重做收场，教训：JSDoc 参数标注的正确形式是
  `f(/** @type {X} */ x)`，带默认值的参数不能写成 `[x=v]`（那是解构）。
- 健壮性修复（v2.1.2，来自全项目审查）：
  - GPU 泄漏：`School.dispose()` 补 `skeleton.dispose()`——`SkeletonUtils.clone` 给每个 SkinnedMesh 一份骨架，
    骨骼纹理此前每次切场景/改鱼数都会留下（实测切 7 个场景一轮 +700 余张纹理，修复后持平）。
  - 存档：`scene-store` 版本升到 2 并启用版本闸门（读到更高版本的存档 → 只读，不回写）；无法解析的存档重新播种前
    备份到 `aquarium.scenes.bak`；内容没变不回写；`save()` 写盘失败回滚内存并抛错（编辑器如实提示）；缩略图写满
    淘汰最旧的；存储被禁用时也能启动；预设播种也经过 `sanitizeDoc`（此前首次运行与刷新后的物件种子不一致）。
    `sanitizeDoc` / `resolveTank` / `isNatural` 查表改用 `Object.hasOwn`（`constructor` 等键名曾让启动崩溃）。
  - 饱食度按墙钟结算：两次结算间隔超过 1 秒（后台标签页 rAF 停摆、休眠）按真实时间补扣，落盘前也先补扣。
  - 拍照：拍摄中忽略重复按键（此前连按会把渲染器永久卡在高像素比），像素总量封顶 24M，拍完 toast 反馈。
  - 交互小修：造景中刷新/关页有未保存改动时确认；输入框里 Ctrl+S 也走保存；Esc 关帮助；没有气石（或关了气泡）时不再
    播放气泡声；`_serve.cjs` 限制在项目根/public 内（此前 `..%2f` 可读任意文件、畸形 URL 会让进程崩溃），支持 `PORT`。
- 鱼群行为修正（v2.1.3，来自全项目审查，浏览器实测）：
  - 活动范围：软边界从写死的 x ±1.5 / z ±0.48 改为按缸内腔（`steering.SWIM`）减体长余量（`swimLimits(L)`），
    硬约束跟随；经典缸实测脂鲤 x p5–p95 由约 ±1.36 扩到 ±1.8、z 由 ±0.4 扩到 ±0.6。沙面硬约束按 `sandHeight`。
  - 体型分离：同种分离半径 `sepRadius`（小鱼保持 0.16，锦鲤约 0.36）且越近推力越大；异种 `crossRadius` 按两鱼体长之和。
  - 底栖：物种字段 `hug`（鼠鱼、麒麟），下界贴着沙面起伏；喂食时附带 3 片快沉的沉底片（偏绿），只有底栖鱼追，
    中层鱼也不追沉到自己水层下界以下的饲料。实测 5 轮喂食鼠鱼由 0 颗变为 29 颗。
  - 顶流：相对水的目标速度改为水流推送量 ×(1±0.35)，最低游速在水流里放宽；此前恒逆游 minS×2.2 > 水流，全群挤在上游。
    溪流实测 89~92% 的鱼头朝上游，群中心在 x≈0 附近前后进退，贴两端玻璃 0%。
  - 神仙鱼领地：改为椭圆 `[0,0.8,-0.12,0.65,0.3]`，整圈都在活动范围内、切向力加大；此前圆心在边界外，99% 时间卡在一点。
- 渲染性能（v2.1.4，浏览器实测，格式：修复前 → 修复后）：
  - 一条 GLB 鱼的 3~4 个 SkinnedMesh 共用一份骨架（`shareSkeleton`，骨骼与逆绑定矩阵一致才合并）：
    骨骼纹理上传 经典缸 213 → 53、荷兰草缸 138 → 36 次/帧。
  - 鱼的材质克隆不再 dispose（无独占 GPU 资源；dispose 会让 three 删掉着色器程序、切回时重编译），只释放骨架；
    切场景在黑场里 `renderer.compileAsync` 预编译（上限 1.5 s）。回访场景重新链接程序 6~12 → 2~4 个；
    揭幕后最长帧 95~208 ms → 3~5 ms（首次进入的编译耗时都落在黑场里）。
  - 阴影贴图限频 30 Hz（`shadowMap.autoUpdate=false`，主循环按 `SHADOW_DT` 置 needsUpdate）：
    60 Hz 下 draw call 约 -17%（经典缸 601 → 500），刷新率越高省得越多。
- 画面修正（v2.1.5）：
  - 抗锯齿：EffectComposer 的离屏目标默认 samples=0，`antialias:true` 只作用于最后的全屏四边形，场景实际无抗锯齿；
    `setMSAA` 按画质档开 MSAA（像素比 ≥1.75 不开，最低档 2x，其余 4x）。
  - 缸体水面顶层：法线 y 分量 0.02 → 0.25（此前法线近乎水平，俯视出现大块条纹），alpha 按菲涅尔 0.32~0.93
    （此前恒 0.93：俯视机位与编辑器视角都被一块深色板挡住），侧看效果不变。
  - 自然水域岸线：`natural-shells` 烘一张水深贴图（R8，`DEPTH_MAX`=0.6），水面按水深在岸边淡出、浅滩更透、
    岸线内侧带流动白沫；地形水下泥沙 → 湿泥 → 岸上改为按高度平滑过渡，湿泥色调浅（此前三段硬切 + 很深的湿泥色，
    水面不再遮挡后在粗网格上显成黑色锯齿）。
  - 调试钩子 `setNight(k)`：固定昼夜并关闭本次运行的自动循环（截图对比用，不落盘）。
- 交互与存档小修（v2.1.6）：
  - 多窗口单写者（`systems/write-lock.js`）：第一个窗口持有 Web Lock `aquarium-writer`，之后打开的窗口只读
    （scene-store / care / 设置都不落盘，启动 toast 提示、造景"保存"提示不会保存）；此前两个窗口用各自的内存快照
    整份写回，后写的会抹掉另一个刚建的水景。锁在 `createSceneStore` 之前拿（它启动时会回写）。
  - 图鉴条数与"已收录 N 种"跟随当前水景（`syncEncyclopediaCounts`，只改文字不重建卡片），不在缸里的物种标"不在此缸"。
  - 新建空缸后在造景里直接放弃：删掉这个从未保存的缸并回到原水景（此前留下空缸、人也停在里面）。
  - 点水喂食：命中点收进投喂范围（落在离点击最近处），不再"点在投喂矩形外就随机落点"——池塘/溪流的岸边水面点了终于有反应。
  - 调试钩子 `pellets()`：水中饲料坐标。
- 画面质感（v2.1.7）：
  - 物件接地暗斑（`scenes/contact-shadow.js`）：每个物件脚下一片按 `sandHeight` 起伏的径向暗斑（半径 = 占地 × 缩放 × 1.35，
    浓度按类别：岩石最深、水草最浅；睡莲/草毯/卵石不加），由 scene-runtime 在 `place()` 末尾随移动/缩放重贴。
    阴影贴图只管顶灯被挡住的部分，环境光照到根部，物件此前像"浮在沙上"。
  - 焦散只打在朝上的面（`CAUSTIC_FACING`，按视空间法线换回世界 y）：注入点从 `map_fragment` 挪到 `normal_fragment_maps` 之后；
    岩石侧面、鱼腹不再被同样亮的焦散纹覆盖。
  - 溪流水草顺流倒伏：`U.flow`（与水面波纹共用）驱动 `injectSway`，水下的草沿世界 +x 倒伏、摆得更急并带阵风；
    倒伏方向换到物件/实例局部空间（各自随机转过），岸上的草按根部世界高度排除。
  - 浮叶随波：水面波形抽成 `scene/water-wave.js` 的 `WAVE_GLSL`，睡莲叶/花与岸边浮叶用 `injectFloat` 逐顶点贴着同一波面起伏
    （此前叶片只高出静水面 3~4 mm，±18 mm 的浪头会把它们淹掉一块块）。
- 画面纵深（v2.1.8）：
  - 底砂截面（`scene/substrate.js`）：缸体四面玻璃后的竖直侧裙换成程序化分层底砂——波浪形下沿的细沙层，下面是越深越大的
    圆卵石（Voronoi，大小不一、顶面受光、石间露沙），颜色基调仍是主题顶点色；不再注入焦散（竖直面上会拉成竖条纹）。
  - 水体纵深后期（`scene/water-haze.js`）：紧跟 RenderPass、在泛光之前，用深度重建世界坐标，与缸内水体盒求交得到视线在水中的
    长度，按 `1-exp(-L·0.24)`（上限 0.42）混向当前水色（`scene.fog.color`）。composer 两块离屏目标都挂了 DepthTexture；
    玻璃改为不写深度（几乎全透明，写了深度就只"看得到"前玻璃）。自然水域关闭（水面着色器已按水深处理）。调试钩子 `haze(on, k?, max?)`。
- 镜头景深（v2.1.9）：
  - 水体纵深与新加的景深合并为一个镜头 pass（`scene/lens-pass.js`，取代 `water-haze.js`）：两者都读场景深度，拆成两个 pass 时
    第二个会写进挂着这张深度纹理的目标，WebGL 反馈环 → 整屏黑。先景深模糊，再按中心像素深度上水雾。
  - 景深：弥散圆按屈光度差 |1/对焦 - 1/深度| × 26 px（按 1000 px 画面高归一，上限 11 px），黄金角 24 点聚集，样本自身弥散圆
    够大才计入（清晰主体与背景互不渗色）。远景机位几乎全清晰，拉近看鱼时背景化开；对焦默认是 OrbitControls 目标，
    识鱼卡片打开时平滑拉焦到那条鱼（`fishCard.focusPoint`）。画质最低一档随泛光一起关。调试钩子 `dof(on, k?)`。
- 自然水域阳光（v2.1.10）：
  - 太阳斜照：`daynight.setTank` 对 `kind:'natural'` 把主灯挪到后左上方约 30°（`SUN`），近似平行光（decay 0、无距离截断、
    锥角 0.62），亮度按原先正上方灯在河床处的照度折算；阴影相机 near/far 随之放宽。鱼影、睡莲叶影斜落在河床上
    （此前正上方的灯把鱼影压在鱼身正下方被挡住，还在河床上打出一圈"舞台追光"）。缸体款式恢复原吊灯参数。
  - 日光/天光比：三种自然水域的 hemi/fill 调低、太阳调强（约 4:1），阴影才有对比度。
  - 水面改为不写深度：俯视时水面挡在所有水下物体前，镜头 pass 读到的深度全是水面——景深把整个河床当成失焦。
- 中式园林（v2.1.11）：
  - 新物件组"中式园林"：太湖石（`items/taihu.js`，隐式场 + MarchingCubes：扭动竖轴的变径主体、分形褶皱、横穿的胶囊孔洞；
    法线按解析场梯度重算——网格场被截断处 MarchingCubes 的差分法线为 0 → NaN 花斑）、石拱桥（`items/bridge.js`，驼峰桥面 + 半圆桥洞
    一笔画成 Shape 挤出，券脸、栏板、莲苞望柱；避障球只放桥墩与券顶，鱼可穿洞）、青花瓷罐（`items/porcelain.js`，带壁厚的车削罐形，
    canvas 按罐身高度分带画足部弦纹 / 蕉叶 / 缠枝莲 / 如意云头 / 回纹，纹样 3 种变体缓存）。
  - 缸体款式"明式红木"（`scene/ming-shell.js`）：紫檀推光漆框、翘头横梁灯檐、两盏六角宫灯（自发光，不加点光源——灯数变化会让全部材质重编译）、
    回纹牙板 + 团花门心 + 铜面叶 + 马蹄足的明式柜。
  - 主题"园林墨韵"：`art:'ink'` 让背光幕画水墨远山（三重山由远及近墨色渐浓、山脚化入雾里，一轮淡日，夜里读作月亮）。
  - 预设"江南园林"（`garden`），存档版本 2 → 3（新物件 / 缸型 / 主题，老版本代码读到会只读）。
- 常识与时间（v2.1.12，`docs/养鱼要素任务分解.md` 第一批）：
  - 物种生态标签：纯数据模块 `entities/fish/ecology.js`（水 / 水温 / 是否吞小鱼），不放进依赖 DOM/GLTFLoader 的 `ui/encyclopedia.js`，
    Node 单测断言 `FISH_IDS` 全覆盖；图鉴卡加"淡水 · 热带"两个胶囊。
  - 混养小知识：纯函数 `mixNote(fish)` 按优先级只返回一句（淡海水 > 冷热水 > 肉食鱼配 ≤0.7 倍体长的鱼），
    显示在造景鱼群页底部（随加减鱼实时变化）与图鉴页脚；不阻止、不打分。`ui/encyclopedia.js` 的 `mixNoteFor` 补上体长与显示名。
  - 氛围接线收进 `systems/ambience.js`（main 每帧只调 `ambience.update`，原来的 `dayNight.update` 挪进去）：
    - 灯光定时器：纯函数 `systems/light-timer.js` `clockNight(date, { on, off, ramp })`，渐变落在开灯时段之内（开灯起 45 分钟日出、
      关灯前 45 分钟日落），支持跨午夜；设置「跟随本地时间」默认关，与 180 s 自动循环互斥（`settings-panel` 的 `EXCLUSIVE`），
      手动按 Dock 日/夜关掉两者；开着时启动直接 `jump` 到当前时刻。
    - 开缸清澈化：`systems/turbidity.js`（kick 取较大值，τ=1.8 s 指数回落）。首次进入某水景（含新建空缸，揭幕时）kick 1，
      造景保存后 kick 0.45。已见水景存 `aquarium.seen`，键不存在时把现有水景全记为见过（第一次启动 / 老玩家升级不会一进来就是浑水）。
      玻璃缸：镜头 pass 新 uniform `uTurb`（雾化系数 ×(1+3·浊度)、上限 +0.3 封顶 0.8、雾色略偏泥沙），悬浮颗粒池扩到 900、
      `setDensity` 用 drawRange 画 300→900；自然水域：雾密度 ×(1+2.5·浊度)（`dayNight.fogD` 为基准）、`uClear` 降到 1-0.6·浊度。
      浊度未清时不补拍缩略图。
  - 在缸时长：care 存档新增 `since:{物种:[时间戳]}`，缺失/非法/未来值补为"现在"并落盘（旧存档从升级当天算起）；
    `runtime.addFish` 调 `care.arrive`；`daysInTank` 按本地日历日计数。识鱼卡加"在缸第 N 天"/"今天刚到"，页脚改为可换行。
  - 调试钩子：`clockAt(hhmm|null)`、`turbidity()`、`kickTurbid(s)`、`mixNote()`、`daysOf(si, ii)`。
- 渲染性能（v2.2，对照学习项目 SkentSun/aquarium-editor 的 PERFORMANCE.md 第一轮优化移植）：
  - 造景物件绘制批处理 `scenes/item-batch.js`：静态小网格按「材质 uuid + 阴影标志 + 属性签名(名:itemSize 排序) + 是否索引」
    分桶，每桶 ≥2 件合成一个 `BatchedMesh`（`WEBGL_multi_draw` 多绘制，一次提交画全桶；扩展不可用则整体跳过、保持原网格）。
    原网格隐藏保留作编辑代理：编辑器进入拆批恢复逐件拾取/拖拽，退出（`apply` 之后）由 `runtime.setBatching(true)` 立即重批；
    `sync` 对"同桶同网格同矩阵"做脏检查，亲密度发鱼等频繁 `apply` 不会反复重建 GPU 缓冲。InstancedMesh（植物丛/香蒲/触手）
    本身已是单次绘制，不参与；透明/morph/多材质槽不参与（分桶键即 `bucketOf` 纯函数，Node 单测覆盖）。
  - 着色器注入加 `USE_BATCHING` 分支：`injectCaustics`（vWPos）、`injectSway`（toW/base 与 vSwW）、
    `injectFloat`（toW）在批处理下经 `batchingMatrix` 取世界坐标——焦散网纹、水流倒伏、浮叶贴浪与逐件渲染完全一致；
    three 的程序缓存键含 batching 位，共享材质在批/非批两条路径各自编译一份程序，互不污染。
  - 自动画质升级（`systems/quality.js`）：每级新增「画布像素预算」`pixels`（标定为各档像素比在 1080p 下的实际像素数）与
    「阴影刷新率」`shadowHz`（30→10 Hz）。`budgetRatio(budget,w,h,base)` = min(base, sqrt(预算/窗口像素))、下限 0.6——
    4K 大窗口立即缩像素，不再等帧率阶梯慢压；小窗口预算用不完、行为与原先一致。`reapply()` 供 resize 重发当前档。
  - 整帧渲染统计：`renderer.info.autoReset=false` + 主循环每帧手动 reset（覆盖主场景/阴影/后期全部通道）；
    `__aqDebug.perf()` 读上一帧 draw calls / 三角形 / 几何纹理数 / 像素比，`itemBatches()` / `setBatching(on)`
    可量化批处理前后收益（学习项目实测同类改造 Draw Calls -84%、提交三角形 -80%）。
  - 水面细节三件套（同为 aquarium-editor 移植，纯着色器增强不动架构）：焦散**色散**（`caustics.js` RGB 沿轴错开
    采样、随水深拉开，网纹边缘微彩虹）；水面**灯带实形反射**（`tank.js` LAMP_RECT 按各外壳发光面真实几何给出矩形，
    视线经波面反射打到灯平面命中才亮，reef 双灯盘查两块；`daynight` 用 uLampK 跟随灯具昼夜调光）；
    **弯月线**（水面贴玻璃处银线收边，自然水域随 uLampOn=0 一并关闭）。
  - **水体合成 pass**（v2.3，整体移植 aquarium-editor 的 post.js WATER_FS，水面从此"不是网格而是光线合成"）：
    - 新模块 `scene/water-pass.js`：玻璃缸的水面/水体由紧跟场景渲染的全屏 pass 合成——俯视波面折射偏移 + 菲涅尔
      混灯带/房间反射；水中按 exp(-σL) 吸收（σ 随开缸浊度加浓）+ 14 步 march **阴影图与解析焦散网纹**的灯内散射
      （光柱被石头/沉木/鱼剪影切开、HG 相函数、夜间跟随主灯变暗）；仰视水面**全内反射**显示缸内镜像（半分辨率
      平面镜像 RT，仅相机入水时渲染）；缸内看侧玻璃掠射角是**平面镜**（左右 0.55× 镜像 RT，仅相机在缸内时渲染）；
      弯月线。镜像渲染期间冻结阴影更新（复用主相机阴影图）。
    - 通道结构与深度反馈环红线：RenderPass（场景+深度→composer A）→ 水体 pass 读 A 颜色+深度、写私有 rtWater
      （needsSwap=false）→ lens 颜色源切到 rtWater（新增 `setSource`）、深度仍读 A → 泛光 → 输出。任何被采样的
      目标都不在当前绘制目标上；水面网格（缸）不写深度的老约定由此接管为"合成不写深度"。
    - 模式切换 `applyWaterMode`（main）：玻璃缸=合成+藏水面网格；自然水域=保留网格水面（岸线/浅滩/白沫依赖水深
      贴图，盒体模型做不了）；编辑器打开=全关。画质最低档 `setShafts(0)` 停 march。`__aqDebug.water(false)`
      一键回退网格水面做 A/B，`absorb(k)`/`shafts(k)` 调参。
    - 与场景水面的 uniform（uTime/uFlow/uSky/uDeep/uLamp*、浊度）全部共享引用，昼夜/款式/开缸浊度自动流入合成。
- 摆放与投喂的缸内边界（v2.3.1，修复"鱼粮沉到缸外、水草穿玻璃"）：
  - 水体合成 pass 落地后跟进的设置项：画面里新增「水色浓淡」（`absorb`，默认 0.4）与「光柱」（`shafts`，默认 0.1）
    两个滑杆（1% 步进，`water-pass` 的 uSigmaK / setShafts）；旧的网格光柱 `LightRays` 删除，`effects` 只剩气泡/雪/涟漪。
  - 饲料硬边界：`systems/feeder.js` 每帧把饲料与碎屑夹在 ±2.2 / ±0.8（= 鱼群巡游矩形，也在玻璃内壁之内），
    顺流漂到玻璃就停——不再用"漂出 |x|>2.2 就淡出"兜底（那条路会看着饲料掉到缸外才消失）。
  - 物件包络钳制：`scene-runtime.js` build 时量出物件局部满幅（含 InstancedMesh 全部实例），`place()` 按旋转/缩放换算
    世界包络，把中心点钳在玻璃内壁 `GLASS_INNER`（±2.265 / ±0.865，item-meta 导出）之内，水草另加摆动余量；
    钳制结果写回运行时副本，接地暗斑跟随。`limitsOf(id)` 对编辑器暴露同一套范围。
  - 数据侧估算 `placeLimits(type, s)`（item-meta）：玻璃内壁 − 占地半径×缩放 − 2 cm，夹在 `PLACE_BOUNDS` 内、
    触底 0.15；`sanitizeItem` 用它把旧存档贴边的物件拉回缸内。估算比精确包络松的部分由 place() 兜底。
  - 编辑器同一套边界：拖动/方向键微移/复制用 `limitsOf`（真实包络），新放/缩放用 `placeLimits` 估算；
    拖动与缩放/旋转滑杆在 moveItem 后按新包络回钳文档，选中圈与视觉一致。
  - 水草 radius 改为含叶片满幅的占地（长叶草 0.24→0.42、皇冠草 0.16→0.4 等），石拱桥/瓷罐同步调大：
    选中圈更贴实、默认摆放间距更合理。
- 灯光亮度调节（v2.3.2）：设置「画面」新增「灯光亮度」滑杆（`lamp`，0~150%、1% 步进、默认 100%，落盘
  `aquarium.settings`）：`dayNight.setLamp(k)` 存用户倍率，`apply()` 里只乘缸灯本体四件套——主灯
  `hoodSpot.intensity`、灯具发光面 `lightMat.emissiveIntensity`、水面灯带反射 `uLampK`、地面漏光
  `floorGlowMat.opacity`（≤1 封顶）；环境光/补光/雾/焦散不受影响，昼夜循环与灯光定时器照常在其上工作。
  旧存档坏值回落 1。调试钩子 `__aqDebug.lamp(k)`。
- 照片级 PBR 表面（v2.3.3，素材取自 aquarium-editor，MIT）：`public/tex/` 收录 4 组 1024² albedo+法线
  （青龙石 r_seiryu / 火山岩 r_lava / 漂木 w_drift / 大磯沙 s_oiso，各带 `_n` 法线，约 3.6 MB，
  懒加载 + PWA 缓存，来源与许可见 public/tex/README.md）。新增 `scenes/items/surface-tex.js`：
  三平面映射按物件局部坐标采样——无 UV 的程序化几何也能贴、纹理跟着物件走（拖动/旋转不游移）、
  实例共享几何时同贴图；1×1 占位 + uniform 共享引用热替换，加载完成前完全保持程序化外观；
  与 injectCaustics / injectSurfaceDetail 锚点式叠加（各自重发 include 锚点，注入顺序无关）。
  接线：青龙石/活石拆出专用材质（河石仍程序化圆石），沉木拱贴漂木纹，缸底沙面换成大磯沙
  albedo+法线（顶点色继续按主题调沙色，normalScale 0.55，bumpMap→normalMap 重编译一次）。
- 镜头效果开关（v2.3.4）：设置「画面」新增「景深」（`dof`，默认开；`lens.setDof`，画质最低档仍随泛光连带
  关闭，与光柱同一套联动）与「水体雾化」（`haze`，默认开；水体合成 pass 的深度吸收总开关——关闭即
  `uSigmaK→0`，「水色浓淡」滑杆在其下暂失效，重开恢复）两个开关，落盘 `aquarium.settings`，旧存档缺省视为开。
  修复：lens pass 身兼水体合成的上链拷贝段（颜色源接 rtWater），此前景深/雾化全关会把整个 pass 停掉，
  合成水面进不了画面（此时水面网格是藏的 → 水面整个消失；极速画质档自动关景深时同样会触发）。
  现在背着颜色源时 pass 保持启用，两效果全关走片元提前直拷（近乎零开销）。
- 按主题分底砂 + 太湖石贴图（v2.3.5，素材续自 aquarium-editor）：主题新增 `sandTex` 字段——fresh/river=
  水草泥 `s_aquasoil`、reef/garden=白沙 `s_white`、pond/stream=大磯沙 `s_oiso`；`tank.setSandColors(a, b, tex)`
  接收贴图名，换装时按 `SAND_GAIN` 用材质 color 给各贴图平均亮度找平，等加载期间切主题的迟到加载作废；
  太湖石贴 `r_ryuoh` 龙王石灰质纹理。public/tex/ 共 7 组约 5.5 MB（懒加载，PWA 缓存）。
- 照片皮新物种 ×3（v2.3.6，模型续自 aquarium-editor，MIT）：孔雀鱼（雄）guppy、半月斗鱼 betta、
  金三角灯 harlequin——侧面照片生成的单网格静态模型（一张嵌入式贴图、无骨骼片段），b64 解码进
  `public/fish-models/species/`（README 记来源）。物种流水线全链登记：SPECIES（profile/鳍参数/
  Boids/水层/程序化回退 paint）+ FILES + SPECIES_META（中文名/拉丁名/图鉴文案，名字取自源项目
  catalog）+ ECOLOGY（均淡水热带）+ FISH_IDS/FISH_MAX（guppy 10、betta 2 独居、harlequin 24）+
  三处 css 强调色。无 PALETTES 条目 → 走锦鲤同款"保留照片贴图+压镜面"路径；无动画片段 →
  走 decorateFishMaterial 顶点尾摆（amp/beat/waveK 来自物种表）。classic 预设测试改为
  "旧九种保持默认、新物种不入旧预设"。与 tetra（霓虹脂鲤=红绿灯）同种的源项目 neon 模型未收录。
- 大户外池塘（场景存档 v4）：水体边界收到 `scenes/tank-bounds.js`。不带 `volume` 的缸型仍是
  4.6×2.2×1.8，默认边界吸附回历史字面量（swim 2.13×0.74、摆放 2.05×0.75、玻璃内壁 2.265×0.865、
  饲料 2.2×0.8）。`outdoor` 的活动矩形内接在不规则岸线里（硬钳制角 pondD&lt;0.93），视觉水面约 17×12
  （`scene/pond-shape.js` + `natural-shells.js` 的 `buildOutdoor`：石缘、碗形底、`userData.bed`）。
  地面查询走 `scene/ground.js`，沙床公式不动。预设「大户外池塘」用现有锦鲤 / 睡莲 / 香蒲。
  旧 v3 存档按 seeded 补发一次。天气是 `systems/weather.js` 的纯逻辑（晴 / 多云 / 小雨 / 中雨 /
  薄雾 / 小雪 + 强度 + 28 秒自动），晴天或强度 0 不改变灯光、雾和波浪；粒子在 `effects.js`，
  数量跟着现有五档画质走；潮湿度 `U.wet` 只压暗地面和石头。eco-pond 的水质分数不移植，只把
  相对清澈的茶色差写进自然水域网格水面的 `uMurk`。阴影仍由主循环按画质档刷新，不在天气里开关投影。
## 后续拆分顺序

1. 把当前入口拆成 `src/main.js`、`scene/`、`entities/fish/`、`entities/flora/`、`entities/scenery/`、`systems/` 和 `ui/`。
2. ~~将鱼、水草、石头、沉木都统一为可创建/销毁的场景实体~~（v1.8 已完成造景部分：`scenes/catalog.js`）；鱼的资源注册表待做。
3. ~~引入 Vite 开发/构建脚本，保留现有静态服务作为兼容入口~~（已完成）；后续视需要补 TypeScript。
4. 只有当图鉴、编辑器或配置面板变成复杂应用时，才评估 React/Vue。
