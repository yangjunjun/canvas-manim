import { evaluateExpression } from './expression.ts'
import { axesPoint, transformedNodes } from './renderer.ts'
import type { EvaluatedScene, SceneNode } from './types.ts'

export interface SelectionBounds { x: number; y: number; width: number; height: number }
export type TextMeasure = (text: string, size: number) => { width: number; ascent: number; descent: number }

function lineDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const length = dx * dx + dy * dy
  const ratio = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0
  return Math.hypot(x - x1 - ratio * dx, y - y1 - ratio * dy)
}

function localPoint(x: number, y: number, originX: number, originY: number, node: SceneNode): [number, number] {
  const angle = -(node.rotation ?? 0), scale = node.scale ?? 1
  const dx = x - originX, dy = y - originY
  return [(dx * Math.cos(angle) - dy * Math.sin(angle)) / scale, (dx * Math.sin(angle) + dy * Math.cos(angle)) / scale]
}

function contains(node: SceneNode, pointX: number, pointY: number, axes: SceneNode | undefined, state: EvaluatedScene): boolean {
  const [x, y] = axes ? axesPoint(axes, node.x, node.y) : [node.x, node.y]
  const [x2, y2] = axes && node.x2 !== undefined && node.y2 !== undefined
    ? axesPoint(axes, node.x2, node.y2) : [node.x2 ?? x, node.y2 ?? y]
  const tolerance = 9

  if (node.type === 'circle' || node.type === 'point') return Math.hypot(pointX - x, pointY - y) <= (node.radius ?? 18) * (node.scale ?? 1) + tolerance
  if (node.type === 'line' || node.type === 'arrow') return lineDistance(pointX, pointY, x, y, x2, y2) <= Math.max(tolerance, (node.lineWidth ?? 2) / 2 + 5)
  if (node.type === 'plot' && axes && node.expression) {
    const [xmin, xmax] = axes.xRange ?? [-5, 5]
    const mathX = xmin + (pointX - axes.x) / (axes.width ?? 1) * (xmax - xmin)
    if (mathX < xmin || mathX > xmax) return false
    try {
      const mathY = evaluateExpression(node.expression, { ...state.params, t: state.time, x: mathX })
      if (!Number.isFinite(mathY)) return false
      const [, curveY] = axesPoint(axes, mathX, mathY)
      return pointY >= axes.y - tolerance && pointY <= axes.y + (axes.height ?? 1) + tolerance && Math.abs(pointY - curveY) <= tolerance
    } catch { return false }
  }

  const [localX, localY] = localPoint(pointX, pointY, x, y, node)
  if (node.type === 'axes') {
    const width = node.width ?? 1, height = node.height ?? 1
    return localX >= -tolerance && localX <= width + tolerance && localY >= -tolerance && localY <= height + tolerance
      && (Math.min(Math.abs(localX), Math.abs(localX - width), Math.abs(localY), Math.abs(localY - height)) <= tolerance
        || Math.abs(pointX - axesPoint(node, 0, 0)[0]) <= tolerance || Math.abs(pointY - axesPoint(node, 0, 0)[1]) <= tolerance)
  }
  if (node.type === 'rect' || node.type === 'image') return localX >= -tolerance && localX <= (node.width ?? 100) + tolerance && localY >= -tolerance && localY <= (node.height ?? 70) + tolerance
  if (node.type === 'text' || node.type === 'formula') {
    const size = node.fontSize ?? 24
    const width = Math.max(size, (node.text?.length ?? 1) * size * 0.7)
    const top = node.type === 'text' ? -size : 0
    return localX >= -tolerance && localX <= width + tolerance && localY >= top - tolerance && localY <= top + size * 1.3 + tolerance
  }
  if (node.type === 'polygon' || node.type === 'path') {
    const points = node.points ?? []
    if (!points.length) return false
    if (node.type === 'path') return points.slice(1).some(([px, py], index) => lineDistance(localX, localY, points[index][0], points[index][1], px, py) <= tolerance)
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j]
      if ((yi > localY) !== (yj > localY) && localX < (xj - xi) * (localY - yi) / (yj - yi) + xi) inside = !inside
    }
    return inside || points.some(([px, py]) => Math.hypot(localX - px, localY - py) <= tolerance)
  }
  return false
}

