import { applyAnimationCombo, createBlankProject, createShareUrl, evaluateScene, mountPlayer, type Project } from 'canvas-manim'

const project: Project = createBlankProject()
project.scenes[0].nodes.push({ id: 'dot', type: 'point', name: 'Dot', x: 0, y: 0, radius: 5 })
applyAnimationCombo(project.scenes[0], 'dot', { kind: 'pulse', start: 0, duration: 1, amount: 1.2 })
const frame = evaluateScene(project.scenes[0], 0)
const shareUrl: string = createShareUrl({ project, sceneId: project.scenes[0].id, params: {}, time: 0 }, 'https://example.test/')

declare const host: HTMLElement
const player = mountPlayer(host, project)
player.seek(frame.time)
void shareUrl
