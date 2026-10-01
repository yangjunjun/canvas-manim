import type { Scene, SceneNode, Track } from './types.ts'

export type AnimationComboKind = 'fadeSlideIn' | 'pulse' | 'fadeSlideOut'
export interface AnimationComboOptions { kind: AnimationComboKind; start: number; duration: number; amount: number }

/** Adds a reusable multi-property animation to one node. Existing drivers are preserved by rejecting conflicts. */
export function applyAnimationCombo(scene: Scene, nodeId: string, options: AnimationComboOptions): void {
  const node = scene.nodes.find(item => item.id === nodeId)
  if (!node) throw new Error(`动画组合找不到对象 ${nodeId}`)
  const { kind, start, duration, amount } = options
  if (!['fadeSlideIn', 'pulse', 'fadeSlideOut'].includes(kind) || !Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration <= 0 || start + duration > scene.duration || !Number.isFinite(amount) || amount <= 0 || amount > (kind === 'pulse' ? 4 : 1000) || kind === 'pulse' && amount < 1) throw new Error('动画组合参数无效')
  const properties: Array<keyof SceneNode> = kind === 'pulse' ? ['scale'] : ['y', 'opacity']
  for (const property of properties) {
    if (scene.tracks.some(track => track.nodeId === nodeId && track.property === property) || node.bindings?.[property] || property === 'y' && (node.layout || node.followPath)) throw new Error(`对象「${node.name}」的 ${property} 已有动画或约束，无法应用组合`)
  }
  const end = start + duration
  const ease = 'easeInOut' as const
  let tracks: Track[]
  if (kind === 'pulse') {
    const base = node.scale ?? 1
    tracks = [{ nodeId, property: 'scale', keyframes: [
      { time: start, value: base, easing: ease }, { time: start + duration / 2, value: base * amount, easing: ease }, { time: end, value: base },
    ] }]
  } else {
    const baseY = node.y, baseOpacity = node.opacity ?? 1
    const enter = kind === 'fadeSlideIn'
    tracks = [
      { nodeId, property: 'y', keyframes: [{ time: start, value: enter ? baseY + amount : baseY, easing: ease }, { time: end, value: enter ? baseY : baseY - amount }] },
      { nodeId, property: 'opacity', keyframes: [{ time: start, value: enter ? 0 : baseOpacity, easing: ease }, { time: end, value: enter ? baseOpacity : 0 }] },
    ]
  }
  scene.tracks.push(...tracks)
}