export function hitTestScene(state: EvaluatedScene, x: number, y: number): SceneNode | null {
  const nodes = transformedNodes(state.nodes).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes.reverse()) {
    if (node.type === 'group' || node.visible === false || (node.opacity ?? 1) <= 0) continue
    const axes = node.axesId ? byId.get(node.axesId) : undefined
    if (contains(node, x, y, axes, state)) return node
  }
  return null
}

function boundsOfPoints(points: Array<[number, number]>): SelectionBounds | null {
  if (!points.length) return null
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys)
  const padding = 7
  return { x: left - padding, y: top - padding, width: Math.max(14, right - left + padding * 2), height: Math.max(14, bottom - top + padding * 2) }
}

function rotatedPoints(x: number, y: number, node: SceneNode, points: Array<[number, number]>, scale = node.scale ?? 1): Array<[number, number]> {
  const angle = node.rotation ?? 0, cosine = Math.cos(angle), sine = Math.sin(angle)
  return points.map(([px, py]): [number, number] => [x + (px * cosine - py * sine) * scale, y + (px * sine + py * cosine) * scale])
}

export function selectionBounds(state: EvaluatedScene, nodeId: string, measureText?: TextMeasure): SelectionBounds | null {
  const nodes = transformedNodes(state.nodes)
  const byId = new Map(nodes.map(node => [node.id, node]))
  const node = byId.get(nodeId)
  if (!node || node.visible === false || (node.opacity ?? 1) <= 0) return null
  if (node.type === 'group') {
    const childBounds = state.nodes.filter(child => child.parentId === nodeId).map(child => selectionBounds(state, child.id, measureText)).filter((item): item is SelectionBounds => item !== null)
    if (!childBounds.length) return boundsOfPoints([[node.x, node.y]])
    return boundsOfPoints(childBounds.flatMap(box => [[box.x, box.y], [box.x + box.width, box.y + box.height]] as Array<[number, number]>))
  }
  const axes = node.axesId ? byId.get(node.axesId) : undefined
  const [x, y] = axes ? axesPoint(axes, node.x, node.y) : [node.x, node.y]
  if (node.type === 'circle' || node.type === 'point') {
    const radius = (node.radius ?? 18) * (node.scale ?? 1)
    return boundsOfPoints([[x - radius, y - radius], [x + radius, y + radius]])
  }
  if (node.type === 'line' || node.type === 'arrow') {
    const [x2, y2] = axes && node.x2 !== undefined && node.y2 !== undefined ? axesPoint(axes, node.x2, node.y2) : [node.x2 ?? x, node.y2 ?? y]
    return boundsOfPoints([[x, y], [x2, y2]])
  }
  if (node.type === 'axes') return boundsOfPoints([[x, y], [x + (node.width ?? 1), y + (node.height ?? 1)]])
  if (node.type === 'plot' && axes) return boundsOfPoints([[axes.x, axes.y], [axes.x + (axes.width ?? 1), axes.y + (axes.height ?? 1)]])
  if (node.type === 'rect') return boundsOfPoints(rotatedPoints(x, y, node, [[0, 0], [node.width ?? 100, 0], [node.width ?? 100, node.height ?? 70], [0, node.height ?? 70]]))
  if (node.type === 'image') return boundsOfPoints(rotatedPoints(x, y, node, [[0, 0], [node.width ?? 100, 0], [node.width ?? 100, node.height ?? 70], [0, node.height ?? 70]], 1))
  if (node.type === 'text') {
    const size = node.fontSize ?? 24
    const metrics = measureText?.(node.text ?? '', size) ?? { width: (node.text?.length ?? 1) * size, ascent: size, descent: size * 0.25 }
    return boundsOfPoints(rotatedPoints(x, y, node, [[0, -metrics.ascent], [metrics.width, -metrics.ascent], [metrics.width, metrics.descent], [0, metrics.descent]]))
  }
  if (node.type === 'formula') {
    const size = node.fontSize ?? 28, width = Math.max(size, (node.text?.length ?? 1) * size * 0.6)
    return boundsOfPoints(rotatedPoints(x, y, node, [[0, 0], [width, 0], [width, size * 1.3], [0, size * 1.3]]))
  }
  if (node.type === 'polygon' || node.type === 'path') return boundsOfPoints(rotatedPoints(x, y, node, node.points ?? []))
  return null
}
