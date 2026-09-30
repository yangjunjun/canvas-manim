<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Player } from './core/player.ts'
import { evaluateScene, validateProject } from './core/engine.ts'
import { hitTestScene, selectionBounds } from './core/hit-test.ts'
import { projectFromBlob, projectToBlob } from './core/project-file.ts'
import { createBlankProject, templates } from './core/templates.ts'
import { download, exportFrames, exportPng, exportVideo, supportedVideoType } from './core/export.ts'
import type { Project, SceneNode, Track } from './core/types.ts'

const project = ref<Project>(templates.math())
const sceneId = ref(project.value.scenes[0].id)
const canvas = ref<HTMLCanvasElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const player = ref<Player | null>(null)
const selectedId = ref<string | null>(null)
const selectedTrack = ref('x')
const currentTime = ref(0)
const playing = ref(false)
const busy = ref(false)
const leftCollapsed = ref(typeof window !== 'undefined' && window.innerWidth < 900)
const rightCollapsed = ref(typeof window !== 'undefined' && window.innerWidth < 900)
const message = ref('选择模板或从空白场景开始。')
const paramValues = ref<Record<string, number>>({})
const undoStack: Project[] = []
const redoStack: Project[] = []
const scene = computed(() => project.value.scenes.find(item => item.id === sceneId.value) ?? project.value.scenes[0])
const selected = computed(() => scene.value.nodes.find(node => node.id === selectedId.value) ?? null)
const evaluatedSelected = computed(() => {
  if (!selectedId.value) return null
  try { return evaluateScene(scene.value, currentTime.value, paramValues.value).nodes.find(node => node.id === selectedId.value) ?? null }
  catch { return null }
})
const textDriven = computed(() => selected.value?.type === 'text' || selected.value?.type === 'formula'
  ? Boolean(selected.value.valueExpression || scene.value.tracks.some(track => track.nodeId === selectedId.value && track.property === 'text')) : false)
const primaryName = computed(() => {
  if (!selected.value) return ''
  if (selected.value.type === 'text' || selected.value.type === 'formula') return (textDriven.value ? evaluatedSelected.value?.text : selected.value.text) ?? selected.value.name
  return selected.value.name
})
const selectionBox = computed(() => {
  if (!selectedId.value) return null
  try {
    return selectionBounds(evaluateScene(scene.value, currentTime.value, paramValues.value), selectedId.value, (content, size) => {
      const context = canvas.value?.getContext('2d')
      if (!context) return { width: content.length * size, ascent: size, descent: size * 0.25 }
      context.save()
      context.font = `${size}px "Noto Sans SC", sans-serif`
      const metrics = context.measureText(content)
      context.restore()
      return { width: metrics.width, ascent: metrics.actualBoundingBoxAscent || size, descent: metrics.actualBoundingBoxDescent || size * 0.25 }
    })
  } catch { return null }
})
const playLabel = computed(() => playing.value ? '暂停' : '播放')
const supportVideo = supportedVideoType()
const cloneCurrent = (): Project => JSON.parse(JSON.stringify(project.value)) as Project

function displayNodeName(node: SceneNode): string {
  if (node.type !== 'text' && node.type !== 'formula') return node.name
  const content = node.id === selectedId.value && textDriven.value ? evaluatedSelected.value?.text : node.text
  return content || node.name
}

function editPrimaryName(event: Event): void {
  if (!selectedId.value) return
  const value = (event.target as HTMLInputElement).value
  if (selected.value?.type !== 'text' && selected.value?.type !== 'formula') { editNode('name', value); return }
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    node.text = value
    node.name = value || node.name
  })
}

function driverFor(property: 'x' | 'y'): '表达式' | '关键帧' | null {
  if (!selected.value) return null
  if (selected.value.bindings?.[property]) return '表达式'
  if (scene.value.tracks.some(track => track.nodeId === selectedId.value && track.property === property)) return '关键帧'
  return null
}

function announce(error: unknown): void { message.value = error instanceof Error ? error.message : String(error) }

function togglePanel(side: 'left' | 'right'): void {
  if (side === 'left') {
    leftCollapsed.value = !leftCollapsed.value
    if (!leftCollapsed.value && window.innerWidth < 900) rightCollapsed.value = true
  } else {
    rightCollapsed.value = !rightCollapsed.value
    if (!rightCollapsed.value && window.innerWidth < 900) leftCollapsed.value = true
  }
}

