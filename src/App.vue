<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Player } from './core/player.ts'
import { evaluateScene, layoutAnchorPosition, validateProject } from './core/engine.ts'
import { applyAnimationCombo, type AnimationComboKind } from './core/animation-combos.ts'
import { hitTestScene, selectionBounds } from './core/hit-test.ts'
import { projectFromBlob, projectToBlob } from './core/project-file.ts'
import { createShareUrl, readShareUrl } from './core/share.ts'
import { createBlankProject, templates } from './core/templates.ts'
import { download, exportFrames, exportPng, exportVideo, resolveExportRange, supportedVideoType } from './core/export.ts'
import { ArrowUpRight, ChartNoAxesCombined, ChevronDown, Circle, Copy, Crosshair, Dot, Download, Folder, Image, Layers3, ListVideo, Minus, Pause, PenLine, Pentagon, Play, Plus, RectangleHorizontal, Redo2, Settings2, Share2, Sigma, SkipForward, SlidersHorizontal, SlidersVertical, Sparkles, Type, Undo2 } from '@lucide/vue'
import { Button } from './components/ui/button'
import { CollapsiblePanel } from './components/ui/collapsible'
import { Input } from './components/ui/input'
import { SelectField } from './components/ui/select'
import { Slider } from './components/ui/slider'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu'
import type { Project, SceneNode, Track } from './core/types.ts'

const project = ref<Project>(templates.math())
const sceneId = ref(project.value.scenes[0].id)
const canvas = ref<HTMLCanvasElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const player = ref<Player | null>(null)
const selectedId = ref<string | null>(null)
type LeftPanel = 'templates' | 'scenes' | 'layers'
type RightPanel = 'project' | 'object' | 'parameters'
const activeLeftPanel = ref<LeftPanel | null>(typeof window !== 'undefined' && window.innerWidth < 900 ? null : 'templates')
const activeRightPanel = ref<RightPanel | null>(typeof window !== 'undefined' && window.innerWidth < 900 ? null : 'project')
const selectedTrack = ref('x')
const selectedKeyframe = ref<{ nodeId: string; property: keyof SceneNode; time: number } | null>(null)
const draggingKeyframe = ref<{ nodeId: string; property: keyof SceneNode; index: number; time: number } | null>(null)
const draggingNodeId = ref<string | null>(null)
const nodeDropTarget = ref<{ id: string; side: 'before' | 'after' } | null>(null)
const currentTime = ref(0)
const playing = ref(false)
const busy = ref(false)
const exportOpen = ref(false)
const shareOpen = ref(false)
const shareUrl = ref('')
const message = ref('选择模板或从空白场景开始。')
const canvasPresets: { group: string; sizes: { label: string; width: number; height: number }[] }[] = [
  { group: '手机视频', sizes: [
    { label: '竖屏 HD', width: 720, height: 1280 },
    { label: '竖屏 Full HD', width: 1080, height: 1920 },
    { label: '全面屏', width: 1080, height: 2340 },
  ] },
  { group: '平板视频', sizes: [
    { label: '横屏 16:10', width: 1920, height: 1200 },
    { label: '横屏 4:3', width: 2048, height: 1536 },
  ] },
  { group: 'PC 视频', sizes: [
    { label: 'HD 720p', width: 1280, height: 720 },
    { label: 'Full HD 1080p', width: 1920, height: 1080 },
    { label: '2K 1440p', width: 2560, height: 1440 },
    { label: '4K UHD', width: 3840, height: 2160 },
  ] },
]
const canvasPresetGroups = canvasPresets.map(group => ({ label: group.group, options: group.sizes.map(size => ({ value: `${size.width}x${size.height}`, label: `${size.label} · ${size.width} × ${size.height}` })) }))
const animationOptions = [
  { value: 'x', label: 'X 位置' }, { value: 'y', label: 'Y 位置' },
  { value: 'opacity', label: '透明度' }, { value: 'rotation', label: '旋转' },
  { value: 'scale', label: '缩放' }, { value: 'fill', label: '填充色' }, { value: 'stroke', label: '描边色' },
  { value: 'text', label: '文字' }, { value: 'visible', label: '显示 / 隐藏' },
]
const visibilityOptions = [{ value: 'true', label: '显示' }, { value: 'false', label: '隐藏' }]
const orientationOptions = [{ value: 'false', label: '保持原角度' }, { value: 'true', label: '沿切线旋转' }]
const trailOptions = [{ value: 'false', label: '关闭' }, { value: 'true', label: '开启' }]
const comboOptions = [{ value: 'fadeSlideIn', label: '淡入并滑入' }, { value: 'pulse', label: '脉冲缩放' }, { value: 'fadeSlideOut', label: '淡出并滑出' }]
const comboKind = ref<AnimationComboKind>('fadeSlideIn')
const comboStart = ref(0)
const comboDuration = ref(2)
const comboAmount = ref(60)
const layoutOptions = [
  { value: '', label: '自由位置' },
  { value: 'left:top', label: '左上' }, { value: 'center:top', label: '上中' }, { value: 'right:top', label: '右上' },
  { value: 'left:center', label: '左中' }, { value: 'center:center', label: '画布中心' }, { value: 'right:center', label: '右中' },
  { value: 'left:bottom', label: '左下' }, { value: 'center:bottom', label: '下中' }, { value: 'right:bottom', label: '右下' },
]
const easingOptions = [
  { value: 'linear', label: '线性' }, { value: 'easeInOut', label: '缓入缓出' }, { value: 'step', label: '阶跃' },
]
const paramValues = ref<Record<string, number>>({})
const undoStack: Project[] = []
const redoStack: Project[] = []
const scene = computed(() => project.value.scenes.find(item => item.id === sceneId.value) ?? project.value.scenes[0])
const exportStart = ref(0)
const exportEnd = ref(scene.value.duration)
watch(() => scene.value.duration, duration => { exportStart.value = 0; exportEnd.value = duration })
watch(sceneId, () => { exportStart.value = 0; exportEnd.value = scene.value.duration })
const activeKeyframe = computed(() => {
  const selection = selectedKeyframe.value
  if (!selection) return null
  const track = scene.value.tracks.find(item => item.nodeId === selection.nodeId && item.property === selection.property)
  const index = track?.keyframes.findIndex(frame => frame.time === selection.time) ?? -1
  return track && index >= 0 ? { track, index, frame: track.keyframes[index], node: scene.value.nodes.find(node => node.id === track.nodeId) } : null
})
const selectedCanvasPreset = computed(() => canvasPresets.flatMap(group => group.sizes)
  .find(size => size.width === project.value.canvas.width && size.height === project.value.canvas.height))
