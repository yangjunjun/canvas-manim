import type { Scene } from './types.ts'

/** Removes a node and dependent children, keeping surviving references valid. */
export function removeNodeFromScene(scene: Scene, nodeId: string): void {
  const removed = new Set([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of scene.nodes) {
      if (removed.has(node.id) || !(node.parentId && removed.has(node.parentId) || node.type === 'plot' && node.axesId && removed.has(node.axesId))) continue
      removed.add(node.id)
      changed = true
    }
  }
  scene.nodes = scene.nodes.filter(node => !removed.has(node.id))
  scene.tracks = scene.tracks.filter(track => !removed.has(track.nodeId))
  for (const node of scene.nodes) {
    if (node.axesId && removed.has(node.axesId)) delete node.axesId
    if (node.followPath && removed.has(node.followPath.pathId)) delete node.followPath
    if (node.matchTransform && removed.has(node.matchTransform.targetId)) delete node.matchTransform
  }
}
