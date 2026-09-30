import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate'
import { validateProject } from './engine.ts'
import type { Project } from './types.ts'

const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_CONTENT_BYTES = 100 * 1024 * 1024

function encodeBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(output)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function projectToBlob(project: Project): Blob {
  validateProject(project)
  const plain = structuredClone(project)
  const files: Record<string, Uint8Array> = {}
  for (const asset of plain.assets) {
    if (!asset.data || !/^[a-zA-Z0-9_-]+$/.test(asset.id)) throw new Error(`资源 ${asset.id} 无效`)
    files[`assets/${asset.id}`] = decodeBase64(asset.data)
    delete asset.data
  }
  files['project.json'] = strToU8(JSON.stringify(plain, null, 2))
  return new Blob([Uint8Array.from(zipSync(files, { level: 0 }))], { type: 'application/zip' })
}

export async function projectFromBlob(blob: Blob): Promise<Project> {
  if (blob.size > MAX_FILE_BYTES) throw new Error('项目文件过大（上限 50 MB）')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return validateProject(JSON.parse(strFromU8(bytes)))
  let entries = 0, declaredSize = 0
  const files = unzipSync(bytes, { filter: file => {
    entries++
    declaredSize += file.originalSize
    if (entries > 200 || declaredSize > MAX_CONTENT_BYTES || file.name.startsWith('/') || file.name.includes('..') || file.name.includes('\\')) throw new Error('项目包文件数量、路径或解压大小无效')
    return true
  } })
  const names = Object.keys(files)
  if (names.length > 200 || names.some(name => name.startsWith('/') || name.includes('..') || name.includes('\\'))) throw new Error('项目包路径或文件数量无效')
  const total = Object.values(files).reduce((sum, file) => sum + file.length, 0)
  if (total > MAX_CONTENT_BYTES) throw new Error('项目包解压后过大')
  if (!files['project.json']) throw new Error('项目包缺少 project.json')
  const project = validateProject(JSON.parse(strFromU8(files['project.json'])))
  for (const asset of project.assets) {
    const file = files[`assets/${asset.id}`]
    if (!file) throw new Error(`项目包缺少资源 ${asset.id}`)
    asset.data = encodeBase64(file)
  }
  return project
}
