export type NodeType = 'group' | 'circle' | 'rect' | 'line' | 'arrow' | 'text' | 'formula' | 'axes' | 'plot' | 'point' | 'polygon' | 'path' | 'image'

export interface Parameter {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
}

export interface SceneNode {
  id: string
  type: NodeType
  name: string
  x: number
  y: number
  x2?: number
  y2?: number
  width?: number
  height?: number
  radius?: number
  rotation?: number
  scale?: number
  opacity?: number
  fill?: string
  stroke?: string
  lineWidth?: number
  lineDash?: number[]
  fontSize?: number
  text?: string
  valueExpression?: string
  prefix?: string
  suffix?: string
  precision?: number
  expression?: string
  bindings?: Record<string, string>
  axesId?: string
  xRange?: [number, number]
  yRange?: [number, number]
  points?: Array<[number, number]>
  assetId?: string
  parentId?: string
  zIndex?: number
  visible?: boolean
}

export interface Keyframe {
  time: number
  value: number | string | boolean
  easing?: 'linear' | 'easeInOut' | 'step'
}

export interface Track {
  nodeId: string
  property: keyof SceneNode
  keyframes: Keyframe[]
}

export interface Scene {
  id: string
  name: string
  duration: number
  params: Parameter[]
  nodes: SceneNode[]
  tracks: Track[]
}

export interface Asset {
  id: string
  mime: string
  name: string
  data?: string
}

export interface Project {
  schemaVersion: 1
  name: string
  canvas: { width: number; height: number; fit: 'contain' | 'cover'; background?: string }
  scenes: Scene[]
  assets: Asset[]
  extensions?: Record<string, unknown>
}

export interface EvaluatedScene {
  scene: Scene
  nodes: SceneNode[]
  params: Record<string, number>
  time: number
}
