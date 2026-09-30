import type { Project, Scene, SceneNode, Track } from './types.ts'

const base = (id: string, name: string, nodes: SceneNode[], tracks: Track[] = [], duration = 8): Project => ({
  schemaVersion: 1,
  name,
  canvas: { width: 1280, height: 720, fit: 'contain', background: '#0b1220' },
  scenes: [{ id, name, duration, params: [], nodes, tracks }],
  assets: [],
})

function math(): Project {
  const project = base('sine', '正弦函数 · 图像与切线', [
    { id: 'title', type: 'text', name: '标题', x: 72, y: 62, text: '正弦函数：从运动看斜率', fontSize: 36, fill: '#f8fafc' },
    { id: 'note', type: 'text', name: '说明', x: 72, y: 110, text: '拖动时间并改变频率，观察曲线与切线', fontSize: 18, fill: '#94a3b8' },
    { id: 'axes', type: 'axes', name: '坐标系', x: 120, y: 215, width: 1000, height: 370, xRange: [-4, 4], yRange: [-2, 2], stroke: '#667487', lineWidth: 1 },
    { id: 'curve', type: 'plot', name: '正弦曲线', x: 0, y: 0, axesId: 'axes', expression: 'amp*sin(freq*x)', stroke: '#5eead4', lineWidth: 4 },
    { id: 'tangent', type: 'line', name: '切线', x: -1, y: 0, x2: 1, y2: 0, axesId: 'axes', stroke: '#fbbf24', lineWidth: 3, bindings: {
      x: 't-4-0.7', x2: 't-4+0.7',
      y: 'amp*sin(freq*(t-4))-amp*freq*cos(freq*(t-4))*0.7',
      y2: 'amp*sin(freq*(t-4))+amp*freq*cos(freq*(t-4))*0.7',
    } },
    { id: 'dot', type: 'point', name: '运动点', x: -4, y: 0, radius: 10, axesId: 'axes', fill: '#fbbf24', bindings: { x: 't-4', y: 'amp*sin(freq*(t-4))' } },
    { id: 'formula', type: 'formula', name: '函数公式', x: 822, y: 80, text: 'f(x)=A\\sin(\\omega x)', fontSize: 32, fill: '#e2e8f0' },
    { id: 'reading', type: 'text', name: '当前函数值', x: 72, y: 638, text: '', fontSize: 22, fill: '#5eead4', valueExpression: 'amp*sin(freq*(t-4))', prefix: 'f(x) = ', precision: 3 },
    { id: 'slope', type: 'text', name: '切线斜率', x: 310, y: 638, text: '', fontSize: 22, fill: '#fbbf24', valueExpression: 'amp*freq*cos(freq*(t-4))', prefix: 'f′(x) = ', precision: 3 },
  ], [], 8)
  project.scenes[0].params = [
    { id: 'amp', label: '振幅 A', value: 1, min: 0.2, max: 1.8, step: 0.1 },
    { id: 'freq', label: '频率 ω', value: 1, min: 0.5, max: 3, step: 0.1 },
  ]
  return project
}