const selected = computed(() => scene.value.nodes.find(node => node.id === selectedId.value) ?? null)
const pathOptions = computed(() => [{ value: '', label: '不跟随' }, ...scene.value.nodes.filter(node => node.type === 'path' && node.id !== selectedId.value).map(node => ({ value: node.id, label: node.name }))])
const matchOptions = computed(() => [{ value: '', label: '不变形' }, ...scene.value.nodes.filter(node => selected.value && !['group', 'axes', 'plot'].includes(node.type) && node.id !== selected.value.id && node.type === selected.value.type && !node.matchTransform && node.parentId === selected.value.parentId && node.axesId === selected.value.axesId && (node.type !== 'path' && node.type !== 'polygon' || node.points?.length === selected.value.points?.length) && !scene.value.nodes.some(item => item.matchTransform?.targetId === node.id && item.id !== selected.value?.id)).map(node => ({ value: node.id, label: node.name }))])
const evaluatedSelected = computed(() => {
  if (!selectedId.value) return null
  try { return evaluateScene(scene.value, currentTime.value, paramValues.value, { canvas: project.value.canvas }).nodes.find(node => node.id === selectedId.value) ?? null }
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
    return selectionBounds(evaluateScene(scene.value, currentTime.value, paramValues.value, { canvas: project.value.canvas }), selectedId.value, (content, size) => {
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

watch(selectedId, id => {
  if (!id) return
  activeRightPanel.value = 'object'
  if (window.innerWidth < 900) activeLeftPanel.value = null
})

function displayNodeName(node: SceneNode): string {
  if (node.type !== 'text' && node.type !== 'formula') return node.name
  const content = node.id === selectedId.value && textDriven.value ? evaluatedSelected.value?.text : node.text
  return content || node.name
}

function startNodeDrag(event: DragEvent, id: string): void {
  draggingNodeId.value = id
  nodeDropTarget.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}

function updateNodeDrop(event: DragEvent, id: string): void {
  if (!draggingNodeId.value || draggingNodeId.value === id) { nodeDropTarget.value = null; return }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  nodeDropTarget.value = { id, side: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' }
}

function finishNodeDrop(event: DragEvent): void {
  event.preventDefault()
  const sourceId = draggingNodeId.value
  const target = nodeDropTarget.value
  draggingNodeId.value = null
  nodeDropTarget.value = null
  if (!sourceId || !target) return
  const current = scene.value.nodes
  const sourceIndex = current.findIndex(node => node.id === sourceId)
  const targetIndex = current.findIndex(node => node.id === target.id)
  if (sourceIndex < 0 || targetIndex < 0) return
  const insertIndex = targetIndex + (target.side === 'after' ? 1 : 0) - (sourceIndex < targetIndex ? 1 : 0)
  if (insertIndex === sourceIndex) return
  commit(draft => {
    const nodes = draft.scenes.find(item => item.id === sceneId.value)!.nodes
    const [moved] = nodes.splice(sourceIndex, 1)
    nodes.splice(insertIndex, 0, moved)
    nodes.forEach((node, index) => { node.zIndex = index })
  })
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

function driverFor(property: 'x' | 'y'): '布局约束' | '路径跟随' | '表达式' | '关键帧' | null {
  if (!selected.value) return null
  if (selected.value.layout) return '布局约束'
  if (selected.value.followPath) return '路径跟随'
  if (selected.value.bindings?.[property]) return '表达式'
  if (scene.value.tracks.some(track => track.nodeId === selectedId.value && track.property === property)) return '关键帧'
  return null
}

function announce(error: unknown): void { message.value = error instanceof Error ? error.message : String(error) }

function toggleLeftPanel(panel: LeftPanel): void {
  activeLeftPanel.value = activeLeftPanel.value === panel ? null : panel
  if (activeLeftPanel.value && window.innerWidth < 900) activeRightPanel.value = null
}

function toggleRightPanel(panel: RightPanel): void {
  activeRightPanel.value = activeRightPanel.value === panel ? null : panel
  if (activeRightPanel.value && window.innerWidth < 900) activeLeftPanel.value = null
}

function closePanels(): void { activeLeftPanel.value = null; activeRightPanel.value = null }

function syncPlayer(keepTime = true): void {
  const time = keepTime ? currentTime.value : 0
  const values = Object.fromEntries(Object.entries(paramValues.value).filter(([id, value]) => scene.value.params.some(param => param.id === id && value >= param.min && value <= param.max)))
  paramValues.value = values
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
  selectedKeyframe.value = null
  if (!project.value.scenes.some(item => item.id === sceneId.value)) sceneId.value = project.value.scenes[0].id
  syncPlayer()
}

function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(cloneCurrent())
  project.value = next
  selectedKeyframe.value = null
  syncPlayer()
}

function newProject(key: string): void {
  if (key === 'blank') project.value = createBlankProject()
  else project.value = templates[key]()
  undoStack.length = 0; redoStack.length = 0
  sceneId.value = project.value.scenes[0].id
  exportStart.value = 0; exportEnd.value = scene.value.duration
  selectedId.value = null
  selectedKeyframe.value = null
  activeLeftPanel.value = window.innerWidth < 900 ? null : key === 'blank' ? 'layers' : 'templates'
  activeRightPanel.value = window.innerWidth < 900 ? null : 'project'
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
  selectedKeyframe.value = null
  activeLeftPanel.value = 'scenes'
  activeRightPanel.value = window.innerWidth < 900 ? null : 'project'
  syncPlayer(false)
}

function chooseScene(id: string): void {
  sceneId.value = id; selectedId.value = null; currentTime.value = 0
  paramValues.value = {}
  selectedKeyframe.value = null
  activeRightPanel.value = window.innerWidth < 900 ? null : 'project'
  player.value?.setScene(id)
}

const nodeNames: Record<string, string> = { group: '分组', circle: '圆形', rect: '矩形', line: '线段', arrow: '箭头', text: '文字', formula: '公式', axes: '坐标系', plot: '函数曲线', point: '点', polygon: '多边形', path: '路径', image: '图片' }
const nodeIcons = { group: Folder, circle: Circle, rect: RectangleHorizontal, line: Minus, arrow: ArrowUpRight, text: Type, formula: Sigma, axes: Crosshair, plot: ChartNoAxesCombined, point: Dot, polygon: Pentagon, path: PenLine, image: Image } satisfies Record<SceneNode['type'], typeof Circle>
const nodeOptions = Object.entries(nodeNames).map(([value, label]) => ({ value, label }))
const groupOptions = computed(() => [{ value: '', label: '无' }, ...scene.value.nodes.filter(node => node.type === 'group').map(node => ({ value: node.id, label: node.name }))])
const axesOptions = computed(() => [{ value: '', label: '使用画布坐标' }, ...scene.value.nodes.filter(node => node.type === 'axes').map(node => ({ value: node.id, label: node.name }))])
const nextNodeZIndex = (nodes: SceneNode[]): number => nodes.reduce((highest, node) => Math.max(highest, node.zIndex ?? 0), 0) + 1

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
  commit(draft => {
    const nodes = draft.scenes.find(item => item.id === sceneId.value)!.nodes
    node.zIndex = nextNodeZIndex(nodes)
    nodes.push(node)
  })
  selectedId.value = id
}

function removeSelected(): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    target.nodes = target.nodes.filter(node => node.id !== id)
    target.tracks = target.tracks.filter(track => track.nodeId !== id)
    for (const node of target.nodes) if (node.matchTransform?.targetId === id) delete node.matchTransform
  })
  selectedId.value = null
  selectedKeyframe.value = null
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

function setLayoutAnchor(value: string): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    const canvas = draft.canvas
    const [oldAnchorX, oldAnchorY] = node.layout ? layoutAnchorPosition(node.layout, canvas) : [0, 0]
    const positionX = node.layout ? oldAnchorX + node.layout.offsetX : node.x
    const positionY = node.layout ? oldAnchorY + node.layout.offsetY : node.y
    if (!value) { node.x = positionX; node.y = positionY; delete node.layout; return }
    const [anchorX, anchorY] = value.split(':') as [NonNullable<SceneNode['layout']>['anchorX'], NonNullable<SceneNode['layout']>['anchorY']]
    const layout: NonNullable<SceneNode['layout']> = { anchorX, anchorY, offsetX: 0, offsetY: 0 }
    const [nextX, nextY] = layoutAnchorPosition(layout, canvas)
    layout.offsetX = positionX - nextX; layout.offsetY = positionY - nextY
    node.layout = layout
  })
}

function editLayoutOffset(field: 'offsetX' | 'offsetY', event: Event): void {
  if (!selectedId.value) return
  const id = selectedId.value, value = Number((event.target as HTMLInputElement).value)
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.layout![field] = value })
}

