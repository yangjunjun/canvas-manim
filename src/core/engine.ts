import { evaluateExpression } from './expression.ts'
import { axesPoint, transformedNodes } from './renderer.ts'
import type { EvaluatedScene, Keyframe, Parameter, Project, Scene, SceneNode, Track } from './types.ts'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export function layoutAnchorPosition(layout: NonNullable<SceneNode['layout']>, canvas: Project['canvas']): [number, number] {
  return [layout.anchorX === 'left' ? 0 : layout.anchorX === 'center' ? canvas.width / 2 : canvas.width,
    layout.anchorY === 'top' ? 0 : layout.anchorY === 'center' ? canvas.height / 2 : canvas.height]
}
const nodeTypes = new Set(['group', 'circle', 'rect', 'line', 'arrow', 'text', 'formula', 'axes', 'plot', 'point', 'polygon', 'path', 'image'])
const matchableTypes = new Set(['circle', 'rect', 'line', 'arrow', 'text', 'formula', 'point', 'polygon', 'path', 'image'])
const trackable = new Set(['x', 'y', 'x2', 'y2', 'width', 'height', 'radius', 'rotation', 'scale', 'opacity', 'fill', 'stroke', 'lineWidth', 'fontSize', 'text', 'visible'])
const numeric = new Set(['x', 'y', 'x2', 'y2', 'width', 'height', 'radius', 'rotation', 'scale', 'opacity', 'lineWidth', 'fontSize'])

