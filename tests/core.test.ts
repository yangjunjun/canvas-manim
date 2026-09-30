import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateExpression } from '../src/core/expression.ts'
import { evaluateScene, validateProject } from '../src/core/engine.ts'
import { projectFromBlob, projectToBlob } from '../src/core/project-file.ts'
import { createBlankProject, templates } from '../src/core/templates.ts'

test('表达式支持受限数学运算并拒绝任意代码', () => {
  assert.equal(evaluateExpression('2^3 + sin(pi/2)', {}), 9)
  assert.equal(evaluateExpression('-2^2', {}), -4)
  assert.throws(() => evaluateExpression('window.alert(1)', {}))
  assert.throws(() => evaluateExpression('unknown+1', {}), /未知变量/)
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

test('冒泡排序结束时柱形与数值标签按升序排列', () => {
  const scene = templates.bubbleSort().scenes[0]
  const sorted = evaluateScene(scene, scene.duration)
  const values = [1, 2, 5, 6, 8]
  values.forEach((value, index) => {
    assert.equal(sorted.nodes.find(node => node.id === `bar-${value}`)?.x, 125 + index * 205)
    assert.equal(sorted.nodes.find(node => node.id === `value-${value}`)?.x, 179 + index * 205)
  })
  assert.match(sorted.nodes.find(node => node.id === 'step')?.text ?? '', /排序完成/)
})

test('场景格式拒绝冲突驱动和父子循环', () => {
  const project = createBlankProject()
  project.scenes[0].nodes.push({ id: 'a', type: 'point', name: 'A', x: 0, y: 0, bindings: { x: 't' } })
  project.scenes[0].tracks.push({ nodeId: 'a', property: 'x', keyframes: [{ time: 0, value: 0 }] })
  assert.throws(() => validateProject(project), /多个驱动来源/)
  project.scenes[0].tracks = []
  project.scenes[0].nodes[0].parentId = 'a'
  assert.throws(() => validateProject(project), /父级无效/)
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