function setFollowPath(pathId: string): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    if (!pathId) { delete node.followPath; return }
    node.followPath = { pathId, progress: 0, orient: false, offsetX: 0, offsetY: 0 }
  })
}

function editFollowNumber(field: 'progress' | 'offsetX' | 'offsetY', event: Event): void {
  if (!selectedId.value) return
  const id = selectedId.value, value = Number((event.target as HTMLInputElement).value)
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.followPath![field] = value })
}

function editFollowExpression(event: Event): void {
  if (!selectedId.value) return
  const id = selectedId.value, expression = (event.target as HTMLInputElement).value.trim()
  commit(draft => {
    const follow = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.followPath!
    if (expression) follow.progressExpression = expression
    else delete follow.progressExpression
  })
}

function editFollowOrient(value: string): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.followPath!.orient = value === 'true' })
}

function setTrail(value: string): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    if (value === 'true') node.trail = { duration: 2, samples: 8, radius: 5, opacity: 0.45, color: /^#[0-9a-f]{6}$/i.test(node.fill ?? '') ? node.fill : '#5eead4' }
    else delete node.trail
  })
}

function editTrailNumber(field: 'duration' | 'samples' | 'radius' | 'opacity', event: Event): void {
  if (!selectedId.value) return
  const id = selectedId.value, value = Number((event.target as HTMLInputElement).value)
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.trail![field] = value })
}

function editTrailColor(event: Event): void {
  if (!selectedId.value) return
  const id = selectedId.value, value = (event.target as HTMLInputElement).value
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.trail!.color = value })
}

function setMatchTarget(targetId: string): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    if (!targetId) { delete node.matchTransform; return }
    node.matchTransform = { targetId, start: 0, end: Math.min(2, draft.scenes.find(item => item.id === sceneId.value)!.duration), easing: 'easeInOut' }
  })
}

function editMatchNumber(field: 'start' | 'end', event: Event): void {
  if (!selectedId.value) return
  const id = selectedId.value, value = Number((event.target as HTMLInputElement).value)
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.matchTransform![field] = value })
}

function editMatchEasing(value: string): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => { draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.matchTransform!.easing = value as 'linear' | 'easeInOut' })
}

function applySelectedCombo(): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => applyAnimationCombo(draft.scenes.find(item => item.id === sceneId.value)!, id, {
    kind: comboKind.value, start: comboStart.value, duration: comboDuration.value, amount: comboAmount.value,
  }))
}

function selectComboKind(value: string): void {
  comboKind.value = value as AnimationComboKind
  comboAmount.value = value === 'pulse' ? 1.25 : 60
}

function editProjectName(event: Event): void { commit(draft => { draft.name = (event.target as HTMLInputElement).value.trim() || '未命名作品' }) }
function editCanvas(field: 'width' | 'height' | 'background', event: Event): void {
  const value = (event.target as HTMLInputElement).value
  commit(draft => { if (field === 'background') draft.canvas.background = value; else draft.canvas[field] = Number(value) })
}
function applyCanvasPreset(value: string): void {
  const preset = canvasPresets.flatMap(group => group.sizes).find(size => `${size.width}x${size.height}` === value)
  if (preset) commit(draft => { draft.canvas.width = preset.width; draft.canvas.height = preset.height })
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

function editPoint(index: number, coordinate: 0 | 1, event: Event): void {
  if (!selectedId.value) return
  const value = Number((event.target as HTMLInputElement).value), id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    node.points![index][coordinate] = value
  })
}

function addPoint(): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const points = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!.points!
    const last = points.at(-1)!
    points.push([last[0] + 60, last[1]])
  })
}

function removePoint(index: number): void {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(draft => {
    const node = draft.scenes.find(item => item.id === sceneId.value)!.nodes.find(item => item.id === id)!
    if (node.points!.length <= (node.type === 'polygon' ? 3 : 2)) throw new Error('顶点数量已达下限')
    node.points!.splice(index, 1)
  })
}

function editBinding(field: string, event: Event): void {
  if (!selectedId.value) return
  if ((selected.value?.layout || selected.value?.followPath) && (field === 'x' || field === 'y') && (event.target as HTMLInputElement).value.trim()) { message.value = '布局或路径跟随已控制位置；请先解除对应设置'; return }
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
  if ((property === 'x' || property === 'y') && (selected.value?.layout || selected.value?.followPath)) { message.value = '布局或路径跟随已控制位置；请先解除对应设置'; return }
  let value: unknown
  try {
    const node = evaluateScene(scene.value, currentTime.value, paramValues.value, { canvas: project.value.canvas }).nodes.find(node => node.id === id)!
    value = property === 'visible' ? node.visible !== false : (node as unknown as Record<string, unknown>)[property]
  }
  catch (error) { announce(error); return }
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') { message.value = '该属性尚无可用值'; return }
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    const node = target.nodes.find(item => item.id === id)!
    if (node.bindings?.[property]) throw new Error('该属性已有表达式绑定，请先清除')
    let track = target.tracks.find(item => item.nodeId === id && item.property === property)
    if (!track) { track = { nodeId: id, property, keyframes: [] }; target.tracks.push(track) }
    const time = Math.min(target.duration, Math.max(0, Number(currentTime.value.toFixed(2))))
    track.keyframes = track.keyframes.filter(item => item.time !== time)
    track.keyframes.push({ time, value, easing: typeof value === 'number' || property === 'fill' || property === 'stroke' ? 'linear' : 'step' })
    track.keyframes.sort((a, b) => a.time - b.time)
  })
  selectedKeyframe.value = { nodeId: id, property, time: Number(currentTime.value.toFixed(2)) }
}

function moveKeyframe(track: Track, index: number, value: number): void {
  const current = track.keyframes[index]
  if (!current || !Number.isFinite(value) || value < 0 || value > scene.value.duration
    || track.keyframes.some((frame, frameIndex) => frameIndex !== index && frame.time === value)) {
    message.value = '关键帧时间须在场景范围内，且不能与同轨道其他关键帧重合'
    return
  }
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    const editable = target.tracks.find(item => item.nodeId === track.nodeId && item.property === track.property)!
    editable.keyframes[index].time = Math.max(0, Math.min(target.duration, value))
    editable.keyframes.sort((a, b) => a.time - b.time)
  })
  selectedKeyframe.value = { nodeId: track.nodeId, property: track.property, time: value }
  player.value?.seek(value)
}

function editKeyframeValue(track: Track, index: number, value: string): void {
  commit(draft => {
    const editable = draft.scenes.find(item => item.id === sceneId.value)!.tracks.find(item => item.nodeId === track.nodeId && item.property === track.property)!
    editable.keyframes[index].value = typeof editable.keyframes[index].value === 'number' ? Number(value)
      : typeof editable.keyframes[index].value === 'boolean' ? value === 'true' : value
  })
}

function editKeyframeEasing(track: Track, index: number, easing: 'linear' | 'easeInOut' | 'step'): void {
  commit(draft => {
    const editable = draft.scenes.find(item => item.id === sceneId.value)!.tracks.find(item => item.nodeId === track.nodeId && item.property === track.property)!
    editable.keyframes[index].easing = easing
  })
}

function deleteKeyframe(track: Track, index: number): void {
  commit(draft => {
    const target = draft.scenes.find(item => item.id === sceneId.value)!
    const editable = target.tracks.find(item => item.nodeId === track.nodeId && item.property === track.property)!
    editable.keyframes.splice(index, 1)
    if (!editable.keyframes.length) target.tracks = target.tracks.filter(item => item !== editable)
  })
  selectedKeyframe.value = null
}

function selectKeyframe(track: Track, time: number): void {
  selectedKeyframe.value = { nodeId: track.nodeId, property: track.property, time }
  selectedId.value = track.nodeId
  selectedTrack.value = track.property
  player.value?.pause()
  player.value?.seek(time)
}

