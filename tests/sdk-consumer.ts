import { createBlankProject, evaluateScene, mountPlayer, type Project } from 'canvas-manim'

const project: Project = createBlankProject()
const frame = evaluateScene(project.scenes[0], 0)

declare const host: HTMLElement
const player = mountPlayer(host, project)
player.seek(frame.time)
