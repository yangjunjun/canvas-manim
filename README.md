# Canvas Manim

一个面向数学、物理和计算机原理讲解的前端二维动画工具。首版同时提供可视化编辑器和 JavaScript/TypeScript SDK；二者使用同一项目格式、时间求值器和 Canvas 渲染器。

## 本地运行

要求 Node.js 22+、pnpm。项目使用 pnpm 锁文件管理依赖。

```bash
pnpm install
pnpm dev
```

打开终端输出的本地地址进入编辑器；顶部「使用指南」可进入浏览器内的 [图文帮助页](guide.html)，`/examples/sdk-demo.html` 是直接调用 SDK 的示例。这两个页面均会打包到正式构建。构建和测试：

```bash
pnpm test
pnpm build
pnpm run check:sdk
```

浏览器冒烟测试需要本地开发服务器及 Chromium。设置 `CANVAS_MANIM_CHROMIUM` 为本机 Chromium 可执行文件路径后运行 `pnpm test:browser`。
两条创作路径的操作步骤见 [使用指南](docs/usage.md)。

编辑器界面使用 shadcn-vue 的 `a2LKcc4` preset（Reka Mira / Neutral / Inter）与 Tailwind CSS 4。主题配置在 `components.json` 和 `src/shadcn.css`；画布内部的深色配色属于作品内容，不随编辑器主题改变。Inter 字体随构建本地打包，无需在线字体服务。

点击编辑器左侧「模板」图标可打开六个可编辑项目：正弦函数、单位圆、抛体运动、单摆运动、二分查找和冒泡排序。新增三个项目在 SDK 中分别可通过 `templates.unitCircle()`、`templates.pendulum()`、`templates.bubbleSort()` 创建。

## SDK 使用

本仓库开发时可以直接从 `src/sdk.ts` 导入；`pnpm build` 同时生成可供其他前端项目引用的 `dist-lib/` 模块、声明文件和样式。嵌入其他项目时需同时引入 `canvas-manim/style.css`，以加载离线中文字体。

```ts
import 'canvas-manim/style.css'
import { mountPlayer, templates } from 'canvas-manim'

const project = templates.math()
const player = mountPlayer(document.querySelector('#stage')!, project)
player.setParams({ amp: 1.4, freq: 1.2 })
player.seek(3)
player.play()

// 页面卸载时：player.destroy()
```

SDK 还导出 `createBlankProject`、`evaluateScene`、`validateProject`、`projectToBlob`、`projectFromBlob`、`exportPng`、`exportFrames` 和 `exportVideo`。项目默认保存为 `.cmanim` ZIP 包，包含 `project.json` 和可选资产；无图片时也能直接读取项目 JSON。编辑器和代码都可读取共同场景能力。JavaScript 回调无法写入项目文件，不能在编辑器中反向编辑。

表达式支持数字、参数名、`t`、`x`、`pi`、`e`、`+ - * / ^`、括号，以及 `sin`、`cos`、`tan`、`sqrt`、`abs`、`min`、`max` 等常用函数。它采用受限解析器，不执行任意 JavaScript。公式输入采用 TeX 常用数学语法，渲染为 SVG 并绘入 Canvas。

视频导出取决于浏览器的 `MediaRecorder` 能力；当前浏览器不可录制时可导出逐帧 PNG ZIP。首版视频无音轨，逐帧导出限制为 360 帧。详情见 [需求文档](docs/requirements.md) 和 [技术实现文档](docs/technical-design.md)。

当前交付的是可运行的二维 MVP，尚未完成需求文档中的全部 P0 验收；跨浏览器、性能、无障碍、可序列化扩展的只读编辑器界面等边界见 [实现状态](docs/implementation-status.md)。