function timelineSeek(event: PointerEvent): void {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const offset = event.clientX - bounds.left
  const time = offset <= 8 ? 0 : offset >= bounds.width - 8 ? scene.value.duration
    : Math.round(Math.max(0, Math.min(1, offset / bounds.width)) * scene.value.duration * 100) / 100
  player.value?.pause()
  player.value?.seek(time)
}

function timelinePointerDown(event: PointerEvent): void {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  timelineSeek(event)
}

function timelinePointerMove(event: PointerEvent): void {
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) timelineSeek(event)
}

function keyframePointerDown(event: PointerEvent, track: Track, index: number): void {
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  selectKeyframe(track, track.keyframes[index].time)
  draggingKeyframe.value = { nodeId: track.nodeId, property: track.property, index, time: track.keyframes[index].time }
}

function keyframePointerMove(event: PointerEvent, track: Track, index: number): void {
  const drag = draggingKeyframe.value
  if (!drag || drag.nodeId !== track.nodeId || drag.property !== track.property || drag.index !== index) return
  const bounds = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
  const previous = track.keyframes[index - 1]?.time ?? -0.01
  const next = track.keyframes[index + 1]?.time ?? scene.value.duration + 0.01
  drag.time = Math.max(previous + 0.01, Math.min(next - 0.01, Math.round((event.clientX - bounds.left) / bounds.width * scene.value.duration * 100) / 100))
  player.value?.seek(drag.time)
}

function keyframePointerUp(track: Track, index: number): void {
  const drag = draggingKeyframe.value
  if (!drag) return
  draggingKeyframe.value = null
  if (drag.time !== track.keyframes[index].time) moveKeyframe(track, index, drag.time)
}

function framePosition(track: Track, index: number): number {
  const drag = draggingKeyframe.value
  return drag?.nodeId === track.nodeId && drag.property === track.property && drag.index === index ? drag.time : track.keyframes[index].time
}

function deleteTrack(track: Track): void {
  commit(draft => { const target = draft.scenes.find(item => item.id === sceneId.value)!; target.tracks = target.tracks.filter(item => !(item.nodeId === track.nodeId && item.property === track.property)) })
  if (selectedKeyframe.value?.nodeId === track.nodeId && selectedKeyframe.value.property === track.property) selectedKeyframe.value = null
}

function togglePlay(): void { playing.value ? player.value?.pause() : player.value?.play() }

async function save(): Promise<void> {
  try { download(projectToBlob(cloneCurrent()), `${project.value.name || 'project'}.cmanim`); message.value = '项目已下载' }
  catch (error) { announce(error) }
}

function updateShareOpen(open: boolean): void {
  if (!open) { shareOpen.value = false; return }
  try {
    shareUrl.value = createShareUrl({ project: project.value, sceneId: sceneId.value, params: paramValues.value, time: currentTime.value }, window.location.href)
    shareOpen.value = true
  } catch (error) { shareOpen.value = false; announce(error) }
}

async function copyShareLink(): Promise<void> {
  try { await navigator.clipboard.writeText(shareUrl.value); message.value = '分享链接已复制' }
  catch { message.value = '复制失败，请选中链接手动复制' }
}

function loadSharedState(): void {
  try {
    const shared = readShareUrl(window.location.href)
    if (!shared) return
    project.value = shared.project
    sceneId.value = shared.sceneId
    selectedId.value = null; selectedKeyframe.value = null
    currentTime.value = shared.time; paramValues.value = shared.params
    exportStart.value = 0; exportEnd.value = scene.value.duration
    undoStack.length = 0; redoStack.length = 0
    player.value?.setProject(shared.project, shared.sceneId)
    player.value?.setParams(shared.params)
    player.value?.seek(shared.time)
    message.value = `已从分享链接恢复「${shared.project.name}」`
  } catch (error) { announce(error) }
}

async function openFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const loaded = await projectFromBlob(file)
    project.value = loaded; sceneId.value = loaded.scenes[0].id; selectedId.value = null; selectedKeyframe.value = null; currentTime.value = 0; paramValues.value = {}
    exportStart.value = 0; exportEnd.value = scene.value.duration
    activeLeftPanel.value = window.innerWidth < 900 ? null : 'layers'
    activeRightPanel.value = window.innerWidth < 900 ? null : 'project'
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
    const nodes = draft.scenes.find(item => item.id === sceneId.value)!.nodes
    nodes.push({ id: nodeId, name: file.name, type: 'image', x: 420, y: 250, width: 320, height: 240, assetId: id, zIndex: nextNodeZIndex(nodes) })
  })
  selectedId.value = nodeId; input.value = ''
}

