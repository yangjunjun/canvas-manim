import { evaluateExpression } from './expression.ts'
import type { EvaluatedScene, Keyframe, Parameter, Project, Scene, SceneNode, Track } from './types.ts'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const nodeTypes = new Set(['group', 'circle', 'rect', 'line', 'arrow', 'text', 'formula', 'axes', 'plot', 'point', 'polygon', 'path', 'image'])
const trackable = new Set(['x', 'y', 'x2', 'y2', 'width', 'height', 'radius', 'rotation', 'scale', 'opacity', 'fill', 'stroke', 'lineWidth', 'fontSize', 'text', 'visible'])
const numeric = new Set(['x', 'y', 'x2', 'y2', 'width', 'height', 'radius', 'rotation', 'scale', 'opacity', 'lineWidth', 'fontSize'])

export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('项目文件不是对象')
  const project = value as Project
  if (project.schemaVersion !== 1) throw new Error(`不支持的项目版本：${String(project.schemaVersion)}`)
  if (!project.canvas || !Number.isFinite(project.canvas.width) || !Number.isFinite(project.canvas.height) || project.canvas.width <= 0 || project.canvas.height <= 0 || project.canvas.width > 4096 || project.canvas.height > 4096 || !['contain', 'cover'].includes(project.canvas.fit)) throw new Error('画布尺寸或适配方式无效（尺寸上限 4096）')
  if (!Array.isArray(project.scenes) || !project.scenes.length || !Array.isArray(project.assets)) throw new Error('项目缺少场景或资源清单')
  const sceneIds = new Set<string>()
  for (const scene of project.scenes) {
    if (!scene.id || sceneIds.has(scene.id) || !Number.isFinite(scene.duration) || scene.duration <= 0) throw new Error('场景 ID 或时长无效')
    sceneIds.add(scene.id)
    if (!Array.isArray(scene.nodes) || !Array.isArray(scene.tracks) || !Array.isArray(scene.params)) throw new Error(`场景 ${scene.id} 结构无效`)
    const ids = new Set<string>()
    for (const node of scene.nodes) {
      if (!node.id || ids.has(node.id) || !nodeTypes.has(node.type) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error(`场景 ${scene.id} 的对象无效或 ID 重复`)
      if (node.scale !== undefined && (!Number.isFinite(node.scale) || node.scale <= 0)) throw new Error(`对象 ${node.id} 的缩放无效`)
      if (node.opacity !== undefined && (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1)) throw new Error(`对象 ${node.id} 的透明度无效`)
      if (node.radius !== undefined && (!Number.isFinite(node.radius) || node.radius < 0)) throw new Error(`对象 ${node.id} 的半径无效`)
      if (node.x2 !== undefined && !Number.isFinite(node.x2) || node.y2 !== undefined && !Number.isFinite(node.y2)) throw new Error(`对象 ${node.id} 的终点无效`)
      for (const range of [node.xRange, node.yRange]) if (range && (range.length !== 2 || !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0] >= range[1])) throw new Error(`对象 ${node.id} 的坐标范围无效`)
      ids.add(node.id)
    }
    for (const node of scene.nodes) {
      if (node.parentId && (!ids.has(node.parentId) || node.parentId === node.id || scene.nodes.find(item => item.id === node.parentId)?.type !== 'group')) throw new Error(`对象 ${node.id} 的父级无效`)
      if (node.axesId && scene.nodes.find(item => item.id === node.axesId)?.type !== 'axes') throw new Error(`对象 ${node.id} 的关联坐标系无效`)
      const seen = new Set([node.id])
      let parent = node.parentId
      while (parent) {
        if (seen.has(parent)) throw new Error(`对象 ${node.id} 存在父级循环`)
        seen.add(parent)
        parent = scene.nodes.find(item => item.id === parent)?.parentId
      }
    }
    const driven = new Set<string>()
    for (const node of scene.nodes) for (const property of Object.keys(node.bindings ?? {})) {
      if (!numeric.has(property)) throw new Error(`对象 ${node.id} 的绑定属性 ${property} 不支持`)
      driven.add(`${node.id}.${property}`)
    }
    for (const track of scene.tracks) {
      if (!ids.has(track.nodeId) || !trackable.has(track.property) || !track.keyframes.length) throw new Error(`轨道 ${track.nodeId} 无效`)
      const key = `${track.nodeId}.${track.property}`
      if (driven.has(key)) throw new Error(`属性 ${key} 有多个驱动来源`)
      driven.add(key)
      let previous = -1
      for (const frame of track.keyframes) {
        if (!Number.isFinite(frame.time) || frame.time < 0 || frame.time > scene.duration || frame.time <= previous) throw new Error(`轨道 ${key} 的关键帧时间无效`)
        if (numeric.has(track.property) && (typeof frame.value !== 'number' || !Number.isFinite(frame.value))) throw new Error(`轨道 ${key} 的数值无效`)
        if (['fill', 'stroke', 'text'].includes(track.property) && typeof frame.value !== 'string') throw new Error(`轨道 ${key} 的文本或颜色无效`)
        previous = frame.time
      }
    }
    const paramIds = new Set<string>()
    for (const param of scene.params) {
      if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(param.id) || ['t', 'x', 'pi', 'e'].includes(param.id) || paramIds.has(param.id) || !Number.isFinite(param.value) || !Number.isFinite(param.min) || !Number.isFinite(param.max) || !Number.isFinite(param.step) || param.step <= 0 || param.min > param.max || param.value < param.min || param.value > param.max) throw new Error(`参数 ${param.id} 无效`)
      paramIds.add(param.id)
    }
  }
  return project
}

