# 使用指南

初次使用请直接在应用顶部打开 [浏览器内图文指南](../guide.html)，跟着「第一个动画」章节逐步操作。本文保留简明文字版。

编辑器两侧各有一条常驻图标栏。左侧「模板」「场景」「图层」，右侧「项目」「属性」「参数」；点击图标展开对应面板，再点同一图标收起。窄屏时面板会覆盖画布区域，点击空白处可关闭。选中对象时会自动打开「属性」。

右侧「项目」中的「画布预置」提供手机竖屏、平板横屏和 PC 视频常用尺寸；选中后会同时设置宽度与高度。也可以直接输入自定义尺寸（每边最大 4096 像素）。

## 可视化创作

1. 执行 `pnpm install`、`pnpm dev`，打开本地地址。选择「新建」或左侧六个数学、物理、算法模板之一。
2. 点击左侧「图层」图标，在展开的面板中选择对象类型；点选对象后，在右侧「属性」面板修改位置、大小、颜色、文字或公式。画布中的普通对象也可拖动。
3. 要让属性随时间变化，先选中对象，在时间线上选择动画属性，点击时间刻度定位后按「＋ 关键帧」。点击菱形可在下方编辑时间、值和缓动方式，拖动菱形可调整时间，也可删除单个关键帧；同一属性已有表达式绑定时须先清除绑定。
4. 点击右侧「参数」图标添加场景参数，设置名称、范围、默认值和单位。选中对象后，可在「属性」面板的表达式绑定中用参数 ID、`t`（秒）及常用数学函数驱动数值属性。参数滑块可实时预览。
5. 使用播放、下一帧和进度条检查动画；「保存项目」生成 `.cmanim` 文件，「打开」可重新导入。「分享」生成包含当前项目、场景、参数和播放时刻的链接，修改后需重新生成；项目过大时请改用文件。顶部最右侧的「导出作品」下拉菜单提供当前帧 PNG、浏览器支持的视频和逐帧 PNG ZIP；视频和逐帧 ZIP 可设置开始、结束时间。

模板中的运动点等对象由表达式或关键帧控制位置。画布上可以直接点选它们，但右侧受驱动的 X/Y 输入会锁定并显示原因；请到「时间表达式」或时间线修改其运动方式。普通静态对象的 X/Y 可直接编辑。

分组的显示状态与透明度会作用于所有子对象。删除分组会一并删除其子对象和依赖组内坐标系的曲线；仍在场景中的对象若引用了被删路径或匹配目标，会解除对应关联。可用「撤销」恢复整次删除。

新增示例包括「单位圆」（调整显示半径和角速度，看正弦/余弦投影）、「单摆运动」（调整摆长、初始摆角和重力加速度；采用小角度近似）、「冒泡排序」（拖动时间线逐次查看相邻数字的比较；虚线框和向下箭头标出当前比较对象，不交换的步骤也会展示）。点击左侧「模板」图标即可打开示例；切换前请先保存当前项目。

公式内容使用常见 TeX 数学写法，例如 `x^2+y^2=r^2`。函数曲线对象需关联一个坐标系，表达式中的 `x` 表示横坐标。预览和导出会等待公式、图片与字体资源加载。

函数曲线在无效值、极点和可检测的跳变处断线，例如 `sqrt(x)` 的负数定义域与 `floor(x)` 的阶跃。采样无法保证识别所有数学不连续点；需要严格控制分段时，可使用多个路径对象明确绘制各段。

### 画布锚点布局

选中对象后，在「属性 → 布局锚点」选择画布中心、四角或边缘中点，再设置水平和垂直偏移。锚点约束对象原点，调整画布尺寸时对象会随锚点移动。例如把提示文字放在右下角附近：

```ts
scene.nodes.push({
  id: 'hint', type: 'text', name: '提示', text: '拖动参数观察变化',
  x: 0, y: 0, fontSize: 24,
  layout: { anchorX: 'right', anchorY: 'bottom', offsetX: -320, offsetY: -36 },
})
```

`offsetX` 和 `offsetY` 以画布像素计；布局约束与同一对象的 X/Y 关键帧或位置表达式不能并用。代码侧求值时需传入画布：`evaluateScene(scene, time, params, { canvas: project.canvas })`。选择「自由位置」会把当前锚点结果转回普通 X/Y 坐标。

### 路径跟随

先添加「路径」，再选中要移动的对象，在「属性 → 跟随路径」选择它。`路径进度` 从 0 到 1，按路径弧长计算；`进度表达式` 可写 `t/8` 或 `speed*t`，结果会限制到 0–1。需要箭头沿行进方向转向时，启用「沿路径旋转」，并用水平、垂直偏移微调位置。代码示例：

