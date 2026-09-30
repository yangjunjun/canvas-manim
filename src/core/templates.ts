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

function unitCircle(): Project {
  const project = base('unit-circle', '单位圆 · 三角函数投影', [
    { id: 'title', type: 'text', name: '标题', x: 72, y: 66, text: '单位圆：看见 sin 与 cos', fontSize: 36, fill: '#f8fafc' },
    { id: 'note', type: 'text', name: '说明', x: 72, y: 112, text: '旋转半径，观察横、纵投影随角度变化', fontSize: 19, fill: '#94a3b8' },
    { id: 'x-axis', type: 'line', name: '横轴', x: 165, y: 390, x2: 690, y2: 390, stroke: '#64748b', lineWidth: 2 },
    { id: 'y-axis', type: 'line', name: '纵轴', x: 420, y: 145, x2: 420, y2: 635, stroke: '#64748b', lineWidth: 2 },
    { id: 'circle', type: 'circle', name: '圆周', x: 420, y: 390, radius: 170, fill: '#00000000', stroke: '#64748b', lineWidth: 2, bindings: { radius: 'r' } },
    { id: 'radius', type: 'line', name: '旋转半径', x: 420, y: 390, x2: 590, y2: 390, stroke: '#e2e8f0', lineWidth: 3, bindings: { x2: '420+r*cos(speed*t)', y2: '390-r*sin(speed*t)' } },
    { id: 'cos-projection', type: 'line', name: '余弦投影', x: 420, y: 390, x2: 590, y2: 390, stroke: '#5eead4', lineWidth: 6, bindings: { x2: '420+r*cos(speed*t)' } },
    { id: 'sin-projection', type: 'line', name: '正弦投影', x: 590, y: 390, x2: 590, y2: 390, stroke: '#fbbf24', lineWidth: 6, bindings: { x: '420+r*cos(speed*t)', x2: '420+r*cos(speed*t)', y2: '390-r*sin(speed*t)' } },
    { id: 'foot', type: 'point', name: '投影点', x: 590, y: 390, radius: 6, fill: '#5eead4', bindings: { x: '420+r*cos(speed*t)' } },
    { id: 'dot', type: 'point', name: '圆周运动点', x: 590, y: 390, radius: 12, fill: '#fbbf24', bindings: { x: '420+r*cos(speed*t)', y: '390-r*sin(speed*t)' } },
    { id: 'formula', type: 'formula', name: '投影关系', x: 760, y: 242, text: 'x=r\\cos\\theta,\\quad y=r\\sin\\theta', fontSize: 30, fill: '#e2e8f0' },
    { id: 'angle', type: 'text', name: '当前角度', x: 760, y: 337, text: '', fontSize: 25, fill: '#e2e8f0', valueExpression: 'speed*t', prefix: 'θ = ', suffix: ' rad', precision: 2 },
    { id: 'cos-value', type: 'text', name: '余弦值', x: 760, y: 395, text: '', fontSize: 25, fill: '#5eead4', valueExpression: 'cos(speed*t)', prefix: 'cos θ = ', precision: 3 },
    { id: 'sin-value', type: 'text', name: '正弦值', x: 760, y: 453, text: '', fontSize: 25, fill: '#fbbf24', valueExpression: 'sin(speed*t)', prefix: 'sin θ = ', precision: 3 },
    { id: 'model', type: 'text', name: '模型说明', x: 760, y: 532, text: '这里的 r 只控制画面大小，读数为单位圆比值。', fontSize: 18, fill: '#94a3b8' },
  ])
  project.scenes[0].params = [
    { id: 'r', label: '显示半径', value: 170, min: 110, max: 215, step: 5, unit: 'px' },
    { id: 'speed', label: '角速度', value: 0.8, min: 0.3, max: 1.2, step: 0.1, unit: 'rad/s' },
  ]
  return project
}