async function output(kind: 'png' | 'video' | 'frames'): Promise<void> {
  exportOpen.value = false
  busy.value = true; message.value = '正在准备资源并导出…'
  try {
    if (kind === 'png') download(await exportPng(project.value, sceneId.value, currentTime.value, paramValues.value), `${scene.value.name}.png`)
    else if (kind === 'frames') {
      const range = resolveExportRange(scene.value.duration, { start: exportStart.value, end: exportEnd.value })
      download(await exportFrames(project.value, sceneId.value, paramValues.value, 30, range), `${scene.value.name}-frames.zip`)
    }
    else {
      const range = resolveExportRange(scene.value.duration, { start: exportStart.value, end: exportEnd.value })
      const result = await exportVideo(project.value, sceneId.value, paramValues.value, range)
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
  try { hit = hitTestScene(evaluateScene(scene.value, currentTime.value, paramValues.value, { canvas: project.value.canvas }), x, y) }
  catch (error) { announce(error); return }
  selectedId.value = hit?.id ?? null
  if (!hit) return
  const driven = hit.layout || hit.followPath || hit.bindings?.x || hit.bindings?.y || scene.value.tracks.some(track => track.nodeId === hit!.id && (track.property === 'x' || track.property === 'y'))
  if (hit.axesId || hit.type === 'plot' || driven) {
    message.value = hit.layout ? '已选中对象。位置由布局约束控制，请在右侧调整偏移' : hit.followPath ? '已选中对象。位置由路径跟随控制，请在右侧调整进度或偏移' : driven ? '已选中对象。位置由表达式或关键帧控制，请在右侧或时间线修改' : '已选中对象。此对象使用坐标系，请在右侧修改坐标'
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
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('button, a, [role="menuitem"], [role="button"]')) return
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
  loadSharedState()
  window.addEventListener('hashchange', loadSharedState)
  window.addEventListener('keydown', keyboard)
})
onBeforeUnmount(() => { window.removeEventListener('keydown', keyboard); window.removeEventListener('hashchange', loadSharedState); player.value?.destroy() })
</script>

<template>
  <div class="workspace">
    <header class="topbar">
      <div class="top-left">
        <div class="brand"><span class="brand-mark">◈</span><div><strong>Canvas Manim</strong><small>数学与科学动画工作台</small></div></div>
      </div>
      <div class="top-actions">
        <span class="project-name">{{ project.name }}</span>
        <Button as="a" href="./guide.html" target="_blank" rel="noopener noreferrer" variant="outline" size="lg" class="help-link">？ 使用指南</Button>
        <Button variant="outline" size="icon-lg" title="撤销 Ctrl+Z" aria-label="撤销" @click="undo"><Undo2 aria-hidden="true" /></Button>
        <Button variant="outline" size="icon-lg" title="重做 Ctrl+Y" aria-label="重做" @click="redo"><Redo2 aria-hidden="true" /></Button>
        <Button variant="outline" size="lg" @click="newProject('blank')">新建</Button>
        <Button variant="outline" size="lg" @click="fileInput?.click()">打开</Button>
        <Button variant="outline" size="lg" @click="save">保存项目</Button>
        <DropdownMenu :open="shareOpen" :modal="false" @update:open="updateShareOpen">
          <DropdownMenuTrigger as-child><Button variant="outline" size="lg"><Share2 aria-hidden="true" />分享</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" :side-offset="8" class="share-dropdown-panel"><div class="share-content"><strong>分享当前作品</strong><p>链接包含项目、场景、参数和当前时刻。修改后请重新生成链接。</p><Input :value="shareUrl" readonly aria-label="分享链接" @focus="($event.target as HTMLInputElement).select()" /><Button class="share-copy" @click="copyShareLink"><Copy aria-hidden="true" />复制链接</Button></div></DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu v-model:open="exportOpen" :modal="false">
          <DropdownMenuTrigger as-child><Button size="lg" class="export-trigger" :disabled="busy"><Download aria-hidden="true" />导出作品<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent id="export-dropdown-panel" align="end" :side-offset="8" class="export-dropdown-panel">
            <div class="export-range"><strong>导出时间段</strong><div class="field-row"><label>开始（秒）<Input type="number" min="0" :max="scene.duration" step="0.01" :value="exportStart" aria-label="导出开始时间" @change="exportStart = Number(($event.target as HTMLInputElement).value)" /></label><label>结束（秒）<Input type="number" min="0" :max="scene.duration" step="0.01" :value="exportEnd" aria-label="导出结束时间" @change="exportEnd = Number(($event.target as HTMLInputElement).value)" /></label></div><small>用于视频和逐帧 ZIP；PNG 使用当前时刻</small></div>
            <DropdownMenuItem class="export-option" :disabled="busy" @select="output('png')"><span class="export-option-icon" aria-hidden="true">▧</span><span><strong>当前帧 PNG</strong><small>保存当前播放时刻</small></span></DropdownMenuItem>
            <DropdownMenuItem class="export-option" :disabled="busy || !supportVideo" :title="supportVideo || '浏览器不支持视频录制'" @select="output('video')"><span class="export-option-icon" aria-hidden="true">▶</span><span><strong>视频 {{ supportVideo?.includes('mp4') ? 'MP4' : 'WebM' }}</strong><small>{{ supportVideo ? '导出所选时间段' : '当前浏览器不支持录制' }}</small></span></DropdownMenuItem>
            <DropdownMenuItem class="export-option" :disabled="busy" @select="output('frames')"><span class="export-option-icon" aria-hidden="true">▦</span><span><strong>逐帧 ZIP</strong><small>下载 PNG 图片序列</small></span></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref="fileInput" type="file" accept=".cmanim,.json,application/zip,application/json" hidden @change="openFile" />
        <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="importImage" />
      </div>
    </header>

    <main class="main-layout" :class="{ 'left-collapsed': !activeLeftPanel, 'right-collapsed': !activeRightPanel }">
      <button v-if="activeLeftPanel || activeRightPanel" class="panel-scrim" aria-label="关闭侧栏" @click="closePanels"></button>
      <nav class="tool-rail left-rail" aria-label="左侧工具">
        <Button variant="ghost" :class="{ active: activeLeftPanel === 'templates' }" :aria-pressed="activeLeftPanel === 'templates'" :aria-expanded="activeLeftPanel === 'templates'" aria-controls="left-panel" aria-label="模板" title="模板" @click="toggleLeftPanel('templates')"><Sparkles aria-hidden="true" /><span>模板</span></Button>
        <Button variant="ghost" :class="{ active: activeLeftPanel === 'scenes' }" :aria-pressed="activeLeftPanel === 'scenes'" :aria-expanded="activeLeftPanel === 'scenes'" aria-controls="left-panel" aria-label="场景" title="场景" @click="toggleLeftPanel('scenes')"><ListVideo aria-hidden="true" /><span>场景</span></Button>
        <Button variant="ghost" :class="{ active: activeLeftPanel === 'layers' }" :aria-pressed="activeLeftPanel === 'layers'" :aria-expanded="activeLeftPanel === 'layers'" aria-controls="left-panel" aria-label="图层" title="图层" @click="toggleLeftPanel('layers')"><Layers3 aria-hidden="true" /><span>图层</span></Button>
      </nav>
      <aside v-show="activeLeftPanel" id="left-panel" class="left-panel">
        <template v-if="activeLeftPanel === 'templates'">
        <a class="starter-link" href="./guide.html" target="_blank" rel="noopener noreferrer"><span>第一次使用？</span><strong>跟着指南完成第一个动画 →</strong></a>
        <div class="template-list">
          <Button variant="ghost" @click="newProject('math')"><span class="template-icon teal">∿</span><span>正弦函数<small>图像与切线</small></span></Button>
          <Button variant="ghost" @click="newProject('unitCircle')"><span class="template-icon teal">◯</span><span>单位圆<small>角度与三角函数</small></span></Button>
          <Button variant="ghost" @click="newProject('physics')"><span class="template-icon blue">↗</span><span>抛体运动<small>轨迹与速度</small></span></Button>
          <Button variant="ghost" @click="newProject('pendulum')"><span class="template-icon blue">◡</span><span>单摆运动<small>周期与摆角</small></span></Button>
          <Button variant="ghost" @click="newProject('binary')"><span class="template-icon amber">⌕</span><span>二分查找<small>算法逐步演示</small></span></Button>
          <Button variant="ghost" @click="newProject('bubbleSort')"><span class="template-icon amber">▥</span><span>冒泡排序<small>逐次比较与交换</small></span></Button>
        </div>
        </template>
        <template v-if="activeLeftPanel === 'scenes'">
        <div class="section-title"><span>场景</span><Button variant="ghost" title="新增场景" @click="addScene">＋</Button></div>
        <div class="scene-list"><Button variant="ghost" v-for="item in project.scenes" :key="item.id" :class="{ active: item.id === sceneId }" @click="chooseScene(item.id)">▣ &nbsp;{{ item.name }}</Button></div>
        </template>
        <template v-if="activeLeftPanel === 'layers'">
        <div class="section-title"><span>对象图层</span><DropdownMenu :modal="false"><DropdownMenuTrigger as-child><Button variant="ghost" size="sm" class="add-node-trigger" aria-label="添加对象"><Plus aria-hidden="true" />添加</Button></DropdownMenuTrigger><DropdownMenuContent align="end" :side-offset="5" class="add-node-menu"><DropdownMenuItem v-for="option in nodeOptions" :key="option.value" @select="addNode(option.value as SceneNode['type'])">{{ option.label }}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <div class="node-list">
          <Button variant="ghost" v-for="node in scene.nodes" :key="node.id" draggable="true" :data-node-id="node.id" :class="{ active: selectedId === node.id, dragging: draggingNodeId === node.id, 'drop-before': nodeDropTarget?.id === node.id && nodeDropTarget.side === 'before', 'drop-after': nodeDropTarget?.id === node.id && nodeDropTarget.side === 'after' }" :title="displayNodeName(node)" @click="selectedId = node.id" @dragstart="startNodeDrag($event, node.id)" @dragover="updateNodeDrop($event, node.id)" @drop="finishNodeDrop" @dragend="draggingNodeId = null; nodeDropTarget = null"><span class="node-icon-box"><component :is="nodeIcons[node.type]" class="node-icon" aria-hidden="true" /></span><span class="node-name">{{ displayNodeName(node) }}</span><small>{{ node.type }}</small></Button>
          <p v-if="!scene.nodes.length" class="empty-note">添加对象，开始构建场景。</p>
        </div>
        </template>
      </aside>

      <section class="stage-section">
        <div class="stage-header"><div><span class="eyebrow">SCENE PREVIEW</span><h1>{{ scene.name }}</h1></div><div class="stage-meta">{{ project.canvas.width }} × {{ project.canvas.height }} <span>·</span> {{ scene.duration }}s</div></div>
        <div class="canvas-shell" :style="{ aspectRatio: `${project.canvas.width} / ${project.canvas.height}`, maxWidth: `min(1120px, ${70 * project.canvas.width / project.canvas.height}vh)` }">
          <canvas ref="canvas" :width="project.canvas.width" :height="project.canvas.height" @pointerdown="canvasPointerDown" @pointermove="canvasPointerMove" @pointerup="canvasPointerUp" @pointercancel="canvasPointerUp"></canvas>
          <svg v-if="selectionBox" class="selection-overlay" :viewBox="`0 0 ${project.canvas.width} ${project.canvas.height}`" preserveAspectRatio="none" aria-hidden="true"><rect class="selection-rect" :x="selectionBox.x" :y="selectionBox.y" :width="selectionBox.width" :height="selectionBox.height" /><circle v-for="(corner, index) in [[selectionBox.x, selectionBox.y], [selectionBox.x + selectionBox.width, selectionBox.y], [selectionBox.x, selectionBox.y + selectionBox.height], [selectionBox.x + selectionBox.width, selectionBox.y + selectionBox.height]]" :key="index" class="selection-handle" :cx="corner[0]" :cy="corner[1]" r="4" /></svg>
          <span class="canvas-badge">{{ selected ? `已选中 · ${displayNodeName(selected)}` : '点击画布或图层选择对象' }}</span>
        </div>
        <div class="transport"><Button class="play-button" :aria-label="playLabel" @click="togglePlay"><Pause v-if="playing" aria-hidden="true" /><Play v-else aria-hidden="true" /></Button><Button variant="outline" class="step-button" title="下一帧" aria-label="下一帧" @click="player?.step()"><SkipForward aria-hidden="true" /></Button><span class="time-readout">{{ currentTime.toFixed(2) }} / {{ scene.duration.toFixed(2) }} s</span><Slider class="scrubber" :model-value="currentTime" :min="0" :max="scene.duration" :step="0.01" label="播放进度" @update:model-value="player?.seek($event)" /></div>
        <div class="timeline-panel"><div class="timeline-header"><div><strong>时间线</strong><small>点选时间刻度定位；拖动菱形调整关键帧</small></div><div class="timeline-actions"><SelectField v-model="selectedTrack" label="动画属性" :options="animationOptions" /><Button variant="outline" size="sm" @click="addKeyframe">＋ 关键帧</Button></div></div>
          <div class="ruler"><span class="ruler-label">时间</span><div class="ruler-line" aria-label="时间刻度" @pointerdown="timelinePointerDown" @pointermove="timelinePointerMove"><span v-for="mark in 9" :key="mark">{{ ((mark - 1) * scene.duration / 8).toFixed(1) }}s</span><i class="timeline-playhead" :style="{ left: `${currentTime / scene.duration * 100}%` }"></i></div></div>
          <div class="track-list"><div v-for="track in scene.tracks" :key="`${track.nodeId}.${track.property}`" class="track-row"><div class="track-label"><Button variant="ghost" class="track-name" :title="scene.nodes.find(node => node.id === track.nodeId)?.name" @click="selectedId = track.nodeId">{{ scene.nodes.find(node => node.id === track.nodeId)?.name }}</Button><small>{{ track.property }}</small><Button variant="ghost" title="删除轨道" :aria-label="`删除 ${track.property} 轨道`" @click="deleteTrack(track)">×</Button></div><div class="track-line" @pointerdown="timelinePointerDown" @pointermove="timelinePointerMove"><i class="timeline-playhead" :style="{ left: `${currentTime / scene.duration * 100}%` }"></i><Button variant="ghost" v-for="(frame, index) in track.keyframes" :key="index" class="keyframe-marker" :class="{ active: selectedKeyframe?.nodeId === track.nodeId && selectedKeyframe.property === track.property && selectedKeyframe.time === frame.time, dragging: draggingKeyframe?.nodeId === track.nodeId && draggingKeyframe.property === track.property && draggingKeyframe.index === index }" :style="{ left: `${framePosition(track, index) / scene.duration * 100}%` }" :title="`${frame.time}s · ${frame.value}`" :aria-label="`${scene.nodes.find(node => node.id === track.nodeId)?.name} ${track.property} ${frame.time} 秒关键帧`" @click="selectKeyframe(track, frame.time)" @pointerdown="keyframePointerDown($event, track, index)" @pointermove="keyframePointerMove($event, track, index)" @pointerup="keyframePointerUp(track, index)" @pointercancel="draggingKeyframe = null">◆</Button></div></div><p v-if="!scene.tracks.length" class="empty-note">暂无关键帧。先选对象，定位时间，再点击“＋ 关键帧”。</p></div>
          <div v-if="activeKeyframe" class="keyframe-editor"><strong>{{ activeKeyframe.node?.name }} · {{ activeKeyframe.track.property }}</strong><label>时间（秒）<Input type="number" min="0" :max="scene.duration" step="0.01" :value="activeKeyframe.frame.time" aria-label="关键帧时间" @change="moveKeyframe(activeKeyframe.track, activeKeyframe.index, Number(($event.target as HTMLInputElement).value)); ($event.target as HTMLInputElement).value = String(activeKeyframe?.frame.time ?? '')" /></label><label v-if="typeof activeKeyframe.frame.value === 'boolean'">值<SelectField :model-value="String(activeKeyframe.frame.value)" label="关键帧值" :options="visibilityOptions" @update:model-value="editKeyframeValue(activeKeyframe.track, activeKeyframe.index, $event)" /></label><label v-else>值<Input :value="activeKeyframe.frame.value" aria-label="关键帧值" @change="editKeyframeValue(activeKeyframe.track, activeKeyframe.index, ($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = String(activeKeyframe?.frame.value ?? '')" /></label><label v-if="typeof activeKeyframe.frame.value === 'number' || ['fill', 'stroke'].includes(activeKeyframe.track.property)">至下一帧缓动<SelectField :model-value="activeKeyframe.frame.easing ?? 'linear'" label="关键帧缓动" :options="easingOptions" @update:model-value="editKeyframeEasing(activeKeyframe.track, activeKeyframe.index, $event as 'linear' | 'easeInOut' | 'step')" /></label><Button variant="ghost" class="delete-keyframe" @click="deleteKeyframe(activeKeyframe.track, activeKeyframe.index)">删除关键帧</Button></div>
        </div>
      </section>

      <aside v-show="activeRightPanel" id="right-panel" class="right-panel">
        <template v-if="activeRightPanel === 'project'">
            <section class="project-settings"><div class="section-title">项目与场景设置</div><div class="settings-body"><label>项目名称<Input :value="project.name" @change="editProjectName" /></label><label>场景名称<Input :value="scene.name" @change="editScene('name', $event)" /></label><div class="field-row"><label>时长（秒）<Input type="number" min="0.1" step="0.1" :value="scene.duration" @change="editScene('duration', $event)" /></label><label>背景色<Input type="color" :value="project.canvas.background ?? '#0b1220'" @change="editCanvas('background', $event)" /></label></div><label>画布预置<SelectField :model-value="selectedCanvasPreset ? `${selectedCanvasPreset.width}x${selectedCanvasPreset.height}` : ''" label="画布预置" placeholder="自定义尺寸" :groups="canvasPresetGroups" @update:model-value="applyCanvasPreset" /></label><div class="field-row"><label>画布宽度<Input type="number" min="1" max="4096" :value="project.canvas.width" @change="editCanvas('width', $event)" /></label><label>画布高度<Input type="number" min="1" max="4096" :value="project.canvas.height" @change="editCanvas('height', $event)" /></label></div><div v-if="project.extensions" class="extension-view"><strong>扩展数据 · 只读</strong><p>编辑器暂不支持修改以下扩展数据；保存项目时会保留。</p><pre tabindex="0">{{ JSON.stringify(project.extensions, null, 2) }}</pre></div></div></section>
        </template>
        <template v-if="activeRightPanel === 'parameters'">
            <div class="params-panel"><div class="section-title"><span>场景参数</span><Button variant="ghost" title="新增参数" @click="addParameter">＋</Button></div><div v-for="param in scene.params" :key="param.id" class="param-item"><div class="param-head"><strong>{{ param.label }}</strong><span>{{ (paramValues[param.id] ?? param.value).toFixed(2) }} {{ param.unit }}</span></div><Slider :model-value="paramValues[param.id] ?? param.value" :min="param.min" :max="param.max" :step="param.step" :label="param.label" @update:model-value="changeParam(param.id, $event)" /><CollapsiblePanel title="参数定义"><label>名称<Input :value="param.label" @change="editParam(param.id, 'label', ($event.target as HTMLInputElement).value)" /></label><div class="field-row"><label>默认值<Input type="number" :value="param.value" @change="editParam(param.id, 'value', ($event.target as HTMLInputElement).value)" /></label><label>单位<Input :value="param.unit" @change="editParam(param.id, 'unit', ($event.target as HTMLInputElement).value)" /></label></div><div class="field-row"><label>最小<Input type="number" :value="param.min" @change="editParam(param.id, 'min', ($event.target as HTMLInputElement).value)" /></label><label>最大<Input type="number" :value="param.max" @change="editParam(param.id, 'max', ($event.target as HTMLInputElement).value)" /></label></div><label>步长<Input type="number" min="0.001" step="0.001" :value="param.step" @change="editParam(param.id, 'step', ($event.target as HTMLInputElement).value)" /></label></CollapsiblePanel></div><p v-if="!scene.params.length" class="empty-note">添加参数，让作品可交互。</p></div>
        </template>
        <template v-if="activeRightPanel === 'object'">
        <div v-if="selected" class="inspector"><div class="inspector-name"><span class="template-icon teal">◇</span><div><strong>{{ displayNodeName(selected) }}</strong><small>{{ nodeNames[selected.type] }}</small></div><Button variant="ghost" title="删除对象" @click="removeSelected">×</Button></div>
          <label>名称<Input :value="primaryName" :disabled="textDriven" @change="editPrimaryName" /><small v-if="selected.type === 'text' || selected.type === 'formula'" class="field-help">{{ textDriven ? '画布文字由表达式或关键帧生成，请修改驱动来源' : '文字对象的名称就是画布显示内容' }}</small></label>
          <label v-if="selected.type !== 'group'">所属分组<SelectField :model-value="selected.parentId ?? ''" label="所属分组" :options="groupOptions" @update:model-value="editNode('parentId', $event)" /></label>
          <label v-if="selected.type !== 'group'">可见性<SelectField :model-value="String(selected.visible !== false)" label="对象可见性" :options="visibilityOptions" :disabled="scene.tracks.some(track => track.nodeId === selectedId && track.property === 'visible')" @update:model-value="editNode('visible', $event === 'true')" /><small v-if="scene.tracks.some(track => track.nodeId === selectedId && track.property === 'visible')" class="driven-note">由时间线控制</small></label>
          <label>布局锚点<SelectField :model-value="selected.layout ? `${selected.layout.anchorX}:${selected.layout.anchorY}` : ''" label="布局锚点" :options="layoutOptions" @update:model-value="setLayoutAnchor" /><small class="field-help">将对象原点固定在画布对应位置；调整画布尺寸时保持相对位置</small></label>
          <div v-if="selected.layout" class="field-row"><label>水平偏移<Input type="number" :value="selected.layout.offsetX" @change="editLayoutOffset('offsetX', $event)" /></label><label>垂直偏移<Input type="number" :value="selected.layout.offsetY" @change="editLayoutOffset('offsetY', $event)" /></label></div>
          <label v-if="selected.type !== 'path'">跟随路径<SelectField :model-value="selected.followPath?.pathId ?? ''" label="跟随路径" :options="pathOptions" @update:model-value="setFollowPath" /><small class="field-help">沿路径的实际长度移动；可用 t 和参数控制进度</small></label>
          <template v-if="selected.followPath"><div class="field-row"><label>路径进度<Input type="number" min="0" max="1" step="0.01" :value="selected.followPath.progress" :disabled="!!selected.followPath.progressExpression" @change="editFollowNumber('progress', $event)" /></label><label>沿路径旋转<SelectField :model-value="String(selected.followPath.orient === true)" label="沿路径旋转" :options="orientationOptions" @update:model-value="editFollowOrient" /></label></div><label>进度表达式<Input :value="selected.followPath.progressExpression ?? ''" placeholder="例如 t/8" @change="editFollowExpression" /><small class="field-help">结果限制在 0–1；填写后覆盖静态进度</small></label><div class="field-row"><label>跟随水平偏移<Input type="number" :value="selected.followPath.offsetX" @change="editFollowNumber('offsetX', $event)" /></label><label>跟随垂直偏移<Input type="number" :value="selected.followPath.offsetY" @change="editFollowNumber('offsetY', $event)" /></label></div></template>
          <label>轨迹残影<SelectField :model-value="String(!!selected.trail)" label="轨迹残影" :options="trailOptions" @update:model-value="setTrail" /><small class="field-help">由历史时刻重新求值，回拖与导出保持一致</small></label>
          <template v-if="selected.trail"><div class="field-row"><label>残影时长（秒）<Input type="number" min="0.1" max="30" step="0.1" :value="selected.trail.duration" @change="editTrailNumber('duration', $event)" /></label><label>残影采样数<Input type="number" min="2" max="24" step="1" :value="selected.trail.samples" @change="editTrailNumber('samples', $event)" /></label></div><div class="field-row"><label>残影点半径<Input type="number" min="1" max="50" step="1" :value="selected.trail.radius" @change="editTrailNumber('radius', $event)" /></label><label>残影透明度<Input type="number" min="0.01" max="1" step="0.05" :value="selected.trail.opacity" @change="editTrailNumber('opacity', $event)" /></label></div><label>残影颜色<Input type="color" :value="selected.trail.color ?? '#5eead4'" @change="editTrailColor" /></label></template>
          <label v-if="!['group', 'axes', 'plot'].includes(selected.type)">匹配对象变形<SelectField :model-value="selected.matchTransform?.targetId ?? ''" label="匹配对象变形" :options="matchOptions" @update:model-value="setMatchTarget" /><small class="field-help">同类对象从当前形态过渡到目标；目标在完成前隐藏</small></label>
          <template v-if="selected.matchTransform"><div class="field-row"><label>变形开始（秒）<Input type="number" min="0" :max="scene.duration" step="0.1" :value="selected.matchTransform.start" @change="editMatchNumber('start', $event)" /></label><label>变形结束（秒）<Input type="number" min="0" :max="scene.duration" step="0.1" :value="selected.matchTransform.end" @change="editMatchNumber('end', $event)" /></label></div><label>变形缓动<SelectField :model-value="selected.matchTransform.easing" label="变形缓动" :options="easingOptions.filter(option => option.value !== 'step')" @update:model-value="editMatchEasing" /></label></template>
          <div class="combo-editor"><label>动画组合<SelectField :model-value="comboKind" label="动画组合" :options="comboOptions" @update:model-value="selectComboKind" /></label><div class="field-row"><label>组合开始（秒）<Input v-model.number="comboStart" type="number" min="0" :max="scene.duration" step="0.1" /></label><label>组合时长（秒）<Input v-model.number="comboDuration" type="number" min="0.1" :max="scene.duration" step="0.1" /></label></div><label>{{ comboKind === 'pulse' ? '最大缩放倍数' : '滑动距离（像素）' }}<Input v-model.number="comboAmount" type="number" :min="comboKind === 'pulse' ? 1 : 1" :max="comboKind === 'pulse' ? 4 : 1000" :step="comboKind === 'pulse' ? 0.05 : 1" /></label><Button variant="outline" size="sm" @click="applySelectedCombo">应用动画组合</Button><small class="field-help">一次生成多条关键帧轨道；已有同属性动画时会提示冲突</small></div>
          <div class="field-row"><label>X 位置<Input type="number" :value="evaluatedSelected?.x ?? selected.x" :disabled="!!driverFor('x')" @change="editNodeNumber('x', $event)" /><small v-if="driverFor('x')" class="driven-note">由{{ driverFor('x') }}控制，请修改对应设置</small></label><label>Y 位置<Input type="number" :value="evaluatedSelected?.y ?? selected.y" :disabled="!!driverFor('y')" @change="editNodeNumber('y', $event)" /><small v-if="driverFor('y')" class="driven-note">由{{ driverFor('y') }}控制，请修改对应设置</small></label></div>
          <div v-if="['rect','axes','image'].includes(selected.type)" class="field-row"><label>宽度<Input type="number" min="1" :value="selected.width" @change="editNodeNumber('width', $event)" /></label><label>高度<Input type="number" min="1" :value="selected.height" @change="editNodeNumber('height', $event)" /></label></div>
          <div v-if="['circle','point'].includes(selected.type)" class="field-row"><label>半径<Input type="number" min="1" :value="selected.radius" @change="editNodeNumber('radius', $event)" /></label><label>透明度<Input type="number" min="0" max="1" step="0.1" :value="selected.opacity ?? 1" @change="editNodeNumber('opacity', $event)" /></label></div>
          <div v-if="['line','arrow'].includes(selected.type)" class="field-row"><label>终点 X<Input type="number" :value="selected.x2" @change="editNodeNumber('x2', $event)" /></label><label>终点 Y<Input type="number" :value="selected.y2" @change="editNodeNumber('y2', $event)" /></label></div>
          <div v-if="['text','formula'].includes(selected.type)" class="field-row"><label>字号<Input type="number" min="8" :value="selected.fontSize ?? 24" @change="editNodeNumber('fontSize', $event)" /></label><label>透明度<Input type="number" min="0" max="1" step="0.1" :value="selected.opacity ?? 1" @change="editNodeNumber('opacity', $event)" /></label></div>
          <label v-if="selected.type === 'plot'">函数 y = f(x)<Input :value="selected.expression" placeholder="sin(x)" @change="editNodeString('expression', $event)" /></label>
          <template v-if="selected.type === 'axes'"><div class="field-row"><label>X 最小<Input type="number" :value="selected.xRange?.[0]" @change="editAxisRange('xRange', 0, $event)" /></label><label>X 最大<Input type="number" :value="selected.xRange?.[1]" @change="editAxisRange('xRange', 1, $event)" /></label></div><div class="field-row"><label>Y 最小<Input type="number" :value="selected.yRange?.[0]" @change="editAxisRange('yRange', 0, $event)" /></label><label>Y 最大<Input type="number" :value="selected.yRange?.[1]" @change="editAxisRange('yRange', 1, $event)" /></label></div></template>
          <div v-if="selected.type === 'path' || selected.type === 'polygon'" class="point-editor"><div class="point-editor-heading"><strong>顶点</strong><Button variant="outline" size="sm" @click="addPoint">添加顶点</Button></div><div v-for="(point, index) in selected.points" :key="index" class="point-editor-row"><span>{{ index + 1 }}</span><label>X<Input type="number" :value="point[0]" :aria-label="`顶点 ${index + 1} X`" @change="editPoint(index, 0, $event)" /></label><label>Y<Input type="number" :value="point[1]" :aria-label="`顶点 ${index + 1} Y`" @change="editPoint(index, 1, $event)" /></label><Button variant="ghost" size="icon" :disabled="(selected.points?.length ?? 0) <= (selected.type === 'polygon' ? 3 : 2)" :aria-label="`删除顶点 ${index + 1}`" @click="removePoint(index)">×</Button></div><small>坐标相对于对象的位置</small></div>
          <label v-if="['point','line','arrow','plot'].includes(selected.type)">关联坐标系<SelectField :model-value="selected.axesId ?? ''" label="关联坐标系" :options="axesOptions" @update:model-value="editNode('axesId', $event)" /></label>
          <div class="field-row"><label>旋转（弧度）<Input type="number" step="0.1" :value="selected.rotation ?? 0" @change="editNodeNumber('rotation', $event)" /></label><label>缩放<Input type="number" min="0.1" step="0.1" :value="selected.scale ?? 1" @change="editNodeNumber('scale', $event)" /></label></div>
          <div class="field-row"><label>填充色<Input type="color" :value="selected.fill ?? '#ffffff'" @change="editNodeString('fill', $event)" /></label><label>描边色<Input type="color" :value="selected.stroke ?? '#ffffff'" @change="editNodeString('stroke', $event)" /></label></div>
          <label>时间表达式 <small>例如 sin(t) 或 speed*t</small><Input :value="selected.bindings?.x ?? ''" placeholder="X =" @change="editBinding('x', $event)" /><Input :value="selected.bindings?.y ?? ''" placeholder="Y =" @change="editBinding('y', $event)" /></label>
          <template v-if="selected.type === 'text'"><label>数值读数表达式<Input :value="selected.valueExpression ?? ''" placeholder="例如 speed*t" @change="editNodeString('valueExpression', $event)" /></label><div class="field-row"><label>前缀<Input :value="selected.prefix ?? ''" @change="editNodeString('prefix', $event)" /></label><label>后缀<Input :value="selected.suffix ?? ''" @change="editNodeString('suffix', $event)" /></label></div><label>小数位<Input type="number" min="0" max="8" :value="selected.precision ?? 2" @change="editNodeNumber('precision', $event)" /></label></template>
        </div><div v-else class="inspector-empty"><span>◇</span><p>选择画布上的对象或左侧图层，在这里调整属性。</p></div>
        </template>
      </aside>
      <nav class="tool-rail right-rail" aria-label="右侧工具">
        <Button variant="ghost" :class="{ active: activeRightPanel === 'project' }" :aria-pressed="activeRightPanel === 'project'" :aria-expanded="activeRightPanel === 'project'" aria-controls="right-panel" aria-label="项目" title="项目与场景" @click="toggleRightPanel('project')"><Settings2 aria-hidden="true" /><span>项目</span></Button>
        <Button variant="ghost" :class="{ active: activeRightPanel === 'object' }" :aria-pressed="activeRightPanel === 'object'" :aria-expanded="activeRightPanel === 'object'" aria-controls="right-panel" aria-label="属性" title="对象属性" @click="toggleRightPanel('object')"><SlidersHorizontal aria-hidden="true" /><span>属性</span></Button>
        <Button variant="ghost" :class="{ active: activeRightPanel === 'parameters' }" :aria-pressed="activeRightPanel === 'parameters'" :aria-expanded="activeRightPanel === 'parameters'" aria-controls="right-panel" aria-label="参数" title="场景参数" @click="toggleRightPanel('parameters')"><SlidersVertical aria-hidden="true" /><span>参数</span></Button>
      </nav>
    </main>
    <footer class="statusbar"><span class="status-dot"></span><span>{{ message }}</span><span class="status-right">{{ busy ? '正在处理…' : '本地运行 · 无需登录' }}</span></footer>
  </div>
</template>
