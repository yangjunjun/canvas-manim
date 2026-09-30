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
      await this.resources.preload(project, sceneId)
      if (this.destroyed || version !== this.loadVersion) return
      this.render()
    } catch (cause) { if (version === this.loadVersion) this.onError?.(cause instanceof Error ? cause : new Error(String(cause))) }
  }

  setProject(project: Project, sceneId = project.scenes[0]?.id): void {
    this.pause()
    this.project = validateProject(project)
    this.sceneId = sceneId
    this.params = {}
    this.time = 0
    this.resources.clear()
    this.resize()
    void this.prepare()
  }

  setScene(id: string): void {
    if (!this.project.scenes.some(scene => scene.id === id)) throw new Error(`场景 ${id} 不存在`)
    this.pause(); this.sceneId = id; this.time = 0; this.render(); void this.prepare()
  }

  setParams(values: Record<string, number>): void {
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
    try { renderScene(this.canvas, this.project, evaluateScene(this.currentScene, this.time, this.params), this.resources, this.project.canvas.background) }
    catch (cause) { this.onError?.(cause instanceof Error ? cause : new Error(String(cause))) }
  }

  destroy(): void { this.pause(); this.destroyed = true; this.loadVersion++; this.resources.clear(); this.onChange = undefined; this.onError = undefined }
}

export function mountPlayer(container: HTMLElement, project: Project, sceneId?: string): Player {
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = 'auto'
  container.append(canvas)
  const player = new Player(canvas, project, sceneId)
  const destroy = player.destroy.bind(player)
  player.destroy = () => { destroy(); canvas.remove() }
  return player
}