function physics(): Project {
  const project = base('projectile', '抛体运动 · 轨迹与速度', [
    { id: 'title', type: 'text', name: '标题', x: 72, y: 62, text: '理想抛体运动', fontSize: 36, fill: '#f8fafc' },
    { id: 'note', type: 'text', name: '模型条件', x: 72, y: 110, text: '忽略空气阻力；重力加速度恒定', fontSize: 18, fill: '#94a3b8' },
    { id: 'axes', type: 'axes', name: '位置坐标', x: 120, y: 188, width: 1020, height: 400, xRange: [0, 32], yRange: [0, 18], stroke: '#667487' },
    { id: 'curve', type: 'plot', name: '运动轨迹', x: 0, y: 0, axesId: 'axes', expression: 'x*tan(angle)-g*x*x/(2*speed*speed*cos(angle)^2)', stroke: '#60a5fa', lineWidth: 4 },
    { id: 'ball', type: 'point', name: '小球', x: 0, y: 0, axesId: 'axes', radius: 12, fill: '#fbbf24', bindings: { x: 'speed*cos(angle)*t', y: 'speed*sin(angle)*t-g*t*t/2' } },
    { id: 'velocity', type: 'arrow', name: '速度向量', x: 0, y: 0, x2: 3, y2: 3, axesId: 'axes', stroke: '#fb7185', lineWidth: 4, bindings: {
      x: 'speed*cos(angle)*t', y: 'speed*sin(angle)*t-g*t*t/2',
      x2: 'speed*cos(angle)*t+speed*cos(angle)*0.45',
      y2: 'speed*sin(angle)*t-g*t*t+(speed*sin(angle)-g*t)*0.45',
    } },
    { id: 'formula', type: 'formula', name: '运动方程', x: 716, y: 72, text: 'y=v_0\\sin(\\theta)t-\\frac{1}{2}gt^2', fontSize: 27, fill: '#e2e8f0' },
    { id: 'unit', type: 'text', name: '单位', x: 72, y: 642, text: '位置：m    速度：m/s    时间：s', fontSize: 18, fill: '#94a3b8' },
    { id: 'reading', type: 'text', name: '当前高度', x: 72, y: 674, text: '', fontSize: 19, fill: '#fbbf24', valueExpression: 'speed*sin(angle)*t-g*t*t/2', prefix: '高度 y = ', suffix: ' m', precision: 2 },
  ], [], 6)
  project.scenes[0].params = [
    { id: 'speed', label: '初速度', value: 6, min: 3, max: 9, step: 0.2, unit: 'm/s' },
    { id: 'angle', label: '发射角', value: 0.7, min: 0.25, max: 1.2, step: 0.05, unit: 'rad' },
    { id: 'g', label: '重力加速度', value: 1, min: 0.5, max: 2, step: 0.1, unit: 'm/s²' },
  ]
  return project
}

function binarySearch(): Project {
  const values = [3, 7, 11, 15, 19, 23, 27, 31]
  const nodes: SceneNode[] = [
    { id: 'title', type: 'text', name: '标题', x: 72, y: 66, text: '二分查找：每一步缩小范围', fontSize: 36, fill: '#f8fafc' },
    { id: 'note', type: 'text', name: '目标', x: 72, y: 120, text: '有序数组中寻找 23', fontSize: 21, fill: '#94a3b8' },
    { id: 'step', type: 'text', name: '步骤说明', x: 72, y: 505, text: '第 1 步：比较中间值 15', fontSize: 27, fill: '#fbbf24' },
  ]
  const tracks: Track[] = [
    { nodeId: 'step', property: 'text', keyframes: [
      { time: 0, value: '第 1 步：比较中间值 15', easing: 'step' },
      { time: 2, value: '第 2 步：向右比较 23', easing: 'step' },
      { time: 4, value: '找到目标 23，索引为 5', easing: 'step' },
    ] },
  ]
  values.forEach((value, index) => {
    const x = 126 + index * 131
    nodes.push({ id: `cell-${index}`, type: 'rect', name: `单元 ${index}`, x, y: 276, width: 100, height: 98, fill: '#1e293b', stroke: '#475569', lineWidth: 2, radius: 12 })
    nodes.push({ id: `value-${index}`, type: 'text', name: `数值 ${value}`, x: x + 30, y: 337, text: String(value), fontSize: 31, fill: '#e2e8f0' })
    nodes.push({ id: `index-${index}`, type: 'text', name: `索引 ${index}`, x: x + 42, y: 408, text: String(index), fontSize: 17, fill: '#64748b' })
    tracks.push({ nodeId: `cell-${index}`, property: 'fill', keyframes: [
      { time: 0, value: index === 3 ? '#f59e0b' : '#1e293b', easing: 'step' },
      { time: 2, value: index < 4 ? '#111827' : index === 5 ? '#f59e0b' : '#1e293b', easing: 'step' },
      { time: 4, value: index === 5 ? '#22c55e' : index < 4 ? '#111827' : '#1e293b', easing: 'step' },
    ] })
  })
  return base('binary', '二分查找 · 缩小搜索区间', nodes, tracks, 6)
}

export const templates: Record<string, () => Project> = {
  math, physics, binary: binarySearch,
}

export function createBlankProject(): Project {
  const scene: Scene = { id: 'scene-1', name: '我的场景', duration: 8, params: [], nodes: [], tracks: [] }
  return { schemaVersion: 1, name: '未命名作品', canvas: { width: 1280, height: 720, fit: 'contain', background: '#0b1220' }, scenes: [scene], assets: [] }
}
