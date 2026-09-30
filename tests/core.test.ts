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