export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('项目文件不是对象')
  const project = value as Project
  if (project.schemaVersion !== 1) throw new Error(`不支持的项目版本：${String(project.schemaVersion)}`)
  if (!project.canvas || !Number.isFinite(project.canvas.width) || !Number.isFinite(project.canvas.height) || project.canvas.width <= 0 || project.canvas.height <= 0 || project.canvas.width > 4096 || project.canvas.height > 4096 || !['contain', 'cover'].includes(project.canvas.fit)) throw new Error('画布尺寸或适配方式无效（尺寸上限 4096）')
  if (!Array.isArray(project.scenes) || !project.scenes.length || !Array.isArray(project.assets)) throw new Error('项目缺少场景或资源清单')
  const assetIds = new Set<string>()
  for (const asset of project.assets) {
    if (!asset || typeof asset.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(asset.id) || assetIds.has(asset.id) || typeof asset.name !== 'string' || typeof asset.mime !== 'string') throw new Error('资源清单项无效或 ID 重复')
    assetIds.add(asset.id)
  }
  const sceneIds = new Set<string>()
  for (const scene of project.scenes) {
    if (!scene || typeof scene.id !== 'string' || !scene.id || sceneIds.has(scene.id) || !Number.isFinite(scene.duration) || scene.duration <= 0) throw new Error('场景 ID 或时长无效')
    sceneIds.add(scene.id)
    if (!Array.isArray(scene.nodes) || !Array.isArray(scene.tracks) || !Array.isArray(scene.params)) throw new Error(`场景 ${scene.id} 结构无效`)
    const ids = new Set<string>()
    for (const node of scene.nodes) {
      if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) || !nodeTypes.has(node.type) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error(`场景 ${scene.id} 的对象无效或 ID 重复`)
      if (node.scale !== undefined && (!Number.isFinite(node.scale) || node.scale <= 0)) throw new Error(`对象 ${node.id} 的缩放无效`)
      if (node.opacity !== undefined && (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1)) throw new Error(`对象 ${node.id} 的透明度无效`)
      if (node.radius !== undefined && (!Number.isFinite(node.radius) || node.radius < 0)) throw new Error(`对象 ${node.id} 的半径无效`)
      if (node.lineDash !== undefined && (!Array.isArray(node.lineDash) || !node.lineDash.length || !node.lineDash.every(length => Number.isFinite(length) && length >= 0) || !node.lineDash.some(length => length > 0))) throw new Error(`对象 ${node.id} 的虚线样式无效`)
      if (node.x2 !== undefined && !Number.isFinite(node.x2) || node.y2 !== undefined && !Number.isFinite(node.y2)) throw new Error(`对象 ${node.id} 的终点无效`)
      if ((node.type === 'path' || node.type === 'polygon') && (!Array.isArray(node.points) || node.points.length < (node.type === 'polygon' ? 3 : 2) || !node.points.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))) throw new Error(`对象 ${node.id} 的顶点无效`)
      if (node.visible !== undefined && typeof node.visible !== 'boolean') throw new Error(`对象 ${node.id} 的可见性无效`)
      if (node.type === 'image' && (!node.assetId || !assetIds.has(node.assetId))) throw new Error(`对象 ${node.id} 的图片资源引用无效`)
      if (node.layout && (!['left', 'center', 'right'].includes(node.layout.anchorX) || !['top', 'center', 'bottom'].includes(node.layout.anchorY) || !Number.isFinite(node.layout.offsetX) || !Number.isFinite(node.layout.offsetY))) throw new Error(`对象 ${node.id} 的布局约束无效`)
      if (node.followPath && (typeof node.followPath.pathId !== 'string' || !Number.isFinite(node.followPath.progress) || node.followPath.progress < 0 || node.followPath.progress > 1 || node.followPath.progressExpression !== undefined && typeof node.followPath.progressExpression !== 'string' || node.followPath.orient !== undefined && typeof node.followPath.orient !== 'boolean' || !Number.isFinite(node.followPath.offsetX) || !Number.isFinite(node.followPath.offsetY) || node.layout || node.parentId || node.axesId)) throw new Error(`对象 ${node.id} 的路径跟随配置无效`)
      if (node.trail && (!Number.isFinite(node.trail.duration) || node.trail.duration <= 0 || node.trail.duration > 30 || !Number.isInteger(node.trail.samples) || node.trail.samples < 2 || node.trail.samples > 24 || !Number.isFinite(node.trail.radius) || node.trail.radius <= 0 || node.trail.radius > 50 || !Number.isFinite(node.trail.opacity) || node.trail.opacity <= 0 || node.trail.opacity > 1 || node.trail.color !== undefined && typeof node.trail.color !== 'string')) throw new Error(`对象 ${node.id} 的轨迹残影配置无效`)
      if (node.matchTransform && (typeof node.matchTransform.targetId !== 'string' || !Number.isFinite(node.matchTransform.start) || !Number.isFinite(node.matchTransform.end) || node.matchTransform.start < 0 || node.matchTransform.end > scene.duration || node.matchTransform.start >= node.matchTransform.end || !['linear', 'easeInOut'].includes(node.matchTransform.easing))) throw new Error(`对象 ${node.id} 的匹配变换配置无效`)
      for (const range of [node.xRange, node.yRange]) if (range && (range.length !== 2 || !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0] >= range[1])) throw new Error(`对象 ${node.id} 的坐标范围无效`)
      ids.add(node.id)
    }
    for (const node of scene.nodes) {
      if (node.parentId && (!ids.has(node.parentId) || node.parentId === node.id || scene.nodes.find(item => item.id === node.parentId)?.type !== 'group')) throw new Error(`对象 ${node.id} 的父级无效`)
      if (node.axesId && scene.nodes.find(item => item.id === node.axesId)?.type !== 'axes') throw new Error(`对象 ${node.id} 的关联坐标系无效`)
      if (node.followPath && (node.type === 'path' || scene.nodes.find(item => item.id === node.followPath!.pathId)?.type !== 'path')) throw new Error(`对象 ${node.id} 的跟随路径不存在或类型无效`)
      const seen = new Set([node.id])
      let parent = node.parentId
      while (parent) {
        if (seen.has(parent)) throw new Error(`对象 ${node.id} 存在父级循环`)
        seen.add(parent)
        parent = scene.nodes.find(item => item.id === parent)?.parentId
      }
      if (node.followPath) {
        let pathParent = scene.nodes.find(item => item.id === node.followPath!.pathId)?.parentId
        while (pathParent) {
          if (pathParent === node.id) throw new Error(`对象 ${node.id} 不能跟随自身子级路径`)
          pathParent = scene.nodes.find(item => item.id === pathParent)?.parentId
        }
      }
    }
    const matchedTargets = new Set<string>()
    for (const node of scene.nodes) if (node.matchTransform) {
      const target = scene.nodes.find(item => item.id === node.matchTransform!.targetId)
      if (!target || target.id === node.id || target.type !== node.type || !matchableTypes.has(node.type) || target.matchTransform || matchedTargets.has(target.id) || target.parentId !== node.parentId || target.axesId !== node.axesId) throw new Error(`对象 ${node.id} 的匹配变换目标无效`)
      if ((node.type === 'path' || node.type === 'polygon') && node.points?.length !== target.points?.length) throw new Error(`对象 ${node.id} 与目标的顶点数量不同`)
      matchedTargets.add(target.id)
    }
    if (scene.nodes.reduce((sum, node) => sum + (node.trail?.samples ?? 0), 0) > 96) throw new Error(`场景 ${scene.id} 的轨迹采样总数超过 96`)
    const driven = new Set<string>()
    for (const node of scene.nodes) for (const property of Object.keys(node.bindings ?? {})) {
      if (!numeric.has(property)) throw new Error(`对象 ${node.id} 的绑定属性 ${property} 不支持`)
      if ((node.layout || node.followPath) && (property === 'x' || property === 'y')) throw new Error(`对象 ${node.id} 的布局或路径跟随不能与位置表达式同时使用`)
      driven.add(`${node.id}.${property}`)
    }
    for (const track of scene.tracks) {
      if (!track || !ids.has(track.nodeId) || !trackable.has(track.property) || !Array.isArray(track.keyframes) || !track.keyframes.length) throw new Error(`轨道 ${track?.nodeId ?? '?'} 无效`)
      const key = `${track.nodeId}.${track.property}`
      if ((track.property === 'x' || track.property === 'y') && scene.nodes.find(node => node.id === track.nodeId)?.layout) throw new Error(`对象 ${track.nodeId} 的布局约束不能与位置轨道同时使用`)
      if ((track.property === 'x' || track.property === 'y') && scene.nodes.find(node => node.id === track.nodeId)?.followPath) throw new Error(`对象 ${track.nodeId} 的路径跟随不能与位置轨道同时使用`)
      if (driven.has(key)) throw new Error(`属性 ${key} 有多个驱动来源`)
      driven.add(key)
      let previous = -1
      for (const frame of track.keyframes) {
        if (!frame || !Number.isFinite(frame.time) || frame.time < 0 || frame.time > scene.duration || frame.time <= previous) throw new Error(`轨道 ${key} 的关键帧时间无效`)
        if (numeric.has(track.property) && (typeof frame.value !== 'number' || !Number.isFinite(frame.value))) throw new Error(`轨道 ${key} 的数值无效`)
        if (['fill', 'stroke', 'text'].includes(track.property) && typeof frame.value !== 'string') throw new Error(`轨道 ${key} 的文本或颜色无效`)
        if (track.property === 'visible' && typeof frame.value !== 'boolean') throw new Error(`轨道 ${key} 的可见性无效`)
        previous = frame.time
      }
    }
    const paramIds = new Set<string>()
    for (const param of scene.params) {
      if (!param || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(param.id) || ['t', 'x', 'pi', 'e'].includes(param.id) || paramIds.has(param.id) || !Number.isFinite(param.value) || !Number.isFinite(param.min) || !Number.isFinite(param.max) || !Number.isFinite(param.step) || param.step <= 0 || param.min > param.max || param.value < param.min || param.value > param.max) throw new Error(`参数 ${param?.id ?? '?'} 无效`)
      paramIds.add(param.id)
    }
  }
  return project
}