function pendulum(): Project {
  const swing = 'angle0*cos(sqrt(g/length)*t)'
  const bobX = `420+100*length*sin(${swing})`
  const bobY = `190+100*length*cos(${swing})`
  const project = base('pendulum', '单摆运动 · 周期与摆角', [
    { id: 'title', type: 'text', name: '标题', x: 72, y: 66, text: '单摆：周期从哪里来？', fontSize: 36, fill: '#f8fafc' },
    { id: 'note', type: 'text', name: '模型条件', x: 72, y: 112, text: '小角度近似；忽略空气阻力与支点摩擦', fontSize: 19, fill: '#94a3b8' },
    { id: 'support', type: 'line', name: '支架', x: 278, y: 165, x2: 562, y2: 165, stroke: '#64748b', lineWidth: 8 },
    { id: 'rest-line', type: 'line', name: '平衡位置', x: 420, y: 190, x2: 420, y2: 465, stroke: '#475569', lineWidth: 2 },
    { id: 'rod', type: 'line', name: '摆线', x: 420, y: 190, x2: 420, y2: 390, stroke: '#e2e8f0', lineWidth: 4, bindings: { x2: bobX, y2: bobY } },
    { id: 'pivot', type: 'point', name: '支点', x: 420, y: 190, radius: 9, fill: '#94a3b8' },
    { id: 'bob', type: 'point', name: '摆球', x: 420, y: 390, radius: 27, fill: '#60a5fa', bindings: { x: bobX, y: bobY } },
    { id: 'formula', type: 'formula', name: '小角度解', x: 716, y: 250, text: '\\theta(t)\\approx\\theta_0\\cos(\\sqrt{g/L}\\,t)', fontSize: 28, fill: '#e2e8f0' },
    { id: 'period-formula', type: 'formula', name: '周期公式', x: 716, y: 322, text: 'T\\approx 2\\pi\\sqrt{L/g}', fontSize: 29, fill: '#e2e8f0' },
    { id: 'angle', type: 'text', name: '当前摆角', x: 716, y: 427, text: '', fontSize: 25, fill: '#60a5fa', valueExpression: swing, prefix: '摆角 θ = ', suffix: ' rad', precision: 3 },
    { id: 'period', type: 'text', name: '近似周期', x: 716, y: 490, text: '', fontSize: 25, fill: '#fbbf24', valueExpression: '2*pi*sqrt(length/g)', prefix: '周期 T ≈ ', suffix: ' s', precision: 2 },
    { id: 'hint', type: 'text', name: '参数提示', x: 716, y: 552, text: '改变摆长，观察周期和运动同时变化。', fontSize: 18, fill: '#94a3b8' },
  ])
  project.scenes[0].params = [
    { id: 'length', label: '摆长 L', value: 2, min: 1.2, max: 2.5, step: 0.1, unit: 'm' },
    { id: 'angle0', label: '初始摆角', value: 0.5, min: 0.1, max: 0.6, step: 0.05, unit: 'rad' },
    { id: 'g', label: '重力加速度', value: 9.8, min: 8, max: 11, step: 0.1, unit: 'm/s²' },
  ]
  return project
}

