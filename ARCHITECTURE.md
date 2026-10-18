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
## 后续拆分顺序

1. 把当前入口拆成 `src/main.js`、`scene/`、`entities/fish/`、`entities/flora/`、`entities/scenery/`、`systems/` 和 `ui/`。
2. ~~将鱼、水草、石头、沉木都统一为可创建/销毁的场景实体~~（v1.8 已完成造景部分：`scenes/catalog.js`）；鱼的资源注册表待做。
3. ~~引入 Vite 开发/构建脚本，保留现有静态服务作为兼容入口~~（已完成）；后续视需要补 TypeScript。
4. 只有当图鉴、编辑器或配置面板变成复杂应用时，才评估 React/Vue。
