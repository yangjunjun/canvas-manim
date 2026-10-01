import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { evaluateExpression } from './expression.ts'
import type { EvaluatedScene, Project, SceneNode } from './types.ts'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const mathDocument = mathjax.document('', { InputJax: new TeX(), OutputJax: new SVG({ fontCache: 'none' }) })

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图像资源解码失败'))
    image.src = url
  })
}

export class ResourceCache {
  private formulas = new Map<string, Promise<HTMLImageElement>>()
  private images = new Map<string, Promise<HTMLImageElement>>()
  private readyFormulas = new Map<string, HTMLImageElement>()
  private readyImages = new Map<string, HTMLImageElement>()

  async formula(text: string, size: number, color: string): Promise<HTMLImageElement> {
    const key = `${text}|${size}|${color}`
    if (!this.formulas.has(key)) {
      const promise = (async () => {
        const node = mathDocument.convert(text, { display: false })
        const markup = adaptor.outerHTML(node)
        const start = markup.indexOf('<svg')
        const end = markup.lastIndexOf('</svg>')
        if (start < 0 || end < 0) throw new Error('公式未生成 SVG')
        let svg = markup.slice(start, end + 6)
        const width = Math.max(1, parseFloat(/\bwidth="([\d.]+)/.exec(svg)?.[1] ?? '2') * size * 0.5)
        const height = Math.max(1, parseFloat(/\bheight="([\d.]+)/.exec(svg)?.[1] ?? '2') * size * 0.5)
        svg = svg.replace(/\bwidth="[^"]*"/, `width="${width}px"`).replace(/\bheight="[^"]*"/, `height="${height}px"`)
        svg = svg.replace('<svg ', `<svg color="${color}" `)
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        try { return await loadImage(url) } finally { URL.revokeObjectURL(url) }
      })().then(image => { this.readyFormulas.set(key, image); return image })
      this.formulas.set(key, promise)
    }
    return this.formulas.get(key)!
  }

  async image(id: string, project: Project): Promise<HTMLImageElement> {
    if (!this.images.has(id)) {
      const asset = project.assets.find(item => item.id === id)
      if (!asset?.data) throw new Error(`图片资源 ${id} 不存在`)
      this.images.set(id, loadImage(`data:${asset.mime};base64,${asset.data}`).then(image => { this.readyImages.set(id, image); return image }))
    }
    return this.images.get(id)!
  }

  async preload(project: Project, sceneId: string, onNodeError?: (error: Error) => void): Promise<void> {
    const scene = project.scenes.find(item => item.id === sceneId)
    if (!scene) throw new Error('场景不存在')
    if (typeof document !== 'undefined' && document.fonts) {
      const text = scene.nodes.filter(node => node.type === 'text').map(node => node.text ?? '').join('')
      if (text) await document.fonts.load('24px "Noto Sans SC"', text)
    }
    await Promise.all(scene.nodes.map(async node => {
      try {
        if (node.type === 'formula') await this.formula(node.text ?? '', node.fontSize ?? 28, node.fill ?? '#ffffff')
        if (node.type === 'image' && node.assetId) await this.image(node.assetId, project)
      } catch (cause) {
        const error = new Error(`对象「${node.name}」资源加载失败：${cause instanceof Error ? cause.message : String(cause)}`)
        if (!onNodeError) throw error
        onNodeError(error)
      }
    }))
  }

  getFormula(text: string, size: number, color: string): HTMLImageElement | undefined {
    return this.readyFormulas.get(`${text}|${size}|${color}`)
  }

  getImage(id: string): HTMLImageElement | undefined { return this.readyImages.get(id) }

  clear(): void { this.formulas.clear(); this.images.clear(); this.readyFormulas.clear(); this.readyImages.clear() }
}

export function axesPoint(axes: SceneNode, x: number, y: number): [number, number] {
  const [xmin, xmax] = axes.xRange ?? [-5, 5]
  const [ymin, ymax] = axes.yRange ?? [-3, 3]
  return [axes.x + (x - xmin) / (xmax - xmin) * (axes.width ?? 1), axes.y + (1 - (y - ymin) / (ymax - ymin)) * (axes.height ?? 1)]
}

export function transformedNodes(input: SceneNode[]): SceneNode[] {
  const source = new Map(input.map(node => [node.id, node]))
  const cache = new Map<string, SceneNode>()
  function world(node: SceneNode): SceneNode {
    const existing = cache.get(node.id)
    if (existing) return existing
    const output = { ...node }
    if (node.parentId) {
      const parent = source.get(node.parentId)
      if (parent) {
        const frame = world(parent)
        const angle = frame.rotation ?? 0, scale = frame.scale ?? 1
        const point = (x: number, y: number): [number, number] => [frame.x + (x * Math.cos(angle) - y * Math.sin(angle)) * scale, frame.y + (x * Math.sin(angle) + y * Math.cos(angle)) * scale]
        ;[output.x, output.y] = point(node.x, node.y)
        if (node.x2 !== undefined && node.y2 !== undefined) [output.x2, output.y2] = point(node.x2, node.y2)
        output.rotation = (node.rotation ?? 0) + angle
        output.scale = (node.scale ?? 1) * scale
      }
    }
    if (node.type === 'axes' || node.type === 'image') {
      if (node.width !== undefined) output.width = node.width * (output.scale ?? 1)
      if (node.height !== undefined) output.height = node.height * (output.scale ?? 1)
    }
    if ((node.type === 'line' || node.type === 'arrow') && output.x2 !== undefined && output.y2 !== undefined) {
      const dx = output.x2 - output.x, dy = output.y2 - output.y
      const angle = node.rotation ?? 0, scale = node.scale ?? 1
      output.x2 = output.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * scale
      output.y2 = output.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * scale
    }
    cache.set(node.id, output)
    return output
  }
  return input.map(world)
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 13 * Math.cos(angle - 0.5), y2 - 13 * Math.sin(angle - 0.5))
  ctx.lineTo(x2 - 13 * Math.cos(angle + 0.5), y2 - 13 * Math.sin(angle + 0.5))
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
}

export function renderScene(canvas: HTMLCanvasElement, project: Project, state: EvaluatedScene, resources: ResourceCache, background = '#0b1220', onNodeError?: (error: Error) => void): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D')
  const logicalWidth = project.canvas.width, logicalHeight = project.canvas.height
  const scaleX = canvas.width / logicalWidth, scaleY = canvas.height / logicalHeight
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, logicalWidth, logicalHeight)
  const nodes = transformedNodes(state.nodes).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes) {
    if (node.type === 'group' || node.visible === false || (node.opacity ?? 1) <= 0) continue
    try {
    ctx.save()
    const axes = node.axesId ? byId.get(node.axesId) : undefined
    const [x, y] = axes ? axesPoint(axes, node.x, node.y) : [node.x, node.y]
    const [x2, y2] = axes && node.x2 !== undefined && node.y2 !== undefined ? axesPoint(axes, node.x2, node.y2) : [node.x2 ?? x, node.y2 ?? y]
    ctx.globalAlpha = node.opacity ?? 1
    ctx.lineWidth = node.lineWidth ?? 2
    if (node.lineDash) ctx.setLineDash(node.lineDash)
    ctx.strokeStyle = node.stroke ?? '#dbeafe'
    ctx.fillStyle = node.fill ?? '#e2e8f0'
    if (node.type === 'axes') {
      const width = node.width ?? 1, height = node.height ?? 1
      ctx.strokeStyle = node.stroke ?? '#64748b'
      ctx.strokeRect(x, y, width, height)
      const [zx] = axesPoint(node, 0, 0), [, zy] = axesPoint(node, 0, 0)
      ctx.beginPath()
      if (zx >= x && zx <= x + width) { ctx.moveTo(zx, y); ctx.lineTo(zx, y + height) }
      if (zy >= y && zy <= y + height) { ctx.moveTo(x, zy); ctx.lineTo(x + width, zy) }
      ctx.stroke()
      ctx.font = '15px "Noto Sans SC", sans-serif'
      ctx.fillStyle = '#94a3b8'
      const [xmin, xmax] = node.xRange ?? [-5, 5]
      const [ymin, ymax] = node.yRange ?? [-3, 3]
      for (let i = 0; i <= 4; i++) {
        const xv = xmin + (xmax - xmin) * i / 4
        const yv = ymin + (ymax - ymin) * i / 4
        ctx.fillText(Number(xv.toFixed(1)).toString(), x + width * i / 4 - 8, y + height + 23)
        ctx.fillText(Number(yv.toFixed(1)).toString(), x - 36, y + height * (1 - i / 4) + 5)
      }
    } else if (node.type === 'plot' && axes && node.expression) {
      const [xmin, xmax] = axes.xRange ?? [-5, 5]
      const [ymin, ymax] = axes.yRange ?? [-3, 3]
      const count = Math.min(1200, Math.max(80, Math.round((axes.width ?? 800) / 3)))
      ctx.save()
      ctx.beginPath()
      ctx.rect(axes.x, axes.y, axes.width ?? 1, axes.height ?? 1)
      ctx.clip()
      ctx.beginPath()
      let active = false, previousY = 0, expressionError: Error | undefined
      for (let i = 0; i <= count; i++) {
        const xv = xmin + (xmax - xmin) * i / count
        let yv: number
        try { yv = evaluateExpression(node.expression, { ...state.params, t: state.time, x: xv }) }
        catch (cause) { yv = NaN; expressionError ??= cause instanceof Error ? cause : new Error(String(cause)) }
        if (!Number.isFinite(yv) || Math.abs(yv) > 1e6 || (active && Math.abs(yv - previousY) > (ymax - ymin) * 1.2)) { active = false; continue }
        const [px, py] = axesPoint(axes, xv, yv)
        if (!active) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
        active = true; previousY = yv
      }
      ctx.stroke()
      ctx.restore()
      if (expressionError) throw new Error(`函数表达式：${expressionError.message}`)
    } else if (node.type === 'circle' || node.type === 'point') {
      ctx.beginPath(); ctx.arc(x, y, (node.radius ?? 18) * (node.scale ?? 1), 0, Math.PI * 2); ctx.fill()
      if (node.stroke) ctx.stroke()
    } else if (node.type === 'rect') {
      ctx.translate(x, y); ctx.rotate(node.rotation ?? 0); ctx.scale(node.scale ?? 1, node.scale ?? 1)
      const width = node.width ?? 100, height = node.height ?? 70
      ctx.beginPath(); ctx.roundRect(0, 0, width, height, Math.min(node.radius ?? 0, width / 2, height / 2)); ctx.fill(); if (node.stroke) ctx.stroke()
    } else if (node.type === 'line' || node.type === 'arrow') {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke()
      if (node.type === 'arrow') drawArrowHead(ctx, x, y, x2, y2)
    } else if (node.type === 'polygon' || node.type === 'path') {
      const points = node.points ?? []
      if (points.length) {
        ctx.translate(x, y); ctx.rotate(node.rotation ?? 0); ctx.scale(node.scale ?? 1, node.scale ?? 1)
        ctx.beginPath()
        points.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py))
        if (node.type === 'polygon') { ctx.closePath(); ctx.fill() }
        ctx.stroke()
      }
    } else if (node.type === 'text') {
      ctx.translate(x, y); ctx.rotate(node.rotation ?? 0); ctx.scale(node.scale ?? 1, node.scale ?? 1)
      ctx.font = `${node.fontSize ?? 24}px "Noto Sans SC", sans-serif`
      ctx.fillText(node.text ?? '', 0, 0)
    } else if (node.type === 'formula') {
      const image = resources.getFormula(node.text ?? '', node.fontSize ?? 28, node.fill ?? '#ffffff')
      if (image) { ctx.translate(x, y); ctx.rotate(node.rotation ?? 0); ctx.scale(node.scale ?? 1, node.scale ?? 1); ctx.drawImage(image, 0, 0, image.width, image.height) }
    } else if (node.type === 'image' && node.assetId) {
      const image = resources.getImage(node.assetId)
      if (image) { ctx.translate(x, y); ctx.rotate(node.rotation ?? 0); ctx.drawImage(image, 0, 0, node.width ?? image.width, node.height ?? image.height) }
    }
    ctx.restore()
    } catch (cause) {
      const error = new Error(`对象「${node.name}」渲染失败：${cause instanceof Error ? cause.message : String(cause)}`)
      if (!onNodeError) throw error
      onNodeError(error)
      ctx.restore()
    }
  }
}