function closePanels(): void { leftCollapsed.value = true; rightCollapsed.value = true }

function syncPlayer(keepTime = true): void {
  const time = keepTime ? currentTime.value : 0
  const values = { ...paramValues.value }
  player.value?.setProject(project.value, sceneId.value)
  player.value?.setParams(values)
  player.value?.seek(time)
}

function commit(change: (draft: Project) => void): void {
  try {
    const draft = cloneCurrent()
    change(draft)
    validateProject(draft)
    undoStack.push(cloneCurrent())
    if (undoStack.length > 80) undoStack.shift()
    redoStack.length = 0
    project.value = draft
    syncPlayer()
    message.value = '已更新项目'
  } catch (error) { announce(error) }
}

function undo(): void {
  const previous = undoStack.pop()
  if (!previous) return
  redoStack.push(cloneCurrent())
  project.value = previous
  if (!project.value.scenes.some(item => item.id === sceneId.value)) sceneId.value = project.value.scenes[0].id
  syncPlayer()
}

function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(cloneCurrent())
  project.value = next
  syncPlayer()
}

function newProject(key: string): void {
  if (key === 'blank') project.value = createBlankProject()
  else project.value = templates[key]()
  undoStack.length = 0; redoStack.length = 0
  sceneId.value = project.value.scenes[0].id
  selectedId.value = null
  currentTime.value = 0
  paramValues.value = {}
  syncPlayer(false)
  message.value = `已打开「${project.value.name}」`
}

function addScene(): void {
  const id = `scene-${Date.now()}`
  commit(draft => draft.scenes.push({ id, name: `场景 ${draft.scenes.length + 1}`, duration: 8, params: [], nodes: [], tracks: [] }))
  sceneId.value = id
  selectedId.value = null
  syncPlayer(false)
}

function chooseScene(id: string): void {
  sceneId.value = id; selectedId.value = null; currentTime.value = 0
  player.value?.setScene(id)
}

const nodeNames: Record<string, string> = { group: '分组', circle: '圆形', rect: '矩形', line: '线段', arrow: '箭头', text: '文字', formula: '公式', axes: '坐标系', plot: '函数曲线', point: '点', polygon: '多边形', path: '路径', image: '图片' }

function addNode(type: SceneNode['type']): void {
  const id = `${type}-${Date.now()}`
  const node: SceneNode = {
    id, type, name: nodeNames[type], x: 410, y: 280,
    width: 180, height: 120, radius: 30,
    fill: type === 'text' || type === 'formula' ? '#f8fafc' : '#5eead4',
    stroke: '#e2e8f0', lineWidth: 2, fontSize: 34,
    text: type === 'formula' ? 'x^2+y^2=r^2' : '新文字',
  }
  if (type === 'group') { node.x = 0; node.y = 0; node.name = '新分组'; node.fill = undefined; node.stroke = undefined }
  if (type === 'point') { node.radius = 12; node.x = 620; node.y = 350 }
  if (type === 'line' || type === 'arrow') { node.x2 = 670; node.y2 = 430; node.fill = '#fbbf24' }
  if (type === 'axes') { node.x = 180; node.y = 180; node.width = 900; node.height = 420; node.xRange = [-5, 5]; node.yRange = [-3, 3] }
  if (type === 'plot') {
    const axes = scene.value.nodes.find(item => item.type === 'axes')
    if (!axes) { message.value = '请先添加坐标系'; return }
    node.axesId = axes.id; node.expression = 'sin(x)'; node.x = 0; node.y = 0; node.stroke = '#5eead4'; node.lineWidth = 4
  }
  if (type === 'polygon' || type === 'path') node.points = [[0, 0], [90, -80], [180, 0]]
  if (type === 'image') { imageInput.value?.click(); return }
  commit(draft => draft.scenes.find(item => item.id === sceneId.value)!.nodes.push(node))
  selectedId.value = id
}

function removeSelected(): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    target.nodes = target.nodes.filter(node => node.id !== id)
    target.tracks = target.tracks.filter(track => track.nodeId !== id)
  })
  selectedId.value = null
}

function editNode(field: keyof SceneNode, value: string | number | boolean): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    ;(node as unknown as Record<string, unknown>)[field] = value
  })
}

function editNodeNumber(field: keyof SceneNode, event: Event): void { editNode(field, Number((event.target as HTMLInputElement).value)) }
function editNodeString(field: keyof SceneNode, event: Event): void { editNode(field, (event.target as HTMLInputElement).value) }

