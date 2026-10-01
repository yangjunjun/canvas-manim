import { evaluateExpression } from './expression.ts'

export interface PlotSamples {
  segments: Array<Array<[number, number]>>
  error?: Error
}

/** Samples a graph and breaks at invalid values, poles, and detectable jump discontinuities. */
export function samplePlot(expression: string, params: Record<string, number>, time: number,
  xRange: [number, number], yRange: [number, number], count: number, pixelHeight: number): PlotSamples {
  const [xmin, xmax] = xRange, [ymin, ymax] = yRange
  const segments: PlotSamples['segments'] = []
  let segment: Array<[number, number]> = []
  let error: Error | undefined
  const sample = (x: number): number => {
    try { return evaluateExpression(expression, { ...params, t: time, x }) }
    catch (cause) { error ??= cause instanceof Error ? cause : new Error(String(cause)); return NaN }
  }
  const valid = (y: number) => Number.isFinite(y) && Math.abs(y) <= 1e6
  const flush = () => { if (segment.length > 1) segments.push(segment); segment = [] }
  let previous: [number, number] | null = null
  for (let index = 0; index <= count; index++) {
    const x = xmin + (xmax - xmin) * index / count, y = sample(x)
    if (!valid(y)) { flush(); previous = null; continue }
    if (previous) {
      const [oldX, oldY] = previous
      const middle = sample((oldX + x) / 2)
      const change = Math.abs(y - oldY)
      const midpointErrorPixels = Math.abs(middle - (oldY + y) / 2) / (ymax - ymin) * pixelHeight
      if (!valid(middle) || change > (ymax - ymin) * 1.2 || midpointErrorPixels > 1.5 && Math.abs(middle - (oldY + y) / 2) > change * 0.3) flush()
    }
    segment.push([x, y])
    previous = [x, y]
  }
  flush()
  return { segments, error }
}