function interpolate(frames: Keyframe[], time: number): Keyframe['value'] {
  if (time <= frames[0].time) return frames[0].value
  if (time >= frames.at(-1)!.time) return frames.at(-1)!.value
  const rightIndex = frames.findIndex(frame => frame.time > time)
  const a = frames[rightIndex - 1], b = frames[rightIndex]
  if (typeof a.value !== 'number' || typeof b.value !== 'number' || a.easing === 'step') return a.value
  let ratio = (time - a.time) / (b.time - a.time)
  if (a.easing === 'easeInOut') ratio = ratio * ratio * (3 - 2 * ratio)
  return a.value + (b.value - a.value) * ratio
}

function applyTrack(node: SceneNode, track: Track, time: number): void {
  ;(node as unknown as Record<string, unknown>)[track.property] = interpolate(track.keyframes, time)
}

export function resolveParams(defs: Parameter[], values: Record<string, number> = {}): Record<string, number> {
  const result: Record<string, number> = {}
  for (const param of defs) {
    const value = values[param.id] ?? param.value
    result[param.id] = Number.isFinite(value) ? clamp(value, param.min, param.max) : param.value
  }
  return result
}

export function evaluateScene(scene: Scene, time: number, inputParams: Record<string, number> = {}): EvaluatedScene {
  const t = clamp(Number.isFinite(time) ? time : 0, 0, scene.duration)
  const params = resolveParams(scene.params, inputParams)
  const nodes = scene.nodes.map(node => ({ ...node, bindings: node.bindings ? { ...node.bindings } : undefined }))
  const map = new Map(nodes.map(node => [node.id, node]))
  for (const track of scene.tracks) {
    const node = map.get(track.nodeId)
    if (node) applyTrack(node, track, t)
  }
  for (const node of nodes) {
    for (const [property, expression] of Object.entries(node.bindings ?? {})) {
      const value = evaluateExpression(expression, { ...params, t })
      if (!Number.isFinite(value)) throw new Error(`对象「${node.name}」的 ${property} 计算结果无效`)
      ;(node as unknown as Record<string, unknown>)[property] = value
    }
    if (node.valueExpression) {
      const value = evaluateExpression(node.valueExpression, { ...params, t })
      if (!Number.isFinite(value)) throw new Error(`对象「${node.name}」的数值读数无效`)
      node.text = `${node.prefix ?? ''}${value.toFixed(clamp(node.precision ?? 2, 0, 8))}${node.suffix ?? ''}`
    }
  }
  return { scene, nodes, params, time: t }
}
