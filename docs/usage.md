# 使用指南

初次使用请直接在应用顶部打开 [浏览器内图文指南](../guide.html)，跟着「第一个动画」章节逐步操作。本文保留简明文字版。

编辑器顶部的「图层」「属性」按钮可分别折叠左、右侧栏，让画布获得更多空间。右侧栏有「项目／场景」和「对象属性」两个标签页：前者设置项目名称、场景、画布与参数；选中对象时会自动切到后者。

「项目／场景」中的「画布预置」提供手机竖屏、平板横屏和 PC 视频常用尺寸；选中后会同时设置宽度与高度。也可以直接输入自定义尺寸（每边最大 4096 像素）。

## 可视化创作

1. 执行 `pnpm install`、`pnpm dev`，打开本地地址。选择「新建」或左侧六个数学、物理、算法模板之一。
2. 在左侧「对象图层」选择对象类型；点选对象后，在右侧「对象属性」页修改位置、大小、颜色、文字或公式。画布中的普通对象也可拖动。
3. 要让属性随时间变化，先选中对象，在时间线上选择动画属性，移动播放进度并点击「＋ 关键帧」。可继续修改关键帧时间和值；同一属性已有表达式绑定时须先清除绑定。
4. 在右侧「项目／场景」页的「场景参数」添加参数，设置名称、范围、默认值和单位。选中对象后，可在「对象属性」页的表达式绑定中用参数 ID、`t`（秒）及常用数学函数驱动数值属性。参数滑块可实时预览。
5. 使用播放、下一帧和进度条检查动画；「保存项目」生成 `.cmanim` 文件，「打开」可重新导入。顶部最右侧的「导出作品」下拉菜单提供当前帧 PNG、浏览器支持的视频和逐帧 PNG ZIP。

模板中的运动点等对象由表达式或关键帧控制位置。画布上可以直接点选它们，但右侧受驱动的 X/Y 输入会锁定并显示原因；请到「时间表达式」或时间线修改其运动方式。普通静态对象的 X/Y 可直接编辑。

新增示例包括「单位圆」（调整显示半径和角速度，看正弦/余弦投影）、「单摆运动」（调整摆长、初始摆角和重力加速度；采用小角度近似）、「冒泡排序」（拖动时间线逐次查看相邻数字的比较；虚线框和向下箭头标出当前比较对象，不交换的步骤也会展示）。在左侧「快速开始」点选即可打开；切换前请先保存当前项目。

公式内容使用常见 TeX 数学写法，例如 `x^2+y^2=r^2`。函数曲线对象需关联一个坐标系，表达式中的 `x` 表示横坐标。预览和导出会等待公式、图片与字体资源加载。

## 编程式创作

在开发服务器打开 `/examples/sdk-demo.html` 可直接试用 SDK。以下示例从可序列化的场景数据创建对象与动画，并通过同一播放器预览：

```ts
import 'canvas-manim/style.css'
import { createBlankProject, mountPlayer, projectToBlob } from 'canvas-manim'

const project = createBlankProject()
const scene = project.scenes[0]
scene.nodes.push({
  id: 'ball', type: 'circle', name: '小球',
  x: 100, y: 150, radius: 24, fill: '#5eead4',
})
scene.tracks.push({
  nodeId: 'ball', property: 'x',
  keyframes: [
    { time: 0, value: 100 },
    { time: 2, value: 600, easing: 'easeInOut' },
  ],
})

const player = mountPlayer(document.querySelector('#stage')!, project)
player.play()
// projectToBlob(project) 可用于保存；卸载页面前调用 player.destroy()。
```

代码侧可调用 `player.seek(seconds)`、`player.pause()`、`player.step()` 和 `player.setParams({ id: value })`。将 `projectToBlob(project)` 的结果下载为 `.cmanim`，即可在编辑器打开并继续编辑这些共同支持的对象与轨道。项目只保存数据，不会保存任意 JavaScript 回调。