function colorChannels(value: string): [number, number, number] | null {
  const short = /^#([0-9a-f]{3})$/i.exec(value)
  const hex = short ? [...short[1]].map(digit => digit + digit).join('') : /^#([0-9a-f]{6})$/i.exec(value)?.[1]
  return hex ? [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number] : null
}

function mixColor(fromValue: string, toValue: string, ratio: number): string | null {
  const from = colorChannels(fromValue), to = colorChannels(toValue)
  return from && to ? `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio).toString(16).padStart(2, '0')).join('')}` : null
}

function applyMatchTransform(source: SceneNode, target: SceneNode, ratio: number): void {
  const defaults: Partial<Record<keyof SceneNode, number>> = { rotation: 0, scale: 1, opacity: 1 }
  for (const property of ['x', 'y', 'x2', 'y2', 'width', 'height', 'radius', 'rotation', 'scale', 'opacity', 'lineWidth', 'fontSize'] as const) {
    const from = source[property] ?? defaults[property], to = target[property] ?? defaults[property]
    if (typeof from === 'number' && typeof to === 'number') (source as unknown as Record<string, unknown>)[property] = from + (to - from) * ratio
  }
  for (const property of ['fill', 'stroke'] as const) {
    const color = source[property] && target[property] ? mixColor(source[property], target[property], ratio) : null
    if (color) source[property] = color
  }
  if (source.points && target.points) source.points = source.points.map(([x, y], index) => [x + (target.points![index][0] - x) * ratio, y + (target.points![index][1] - y) * ratio])
}

