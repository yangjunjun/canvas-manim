import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateExpression } from '../src/core/expression.ts'
import { evaluateScene, validateProject } from '../src/core/engine.ts'
import { transformedNodes } from '../src/core/renderer.ts'
import { hitTestScene, selectionBounds } from '../src/core/hit-test.ts'
import { removeNodeFromScene } from '../src/core/scene-mutations.ts'
import { samplePlot } from '../src/core/plot.ts'
import { applyAnimationCombo } from '../src/core/animation-combos.ts'
import { resolveExportRange } from '../src/core/export.ts'
import { projectFromBlob, projectToBlob } from '../src/core/project-file.ts'
import { createShareUrl, readShareUrl } from '../src/core/share.ts'
import { createBlankProject, templates } from '../src/core/templates.ts'

test('表达式支持受限数学运算并拒绝任意代码', () => {
  assert.equal(evaluateExpression('2^3 + sin(pi/2)', {}), 9)
  assert.equal(evaluateExpression('-2^2', {}), -4)
  assert.throws(() => evaluateExpression('window.alert(1)', {}))
  assert.throws(() => evaluateExpression('unknown+1', {}), /未知变量/)
})

test('函数采样在阶跃、极点和定义域空洞处断线，连续曲线保持连通', () => {
  const linear = samplePlot('x*x', {}, 0, [-2, 2], [-5, 5], 400, 400)
  assert.equal(linear.segments.length, 1)
  const steps = samplePlot('floor(x)', {}, 0, [-2, 2], [-5, 5], 401, 400)
  assert.ok(steps.segments.length >= 3)
  assert.ok(steps.segments.every(segment => segment.every(([x, y]) => y === Math.floor(x))))
  const pole = samplePlot('1/(x-0.13)', {}, 0, [-1, 1], [-5, 5], 400, 400)
  assert.ok(pole.segments.length >= 2)
  const domain = samplePlot('sqrt(x)', {}, 0, [-1, 1], [-5, 5], 400, 400)
  assert.equal(domain.segments.length, 1)
  assert.ok(domain.segments[0][0][0] >= 0)
  assert.match(samplePlot('missing*x', {}, 0, [-1, 1], [-5, 5], 100, 400).error?.message ?? '', /未知变量/)
})

test('导出时间段校验与可见性轨道求值', () => {
  assert.deepEqual(resolveExportRange(8), { start: 0, end: 8 })
  assert.deepEqual(resolveExportRange(8, { start: 2, end: 5 }), { start: 2, end: 5 })
  for (const range of [{ start: -1, end: 4 }, { start: 4, end: 4 }, { start: 7, end: 9 }]) {
    assert.throws(() => resolveExportRange(8, range), /导出时间范围/)
  }
  const project = createBlankProject()
  const scene = project.scenes[0]
  scene.nodes.push({ id: 'shape', type: 'circle', name: '圆', x: 10, y: 20, radius: 5 })
  scene.tracks.push({ nodeId: 'shape', property: 'visible', keyframes: [
    { time: 0, value: false, easing: 'step' }, { time: 2, value: true, easing: 'step' },
  ] })
  validateProject(project)
  assert.equal(evaluateScene(scene, 1).nodes[0].visible, false)
  assert.equal(evaluateScene(scene, 2).nodes[0].visible, true)
  scene.tracks[0].keyframes[1].value = 'true'
  assert.throws(() => validateProject(project), /可见性无效/)
})

test('十六进制颜色轨道在中间时刻按 sRGB 通道插值', () => {
  const scene = createBlankProject().scenes[0]
  scene.nodes.push({ id: 'shape', type: 'circle', name: '圆', x: 0, y: 0, radius: 5, fill: '#000000' })
  scene.tracks.push({ nodeId: 'shape', property: 'fill', keyframes: [
    { time: 0, value: '#000000', easing: 'linear' }, { time: 2, value: '#ffffff' },
  ] })
  assert.equal(evaluateScene(scene, 1).nodes[0].fill, '#808080')
  scene.tracks[0].keyframes[0].easing = 'step'
  assert.equal(evaluateScene(scene, 1).nodes[0].fill, '#000000')
})

