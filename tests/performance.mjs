import { chromium } from 'playwright-core'

const baseURL = process.env.CANVAS_MANIM_URL ?? 'http://127.0.0.1:5173/'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CANVAS_MANIM_CHROMIUM || chromium.executablePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(new URL('examples/sdk-demo.html', baseURL).href, { waitUntil: 'networkidle' })
  const result = await page.evaluate(async sourceUrl => {
    const { createBlankProject, mountPlayer } = await import(sourceUrl)
    const project = createBlankProject()
    project.canvas.width = 1280
    project.canvas.height = 720
    project.scenes[0].duration = 60
    project.scenes[0].nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `circle-${index}`, type: 'circle', name: `圆 ${index + 1}`,
      x: 60 + index % 10 * 120, y: 50 + Math.floor(index / 10) * 68,
      radius: 14, fill: '#5eead4', stroke: '#0f766e',
      bindings: { x: `${60 + index % 10 * 120}+20*sin(t)` },
    }))
    const host = document.createElement('div')
    document.body.append(host)
    const player = mountPlayer(host, project, { width: 1280, height: 720 })
    const samples = []
    let previous = 0
    player.onChange = (_time, playing) => {
      if (!playing) return
      const now = performance.now()
      if (previous) samples.push(now - previous)
      previous = now
    }
    const heapBefore = performance.memory?.usedJSHeapSize ?? null
    const start = performance.now()
    player.play()
    await new Promise(resolve => setTimeout(resolve, 30_000))
    player.pause()
    const elapsed = (performance.now() - start) / 1000
    const heapAfter = performance.memory?.usedJSHeapSize ?? null
    player.destroy()
    host.remove()
    const sorted = [...samples].sort((a, b) => a - b)
    return {
      browser: navigator.userAgent,
      resolution: '1280x720', objectCount: 100, durationSeconds: Number(elapsed.toFixed(2)),
      renderedFrames: samples.length,
      averageFps: Number((samples.length / elapsed).toFixed(2)),
      p95FrameIntervalMs: Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(2)),
      intervalsOver50ms: samples.filter(value => value > 50).length,
      heapDeltaMB: heapBefore === null || heapAfter === null ? null : Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)),
    }
  }, new URL('src/sdk.ts', baseURL).href)
  console.log(JSON.stringify(result, null, 2))
  if (result.averageFps < 30) process.exitCode = 1
} finally {
  await browser.close()
}
