import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateExpression } from '../src/core/expression.ts'
import { evaluateScene, validateProject } from '../src/core/engine.ts'
import { resolveExportRange } from '../src/core/export.ts'
import { projectFromBlob, projectToBlob } from '../src/core/project-file.ts'
import { createBlankProject, templates } from '../src/core/templates.ts'

test('表达式支持受限数学运算并拒绝任意代码', () => {
  assert.equal(evaluateExpression('2^3 + sin(pi/2)', {}), 9)
  assert.equal(evaluateExpression('-2^2', {}), -4)
  assert.throws(() => evaluateExpression('window.alert(1)', {}))
  assert.throws(() => evaluateExpression('unknown+1', {}), /未知变量/)
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
    for (const time of [0, project.scenes[0].duration / 2, project.scenes[0].duration]) {
      assert.ok(evaluateScene(project.scenes[0], time).nodes.length > 0, `${key} at ${time}s`)
    }
    assert.deepEqual(await projectFromBlob(projectToBlob(project)), project, key)
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