function bubbleSort(): Project {
  const values = [5, 2, 8, 1, 6]
  const order = values.map((_, index) => index)
  const comparisons: Array<{ left: number; right: number; before: number[]; after: number[]; swapped: boolean }> = []
  for (let end = order.length - 1; end > 0; end--) {
    for (let index = 0; index < end; index++) {
      const before = order.slice()
      const left = before[index], right = before[index + 1]
      const swapped = values[left] > values[right]
      if (swapped) [order[index], order[index + 1]] = [right, left]
      comparisons.push({ left, right, before, after: order.slice(), swapped })
    }
  }
  const slotX = (index: number) => 125 + index * 205
  const stepTime = 1.6
  const labelY = (value: number) => 560 - value * 38
  const markerX = (slot: number) => slotX(slot) + 37
  const markerY = (value: number) => labelY(value) - 39
  const nodes: SceneNode[] = [
    { id: 'title', type: 'text', name: '标题', x: 72, y: 66, text: '冒泡排序：逐次比较相邻数字', fontSize: 36, fill: '#f8fafc' },
    { id: 'note', type: 'text', name: '说明', x: 72, y: 112, text: '虚线框和箭头指向正在比较的两个数；只有左边较大时才交换', fontSize: 19, fill: '#94a3b8' },
    { id: 'baseline', type: 'line', name: '基线', x: 104, y: 580, x2: 1140, y2: 580, stroke: '#475569', lineWidth: 2 },
    { id: 'step', type: 'text', name: '步骤说明', x: 150, y: 665, text: '', fontSize: 26, fill: '#fbbf24' },
  ]
  const tracks: Track[] = [{ nodeId: 'step', property: 'text', keyframes: comparisons.flatMap(({ left, right, swapped }, index) => {
    const a = values[left], b = values[right], time = index * stepTime
    return [
      { time, value: `第 ${index + 1} 次比较：${a} 和 ${b}`, easing: 'step' as const },
      { time: time + 0.7, value: swapped ? `${a} > ${b}，交换位置` : `${a} ≤ ${b}，不交换，继续比较`, easing: 'step' as const },
    ]
  }).concat({ time: comparisons.length * stepTime, value: '排序完成：1、2、5、6、8', easing: 'step' }) }]
  const colors = ['#5eead4', '#60a5fa', '#c4b5fd', '#fbbf24', '#fb7185']
  values.forEach((value, index) => {
    const height = value * 38
    const barId = `bar-${value}`, labelId = `value-${value}`
    nodes.push({ id: barId, type: 'rect', name: `数值 ${value} 的柱形`, x: slotX(index), y: 580 - height, width: 138, height, radius: 10, fill: colors[index] })
    nodes.push({ id: labelId, type: 'text', name: `数值 ${value}`, x: slotX(index) + 54, y: 560 - height, text: String(value), fontSize: 30, fill: colors[index] })
    const movement = (offset: number) => {
      const frames: Track['keyframes'] = [{ time: 0, value: slotX(index) + offset, easing: 'step' }]
      comparisons.forEach(({ before, after, swapped }, step) => {
        if (!swapped || before.indexOf(index) === after.indexOf(index)) return
        const time = step * stepTime
        frames.push({ time: time + 0.75, value: slotX(before.indexOf(index)) + offset, easing: 'easeInOut' })
        frames.push({ time: time + 1.35, value: slotX(after.indexOf(index)) + offset, easing: 'step' })
      })
      return frames
    }
    tracks.push({ nodeId: barId, property: 'x', keyframes: movement(0) })
    tracks.push({ nodeId: labelId, property: 'x', keyframes: movement(54) })
  })
  for (const [side, key] of ['left', 'right'].entries()) {
    const first = comparisons[0]
    const initialId = side === 0 ? first.left : first.right
    const initialSlot = first.before.indexOf(initialId)
    const boxId = `compare-box-${key}`, arrowId = `compare-arrow-${key}`
    nodes.push({ id: boxId, type: 'rect', name: `比较标记 ${key}`, x: markerX(initialSlot), y: markerY(values[initialId]), width: 64, height: 50, radius: 6, fill: '#00000000', stroke: '#fbbf24', lineWidth: 3, lineDash: [8, 6], zIndex: 10 })
    nodes.push({ id: arrowId, type: 'arrow', name: `比较箭头 ${key}`, x: markerX(initialSlot) + 32, y: markerY(values[initialId]) - 53, x2: markerX(initialSlot) + 32, y2: markerY(values[initialId]) - 12, stroke: '#fbbf24', lineWidth: 3, zIndex: 10 })
    const boxX: Track['keyframes'] = [], boxY: Track['keyframes'] = [], opacity: Track['keyframes'] = []
    comparisons.forEach((comparison, step) => {
      const id = side === 0 ? comparison.left : comparison.right
      const time = step * stepTime
      const startX = markerX(comparison.before.indexOf(id))
      const endX = markerX(comparison.after.indexOf(id))
      boxX.push({ time, value: startX, easing: 'step' })
      boxY.push({ time, value: markerY(values[id]), easing: 'step' })
      if (comparison.swapped) {
        boxX.push({ time: time + 0.75, value: startX, easing: 'easeInOut' })
        boxX.push({ time: time + 1.35, value: endX, easing: 'step' })
      }
      opacity.push({ time, value: 1, easing: 'step' })
      opacity.push({ time: time + 1.48, value: 1, easing: 'step' })
      opacity.push({ time: time + 1.5, value: 0, easing: 'step' })
    })
    tracks.push({ nodeId: boxId, property: 'x', keyframes: boxX }, { nodeId: boxId, property: 'y', keyframes: boxY }, { nodeId: boxId, property: 'opacity', keyframes: opacity })
    tracks.push({ nodeId: arrowId, property: 'x', keyframes: boxX.map(frame => ({ ...frame, value: Number(frame.value) + 32 })) })
    tracks.push({ nodeId: arrowId, property: 'x2', keyframes: boxX.map(frame => ({ ...frame, value: Number(frame.value) + 32 })) })
    tracks.push({ nodeId: arrowId, property: 'y', keyframes: boxY.map(frame => ({ ...frame, value: Number(frame.value) - 53 })) })
    tracks.push({ nodeId: arrowId, property: 'y2', keyframes: boxY.map(frame => ({ ...frame, value: Number(frame.value) - 12 })) })
    tracks.push({ nodeId: arrowId, property: 'opacity', keyframes: opacity.map(frame => ({ ...frame })) })
  }
  return base('bubble', '冒泡排序 · 逐次比较', nodes, tracks, comparisons.length * stepTime + 0.4)
}

export const templates: Record<string, () => Project> = {
  math, unitCircle, physics, pendulum, binary: binarySearch, bubbleSort,
}

export function createBlankProject(): Project {
  const scene: Scene = { id: 'scene-1', name: '我的场景', duration: 8, params: [], nodes: [], tracks: [] }
  return { schemaVersion: 1, name: '未命名作品', canvas: { width: 1280, height: 720, fit: 'contain', background: '#0b1220' }, scenes: [scene], assets: [] }
}