test('路径顶点必须为有限坐标，多边形至少三个顶点', () => {
  const project = createBlankProject()
  const node = { id: 'polygon', type: 'polygon' as const, name: '多边形', x: 0, y: 0, points: [[0, 0], [10, 0], [0, 10]] as Array<[number, number]> }
  project.scenes[0].nodes.push(node)
  validateProject(project)
  node.points.pop()
  assert.throws(() => validateProject(project), /顶点无效/)
  node.points.push([Number.NaN, 10])
  assert.throws(() => validateProject(project), /顶点无效/)
})

test('导入损坏的场景项和轨道项返回可定位错误', () => {
  const project = createBlankProject()
  project.scenes[0].nodes = [null] as unknown as typeof project.scenes[0]['nodes']
  assert.throws(() => validateProject(project), /场景.*对象无效/)
  project.scenes[0].nodes = []
  project.scenes[0].tracks = [{ nodeId: 'lost', property: 'x' }] as unknown as typeof project.scenes[0]['tracks']
  assert.throws(() => validateProject(project), /轨道.*无效/)
  project.scenes[0].tracks = []
  project.scenes[0].nodes = [{ id: 'image', type: 'image', name: '图片', x: 0, y: 0, assetId: 'lost' }]
  assert.throws(() => validateProject(project), /图片资源引用无效/)
})

test('扩展数据往返保留，运行时回调和循环引用给出明确保存错误', async () => {
  const project = createBlankProject()
  project.extensions = { 'example.notes': { tags: ['math', 'teaching'], version: 2 } }
  assert.deepEqual((await projectFromBlob(projectToBlob(project))).extensions, project.extensions)
  project.extensions = { callback: () => 1 }
  assert.throws(() => projectToBlob(project), /无法序列化的运行时数据/)
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  project.extensions = { cyclic }
  assert.throws(() => projectToBlob(project), /循环引用/)
})

