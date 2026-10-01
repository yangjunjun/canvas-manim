import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const baseURL = process.env.CANVAS_MANIM_URL ?? 'http://127.0.0.1:5173/'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CANVAS_MANIM_CHROMIUM || chromium.executablePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 960 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: /正弦函数/ }).waitFor()
  const themeBackground = await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--background').trim())
  assert.equal(await page.locator('.topbar').evaluate(node => getComputedStyle(node).backgroundColor), themeBackground)
  assert.match(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily), /Inter Variable/)
  assert.equal(await page.locator('.export-trigger').getAttribute('data-slot'), 'dropdown-menu-trigger')
  const initialStageWidth = (await page.locator('.stage-section').boundingBox()).width
  await page.getByRole('button', { name: '折叠左侧栏' }).click()
  assert.equal(await page.locator('#left-panel').isVisible(), false)
  assert.equal(await page.locator('#right-panel').isVisible(), true)
  await page.waitForFunction(width => document.querySelector('.stage-section').getBoundingClientRect().width > width + 100, initialStageWidth)
  await page.getByRole('button', { name: '折叠右侧栏' }).click()
  assert.equal(await page.locator('#right-panel').isVisible(), false)
  const exportTrigger = page.locator('.export-trigger')
  assert.equal(await exportTrigger.isVisible(), true, '右侧栏折叠后仍可导出')
  await exportTrigger.click()
  assert.equal(await exportTrigger.getAttribute('aria-expanded'), 'true')
  assert.equal(await page.getByRole('menuitem', { name: /当前帧 PNG/ }).isVisible(), true)
  await page.keyboard.press('Escape')
  assert.equal(await exportTrigger.getAttribute('aria-expanded'), 'false')
  await exportTrigger.click()
  await page.locator('.stage-header').click()
  await page.locator('#export-dropdown-panel').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '展开左侧栏' }).click()
  assert.equal(await page.locator('#left-panel').isVisible(), true)
  assert.equal(await page.locator('#right-panel').isVisible(), false)
  await page.getByRole('button', { name: '展开右侧栏' }).click()
  assert.equal(await page.locator('#right-panel').isVisible(), true)
  const projectTab = page.getByRole('tab', { name: '项目／场景' })
  const objectTab = page.getByRole('tab', { name: '对象属性' })
  assert.equal(await projectTab.getAttribute('aria-selected'), 'true')
  assert.equal(await page.getByLabel('项目名称').isVisible(), true)
  const canvasPreset = page.getByRole('combobox', { name: '画布预置' })
  assert.equal(await canvasPreset.locator('optgroup').count(), 3)
  assert.equal(await canvasPreset.locator('option[value="3840x2160"]').count(), 1)
  await canvasPreset.selectOption('1080x1920')
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('width'), '1080')
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('height'), '1920')
  const portrait = await page.locator('.canvas-shell').boundingBox()
  assert.ok(Math.abs(portrait.width / portrait.height - 1080 / 1920) < 0.01)
  assert.ok(portrait.height <= 0.7 * 960 + 2, '竖屏预览应适合视口高度')
  await canvasPreset.selectOption('2048x1536')
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('width'), '2048')
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('height'), '1536')
  await canvasPreset.selectOption('1920x1080')
  await page.getByRole('spinbutton', { name: '画布宽度' }).fill('1800')
  await page.getByRole('spinbutton', { name: '画布宽度' }).press('Tab')
  assert.equal(await canvasPreset.inputValue(), '')
  await canvasPreset.selectOption('1280x720')
  assert.equal(await page.locator('.inspector-empty').isVisible(), false)
  const guidePopup = page.waitForEvent('popup')
  await page.getByRole('link', { name: /使用指南/ }).first().click()
  const guidePage = await guidePopup
  await guidePage.getByRole('heading', { name: /第一个科普动画/ }).waitFor()
  assert.equal(await guidePage.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), themeBackground)
  assert.match(await guidePage.locator('body').evaluate(node => getComputedStyle(node).fontFamily), /Noto Sans SC/)
  await guidePage.getByRole('link', { name: '第一个动画' }).click()
  assert.match(guidePage.url(), /guide\.html#first-animation$/)
  assert.match(page.url(), /\/$/, '打开指南后原编辑器仍应保留')
  await guidePage.getByRole('link', { name: /返回编辑器/ }).first().click()
  await guidePage.getByRole('heading', { name: /正弦函数/ }).waitFor()
  await guidePage.close()
  assert.equal(await page.locator('canvas').count(), 1)
  const painted = await page.locator('canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let nonBackground = 0
    for (let index = 0; index < data.length; index += 4000) {
      if (data[index] !== 11 || data[index + 1] !== 18 || data[index + 2] !== 32) nonBackground++
    }
    return nonBackground
  })
  assert.ok(painted > 10, '数学模板应绘制图形')
  await page.locator('.node-list button').first().click()
  assert.equal(await objectTab.getAttribute('aria-selected'), 'true')
  assert.equal(await page.getByLabel('项目名称').isVisible(), false)
  await projectTab.click()
  assert.equal(await page.getByLabel('项目名称').isVisible(), true)
  await projectTab.press('ArrowRight')
  assert.equal(await objectTab.getAttribute('aria-selected'), 'true')
  const titleName = page.locator('.inspector > label').first().locator('input')
  assert.equal(await titleName.inputValue(), '正弦函数：从运动看斜率')
  const titleSelection = page.locator('.selection-overlay .selection-rect')
  assert.equal(await titleSelection.count(), 1)
  assert.ok(Number(await titleSelection.getAttribute('x')) < 72)
  assert.ok(Number(await titleSelection.getAttribute('width')) > 150)
  await titleName.fill('正弦函数：新的标题')
  await titleName.press('Tab')
  assert.match(await page.locator('.node-list button').first().innerText(), /正弦函数：新的标题/)
  const mathBounds = await page.locator('.canvas-shell canvas').boundingBox()
  assert.ok(mathBounds)
  const dotY = 215 + (1 - (Math.sin(-4) + 2) / 4) * 370
  await page.locator('.canvas-shell canvas').click({ position: { x: 120 / 1280 * mathBounds.width, y: dotY / 720 * mathBounds.height } })
  assert.match(await page.locator('.canvas-badge').innerText(), /运动点/)
  assert.equal(await page.locator('.selection-overlay .selection-rect').count(), 1)
  assert.equal(await page.getByRole('spinbutton', { name: 'X 位置' }).isDisabled(), true)
  assert.match(await page.locator('.driven-note').first().innerText(), /表达式/)
  if (process.env.CANVAS_MANIM_SCREENSHOT) await page.screenshot({ path: process.env.CANVAS_MANIM_SCREENSHOT.replace(/\.png$/, '-initial.png'), fullPage: true })
  await page.getByRole('button', { name: /抛体运动/ }).click()
  await page.getByRole('heading', { name: '抛体运动 · 轨迹与速度' }).waitFor()
  await page.getByRole('slider', { name: '初速度' }).fill('7')
  assert.match(await page.locator('.param-head').first().innerText(), /7\.00/)
  await page.getByRole('button', { name: /二分查找/ }).click()
  await page.getByRole('heading', { name: /二分查找/ }).waitFor()
  await page.getByRole('slider', { name: '播放进度' }).fill('4')
  await page.getByRole('button', { name: /单位圆/ }).click()
  await page.getByRole('heading', { name: /单位圆/ }).waitFor()
  await page.getByRole('slider', { name: '角速度' }).fill('1')
  await page.getByRole('slider', { name: '播放进度' }).fill('1.57')
  assert.ok(await page.locator('.node-list button').count() > 10)
  await page.getByRole('button', { name: /单摆运动/ }).click()
  await page.getByRole('heading', { name: /单摆运动/ }).waitFor()
  await page.getByRole('slider', { name: '摆长 L' }).fill('2.5')
  assert.match(await page.locator('.param-head').first().innerText(), /2\.50/)
  await page.getByRole('button', { name: /冒泡排序/ }).click()
  await page.getByRole('heading', { name: /冒泡排序/ }).waitFor()
  await page.getByRole('slider', { name: '播放进度' }).fill('7.2')
  assert.equal(await page.locator('.track-row').count() > 0, true)
  await page.getByRole('button', { name: '新建', exact: true }).click()
  assert.equal(await projectTab.getAttribute('aria-selected'), 'true')
  assert.equal(await page.locator('.node-list button').count(), 0)
  await page.getByLabel('添加对象').selectOption('circle')
  assert.equal(await objectTab.getAttribute('aria-selected'), 'true')
  if (await page.locator('.node-list button').count() !== 1) console.log('Add node diagnostic:', await page.locator('.statusbar').innerText(), errors)
  assert.equal(await page.locator('.node-list button').count(), 1)
  const stage = page.locator('.canvas-shell canvas')
  const bounds = await stage.boundingBox()
  assert.ok(bounds)
  const at = (x, y) => ({ x: x / 1280 * bounds.width, y: y / 720 * bounds.height })
  await stage.click({ position: at(410, 280) })
  assert.match(await page.locator('.canvas-badge').innerText(), /圆形/)
  await page.getByRole('spinbutton', { name: 'X 位置' }).fill('640')
  await page.getByRole('spinbutton', { name: 'X 位置' }).press('Tab')
  assert.equal(await page.getByRole('spinbutton', { name: 'X 位置' }).inputValue(), '640')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.canvas-shell canvas')
    const pixel = canvas.getContext('2d').getImageData(640, 280, 1, 1).data
    return pixel[0] === 94 && pixel[1] === 234 && pixel[2] === 212
  })
  await stage.click({ position: at(640, 280) })
  assert.match(await page.locator('.canvas-badge').innerText(), /圆形/)
  await page.getByRole('spinbutton', { name: 'X 位置' }).fill('760')
  await page.getByRole('spinbutton', { name: 'X 位置' }).press('Tab')
  const immediatePixel = await stage.evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(760, 280, 1, 1).data))
  assert.deepEqual(immediatePixel.slice(0, 3), [94, 234, 212], '连续修改 X 后应立即绘制到新位置')
  await page.getByRole('button', { name: '＋ 关键帧' }).click()
  assert.equal(await page.locator('.track-row').count(), 1)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存项目' }).click()
  const projectDownload = await downloadPromise
  assert.match(projectDownload.suggestedFilename(), /\.cmanim$/)
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.locator('input[type=file][accept*=".cmanim"]').setInputFiles(await projectDownload.path())
  await page.locator('.node-list button').first().waitFor()
  assert.equal(await projectTab.getAttribute('aria-selected'), 'true')
  assert.equal(await page.locator('.node-list button').count(), 1)
  assert.equal(await page.locator('.track-row').count(), 1)
  const pngPromise = page.waitForEvent('download')
  await exportTrigger.click()
  await page.getByRole('menuitem', { name: /当前帧 PNG/ }).click()
  const pngDownload = await pngPromise
  assert.match(pngDownload.suggestedFilename(), /\.png$/)
  assert.ok((await stat(await pngDownload.path())).size > 1000)
  assert.equal(await exportTrigger.getAttribute('aria-expanded'), 'false')
  await page.getByLabel('时长（秒）').fill('0.5')
  await page.getByLabel('时长（秒）').press('Tab')
  const framesPromise = page.waitForEvent('download')
  await exportTrigger.click()
  await page.getByRole('menuitem', { name: /逐帧 ZIP/ }).click()
  const framesDownload = await framesPromise
  assert.ok((await stat(await framesDownload.path())).size > 1000)
  await exportTrigger.click()
  if (await page.getByRole('menuitem', { name: /视频 WebM|视频 MP4/ }).isEnabled()) {
    const videoPromise = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /视频 WebM|视频 MP4/ }).click()
    const videoDownload = await videoPromise
    assert.ok((await stat(await videoDownload.path())).size > 1000)
    const mime = videoDownload.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm'
    const source = `data:${mime};base64,${(await readFile(await videoDownload.path())).toString('base64')}`
    const metadata = await page.evaluate(async url => {
      const element = document.createElement('video')
      element.preload = 'metadata'
      element.src = url
      await new Promise((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = reject })
      return { duration: element.duration, width: element.videoWidth, height: element.videoHeight }
    }, source)
    assert.ok(metadata.duration > 0 && metadata.width > 0 && metadata.height > 0)
  } else {
    assert.match(await page.getByRole('menuitem', { name: /视频 WebM|视频 MP4/ }).getAttribute('title'), /浏览器不支持视频录制/)
  }
  assert.deepEqual(errors, [])
  if (process.env.CANVAS_MANIM_SCREENSHOT) await page.screenshot({ path: process.env.CANVAS_MANIM_SCREENSHOT, fullPage: true })
  await page.goto(new URL('/examples/sdk-demo.html', baseURL).href, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '编程式 SDK 示例' }).waitFor()
  assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(246, 248, 250)')
  assert.equal(await page.locator('canvas').count(), 1)
  await page.getByRole('slider', { name: '振幅' }).fill('1.5')
  await page.getByRole('slider', { name: '时间' }).fill('2')
  assert.equal(await page.locator('#time').innerText(), '2.00s')
  await page.getByRole('button', { name: '播放' }).click()
  await page.getByRole('button', { name: '暂停' }).waitFor()
  const isolated = await page.evaluate(async () => {
    const { mountPlayer, templates } = await import('/src/sdk.ts')
    const firstHost = document.createElement('div')
    const secondHost = document.createElement('div')
    document.body.append(firstHost, secondHost)
    const first = mountPlayer(firstHost, templates.math())
    const second = mountPlayer(secondHost, templates.physics())
    first.seek(2)
    first.setParams({ amp: 1.7 })
    second.seek(3)
    const result = {
      firstTime: first.currentTime,
      secondTime: second.currentTime,
      firstAmp: first.currentParams.amp,
      secondAmp: second.currentParams.amp,
      mounted: firstHost.querySelectorAll('canvas').length + secondHost.querySelectorAll('canvas').length,
    }
    first.destroy()
    second.destroy()
    return { ...result, remaining: firstHost.querySelectorAll('canvas').length + secondHost.querySelectorAll('canvas').length }
  })
  assert.deepEqual(isolated, { firstTime: 2, secondTime: 3, firstAmp: 1.7, secondAmp: undefined, mounted: 2, remaining: 0 })
  assert.deepEqual(errors, [])
  const mobile = await browser.newPage({ viewport: { width: 720, height: 900 } })
  try {
    await mobile.goto(baseURL, { waitUntil: 'networkidle' })
    assert.equal(await mobile.locator('#left-panel').isVisible(), false)
    assert.equal(await mobile.locator('#right-panel').isVisible(), false)
    await mobile.getByRole('button', { name: '展开左侧栏' }).click()
    assert.equal(await mobile.locator('#left-panel').isVisible(), true)
    await mobile.getByRole('button', { name: '展开右侧栏' }).click()
    assert.equal(await mobile.locator('#left-panel').isVisible(), false)
    assert.equal(await mobile.locator('#right-panel').isVisible(), true)
    await mobile.getByRole('button', { name: '关闭侧栏' }).click()
    assert.equal(await mobile.locator('#right-panel').isVisible(), false)
  } finally { await mobile.close() }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await phone.goto(baseURL, { waitUntil: 'networkidle' })
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390)
    assert.ok((await phone.getByRole('button', { name: '新建', exact: true }).boundingBox()).height <= 36)
    assert.equal(await phone.locator('.ruler span:visible').count(), 5)
  } finally { await phone.close() }
  console.log('Browser smoke passed: light theme, collapsible panels, guide, editor, six templates, timeline, project roundtrip, exports, SDK demo and player isolation')
} finally {
  await browser.close()
}