function editProjectName(event: Event): void { commit(draft => { draft.name = (event.target as HTMLInputElement).value.trim() || '未命名作品' }) }
function editCanvas(field: 'width' | 'height' | 'background', event: Event): void {
  const value = (event.target as HTMLInputElement).value
  commit(draft => { if (field === 'background') draft.canvas.background = value; else draft.canvas[field] = Number(value) })
}
function editScene(field: 'name' | 'duration', event: Event): void {
  const value = (event.target as HTMLInputElement).value
  commit(draft => { const target = draft.scenes.find(item => item.id === sceneId.value)!; if (field === 'name') target.name = value; else target.duration = Number(value) })
}
function editAxisRange(axis: 'xRange' | 'yRange', index: 0 | 1, event: Event): void {
  if (!selectedId.value) return
  const value = Number((event.target as HTMLInputElement).value), id = selectedId.value
  commit(draft => { const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!; const range = [...(node[axis] ?? [-5, 5])] as [number, number]; range[index] = value; node[axis] = range })
}

function editBinding(field: string, event: Event): void {
  if (!selectedId.value) return
  const expression = (event.target as HTMLInputElement).value.trim()
  const id = selectedId.value
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    const node = target.nodes.find(item => item.id === id)!
    node.bindings ??= {}
    if (expression) {
      node.bindings[field] = expression
      target.tracks = target.tracks.filter(track => !(track.nodeId === id && track.property === field))
    } else delete node.bindings[field]
  })
}

function addParameter(): void {
  const id = `p${scene.value.params.length + 1}`
  commit(draft => draft.scenes.find(item => item.id === sceneId.value)!.params.push({ id, label: `参数 ${id}`, value: 1, min: 0, max: 10, step: 0.1 }))
}

function editParam(id: string, field: 'label' | 'value' | 'min' | 'max' | 'step' | 'unit', value: string): void {
  commit(draft => {
    const param = draft.scenes.find(item => item.id === sceneId.value)!.params.find(item => item.id === id)!
    if (field === 'label' || field === 'unit') param[field] = value
    else param[field] = Number(value)
  })
}

function changeParam(id: string, value: number): void {
  paramValues.value = { ...paramValues.value, [id]: value }
  player.value?.setParams(paramValues.value)
}

function addKeyframe(): void {
  if (!selectedId.value) { message.value = '先选择一个对象'; return }
  const id = selectedId.value, property = selectedTrack.value as keyof SceneNode
  let value: unknown
  try { value = (evaluateScene(scene.value, currentTime.value, paramValues.value).nodes.find(node => node.id === id) as unknown as Record<string, unknown>)[property] }
  catch (error) { announce(error); return }
  if (typeof value !== 'number' && typeof value !== 'string') { message.value = '该属性尚无可用值'; return }
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    const node = target.nodes.find(item => item.id === id)!
    if (node.bindings?.[property]) throw new Error('该属性已有表达式绑定，请先清除')
    let track = target.tracks.find(item => item.nodeId === id && item.property === property)
    if (!track) { track = { nodeId: id, property, keyframes: [] }; target.tracks.push(track) }
    const time = Math.min(target.duration, Math.max(0, Number(currentTime.value.toFixed(2))))
    track.keyframes = track.keyframes.filter(item => item.time !== time)
    track.keyframes.push({ time, value, easing: typeof value === 'number' ? 'linear' : 'step' })
    track.keyframes.sort((a, b) => a.time - b.time)
  })
}

function moveKeyframe(track: Track, index: number, value: number): void {
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    const editable = target.tracks.find(item => item.nodeId === track.nodeId && item.property === track.property)!
    editable.keyframes[index].time = Math.max(0, Math.min(target.duration, value))
    editable.keyframes.sort((a, b) => a.time - b.time)
  })
}

function editKeyframeValue(track: Track, index: number, value: string): void {
  commit(draft => {
    const editable = draft.scenes.find(item => item.id === sceneId.value)!.tracks.find(item => item.nodeId === track.nodeId && item.property === track.property)!
    editable.keyframes[index].value = typeof editable.keyframes[index].value === 'number' ? Number(value) : value
  })
}

function deleteTrack(track: Track): void {
  commit(draft => { const target = draft.scenes.find(item => item.id === sceneId.value)!; target.tracks = target.tracks.filter(item => !(item.nodeId === track.nodeId && item.property === track.property)) })
}