function interpolate(frames: Keyframe[], time: number, property: keyof SceneNode): Keyframe['value'] {
  if (time <= frames[0].time) return frames[0].value
  if (time >= frames.at(-1)!.time) return frames.at(-1)!.value
  const rightIndex = frames.findIndex(frame => frame.time > time)
  const a = frames[rightIndex - 1], b = frames[rightIndex]
  if (a.easing === 'step') return a.value
  let ratio = (time - a.time) / (b.time - a.time)
  if (a.easing === 'easeInOut') ratio = ratio * ratio * (3 - 2 * ratio)
  if (typeof a.value === 'number' && typeof b.value === 'number') return a.value + (b.value - a.value) * ratio
  if ((property === 'fill' || property === 'stroke') && typeof a.value === 'string' && typeof b.value === 'string') {
    const from = colorChannels(a.value), to = colorChannels(b.value)
    if (from && to) return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio).toString(16).padStart(2, '0')).join('')}`
  }
  return a.value
}

function applyTrack(node: SceneNode, track: Track, time: number): void {
  ;(node as unknown as Record<string, unknown>)[track.property] = interpolate(track.keyframes, time, track.property)
}

function samplePolyline(points: Array<[number, number]>, progress: number): { x: number; y: number; angle: number } {
  const segments = points.slice(1).map(([x, y], index) => {
    const [startX, startY] = points[index]
    return { startX, startY, x, y, length: Math.hypot(x - startX, y - startY) }
  })
  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  if (!total) return { x: points[0][0], y: points[0][1], angle: 0 }
  let distance = clamp(progress, 0, 1) * total
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (distance <= segment.length || index === segments.length - 1) {
      const ratio = segment.length ? clamp(distance / segment.length, 0, 1) : 0
      return { x: segment.startX + (segment.x - segment.startX) * ratio,
        y: segment.startY + (segment.y - segment.startY) * ratio,
        angle: Math.atan2(segment.y - segment.startY, segment.x - segment.startX) }
    }
    distance -= segment.length
  }
  return { x: points[0][0], y: points[0][1], angle: 0 }
}

export function resolveParams(defs: Parameter[], values: Record<string, number> = {}): Record<string, number> {
  const result: Record<string, number> = {}
  for (const param of defs) {
    const value = values[param.id] ?? param.value
    result[param.id] = Number.isFinite(value) ? clamp(value, param.min, param.max) : param.value
  }
  return result
}

export interface EvaluateOptions { canvas?: Project['canvas']; onNodeError?: (error: Error) => void; includeTrails?: boolean }

export function evaluateScene(scene: Scene, time: number, inputParams: Record<string, number> = {}, options: EvaluateOptions | ((error: Error) => void) = {}): EvaluatedScene {
  const onNodeError = typeof options === 'function' ? options : options.onNodeError
  const canvas = typeof options === 'function' ? undefined : options.canvas
  const includeTrails = typeof options === 'function' ? true : options.includeTrails !== false
  const t = clamp(Number.isFinite(time) ? time : 0, 0, scene.duration)
  const params = resolveParams(scene.params, inputParams)
  const nodes = scene.nodes.map(node => ({ ...node, bindings: node.bindings ? { ...node.bindings } : undefined }))
  const map = new Map(nodes.map(node => [node.id, node]))
  for (const track of scene.tracks) {
    const node = map.get(track.nodeId)
    if (node) applyTrack(node, track, t)
  }
  for (const node of nodes) {
    try {
      for (const [property, expression] of Object.entries(node.bindings ?? {})) {
        let value: number
        try { value = evaluateExpression(expression, { ...params, t }) }
        catch (cause) { throw new Error(`${property} 表达式：${cause instanceof Error ? cause.message : String(cause)}`) }
        if (!Number.isFinite(value)) throw new Error(`${property} 计算结果无效`)
        ;(node as unknown as Record<string, unknown>)[property] = value
      }
      if (node.valueExpression) {
        let value: number
        try { value = evaluateExpression(node.valueExpression, { ...params, t }) }
        catch (cause) { throw new Error(`数值读数表达式：${cause instanceof Error ? cause.message : String(cause)}`) }
        if (!Number.isFinite(value)) throw new Error('数值读数无效')
        node.text = `${node.prefix ?? ''}${value.toFixed(clamp(node.precision ?? 2, 0, 8))}${node.suffix ?? ''}`
      }
    } catch (cause) {
      const error = new Error(`对象「${node.name}」：${cause instanceof Error ? cause.message : String(cause)}`)
      if (!onNodeError) throw error
      onNodeError(error)
    }
    if (node.layout) {
      if (!canvas) throw new Error(`对象「${node.name}」使用布局约束，求值时需提供画布配置`)
      const [anchorX, anchorY] = layoutAnchorPosition(node.layout, canvas)
      node.x = anchorX + node.layout.offsetX
      node.y = anchorY + node.layout.offsetY
    }
  }
  if (nodes.some(node => node.followPath)) {
    const world = new Map(transformedNodes(nodes).map(node => [node.id, node]))
    for (const node of nodes) {
      const follow = node.followPath
      if (!follow) continue
      try {
        const path = world.get(follow.pathId)!
        const angle = path.rotation ?? 0, scale = path.scale ?? 1
        const cosine = Math.cos(angle), sine = Math.sin(angle)
        const points = path.points!.map(([x, y]): [number, number] => [path.x + (x * cosine - y * sine) * scale, path.y + (x * sine + y * cosine) * scale])
        const progress = follow.progressExpression ? evaluateExpression(follow.progressExpression, { ...params, t }) : follow.progress
        if (!Number.isFinite(progress)) throw new Error('进度表达式计算结果无效')
        const sampled = samplePolyline(points, progress)
        node.x = sampled.x + follow.offsetX
        node.y = sampled.y + follow.offsetY
        if (follow.orient) node.rotation = (node.rotation ?? 0) + sampled.angle
      } catch (cause) {
        const error = new Error(`对象「${node.name}」路径跟随失败：${cause instanceof Error ? cause.message : String(cause)}`)
        if (!onNodeError) throw error
        onNodeError(error)
      }
    }
  }
  for (const source of nodes) {
    const match = source.matchTransform
    if (!match) continue
    const target = map.get(match.targetId)!
    if (t < match.start) target.visible = false
    else if (t >= match.end) source.visible = false
    else {
      target.visible = false
      let ratio = (t - match.start) / (match.end - match.start)
      if (match.easing === 'easeInOut') ratio = ratio * ratio * (3 - 2 * ratio)
      applyMatchTransform(source, target, ratio)
    }
  }
  const trails: EvaluatedScene['trails'] = []
  const history = new Map<number, SceneNode[]>()
  const currentWorld = includeTrails && nodes.some(node => node.trail) ? new Map(transformedNodes(nodes).map(node => [node.id, node])) : null
  if (includeTrails) for (const node of nodes) {
    const trail = node.trail
    if (!trail) continue
    const current = currentWorld?.get(node.id)
    if (current?.visible === false || (current?.opacity ?? 1) <= 0) continue
    const points: NonNullable<EvaluatedScene['trails']>[number]['points'] = []
    for (let index = trail.samples; index >= 1; index--) {
      const sampleTime = t - trail.duration * index / trail.samples
      if (sampleTime < 0) continue
      try {
        let world = history.get(sampleTime)
        if (!world) {
          const past = evaluateScene(scene, sampleTime, inputParams, { canvas, includeTrails: false })
          world = transformedNodes(past.nodes)
          history.set(sampleTime, world)
        }
        const previous = world.find(item => item.id === node.id)!
        if (previous.visible === false || (previous.opacity ?? 1) <= 0) continue
        const axes = previous.axesId ? world.find(item => item.id === previous.axesId) : undefined
        const [x, y] = axes ? axesPoint(axes, previous.x, previous.y) : [previous.x, previous.y]
        points.push({ x, y, opacity: trail.opacity * (1 - index / (trail.samples + 1)) * (previous.opacity ?? 1) })
      } catch (cause) {
        const error = new Error(`对象「${node.name}」轨迹残影求值失败：${cause instanceof Error ? cause.message : String(cause)}`)
        if (!onNodeError) throw error
        onNodeError(error)
      }
    }
    trails.push({ nodeId: node.id, color: trail.color || node.stroke || node.fill || '#5eead4', radius: trail.radius, points })
  }
  return { scene, nodes, params, time: t, trails }
}
