import { evaluateScene, validateProject } from './engine.ts'
import { renderScene, ResourceCache } from './renderer.ts'
import type { Project, Scene } from './types.ts'

export class Player {
  readonly canvas: HTMLCanvasElement
  readonly resources = new ResourceCache()
  private project: Project
  private sceneId: string
  private params: Record<string, number> = {}
  private time = 0
  private raf = 0
  private lastTick = 0
  private ready = false
  private destroyed = false
  private loadVersion = 0
  onChange?: (time: number, playing: boolean) => void
  onError?: (error: Error) => void

  constructor(canvas: HTMLCanvasElement, project: Project, sceneId = project.scenes[0]?.id) {
    this.canvas = canvas
    this.project = validateProject(project)
    if (!this.project.scenes.some(scene => scene.id === sceneId)) throw new Error(`场景 ${sceneId} 不存在`)
    this.sceneId = sceneId
    this.resize()
    this.ready = true
    this.render()
    void this.prepare()
  }

  get currentProject(): Project { return this.project }
  get currentScene(): Scene { return this.project.scenes.find(scene => scene.id === this.sceneId) ?? this.project.scenes[0] }
  get currentTime(): number { return this.time }
  get isPlaying(): boolean { return this.raf !== 0 }
  get currentParams(): Record<string, number> { return { ...this.params } }

  resize(width = this.project.canvas.width, height = this.project.canvas.height): void {
    this.canvas.width = width
    this.canvas.height = height
    if (this.ready) this.render()
  }

  private async prepare(): Promise<void> {
    const version = ++this.loadVersion
    const project = this.project, sceneId = this.sceneId
    try {
      await this.resources.preload(project, sceneId, error => this.onError?.(error))
      if (this.destroyed || version !== this.loadVersion) return
      this.render()
    } catch (cause) { if (version === this.loadVersion) this.onError?.(cause instanceof Error ? cause : new Error(String(cause))) }
  }

  setProject(project: Project, sceneId = project.scenes[0]?.id): void {
    const validProject = validateProject(project)
    if (!validProject.scenes.some(scene => scene.id === sceneId)) throw new Error(`场景 ${sceneId} 不存在`)
    this.pause()
    this.project = validProject
    this.canvas.style.objectFit = project.canvas.fit
    this.sceneId = sceneId
    this.params = {}
    this.time = 0
    this.resources.clear()
    this.resize()
    void this.prepare()
  }

  setScene(id: string): void {
    if (!this.project.scenes.some(scene => scene.id === id)) throw new Error(`场景 ${id} 不存在`)
    this.pause(); this.sceneId = id; this.params = {}; this.time = 0; this.render(); void this.prepare()
  }

  setParams(values: Record<string, number>): void {
    for (const [id, value] of Object.entries(values)) {
      const param = this.currentScene.params.find(item => item.id === id)
      if (!param) throw new Error(`参数 ${id} 不存在`)
      if (!Number.isFinite(value) || value < param.min || value > param.max) throw new Error(`参数 ${id} 须在 ${param.min} 到 ${param.max} 之间`)
    }
    this.params = { ...this.params, ...values }
    this.render()
  }

  seek(time: number): void {
    this.time = Math.max(0, Math.min(this.currentScene.duration, Number.isFinite(time) ? time : 0))
    this.render()
    this.onChange?.(this.time, this.isPlaying)
  }

  step(seconds = 1 / 30): void { this.pause(); this.seek(this.time + seconds) }

  play(): void {
    if (this.destroyed || this.raf) return
    if (this.time >= this.currentScene.duration) this.seek(0)
    this.lastTick = performance.now()
    const tick = (now: number) => {
      if (!this.raf) return
      const delta = Math.min((now - this.lastTick) / 1000, 0.2)
      this.lastTick = now
      this.seek(this.time + delta)
      if (this.time >= this.currentScene.duration) { this.pause(); return }
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
    this.onChange?.(this.time, true)
  }

  pause(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.onChange?.(this.time, false)
  }

  render(): void {
    if (!this.ready || this.destroyed) return
    try { renderScene(this.canvas, this.project, evaluateScene(this.currentScene, this.time, this.params, { canvas: this.project.canvas, onNodeError: error => this.onError?.(error) }), this.resources, this.project.canvas.background, error => this.onError?.(error)) }
    catch (cause) { this.onError?.(cause instanceof Error ? cause : new Error(String(cause))) }
  }

  destroy(): void { this.pause(); this.destroyed = true; this.loadVersion++; this.resources.clear(); this.onChange = undefined; this.onError = undefined }
}

export interface MountPlayerOptions {
  sceneId?: string
  width?: number
  height?: number
  params?: Record<string, number>
}

export function mountPlayer(container: HTMLElement, project: Project, sceneIdOrOptions?: string | MountPlayerOptions): Player {
  validateProject(project)
  const options: MountPlayerOptions = typeof sceneIdOrOptions === 'string' ? { sceneId: sceneIdOrOptions } : sceneIdOrOptions ?? {}
  for (const [label, size] of [['width', options.width], ['height', options.height]] as const) {
    if (size !== undefined && (!Number.isFinite(size) || size <= 0)) throw new Error(`播放器 ${label} 须为正数`)
  }
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = options.width === undefined ? options.height === undefined ? '100%' : 'auto' : `${options.width}px`
  canvas.style.height = options.height === undefined ? 'auto' : `${options.height}px`
  canvas.style.objectFit = project.canvas.fit
  container.append(canvas)
  let player: Player | undefined
  try {
    player = new Player(canvas, project, options.sceneId)
    if (options.params) player.setParams(options.params)
  } catch (error) { player?.destroy(); canvas.remove(); throw error }
  if (!player) throw new Error('播放器初始化失败')
  const destroy = player.destroy.bind(player)
  player.destroy = () => { destroy(); canvas.remove() }
  return player
}