test('分享链接可复现项目、场景、参数和播放时刻', () => {
  const project = templates.math()
  project.extensions = { 'example.note': '正弦曲线教学' }
  const state = { project, sceneId: project.scenes[0].id, params: { amp: 1.4, freq: 1.2 }, time: 2.5 }
  const url = createShareUrl(state, 'https://example.test/canvas-manim/?source=class#old')
  assert.match(url, /^https:\/\/example\.test\/canvas-manim\/\?source=class#cmanim=v1\./)
  assert.deepEqual(readShareUrl(url), state)
  assert.equal(readShareUrl('https://example.test/canvas-manim/#other'), null)
  assert.throws(() => readShareUrl('https://example.test/#cmanim=v2.abc'), /不支持的分享链接版本/)
  assert.throws(() => readShareUrl('https://example.test/#cmanim=v1.!'), /链接编码无效/)
  assert.throws(() => createShareUrl({ ...state, time: 99 }, 'https://example.test/'), /播放时刻超出/)
  assert.throws(() => createShareUrl({ ...state, params: { amp: 99 } }, 'https://example.test/'), /超出范围/)
  project.extensions = { large: 'A'.repeat(30_000) }
  assert.throws(() => createShareUrl(state, 'https://example.test/'), /大小上限/)
})

test('画布锚点布局随画布尺寸确定性调整，并拒绝位置双重驱动', async () => {
  const project = createBlankProject()
  const scene = project.scenes[0]
  scene.nodes.push({ id: 'anchored', type: 'circle', name: '锚定圆', x: 0, y: 0, radius: 10,
    layout: { anchorX: 'center', anchorY: 'bottom', offsetX: 15, offsetY: -20 } })
  validateProject(project)
  const initial = evaluateScene(scene, 2, {}, { canvas: project.canvas }).nodes[0]
  assert.deepEqual([initial.x, initial.y], [655, 700])
  project.canvas.width = 1920; project.canvas.height = 1080
  const resized = evaluateScene(scene, 2, {}, { canvas: project.canvas }).nodes[0]
  assert.deepEqual([resized.x, resized.y], [975, 1060])
  assert.equal(scene.nodes[0].x, 0, '求值不得修改保存的静态数据')
  assert.deepEqual((await projectFromBlob(projectToBlob(project))).scenes[0].nodes[0].layout, scene.nodes[0].layout)
  assert.throws(() => evaluateScene(scene, 2), /需提供画布配置/)
  scene.tracks.push({ nodeId: 'anchored', property: 'x', keyframes: [{ time: 0, value: 5 }] })
  assert.throws(() => validateProject(project), /不能与位置轨道同时使用/)
})

test('路径跟随按弧长取点、可由时间表达式驱动并沿切线旋转', async () => {
  const project = createBlankProject()
  const scene = project.scenes[0]
  scene.nodes.push(
    { id: 'route', type: 'path', name: '折线路径', x: 10, y: 20, points: [[0, 0], [100, 0], [100, 100]] },
    { id: 'dot', type: 'point', name: '运动点', x: 0, y: 0, radius: 5,
      followPath: { pathId: 'route', progress: 0, progressExpression: 't/8', orient: true, offsetX: 5, offsetY: -5 } },
  )
  validateProject(project)
  const quarter = evaluateScene(scene, 2).nodes[1]
  assert.deepEqual([quarter.x, quarter.y, quarter.rotation], [65, 15, 0])
  const threeQuarters = evaluateScene(scene, 6).nodes[1]
  assert.ok(Math.abs(threeQuarters.x - 115) < 1e-10)
  assert.ok(Math.abs(threeQuarters.y - 65) < 1e-10)
  assert.ok(Math.abs(threeQuarters.rotation! - Math.PI / 2) < 1e-10)
  assert.deepEqual((await projectFromBlob(projectToBlob(project))).scenes[0].nodes[1].followPath, scene.nodes[1].followPath)
  scene.nodes.unshift({ id: 'group', type: 'group', name: '旋转分组', x: 100, y: 0, rotation: Math.PI / 2 })
  scene.nodes.find(node => node.id === 'route')!.parentId = 'group'
  const grouped = evaluateScene(scene, 2).nodes.find(node => node.id === 'dot')!
  assert.ok(Math.abs(grouped.x - 85) < 1e-10)
  assert.ok(Math.abs(grouped.y - 55) < 1e-10)
  assert.ok(Math.abs(grouped.rotation! - Math.PI / 2) < 1e-10)
  scene.nodes.find(node => node.id === 'dot')!.followPath!.pathId = 'missing'
  assert.throws(() => validateProject(project), /跟随路径不存在/)
})

test('轨迹残影由历史逻辑时刻计算，跳转顺序不影响结果', async () => {
  const project = createBlankProject()
  const scene = project.scenes[0]
  scene.nodes.push({ id: 'ball', type: 'circle', name: '运动球', x: 0, y: 100, radius: 8,
    bindings: { x: '100+20*t' }, trail: { duration: 2, samples: 2, radius: 4, opacity: 0.6, color: '#ff0000' } })
  validateProject(project)
  const direct = evaluateScene(scene, 2)
  evaluateScene(scene, 5)
  assert.deepEqual(evaluateScene(scene, 2).trails, direct.trails)
  assert.deepEqual(direct.trails?.[0].points.map(point => [point.x, point.y]), [[100, 100], [120, 100]])
  assert.equal(direct.nodes[0].x, 140)
  assert.deepEqual((await projectFromBlob(projectToBlob(project))).scenes[0].nodes[0].trail, scene.nodes[0].trail)
  scene.nodes[0].trail!.samples = 25
  assert.throws(() => validateProject(project), /轨迹残影配置无效/)
})

test('匹配对象在指定区间过渡形态、位置和颜色，并在结束时交接可见性', async () => {
  const project = createBlankProject(), scene = project.scenes[0]
  scene.nodes.push(
    { id: 'from', type: 'polygon', name: '初始', x: 100, y: 100, fill: '#000000', points: [[0, 0], [20, 0], [0, 20]], matchTransform: { targetId: 'to', start: 1, end: 3, easing: 'linear' } },
    { id: 'to', type: 'polygon', name: '目标', x: 300, y: 200, fill: '#ffffff', points: [[0, 0], [60, 0], [0, 60]] },
  )
  validateProject(project)
  assert.equal(evaluateScene(scene, 0).nodes[1].visible, false)
  const halfway = evaluateScene(scene, 2).nodes
  assert.deepEqual([halfway[0].x, halfway[0].y, halfway[0].fill, halfway[0].points], [200, 150, '#808080', [[0, 0], [40, 0], [0, 40]]])
  assert.equal(halfway[1].visible, false)
  const finished = evaluateScene(scene, 3).nodes
  assert.equal(finished[0].visible, false)
  assert.notEqual(finished[1].visible, false)
  assert.deepEqual((await projectFromBlob(projectToBlob(project))).scenes[0].nodes[0].matchTransform, scene.nodes[0].matchTransform)
  scene.nodes[1].points!.push([60, 60])
  assert.throws(() => validateProject(project), /顶点数量不同/)
})

test('动画组合可复用于不同对象，参数独立且不覆盖已有轨道', () => {
  const project = createBlankProject(), scene = project.scenes[0]
  scene.nodes.push(
    { id: 'a', type: 'circle', name: 'A', x: 100, y: 200, radius: 10 },
    { id: 'b', type: 'circle', name: 'B', x: 200, y: 300, radius: 10 },
  )
  applyAnimationCombo(scene, 'a', { kind: 'fadeSlideIn', start: 1, duration: 2, amount: 80 })
  applyAnimationCombo(scene, 'b', { kind: 'fadeSlideIn', start: 2, duration: 4, amount: 40 })
  validateProject(project)
  const a = evaluateScene(scene, 2).nodes[0], b = evaluateScene(scene, 4).nodes[1]
  assert.deepEqual([a.y, a.opacity], [240, 0.5])
  assert.deepEqual([b.y, b.opacity], [320, 0.5])
  assert.throws(() => applyAnimationCombo(scene, 'a', { kind: 'fadeSlideOut', start: 4, duration: 2, amount: 30 }), /已有动画或约束/)
  applyAnimationCombo(scene, 'a', { kind: 'pulse', start: 4, duration: 2, amount: 1.5 })
  assert.equal(evaluateScene(scene, 5).nodes[0].scale, 1.5)
  assert.equal(evaluateScene(scene, 6).nodes[0].scale, 1)
  assert.throws(() => applyAnimationCombo(scene, 'b', { kind: 'pulse', start: 7, duration: 2, amount: 1.2 }), /参数无效/)
})

test('分组显隐与透明度作用到所有子对象和选区', () => {
  const project = createBlankProject(), scene = project.scenes[0]
  scene.nodes.push(
    { id: 'group', type: 'group', name: '分组', x: 100, y: 100, opacity: 0.5, visible: true },
    { id: 'nested', type: 'group', name: '内层分组', x: 30, y: 0, parentId: 'group', opacity: 0.4 },
    { id: 'dot', type: 'circle', name: '子对象', x: 20, y: 0, parentId: 'nested', radius: 12, opacity: 0.5,
      trail: { duration: 1, samples: 2, radius: 4, opacity: 0.5 } },
  )
  validateProject(project)
  const state = evaluateScene(scene, 0)
  const dot = transformedNodes(state.nodes).find(node => node.id === 'dot')!
  assert.deepEqual([dot.x, dot.y, dot.opacity, dot.visible], [150, 100, 0.1, true])
  assert.equal(hitTestScene(state, 150, 100)?.id, 'dot')
  scene.nodes[0].visible = false
  const hidden = evaluateScene(scene, 0)
  assert.equal(transformedNodes(hidden.nodes).find(node => node.id === 'dot')?.visible, false)
  assert.equal(hitTestScene(hidden, 150, 100), null)
  assert.equal(selectionBounds(hidden, 'dot'), null)
  assert.deepEqual(hidden.trails, [])
  scene.nodes[0].visible = true
  scene.nodes[0].opacity = 0
  assert.equal(transformedNodes(evaluateScene(scene, 0).nodes).find(node => node.id === 'dot')?.opacity, 0)
})

test('删除分组会移除子树和依赖坐标系的曲线，保留对象不会悬空引用', () => {
  const project = createBlankProject(), scene = project.scenes[0]
  scene.nodes.push(
    { id: 'group', type: 'group', name: '分组', x: 0, y: 0 },
    { id: 'route', type: 'path', name: '子路径', x: 0, y: 0, parentId: 'group', points: [[0, 0], [20, 0]] },
    { id: 'axes', type: 'axes', name: '子坐标系', x: 0, y: 0, parentId: 'group', width: 100, height: 100 },
    { id: 'curve', type: 'plot', name: '曲线', x: 0, y: 0, axesId: 'axes', expression: 'x' },
    { id: 'dot', type: 'point', name: '运动点', x: 0, y: 0, radius: 5, axesId: 'axes' },
    { id: 'follower', type: 'circle', name: '跟随者', x: 0, y: 0, radius: 5,
      followPath: { pathId: 'route', progress: 0.5, offsetX: 0, offsetY: 0 } },
  )
  scene.tracks.push({ nodeId: 'route', property: 'opacity', keyframes: [{ time: 0, value: 1 }] })
  validateProject(project)
  removeNodeFromScene(scene, 'group')
  validateProject(project)
  assert.deepEqual(scene.nodes.map(node => node.id), ['dot', 'follower'])
  assert.equal(scene.nodes[0].axesId, undefined)
  assert.equal(scene.nodes[1].followPath, undefined)
  assert.deepEqual(scene.tracks, [])
  scene.nodes.push(
    { id: 'source', type: 'circle', name: '起始', x: 0, y: 0, radius: 5,
      matchTransform: { targetId: 'destination', start: 0, end: 1, easing: 'linear' } },
    { id: 'destination', type: 'circle', name: '目标', x: 10, y: 10, radius: 10 },
  )
  validateProject(project)
  removeNodeFromScene(scene, 'destination')
  validateProject(project)
  assert.equal(scene.nodes.find(node => node.id === 'source')?.matchTransform, undefined)
})

test('代码创建的分组、路径、图片、参数、时间线和扩展数据可在项目文件往返', async () => {
  const project = createBlankProject()
  project.assets.push({ id: 'pixel', name: '像素', mime: 'image/png', data: 'AQID' })
  project.extensions = { 'example.meta': { author: 'SDK', version: 1 } }
  const scene = project.scenes[0]
  scene.params.push({ id: 'distance', label: '距离', value: 10, min: 0, max: 100, step: 1, unit: 'px' })
  scene.nodes.push(
    { id: 'group', type: 'group', name: '分组', x: 50, y: 60 },
    { id: 'path', type: 'path', name: '路径', x: 0, y: 0, parentId: 'group', points: [[0, 0], [30, 20]], bindings: { x: 'distance+t' } },
    { id: 'polygon', type: 'polygon', name: '多边形', x: 20, y: 20, points: [[0, 0], [20, 0], [10, 20]], fill: '#ff0000' },
    { id: 'image', type: 'image', name: '图片', x: 100, y: 100, assetId: 'pixel', width: 10, height: 10 },
  )
  scene.tracks.push(
    { nodeId: 'polygon', property: 'fill', keyframes: [{ time: 0, value: '#ff0000' }, { time: 2, value: '#0000ff' }] },
    { nodeId: 'image', property: 'visible', keyframes: [{ time: 0, value: false }, { time: 1, value: true }] },
  )
  const loaded = await projectFromBlob(projectToBlob(project))
  assert.deepEqual(loaded, project)
  assert.equal(evaluateScene(loaded.scenes[0], 1, { distance: 20 }).nodes.find(node => node.id === 'path')?.x, 21)
  assert.equal(evaluateScene(loaded.scenes[0], 1).nodes.find(node => node.id === 'polygon')?.fill, '#800080')
  assert.equal(evaluateScene(loaded.scenes[0], 1).nodes.find(node => node.id === 'image')?.visible, true)
})

test('单个对象表达式失败时可报告并继续求值其余对象，修复后恢复', () => {
  const scene = createBlankProject().scenes[0]
  scene.nodes.push(
    { id: 'broken', type: 'circle', name: '错误对象', x: 10, y: 20, radius: 5, bindings: { x: 'unknown+1' } },
    { id: 'working', type: 'circle', name: '正常对象', x: 30, y: 40, radius: 5, bindings: { x: 't+30' } },
  )
  const errors: string[] = []
  const result = evaluateScene(scene, 2, {}, error => errors.push(error.message))
  assert.match(errors[0], /错误对象.*x 表达式.*未知变量/)
  assert.equal(result.nodes[1].x, 32)
  scene.nodes[0].bindings!.x = 't+10'
  errors.length = 0
  assert.equal(evaluateScene(scene, 2, {}, error => errors.push(error.message)).nodes[0].x, 12)
  assert.deepEqual(errors, [])
})

test('同一时刻的场景状态与访问路径无关', () => {
  const scene = templates.math().scenes[0]
  const a = evaluateScene(scene, 4, { amp: 1.5, freq: 2 })
  evaluateScene(scene, 7, { amp: 1.5, freq: 2 })
  const b = evaluateScene(scene, 4, { amp: 1.5, freq: 2 })
  assert.deepEqual(a.nodes, b.nodes)
  assert.equal(a.nodes.find(node => node.id === 'dot')?.x, 0)
  assert.equal(a.nodes.find(node => node.id === 'reading')?.text, 'f(x) = 0.000')
})

test('抛体运动与二分查找模板的关键状态正确', () => {
  const physics = templates.physics().scenes[0]
  const atTwo = evaluateScene(physics, 2)
  const ball = atTwo.nodes.find(node => node.id === 'ball')!
  assert.ok(Math.abs(ball.x - 12 * Math.cos(0.7)) < 1e-10)
  assert.ok(Math.abs(ball.y - (12 * Math.sin(0.7) - 2)) < 1e-10)
  const binary = templates.binary().scenes[0]
  assert.equal(evaluateScene(binary, 4).nodes.find(node => node.id === 'cell-5')?.fill, '#22c55e')
  assert.equal(evaluateScene(binary, 4).nodes.find(node => node.id === 'step')?.text, '找到目标 23，索引为 5')
})

test('六个内置项目均可校验、求值与保存', async () => {
  for (const [key, create] of Object.entries(templates)) {
    const project = create()
    assert.equal(validateProject(project), project, key)
    const loaded = await projectFromBlob(projectToBlob(project))
    assert.deepEqual(loaded, project, key)
    for (const time of [0, project.scenes[0].duration / 2, project.scenes[0].duration]) for (const edge of ['min', 'value', 'max'] as const) {
      const params = Object.fromEntries(project.scenes[0].params.map(param => [param.id, param[edge]]))
      const before = evaluateScene(project.scenes[0], time, params, { canvas: project.canvas })
      const after = evaluateScene(loaded.scenes[0], time, params, { canvas: loaded.canvas })
      assert.ok(before.nodes.length > 0, `${key} at ${time}s`)
      assert.deepEqual(after.nodes, before.nodes, `${key} at ${time}s with ${edge} parameters`)
      assert.deepEqual(after.trails, before.trails, `${key} trails at ${time}s`)
    }
  }
})

test('单位圆投影与单摆周期随参数正确变化', () => {
  const circle = templates.unitCircle().scenes[0]
  const quarterTurn = evaluateScene(circle, Math.PI / 2, { speed: 1, r: 200 })
  const dot = quarterTurn.nodes.find(node => node.id === 'dot')!
  assert.ok(Math.abs(dot.x - 420) < 1e-10)
  assert.ok(Math.abs(dot.y - 190) < 1e-10)
  assert.equal(quarterTurn.nodes.find(node => node.id === 'sin-value')?.text, 'sin θ = 1.000')
  const scene = templates.pendulum().scenes[0]
  const initial = evaluateScene(scene, 0)
  const halfPeriod = evaluateScene(scene, Math.PI * Math.sqrt(2 / 9.8))
  assert.ok(initial.nodes.find(node => node.id === 'bob')!.x > 420)
  assert.ok(halfPeriod.nodes.find(node => node.id === 'bob')!.x < 420)
  assert.equal(initial.nodes.find(node => node.id === 'period')?.text, '周期 T ≈ 2.84 s')
  assert.ok(Number(evaluateScene(scene, 0, { length: 2.5 }).nodes.find(node => node.id === 'period')!.text!.match(/[\d.]+/)![0]) > 2.84)
})

test('冒泡排序逐次展示所有比较、判断与移动标记', () => {
  const scene = validateProject(templates.bubbleSort()).scenes[0]
  const comparisons = [
    [5, 2, true], [5, 8, false], [8, 1, true], [8, 6, true],
    [2, 5, false], [5, 1, true], [5, 6, false],
    [2, 1, true], [2, 5, false], [1, 2, false],
  ] as const
  const order = [5, 2, 8, 1, 6]
  comparisons.forEach(([left, right, swapped], index) => {
    const time = index * 1.6
    const leftSlot = order.indexOf(left), rightSlot = order.indexOf(right)
    const comparing = evaluateScene(scene, time + 0.1)
    assert.equal(comparing.nodes.find(node => node.id === 'step')?.text, `第 ${index + 1} 次比较：${left} 和 ${right}`)
    for (const [side, value, slot] of [['left', left, leftSlot], ['right', right, rightSlot]] as const) {
      const box = comparing.nodes.find(node => node.id === `compare-box-${side}`)!
      const arrow = comparing.nodes.find(node => node.id === `compare-arrow-${side}`)!
      assert.equal(box.x, 162 + slot * 205)
      assert.equal(box.y, 521 - value * 38)
      assert.equal(box.opacity, 1)
      assert.deepEqual(box.lineDash, [8, 6])
      assert.equal(arrow.x2, box.x + 32)
      assert.equal(arrow.y2, box.y - 12)
      assert.equal(arrow.opacity, 1)
    }
    const result = evaluateScene(scene, time + 1.4)
    assert.equal(result.nodes.find(node => node.id === 'step')?.text, swapped ? `${left} > ${right}，交换位置` : `${left} ≤ ${right}，不交换，继续比较`)
    if (swapped) [order[leftSlot], order[rightSlot]] = [right, left]
    assert.equal(result.nodes.find(node => node.id === `bar-${left}`)?.x, 125 + order.indexOf(left) * 205)
    assert.equal(result.nodes.find(node => node.id === `bar-${right}`)?.x, 125 + order.indexOf(right) * 205)
    assert.equal(result.nodes.find(node => node.id === 'compare-box-left')?.x, 162 + order.indexOf(left) * 205)
    assert.equal(result.nodes.find(node => node.id === 'compare-box-right')?.x, 162 + order.indexOf(right) * 205)
  })
  const sorted = evaluateScene(scene, scene.duration)
  const values = [1, 2, 5, 6, 8]
  values.forEach((value, index) => {
    assert.equal(sorted.nodes.find(node => node.id === `bar-${value}`)?.x, 125 + index * 205)
    assert.equal(sorted.nodes.find(node => node.id === `value-${value}`)?.x, 179 + index * 205)
  })
  assert.match(sorted.nodes.find(node => node.id === 'step')?.text ?? '', /排序完成/)
  assert.equal(sorted.nodes.find(node => node.id === 'compare-box-left')?.opacity, 0)
  assert.equal(sorted.nodes.find(node => node.id === 'compare-arrow-right')?.opacity, 0)
})

test('场景格式拒绝冲突驱动和父子循环', () => {
  const project = createBlankProject()
  project.scenes[0].nodes.push({ id: 'a', type: 'point', name: 'A', x: 0, y: 0, bindings: { x: 't' } })
  project.scenes[0].tracks.push({ nodeId: 'a', property: 'x', keyframes: [{ time: 0, value: 0 }] })
  assert.throws(() => validateProject(project), /多个驱动来源/)
  project.scenes[0].tracks = []
  project.scenes[0].nodes[0].parentId = 'a'
  assert.throws(() => validateProject(project), /父级无效/)
  project.scenes[0].nodes[0].parentId = undefined
  project.scenes[0].nodes[0].lineDash = [8, -1]
  assert.throws(() => validateProject(project), /虚线样式无效/)
})

test('代码与编辑器共用的项目包可往返且保留扩展数据', async () => {
  const project = templates.math()
  project.extensions = { 'sample:note': { author: 'test' } }
  project.assets.push({ id: 'asset_1', mime: 'image/png', name: 'pixel.png', data: 'iVBORw0KGgo=' })
  const loaded = await projectFromBlob(projectToBlob(project))
  assert.deepEqual(loaded, project)
  const fromJson = await projectFromBlob(new Blob([JSON.stringify(createBlankProject())]))
  assert.equal(fromJson.schemaVersion, 1)
})