```ts
scene.nodes.push(
  { id: 'route', type: 'path', name: '路线', x: 100, y: 120, points: [[0, 0], [200, 0], [200, 120]] },
  { id: 'traveler', type: 'rect', name: '移动指示', x: 0, y: 0, width: 28, height: 8, fill: '#5eead4',
    followPath: { pathId: 'route', progress: 0, progressExpression: 't/8', orient: true, offsetX: 0, offsetY: 0 } },
)
```

同一对象的路径跟随不能与画布锚点布局、X/Y 关键帧或位置表达式并用；跟随对象自身不能再归入分组或关联数学坐标系。路径本身可以归入分组，跟随位置会使用变换后的路径。

### 轨迹残影

在对象的「属性 → 轨迹残影」选择「开启」，再分别设置时长、采样数、点半径、透明度和颜色。残影位置来自过去的逻辑时刻，不依赖之前是否播放过，因此直接跳转和回拖的画面一致。一个运动点的代码示例：

```ts
scene.nodes.push({
  id: 'trail-dot', type: 'point', name: '带轨迹的点', x: 0, y: 320, radius: 8,
  bindings: { x: '120+60*t' },
  trail: { duration: 2, samples: 12, radius: 4, opacity: 0.55, color: '#ef4444' },
})
```

单个对象最多 24 个采样点，单场景采样总数上限为 96；每次预览或导出都会重新计算这些历史位置。残影只用于展示，不参与画布点选。

### 匹配对象变形

在同一场景中建立两个同类对象，选中起始对象，在「属性 → 匹配对象变形」选择目标，再设置开始、结束时刻和缓动。目标在变形结束前隐藏；结束时起始对象隐藏，显示目标。位置、尺寸、旋转、缩放、透明度、十六进制颜色和路径顶点会逐步插值。两个对象应在同一分组和坐标系中；路径或多边形需有相同数量的顶点。例如：

```ts
scene.nodes.push(
  { id: 'small', type: 'circle', name: '小圆', x: 100, y: 100, radius: 20, fill: '#2563eb',
    matchTransform: { targetId: 'large', start: 1, end: 3, easing: 'easeInOut' } },
  { id: 'large', type: 'circle', name: '大圆', x: 300, y: 200, radius: 80, fill: '#ef4444' },
)
```

### 可复用动画组合

选中对象，在「属性 → 动画组合」选择「淡入并滑入」「脉冲缩放」或「淡出并滑出」，分别设置开始时刻、持续时长和滑动距离或最大缩放倍数，再点击「应用动画组合」。组合会生成普通关键帧轨道，可在时间线上继续编辑。相同组合可以给多个对象分别设置参数；如果该对象的目标属性已有轨道、表达式或位置约束，应用会提示冲突并保持原项目。代码中使用同一生成函数：

```ts
import { applyAnimationCombo } from 'canvas-manim'

applyAnimationCombo(scene, 'small', { kind: 'fadeSlideIn', start: 0, duration: 1.5, amount: 60 })
applyAnimationCombo(scene, 'large', { kind: 'pulse', start: 3, duration: 1, amount: 1.25 })
```

## 编程式创作

在开发服务器打开 `/examples/sdk-demo.html` 可直接试用 SDK。以下示例从可序列化的场景数据创建对象与动画，并通过同一播放器预览：

```ts
import 'canvas-manim/style.css'
import { createBlankProject, mountPlayer, projectToBlob } from 'canvas-manim'

const project = createBlankProject()
const scene = project.scenes[0]
scene.nodes.push({
  id: 'ball', type: 'circle', name: '小球',
  x: 100, y: 150, radius: 24, fill: '#5eead4', bindings: { y: 'height' },
})
scene.nodes.push({ id: 'formula', type: 'formula', name: '位移公式', x: 80, y: 80,
  text: 'x(t)=x_0+vt', fontSize: 28, fill: '#ffffff' })
scene.params.push({ id: 'height', label: '小球高度', value: 150, min: 80, max: 400, step: 10, unit: 'px' })
scene.tracks.push({
  nodeId: 'ball', property: 'x',
  keyframes: [
    { time: 0, value: 100 },
    { time: 2, value: 600, easing: 'easeInOut' },
  ],
})

const player = mountPlayer(document.querySelector('#stage')!, project)
player.setParams({ height: 220 })
player.play()
// projectToBlob(project) 可用于保存；卸载页面前调用 player.destroy()。
```

代码侧可调用 `player.seek(seconds)`、`player.pause()`、`player.step()` 和 `player.setParams({ id: value })`。参数名或数值无效时 `setParams` 会抛出错误，原值保持不变。需要固定嵌入尺寸或初始参数时，使用 `mountPlayer(host, project, { width: 960, height: 540, params: { amp: 1.4 } })`；尺寸按项目的 `fit` 策略适配。将 `projectToBlob(project)` 的结果下载为 `.cmanim`，即可在编辑器打开并继续编辑这些共同支持的对象与轨道。项目只保存数据，无法序列化的 JavaScript 回调会在保存时报错。
