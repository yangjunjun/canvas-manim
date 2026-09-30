import { strToU8, zipSync } from 'fflate'
import { evaluateScene } from './engine.ts'
import { renderScene, ResourceCache } from './renderer.ts'
import type { Project } from './types.ts'

function asBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas 图片导出失败')), 'image/png'))
}

function outputCanvas(project: Project): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = project.canvas.width
  canvas.height = project.canvas.height
  return canvas
}

export async function exportPng(project: Project, sceneId: string, time: number, params: Record<string, number> = {}): Promise<Blob> {
  const scene = project.scenes.find(item => item.id === sceneId)
  if (!scene) throw new Error('场景不存在')
  const resources = new ResourceCache()
  await resources.preload(project, sceneId)
  const canvas = outputCanvas(project)
  renderScene(canvas, project, evaluateScene(scene, time, params), resources, project.canvas.background)
  return asBlob(canvas)
}

export async function exportFrames(project: Project, sceneId: string, params: Record<string, number> = {}, fps = 30): Promise<Blob> {
  const scene = project.scenes.find(item => item.id === sceneId)
  if (!scene) throw new Error('场景不存在')
  const count = Math.ceil(scene.duration * fps) + 1
  if (count > 360) throw new Error('逐帧导出上限为 360 帧；请缩短场景或降低帧率')
  const resources = new ResourceCache()
  await resources.preload(project, sceneId)
  const canvas = outputCanvas(project)
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify({ sceneId, fps, duration: scene.duration, frames: count })) }
  for (let i = 0; i < count; i++) {
    renderScene(canvas, project, evaluateScene(scene, Math.min(scene.duration, i / fps), params), resources, project.canvas.background)
    files[`frames/${String(i).padStart(4, '0')}.png`] = new Uint8Array(await (await asBlob(canvas)).arrayBuffer())
  }
  return new Blob([Uint8Array.from(zipSync(files, { level: 0 }))], { type: 'application/zip' })
}

export function supportedVideoType(): string | null {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) ?? null
}

export async function exportVideo(project: Project, sceneId: string, params: Record<string, number> = {}): Promise<{ blob: Blob; mime: string }> {
  const mime = supportedVideoType()
  if (!mime) throw new Error('当前浏览器不支持视频录制，请导出逐帧图片')
  const scene = project.scenes.find(item => item.id === sceneId)
  if (!scene) throw new Error('场景不存在')
  const resources = new ResourceCache()
  await resources.preload(project, sceneId)
  const canvas = outputCanvas(project)
  const stream = canvas.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: mime })
  const chunks: Blob[] = []
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  let frame = 0
  try {
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('视频录制失败'))
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime }))
    })
    renderScene(canvas, project, evaluateScene(scene, 0, params), resources, project.canvas.background)
    recorder.start()
    await new Promise<void>((resolve) => {
      const start = performance.now()
      const draw = (now: number) => {
        const time = Math.min(scene.duration, (now - start) / 1000)
        renderScene(canvas, project, evaluateScene(scene, time, params), resources, project.canvas.background)
        if (time >= scene.duration) resolve()
        else frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
    })
    recorder.stop()
    return { blob: await recorded, mime: recorder.mimeType || mime }
  } finally {
    if (frame) cancelAnimationFrame(frame)
    if (recorder.state !== 'inactive') recorder.stop()
    stream.getTracks().forEach(track => track.stop())
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