function togglePlay(): void { playing.value ? player.value?.pause() : player.value?.play() }
function seek(event: Event): void { player.value?.seek(Number((event.target as HTMLInputElement).value)) }

async function save(): Promise<void> {
  try { download(projectToBlob(cloneCurrent()), `${project.value.name || 'project'}.cmanim`); message.value = '项目已下载' }
  catch (error) { announce(error) }
}

async function openFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const loaded = await projectFromBlob(file)
    project.value = loaded; sceneId.value = loaded.scenes[0].id; selectedId.value = null; currentTime.value = 0; paramValues.value = {}
    undoStack.length = 0; redoStack.length = 0; syncPlayer(false)
    message.value = `已打开「${loaded.name}」`
  } catch (error) { announce(error) }
  input.value = ''
}

async function importImage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/') || file.size > 5_000_000) { message.value = '请选择 5 MB 以下的图片'; return }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  const id = `asset-${Date.now()}`, nodeId = `image-${Date.now()}`
  commit(draft => {
    draft.assets.push({ id, mime: file.type, name: file.name, data })
    draft.scenes.find(item => item.id === sceneId.value)!.nodes.push({ id: nodeId, name: file.name, type: 'image', x: 420, y: 250, width: 320, height: 240, assetId: id })
  })
  selectedId.value = nodeId; input.value = ''
}

async function output(kind: 'png' | 'video' | 'frames'): Promise<void> {
  busy.value = true; message.value = '正在准备资源并导出…'
  try {
    if (kind === 'png') download(await exportPng(project.value, sceneId.value, currentTime.value, paramValues.value), `${scene.value.name}.png`)
    else if (kind === 'frames') download(await exportFrames(project.value, sceneId.value, paramValues.value), `${scene.value.name}-frames.zip`)
    else {
      const result = await exportVideo(project.value, sceneId.value, paramValues.value)
      download(result.blob, `${scene.value.name}.${result.mime.includes('mp4') ? 'mp4' : 'webm'}`)
    }
    message.value = '导出完成'
  } catch (error) { announce(error) }
  finally { busy.value = false }
}

function canvasPoint(event: PointerEvent): [number, number] {
  const bounds = canvas.value!.getBoundingClientRect()
  return [(event.clientX - bounds.left) / bounds.width * project.value.canvas.width, (event.clientY - bounds.top) / bounds.height * project.value.canvas.height]
}

let drag: { id: string; startX: number; startY: number; nodeX: number; nodeY: number; before: Project } | null = null
function canvasPointerDown(event: PointerEvent): void {
  const [x, y] = canvasPoint(event)
  let hit: SceneNode | null = null
  try { hit = hitTestScene(evaluateScene(scene.value, currentTime.value, paramValues.value), x, y) }
  catch (error) { announce(error); return }
  selectedId.value = hit?.id ?? null
  if (!hit) return
  const driven = hit.bindings?.x || hit.bindings?.y || scene.value.tracks.some(track => track.nodeId === hit!.id && (track.property === 'x' || track.property === 'y'))
  if (hit.axesId || hit.type === 'plot' || driven) {
    message.value = driven ? '已选中对象。位置由表达式或关键帧控制，请在右侧或时间线修改' : '已选中对象。此对象使用坐标系，请在右侧修改坐标'
    return
  }
  drag = { id: hit.id, startX: x, startY: y, nodeX: hit.x, nodeY: hit.y, before: cloneCurrent() }
  canvas.value?.setPointerCapture(event.pointerId)
}

function canvasPointerMove(event: PointerEvent): void {
  if (!drag) return
  const [x, y] = canvasPoint(event)
  const node = scene.value.nodes.find(item => item.id === drag!.id)
  if (!node) return
  node.x = Math.round(drag.nodeX + x - drag.startX)
  node.y = Math.round(drag.nodeY + y - drag.startY)
  player.value?.render()
}

function canvasPointerUp(): void {
  if (!drag) return
  const moved = scene.value.nodes.find(item => item.id === drag!.id)
  if (moved && (moved.x !== drag.nodeX || moved.y !== drag.nodeY)) {
    undoStack.push(drag.before); redoStack.length = 0
    project.value = cloneCurrent()
    syncPlayer()
  }
  drag = null
}

