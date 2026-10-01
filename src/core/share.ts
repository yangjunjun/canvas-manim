import { validateProject } from './engine.ts'
import { assertSerializable } from './project-file.ts'
import type { Project } from './types.ts'

const SHARE_PREFIX = 'cmanim=v1.'
const MAX_HASH_LENGTH = 32_000

export interface ShareState {
  project: Project
  sceneId: string
  params: Record<string, number>
  time: number
}

function validateShareState(value: unknown): ShareState {
  if (!value || typeof value !== 'object') throw new Error('分享数据不是对象')
  const state = value as ShareState
  const project = validateProject(state.project)
  const scene = project.scenes.find(item => item.id === state.sceneId)
  if (!scene) throw new Error(`场景 ${String(state.sceneId)} 不存在`)
  if (!Number.isFinite(state.time) || state.time < 0 || state.time > scene.duration) throw new Error('播放时刻超出场景范围')
  if (!state.params || typeof state.params !== 'object' || Array.isArray(state.params)) throw new Error('参数状态无效')
  for (const [id, number] of Object.entries(state.params)) {
    const param = scene.params.find(item => item.id === id)
    if (!param || !Number.isFinite(number) || number < param.min || number > param.max) throw new Error(`参数 ${id} 无效或超出范围`)
  }
  return state
}

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('链接编码无效')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export function createShareUrl(state: ShareState, baseUrl: string): string {
  validateShareState(state)
  assertSerializable(state, 'share')
  const fragment = SHARE_PREFIX + encode(new TextEncoder().encode(JSON.stringify(state)))
  if (fragment.length > MAX_HASH_LENGTH) throw new Error('项目内容超过分享链接大小上限；请改用“保存项目”下载文件')
  const url = new URL(baseUrl)
  url.hash = fragment
  return url.toString()
}

export function readShareUrl(url: string): ShareState | null {
  const fragment = new URL(url).hash.slice(1)
  if (!fragment.startsWith('cmanim=')) return null
  try {
    if (!fragment.startsWith(SHARE_PREFIX)) throw new Error('不支持的分享链接版本')
    if (fragment.length > MAX_HASH_LENGTH) throw new Error('链接超过大小上限')
    const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(fragment.slice(SHARE_PREFIX.length))))
    return validateShareState(state)
  } catch (cause) {
    throw new Error(`分享链接无效：${cause instanceof Error ? cause.message : String(cause)}`)
  }
}