function keyboard(event: KeyboardEvent): void {
  const target = event.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
  else if (event.key === ' ') { event.preventDefault(); togglePlay() }
  else if (event.key === 'ArrowRight') { event.preventDefault(); player.value?.step(1 / 30) }
  else if (event.key === 'Delete' && selectedId.value) removeSelected()
}

onMounted(async () => {
  await nextTick()
  if (canvas.value) {
    player.value = new Player(canvas.value, project.value, sceneId.value)
    player.value.onChange = (time, isPlaying) => { currentTime.value = time; playing.value = isPlaying }
    player.value.onError = announce
  }
  window.addEventListener('keydown', keyboard)
})
onBeforeUnmount(() => { window.removeEventListener('keydown', keyboard); player.value?.destroy() })
</script>

<template>
  <div class="workspace">
    <header class="topbar">
      <div class="top-left">
        <div class="brand"><span class="brand-mark">◈</span><div><strong>Canvas Manim</strong><small>数学与科学动画工作台</small></div></div>
        <div class="panel-switches" aria-label="工作区面板">
          <button class="panel-toggle" :class="{ active: !leftCollapsed }" :aria-expanded="!leftCollapsed" aria-controls="left-panel" :aria-label="leftCollapsed ? '展开左侧栏' : '折叠左侧栏'" @click="togglePanel('left')"><span aria-hidden="true">▤</span><span>图层</span></button>
          <button class="panel-toggle" :class="{ active: !rightCollapsed }" :aria-expanded="!rightCollapsed" aria-controls="right-panel" :aria-label="rightCollapsed ? '展开右侧栏' : '折叠右侧栏'" @click="togglePanel('right')"><span aria-hidden="true">▥</span><span>属性</span></button>
        </div>
      </div>
      <div class="top-actions">
        <span class="project-name">{{ project.name }}</span>
        <a class="ghost help-link" href="./guide.html" target="_blank" rel="noopener noreferrer">？ 使用指南</a>
        <button class="ghost" title="撤销 Ctrl+Z" @click="undo">↶</button>
        <button class="ghost" title="重做 Ctrl+Y" @click="redo">↷</button>
        <button class="ghost" @click="newProject('blank')">新建</button>
        <button class="ghost" @click="fileInput?.click()">打开</button>
        <button class="ghost" @click="save">保存项目</button>
        <input ref="fileInput" type="file" accept=".cmanim,.json,application/zip,application/json" hidden @change="openFile" />
        <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="importImage" />
      </div>
    </header>

    <main class="main-layout" :class="{ 'left-collapsed': leftCollapsed, 'right-collapsed': rightCollapsed }">
      <button v-if="!leftCollapsed || !rightCollapsed" class="panel-scrim" aria-label="关闭侧栏" @click="closePanels"></button>
      <aside v-show="!leftCollapsed" id="left-panel" class="left-panel">
        <div class="panel-heading"><span>快速开始</span><span class="eyebrow">TEMPLATES</span></div>
        <a class="starter-link" href="./guide.html" target="_blank" rel="noopener noreferrer"><span>第一次使用？</span><strong>跟着指南完成第一个动画 →</strong></a>
        <div class="template-list">
          <button @click="newProject('math')"><span class="template-icon teal">∿</span><span>正弦函数<small>图像与切线</small></span></button>
          <button @click="newProject('physics')"><span class="template-icon blue">↗</span><span>抛体运动<small>轨迹与速度</small></span></button>
          <button @click="newProject('binary')"><span class="template-icon amber">⌕</span><span>二分查找<small>算法逐步演示</small></span></button>
        </div>
        <div class="section-title"><span>场景</span><button title="新增场景" @click="addScene">＋</button></div>
        <div class="scene-list"><button v-for="item in project.scenes" :key="item.id" :class="{ active: item.id === sceneId }" @click="chooseScene(item.id)">▣ &nbsp;{{ item.name }}</button></div>
        <div class="section-title"><span>对象图层</span><select aria-label="添加对象" @change="addNode(($event.target as HTMLSelectElement).value as SceneNode['type']); ($event.target as HTMLSelectElement).value = ''"><option value="">＋ 添加</option><option v-for="(label, key) in nodeNames" :key="key" :value="key">{{ label }}</option></select></div>
        <div class="node-list">
          <button v-for="node in scene.nodes" :key="node.id" :class="{ active: selectedId === node.id }" @click="selectedId = node.id"><span class="node-icon">{{ node.type === 'formula' ? '∑' : node.type === 'plot' ? '∿' : node.type === 'text' ? 'T' : '◇' }}</span><span>{{ displayNodeName(node) }}</span><small>{{ node.type }}</small></button>
          <p v-if="!scene.nodes.length" class="empty-note">添加对象，开始构建场景。</p>
        </div>
      </aside>

      <section class="stage-section">
        <div class="stage-header"><div><span class="eyebrow">SCENE PREVIEW</span><h1>{{ scene.name }}</h1></div><div class="stage-meta">{{ project.canvas.width }} × {{ project.canvas.height }} <span>·</span> {{ scene.duration }}s</div></div>
        <div class="canvas-shell">
          <canvas ref="canvas" :width="project.canvas.width" :height="project.canvas.height" @pointerdown="canvasPointerDown" @pointermove="canvasPointerMove" @pointerup="canvasPointerUp" @pointercancel="canvasPointerUp"></canvas>
          <svg v-if="selectionBox" class="selection-overlay" :viewBox="`0 0 ${project.canvas.width} ${project.canvas.height}`" preserveAspectRatio="none" aria-hidden="true"><rect class="selection-rect" :x="selectionBox.x" :y="selectionBox.y" :width="selectionBox.width" :height="selectionBox.height" /><circle v-for="(corner, index) in [[selectionBox.x, selectionBox.y], [selectionBox.x + selectionBox.width, selectionBox.y], [selectionBox.x, selectionBox.y + selectionBox.height], [selectionBox.x + selectionBox.width, selectionBox.y + selectionBox.height]]" :key="index" class="selection-handle" :cx="corner[0]" :cy="corner[1]" r="4" /></svg>
          <span class="canvas-badge">{{ selected ? `已选中 · ${displayNodeName(selected)}` : '点击画布或图层选择对象' }}</span>
        </div>
        <div class="transport"><button class="play-button" :aria-label="playLabel" @click="togglePlay">{{ playing ? 'Ⅱ' : '▶' }}</button><button class="step-button" title="下一帧" @click="player?.step()">⏭</button><span class="time-readout">{{ currentTime.toFixed(2) }} / {{ scene.duration.toFixed(2) }} s</span><input class="scrubber" type="range" min="0" :max="scene.duration" step="0.01" :value="currentTime" aria-label="播放进度" @input="seek" /></div>
        <div class="timeline-panel"><div class="timeline-header"><div><strong>时间线</strong><small>选择对象后，为属性添加关键帧</small></div><div class="timeline-actions"><select v-model="selectedTrack" aria-label="动画属性"><option value="x">X 位置</option><option value="y">Y 位置</option><option value="opacity">透明度</option><option value="rotation">旋转</option><option value="scale">缩放</option><option value="fill">填充色</option><option value="text">文字</option></select><button @click="addKeyframe">＋ 关键帧</button></div></div>
          <div class="ruler"><span v-for="mark in 9" :key="mark">{{ ((mark - 1) * scene.duration / 8).toFixed(1) }}s</span></div>
          <div class="track-list"><div v-for="track in scene.tracks" :key="`${track.nodeId}.${track.property}`" class="track-row"><div class="track-label"><span>{{ scene.nodes.find(node => node.id === track.nodeId)?.name }}</span><small>{{ track.property }}</small><button title="删除轨道" @click="deleteTrack(track)">×</button></div><div class="track-line"><div v-for="(frame, index) in track.keyframes" :key="index" class="keyframe" :style="{ left: `${frame.time / scene.duration * 100}%` }" :title="`${frame.time}s: ${frame.value}`"><span>◆</span><input type="number" min="0" :max="scene.duration" step="0.1" :value="frame.time" aria-label="关键帧时间" @change="moveKeyframe(track, index, Number(($event.target as HTMLInputElement).value))" /><input :value="frame.value" aria-label="关键帧值" @change="editKeyframeValue(track, index, ($event.target as HTMLInputElement).value)" /></div></div></div><p v-if="!scene.tracks.length" class="empty-note">暂无关键帧。先选一个对象，再点击“＋ 关键帧”。</p></div>
        </div>
      </section>

      <aside v-show="!rightCollapsed" id="right-panel" class="right-panel">
        <div class="panel-heading"><span>属性检查器</span><span class="eyebrow">INSPECTOR</span></div>
        <details class="project-settings"><summary>项目与场景设置</summary><div class="settings-body"><label>项目名称<input :value="project.name" @change="editProjectName" /></label><label>场景名称<input :value="scene.name" @change="editScene('name', $event)" /></label><div class="field-row"><label>时长（秒）<input type="number" min="0.1" step="0.1" :value="scene.duration" @change="editScene('duration', $event)" /></label><label>背景色<input type="color" :value="project.canvas.background ?? '#0b1220'" @change="editCanvas('background', $event)" /></label></div><div class="field-row"><label>画布宽度<input type="number" min="1" max="4096" :value="project.canvas.width" @change="editCanvas('width', $event)" /></label><label>画布高度<input type="number" min="1" max="4096" :value="project.canvas.height" @change="editCanvas('height', $event)" /></label></div></div></details>
        <div v-if="selected" class="inspector"><div class="inspector-name"><span class="template-icon teal">◇</span><div><strong>{{ displayNodeName(selected) }}</strong><small>{{ nodeNames[selected.type] }}</small></div><button title="删除对象" @click="removeSelected">×</button></div>
          <label>名称<input :value="primaryName" :disabled="textDriven" @change="editPrimaryName" /><small v-if="selected.type === 'text' || selected.type === 'formula'" class="field-help">{{ textDriven ? '画布文字由表达式或关键帧生成，请修改驱动来源' : '文字对象的名称就是画布显示内容' }}</small></label>
          <label v-if="selected.type !== 'group'">所属分组<select :value="selected.parentId ?? ''" @change="editNodeString('parentId', $event)"><option value="">无</option><option v-for="group in scene.nodes.filter(node => node.type === 'group')" :key="group.id" :value="group.id">{{ group.name }}</option></select></label>
          <div class="field-row"><label>X 位置<input type="number" :value="evaluatedSelected?.x ?? selected.x" :disabled="!!driverFor('x')" @change="editNodeNumber('x', $event)" /><small v-if="driverFor('x')" class="driven-note">由{{ driverFor('x') }}控制，修改下方绑定或时间线</small></label><label>Y 位置<input type="number" :value="evaluatedSelected?.y ?? selected.y" :disabled="!!driverFor('y')" @change="editNodeNumber('y', $event)" /><small v-if="driverFor('y')" class="driven-note">由{{ driverFor('y') }}控制，修改下方绑定或时间线</small></label></div>
          <div v-if="['rect','axes','image'].includes(selected.type)" class="field-row"><label>宽度<input type="number" min="1" :value="selected.width" @change="editNodeNumber('width', $event)" /></label><label>高度<input type="number" min="1" :value="selected.height" @change="editNodeNumber('height', $event)" /></label></div>
          <div v-if="['circle','point'].includes(selected.type)" class="field-row"><label>半径<input type="number" min="1" :value="selected.radius" @change="editNodeNumber('radius', $event)" /></label><label>透明度<input type="number" min="0" max="1" step="0.1" :value="selected.opacity ?? 1" @change="editNodeNumber('opacity', $event)" /></label></div>
          <div v-if="['line','arrow'].includes(selected.type)" class="field-row"><label>终点 X<input type="number" :value="selected.x2" @change="editNodeNumber('x2', $event)" /></label><label>终点 Y<input type="number" :value="selected.y2" @change="editNodeNumber('y2', $event)" /></label></div>
          <div v-if="['text','formula'].includes(selected.type)" class="field-row"><label>字号<input type="number" min="8" :value="selected.fontSize ?? 24" @change="editNodeNumber('fontSize', $event)" /></label><label>透明度<input type="number" min="0" max="1" step="0.1" :value="selected.opacity ?? 1" @change="editNodeNumber('opacity', $event)" /></label></div>
          <label v-if="selected.type === 'plot'">函数 y = f(x)<input :value="selected.expression" placeholder="sin(x)" @change="editNodeString('expression', $event)" /></label>
          <template v-if="selected.type === 'axes'"><div class="field-row"><label>X 最小<input type="number" :value="selected.xRange?.[0]" @change="editAxisRange('xRange', 0, $event)" /></label><label>X 最大<input type="number" :value="selected.xRange?.[1]" @change="editAxisRange('xRange', 1, $event)" /></label></div><div class="field-row"><label>Y 最小<input type="number" :value="selected.yRange?.[0]" @change="editAxisRange('yRange', 0, $event)" /></label><label>Y 最大<input type="number" :value="selected.yRange?.[1]" @change="editAxisRange('yRange', 1, $event)" /></label></div></template>
          <label v-if="['point','line','arrow','plot'].includes(selected.type)">关联坐标系<select :value="selected.axesId ?? ''" @change="editNodeString('axesId', $event)"><option value="">使用画布坐标</option><option v-for="axes in scene.nodes.filter(node => node.type === 'axes')" :key="axes.id" :value="axes.id">{{ axes.name }}</option></select></label>
          <div class="field-row"><label>旋转（弧度）<input type="number" step="0.1" :value="selected.rotation ?? 0" @change="editNodeNumber('rotation', $event)" /></label><label>缩放<input type="number" min="0.1" step="0.1" :value="selected.scale ?? 1" @change="editNodeNumber('scale', $event)" /></label></div>
          <div class="field-row"><label>填充色<input type="color" :value="selected.fill ?? '#ffffff'" @change="editNodeString('fill', $event)" /></label><label>描边色<input type="color" :value="selected.stroke ?? '#ffffff'" @change="editNodeString('stroke', $event)" /></label></div>
          <label>时间表达式 <small>例如 sin(t) 或 speed*t</small><input :value="selected.bindings?.x ?? ''" placeholder="X =" @change="editBinding('x', $event)" /><input :value="selected.bindings?.y ?? ''" placeholder="Y =" @change="editBinding('y', $event)" /></label>
          <template v-if="selected.type === 'text'"><label>数值读数表达式<input :value="selected.valueExpression ?? ''" placeholder="例如 speed*t" @change="editNodeString('valueExpression', $event)" /></label><div class="field-row"><label>前缀<input :value="selected.prefix ?? ''" @change="editNodeString('prefix', $event)" /></label><label>后缀<input :value="selected.suffix ?? ''" @change="editNodeString('suffix', $event)" /></label></div><label>小数位<input type="number" min="0" max="8" :value="selected.precision ?? 2" @change="editNodeNumber('precision', $event)" /></label></template>
        </div><div v-else class="inspector-empty"><span>◇</span><p>选择画布上的对象或左侧图层，在这里调整属性。</p></div>
        <div class="params-panel"><div class="section-title"><span>场景参数</span><button title="新增参数" @click="addParameter">＋</button></div><div v-for="param in scene.params" :key="param.id" class="param-item"><div class="param-head"><strong>{{ param.label }}</strong><span>{{ (paramValues[param.id] ?? param.value).toFixed(2) }} {{ param.unit }}</span></div><input type="range" :min="param.min" :max="param.max" :step="param.step" :value="paramValues[param.id] ?? param.value" :aria-label="param.label" @input="changeParam(param.id, Number(($event.target as HTMLInputElement).value))" /><details><summary>参数定义</summary><label>名称<input :value="param.label" @change="editParam(param.id, 'label', ($event.target as HTMLInputElement).value)" /></label><div class="field-row"><label>默认值<input type="number" :value="param.value" @change="editParam(param.id, 'value', ($event.target as HTMLInputElement).value)" /></label><label>单位<input :value="param.unit" @change="editParam(param.id, 'unit', ($event.target as HTMLInputElement).value)" /></label></div><div class="field-row"><label>最小<input type="number" :value="param.min" @change="editParam(param.id, 'min', ($event.target as HTMLInputElement).value)" /></label><label>最大<input type="number" :value="param.max" @change="editParam(param.id, 'max', ($event.target as HTMLInputElement).value)" /></label></div><label>步长<input type="number" min="0.001" step="0.001" :value="param.step" @change="editParam(param.id, 'step', ($event.target as HTMLInputElement).value)" /></label></details></div><p v-if="!scene.params.length" class="empty-note">添加参数，让作品可交互。</p></div>
        <div class="export-panel"><div class="section-title"><span>导出作品</span></div><div class="export-grid"><button :disabled="busy" @click="output('png')">▧ <span>当前帧 PNG</span></button><button :disabled="busy || !supportVideo" :title="supportVideo || '浏览器不支持视频录制'" @click="output('video')">▶ <span>视频 {{ supportVideo?.includes('mp4') ? 'MP4' : 'WebM' }}</span></button><button :disabled="busy" @click="output('frames')">▦ <span>逐帧 ZIP</span></button></div></div>
      </aside>
    </main>
    <footer class="statusbar"><span class="status-dot"></span><span>{{ message }}</span><span class="status-right">{{ busy ? '正在处理…' : '本地运行 · 无需登录' }}</span></footer>
  </div>
</template>
