import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { chromium, firefox, webkit } from 'playwright-core'

const baseURL = process.env.CANVAS_MANIM_URL ?? 'http://127.0.0.1:5173/'
async function chooseOption(page, label, option) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}

async function setEditorSlider(page, label, value, min, max) {
  const track = page.getByRole('slider', { name: label }).locator('..')
  const bounds = await track.boundingBox()
  assert.ok(bounds)
  await track.click({ position: { x: Math.max(7, Math.min(bounds.width - 7, (value - min) / (max - min) * bounds.width)), y: bounds.height / 2 } })
}
const browserName = process.env.CANVAS_MANIM_BROWSER ?? 'chromium'
const browserType = { chromium, firefox, webkit }[browserName]
if (!browserType) throw new Error(`不支持的浏览器类型：${browserName}`)
const browser = await browserType.launch({
  headless: true,
  ...(browserName === 'chromium' ? { executablePath: process.env.CANVAS_MANIM_CHROMIUM || chromium.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
})

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 960 }, acceptDownloads: true })
  const errors = []
  const remoteRequests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(baseURL).origin) remoteRequests.push(request.url()) })
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: /正弦函数/ }).waitFor()
  const themeBackground = await page.locator('.workspace').evaluate(node => getComputedStyle(node).backgroundColor)
  assert.equal(await page.locator('.topbar').evaluate(node => getComputedStyle(node).backgroundColor), themeBackground)
  assert.match(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily), /Inter Variable/)
  assert.equal(await page.locator('.export-trigger').getAttribute('data-slot'), 'dropdown-menu-trigger')
  const templatesTool = page.getByRole('navigation', { name: '左侧工具' }).getByRole('button', { name: '模板' })
  const scenesTool = page.getByRole('navigation', { name: '左侧工具' }).getByRole('button', { name: '场景' })
  const layersTool = page.getByRole('navigation', { name: '左侧工具' }).getByRole('button', { name: '图层' })
  const projectTool = page.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '项目' })
  const objectTool = page.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '属性' })
  const paramsTool = page.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '参数' })
  assert.equal(await templatesTool.getAttribute('aria-pressed'), 'true')
  assert.equal(await projectTool.getAttribute('aria-pressed'), 'true')
  const initialStageWidth = (await page.locator('.stage-section').boundingBox()).width
  await templatesTool.click()
  assert.equal(await page.locator('#left-panel').isVisible(), false)
  assert.equal(await page.locator('#right-panel').isVisible(), true)
  await page.waitForFunction(width => document.querySelector('.stage-section').getBoundingClientRect().width > width + 100, initialStageWidth)
  await projectTool.click()
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
  await layersTool.click()
  assert.equal(await page.locator('#left-panel').isVisible(), true)
  assert.equal(await page.locator('#right-panel').isVisible(), false)
  await scenesTool.click()
  assert.equal(await page.locator('.scene-list button').count(), 1)
  await layersTool.click()
  assert.equal(await page.getByLabel('添加对象').isVisible(), true)
  const layerItems = page.locator('.node-list button')
  assert.ok(await layerItems.count() > 0)
  assert.equal(await page.locator('.node-list button svg.node-icon[aria-hidden="true"]').count(), await layerItems.count())
  const iconBoxSizes = await page.locator('.node-list .node-icon-box').evaluateAll(nodes => nodes.map(node => [node.getBoundingClientRect().width, node.getBoundingClientRect().height]))
  assert.ok(iconBoxSizes.every(([width, height]) => width === 20 && height === 20))
  assert.ok((await layerItems.first().boundingBox()).height <= 32, '图层项应保持紧凑')
  const firstLayerId = await layerItems.nth(0).getAttribute('data-node-id')
  const secondLayerId = await layerItems.nth(1).getAttribute('data-node-id')
  const secondLayerBounds = await layerItems.nth(1).boundingBox()
  assert.ok(firstLayerId && secondLayerId && secondLayerBounds)
  await layerItems.nth(0).dragTo(layerItems.nth(1), { targetPosition: { x: 30, y: secondLayerBounds.height - 3 } })
  assert.equal(await layerItems.nth(0).getAttribute('data-node-id'), secondLayerId)
  assert.equal(await layerItems.nth(1).getAttribute('data-node-id'), firstLayerId)
  const reorderedDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存项目' }).click()
  const reorderedDownload = await reorderedDownloadPromise
  const reorderedProject = JSON.parse(strFromU8(unzipSync(await readFile(await reorderedDownload.path()))['project.json']))
  assert.deepEqual(reorderedProject.scenes[0].nodes.map(node => node.zIndex), reorderedProject.scenes[0].nodes.map((_, index) => index))
  await page.getByRole('button', { name: '撤销' }).click()
  assert.equal(await layerItems.nth(0).getAttribute('data-node-id'), firstLayerId)
  const layerPanelBounds = await page.locator('#left-panel').boundingBox()
  const layerListBounds = await page.locator('.node-list').boundingBox()
  assert.ok(layerPanelBounds && layerListBounds)
  assert.ok(layerListBounds.height > 500, '图层列表应填满侧栏剩余高度')
  assert.ok(Math.abs(layerListBounds.y + layerListBounds.height - (layerPanelBounds.y + layerPanelBounds.height)) < 2)
  await page.getByRole('button', { name: '添加对象' }).click()
  assert.equal(await page.locator('.add-node-menu').evaluate(node => getComputedStyle(node).backgroundColor), await page.locator('html').evaluate(node => {
    const swatch = document.createElement('span')
    swatch.style.backgroundColor = 'var(--popover)'
    node.appendChild(swatch)
    const color = getComputedStyle(swatch).backgroundColor
    swatch.remove()
    return color
  }))
  await page.keyboard.press('Escape')
  await projectTool.click()
  assert.equal(await page.locator('#right-panel').isVisible(), true)
  assert.equal(await projectTool.getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByLabel('项目名称').isVisible(), true)
  const canvasPreset = page.getByRole('combobox', { name: '画布预置' })
  await canvasPreset.click()
  assert.equal(await page.getByRole('option', { name: /3840 × 2160/ }).count(), 1)
  assert.equal(await page.getByText('手机视频', { exact: true }).count(), 1)
  await page.getByRole('option', { name: /1080 × 1920/ }).click()
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('width'), '1080')
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('height'), '1920')
  const portrait = await page.locator('.canvas-shell').boundingBox()
  assert.ok(Math.abs(portrait.width / portrait.height - 1080 / 1920) < 0.01)
  assert.ok(portrait.height <= 0.7 * 960 + 2, '竖屏预览应适合视口高度')
  await chooseOption(page, '画布预置', /2048 × 1536/)
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('width'), '2048')
  assert.equal(await page.locator('.canvas-shell canvas').getAttribute('height'), '1536')
  await chooseOption(page, '画布预置', /1920 × 1080/)
  await page.getByRole('spinbutton', { name: '画布宽度' }).fill('1800')
  await page.getByRole('spinbutton', { name: '画布宽度' }).press('Tab')
  assert.match(await canvasPreset.innerText(), /自定义尺寸/)
  await chooseOption(page, '画布预置', /1280 × 720/)
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
  assert.equal(await objectTool.getAttribute('aria-pressed'), 'true')
  assert.equal(await page.getByLabel('项目名称').isVisible(), false)
  await projectTool.click()
  assert.equal(await page.getByLabel('项目名称').isVisible(), true)
  await objectTool.click()
  assert.equal(await objectTool.getAttribute('aria-pressed'), 'true')
  const titleName = page.locator('.inspector > label').first().locator('input')
  assert.equal(await titleName.inputValue(), '正弦函数：从运动看斜率')
  const titleSelection = page.locator('.selection-overlay .selection-rect')
  assert.equal(await titleSelection.count(), 1)
  assert.ok(Number(await titleSelection.getAttribute('x')) < 72)
  assert.ok(Number(await titleSelection.getAttribute('width')) > 150)
  const longNodeName = '正弦函数：这是一个很长的对象图层名称，用来检查内容区不出现横向滚动且名称正确省略'
  await titleName.fill(longNodeName)
  await titleName.press('Tab')
  assert.equal(await page.locator('.node-list button').first().getAttribute('title'), longNodeName)
  assert.equal(await page.locator('.node-list').evaluate(node => node.scrollWidth <= node.clientWidth), true)
  assert.equal(await page.locator('.node-list .node-name').first().evaluate(node => node.scrollWidth > node.clientWidth), true)
  const mathBounds = await page.locator('.canvas-shell canvas').boundingBox()
  assert.ok(mathBounds)
  const dotY = 215 + (1 - (Math.sin(-4) + 2) / 4) * 370
  await page.locator('.canvas-shell canvas').click({ position: { x: 120 / 1280 * mathBounds.width, y: dotY / 720 * mathBounds.height } })
  assert.match(await page.locator('.canvas-badge').innerText(), /运动点/)
  assert.equal(await page.locator('.selection-overlay .selection-rect').count(), 1)
  assert.equal(await page.getByRole('spinbutton', { name: 'X 位置' }).isDisabled(), true)
  assert.match(await page.locator('.driven-note').first().innerText(), /表达式/)
  if (process.env.CANVAS_MANIM_SCREENSHOT) await page.screenshot({ path: process.env.CANVAS_MANIM_SCREENSHOT.replace(/\.png$/, '-initial.png'), fullPage: true })
  await templatesTool.click()
  await page.getByRole('button', { name: /抛体运动/ }).click()
  await page.getByRole('heading', { name: '抛体运动 · 轨迹与速度' }).waitFor()
  await paramsTool.click()
  await setEditorSlider(page, '初速度', 7, 3, 9)
  assert.match(await page.locator('.param-head').first().innerText(), /7\.00/)
  await page.getByRole('button', { name: '参数定义' }).first().click()
  assert.equal(await page.getByRole('spinbutton', { name: '默认值' }).isVisible(), true)
  await page.getByRole('button', { name: '参数定义' }).first().click()
  await page.getByRole('button', { name: /二分查找/ }).click()
  await page.getByRole('heading', { name: /二分查找/ }).waitFor()
  await setEditorSlider(page, '播放进度', 4, 0, 6)
  await page.getByRole('button', { name: /单位圆/ }).click()
  await page.getByRole('heading', { name: /单位圆/ }).waitFor()
  await paramsTool.click()
  await setEditorSlider(page, '角速度', 1, 0.3, 1.2)
  await setEditorSlider(page, '播放进度', 1.57, 0, 8)
  await layersTool.click()
  assert.ok(await page.locator('.node-list button').count() > 10)
  await templatesTool.click()
  await page.getByRole('button', { name: /单摆运动/ }).click()
  await page.getByRole('heading', { name: /单摆运动/ }).waitFor()
  await paramsTool.click()
  await setEditorSlider(page, '摆长 L', 2.5, 1.2, 2.5)
  assert.match(await page.locator('.param-head').first().innerText(), /2\.50/)
  await page.getByRole('button', { name: /冒泡排序/ }).click()
  await page.getByRole('heading', { name: /冒泡排序/ }).waitFor()
  await setEditorSlider(page, '播放进度', 7.2, 0, 8)
  assert.equal(await page.locator('.track-row').count() > 0, true)
  await page.getByRole('button', { name: '新建', exact: true }).click()
  assert.equal(await projectTool.getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.node-list button').count(), 0)
  await page.getByRole('button', { name: '添加对象' }).click()
  await page.getByRole('menuitem', { name: '圆形' }).click()
  assert.equal(await objectTool.getAttribute('aria-pressed'), 'true')
  if (await page.locator('.node-list button').count() !== 1) console.log('Add node diagnostic:', await page.locator('.statusbar').innerText(), errors)
  assert.equal(await page.locator('.node-list button').count(), 1)
  const stage = page.locator('.canvas-shell canvas')
  const bounds = await stage.boundingBox()
  assert.ok(bounds)
  const at = (x, y) => ({ x: x / 1280 * bounds.width, y: y / 720 * bounds.height })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.canvas-shell canvas')
    const pixel = canvas.getContext('2d').getImageData(410, 280, 1, 1).data
    return pixel[0] === 94 && pixel[1] === 234 && pixel[2] === 212
  })
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
  assert.equal(await projectTool.getAttribute('aria-pressed'), 'true')
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
  await page.getByRole('spinbutton', { name: '导出开始时间' }).fill('0.2')
  await page.getByRole('spinbutton', { name: '导出开始时间' }).press('Tab')
  await page.getByRole('menuitem', { name: /逐帧 ZIP/ }).click()
  const framesDownload = await framesPromise
  assert.ok((await stat(await framesDownload.path())).size > 1000)
  const frameFiles = unzipSync(await readFile(await framesDownload.path()))
  const manifest = JSON.parse(strFromU8(frameFiles['manifest.json']))
  assert.equal(manifest.start, 0.2)
  assert.equal(manifest.end, 0.5)
  assert.equal(Object.keys(frameFiles).filter(name => name.startsWith('frames/')).length, manifest.frames)
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
  await page.goto(new URL('examples/sdk-demo.html', baseURL).href, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '编程式 SDK 示例' }).waitFor()
  assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(246, 248, 250)')
  assert.equal(await page.locator('canvas').count(), 1)
  await page.getByRole('slider', { name: '振幅' }).fill('1.5')
  await page.getByRole('slider', { name: '时间' }).fill('2')
  assert.equal(await page.locator('#time').innerText(), '2.00s')
  await page.getByRole('button', { name: '播放' }).click()
  await page.getByRole('button', { name: '暂停' }).waitFor()
  const sdkSourceUrl = new URL('src/sdk.ts', baseURL).href
  const sdkSourceResponse = await page.request.get(sdkSourceUrl)
  const sdkSourceAvailable = sdkSourceResponse.ok() && /javascript/.test(sdkSourceResponse.headers()['content-type'] ?? '')
  if (sdkSourceAvailable) {
    const isolated = await page.evaluate(async sourceUrl => {
      const { mountPlayer, templates } = await import(sourceUrl)
      const firstHost = document.createElement('div')
      const secondHost = document.createElement('div')
      document.body.append(firstHost, secondHost)
      let invalidSceneError = ''
      try { mountPlayer(firstHost, templates.math(), 'missing-scene') } catch (error) { invalidSceneError = error.message }
      const first = mountPlayer(firstHost, templates.math(), { width: 320, height: 180, params: { amp: 1.4 } })
      const second = mountPlayer(secondHost, templates.physics())
      const initialAmp = first.currentParams.amp
      const firstSize = [first.canvas.style.width, first.canvas.style.height, first.canvas.style.objectFit]
      first.seek(2)
      first.setParams({ amp: 1.7 })
      let invalidParamError = ''
      try { first.setParams({ amp: 999 }) } catch (error) { invalidParamError = error.message }
      second.seek(3)
      const result = {
        firstTime: first.currentTime,
        invalidSceneError,
        initialAmp,
        firstSize,
        secondTime: second.currentTime,
        firstAmp: first.currentParams.amp,
        invalidParamError,
        secondAmp: second.currentParams.amp,
        mounted: firstHost.querySelectorAll('canvas').length + secondHost.querySelectorAll('canvas').length,
      }
      first.destroy()
      second.destroy()
      return { ...result, remaining: firstHost.querySelectorAll('canvas').length + secondHost.querySelectorAll('canvas').length }
    }, sdkSourceUrl)
    assert.deepEqual(isolated, { firstTime: 2, invalidSceneError: '场景 missing-scene 不存在', initialAmp: 1.4, firstSize: ['320px', '180px', 'contain'], secondTime: 3, firstAmp: 1.7, invalidParamError: '参数 amp 须在 0.2 到 1.8 之间', secondAmp: undefined, mounted: 2, remaining: 0 })
    const recovery = await page.evaluate(async sourceUrl => {
      const { mountPlayer, createBlankProject } = await import(sourceUrl)
      const project = createBlankProject()
      project.canvas.width = 120; project.canvas.height = 80
      project.assets.push({ id: 'broken', name: '损坏图片', mime: 'image/png', data: 'AQID' })
      project.scenes[0].nodes = [
        { id: 'broken-image', type: 'image', name: '损坏图片', x: 0, y: 0, assetId: 'broken' },
        { id: 'circle', type: 'circle', name: '正常圆', x: 60, y: 40, radius: 12, fill: '#ff0000' },
      ]
      const host = document.createElement('div')
      document.body.append(host)
      const player = mountPlayer(host, project)
      const failures = []
      player.onError = error => failures.push(error.message)
      await new Promise(resolve => setTimeout(resolve, 100))
      const before = Array.from(player.canvas.getContext('2d').getImageData(60, 40, 1, 1).data)
      project.scenes[0].nodes.shift()
      player.setProject(project)
      await new Promise(resolve => setTimeout(resolve, 100))
      const after = Array.from(player.canvas.getContext('2d').getImageData(60, 40, 1, 1).data)
      player.destroy()
      host.remove()
      return { failures, before, after }
    }, sdkSourceUrl)
    assert.match(recovery.failures[0], /损坏图片.*资源加载失败/)
    assert.deepEqual(recovery.before.slice(0, 3), [255, 0, 0])
    assert.deepEqual(recovery.after.slice(0, 3), [255, 0, 0])
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(remoteRequests, [], '编辑器与 SDK 示例应只加载本地资源')
  const timelinePage = await browser.newPage({ viewport: { width: 1500, height: 960 } })
  try {
    await timelinePage.goto(baseURL, { waitUntil: 'networkidle' })
    await timelinePage.getByRole('button', { name: '新建', exact: true }).click()
    await timelinePage.getByRole('button', { name: '添加对象' }).click()
    await timelinePage.getByRole('menuitem', { name: '圆形' }).click()
    await chooseOption(timelinePage, '对象可见性', '隐藏')
    assert.match(await timelinePage.getByRole('combobox', { name: '对象可见性' }).innerText(), /隐藏/)
    await chooseOption(timelinePage, '对象可见性', '显示')
    await chooseOption(timelinePage, '动画属性', 'Y 位置')
    await timelinePage.getByRole('combobox', { name: '动画属性' }).getByText('Y 位置').waitFor()
    assert.match(await timelinePage.getByRole('combobox', { name: '动画属性' }).innerText(), /Y 位置/)
    await chooseOption(timelinePage, '动画属性', 'X 位置')
    const ruler = timelinePage.locator('.ruler-line')
    const rulerBounds = await ruler.boundingBox()
    await ruler.click({ position: { x: rulerBounds.width / 2, y: rulerBounds.height / 2 } })
    assert.match(await timelinePage.locator('.time-readout').innerText(), /^4\.00/)
    await timelinePage.getByRole('button', { name: '＋ 关键帧' }).click()
    assert.equal(await timelinePage.getByRole('spinbutton', { name: '关键帧时间' }).inputValue(), '4')
    await timelinePage.getByRole('textbox', { name: '关键帧值' }).fill('620')
    await timelinePage.getByRole('textbox', { name: '关键帧值' }).press('Tab')
    await chooseOption(timelinePage, '关键帧缓动', '缓入缓出')
    await ruler.click({ position: { x: 2, y: rulerBounds.height / 2 } })
    await timelinePage.getByRole('button', { name: '＋ 关键帧' }).click()
    assert.equal(await timelinePage.locator('.keyframe-marker').count(), 2)
    const markers = timelinePage.locator('.keyframe-marker')
    await markers.nth(1).click()
    assert.equal(await timelinePage.getByRole('spinbutton', { name: '关键帧时间' }).inputValue(), '4')
    assert.equal(await timelinePage.getByRole('textbox', { name: '关键帧值' }).inputValue(), '620')
    assert.match(await timelinePage.getByRole('combobox', { name: '关键帧缓动' }).innerText(), /缓入缓出/)
    const line = timelinePage.locator('.track-line').first()
    const lineBounds = await line.boundingBox()
    const markerBounds = await markers.nth(1).boundingBox()
    await timelinePage.mouse.move(markerBounds.x + markerBounds.width / 2, markerBounds.y + markerBounds.height / 2)
    await timelinePage.mouse.down()
    await timelinePage.mouse.move(lineBounds.x + lineBounds.width * 0.75, markerBounds.y + markerBounds.height / 2, { steps: 5 })
    await timelinePage.mouse.up()
    assert.equal(await timelinePage.getByRole('spinbutton', { name: '关键帧时间' }).inputValue(), '6')
    await timelinePage.getByRole('spinbutton', { name: '关键帧时间' }).fill('0')
    await timelinePage.getByRole('spinbutton', { name: '关键帧时间' }).press('Tab')
    assert.equal(await timelinePage.getByRole('spinbutton', { name: '关键帧时间' }).inputValue(), '6', '同轨道关键帧不能重合')
    await markers.first().click()
    await timelinePage.getByRole('button', { name: '删除关键帧' }).click()
    assert.equal(await timelinePage.locator('.keyframe-marker').count(), 1)
    assert.equal(await timelinePage.locator('.track-row').count(), 1)
    await chooseOption(timelinePage, '动画属性', '显示 / 隐藏')
    await ruler.click({ position: { x: 2, y: rulerBounds.height / 2 } })
    await timelinePage.getByRole('button', { name: '＋ 关键帧' }).click()
    await chooseOption(timelinePage, '关键帧值', '隐藏')
    assert.equal(await timelinePage.locator('.track-row').count(), 2)
    await timelinePage.getByRole('button', { name: '添加对象' }).click()
    await timelinePage.getByRole('menuitem', { name: '路径' }).click()
    const timelineObjectTool = timelinePage.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '属性' })
    if (await timelineObjectTool.getAttribute('aria-pressed') !== 'true') await timelineObjectTool.click()
    assert.equal(await timelinePage.locator('.point-editor-row').count(), 3)
    await timelinePage.getByRole('button', { name: '添加顶点' }).click()
    assert.equal(await timelinePage.locator('.point-editor-row').count(), 4)
    await timelinePage.getByRole('spinbutton', { name: '顶点 4 X' }).fill('240')
    await timelinePage.getByRole('spinbutton', { name: '顶点 4 X' }).press('Tab')
    const pathDownloadPromise = timelinePage.waitForEvent('download')
    await timelinePage.getByRole('button', { name: '保存项目' }).click()
    const pathDownload = await pathDownloadPromise
    const pathProject = JSON.parse(strFromU8(unzipSync(await readFile(await pathDownload.path()))['project.json']))
    assert.equal(pathProject.scenes[0].nodes.find(node => node.type === 'path').points[3][0], 240)
    assert.equal(pathProject.scenes[0].tracks.find(track => track.property === 'visible').keyframes[0].value, false)
  } finally { await timelinePage.close() }
  const extensionPage = await browser.newPage({ viewport: { width: 1500, height: 960 }, acceptDownloads: true })
  try {
    await extensionPage.goto(baseURL, { waitUntil: 'networkidle' })
    const extensionProject = { schemaVersion: 1, name: '扩展测试', canvas: { width: 320, height: 180, fit: 'contain' }, scenes: [{ id: 'scene', name: '场景', duration: 2, params: [], nodes: [], tracks: [] }], assets: [], extensions: { 'example.notes': { summary: '只读保留' } } }
    await extensionPage.locator('input[type=file][accept*=".cmanim"]').setInputFiles({ name: 'extension.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extensionProject)) })
    await extensionPage.getByText('扩展数据 · 只读').waitFor()
    assert.match(await extensionPage.locator('.extension-view pre').innerText(), /只读保留/)
    const extensionDownloadPromise = extensionPage.waitForEvent('download')
    await extensionPage.getByRole('button', { name: '保存项目' }).click()
    const extensionDownload = await extensionDownloadPromise
    const saved = JSON.parse(strFromU8(unzipSync(await readFile(await extensionDownload.path()))['project.json']))
    assert.deepEqual(saved.extensions, extensionProject.extensions)
  } finally { await extensionPage.close() }
  const codeRoundtripPage = await browser.newPage({ viewport: { width: 1500, height: 960 }, acceptDownloads: true })
  try {
    await codeRoundtripPage.goto(baseURL, { waitUntil: 'networkidle' })
    const fromCode = { schemaVersion: 1, name: '代码创建的作品', canvas: { width: 1280, height: 720, fit: 'contain' }, scenes: [{ id: 'from-code', name: '代码场景', duration: 4,
      params: [{ id: 'height', label: '高度', value: 200, min: 100, max: 400, step: 10, unit: 'px' }],
      nodes: [{ id: 'ball', type: 'circle', name: '代码小球', x: 100, y: 200, radius: 20, fill: '#5eead4', bindings: { y: 'height' } }],
      tracks: [{ nodeId: 'ball', property: 'x', keyframes: [{ time: 0, value: 100 }, { time: 2, value: 500, easing: 'easeInOut' }] }],
    }], assets: [], extensions: { 'code.meta': { source: 'sdk' } } }
    await codeRoundtripPage.locator('input[type=file][accept*=".cmanim"]').setInputFiles({ name: 'from-code.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fromCode)) })
    await codeRoundtripPage.locator('.node-list button').first().click()
    await codeRoundtripPage.getByRole('spinbutton', { name: '半径' }).fill('32')
    await codeRoundtripPage.getByRole('spinbutton', { name: '半径' }).press('Tab')
    const codeDownloadPromise = codeRoundtripPage.waitForEvent('download')
    await codeRoundtripPage.getByRole('button', { name: '保存项目' }).click()
    const codeDownload = await codeDownloadPromise
    const edited = JSON.parse(strFromU8(unzipSync(await readFile(await codeDownload.path()))['project.json']))
    assert.equal(edited.scenes[0].nodes[0].radius, 32)
    assert.deepEqual(edited.scenes[0].tracks, fromCode.scenes[0].tracks)
    assert.deepEqual(edited.scenes[0].params, fromCode.scenes[0].params)
    assert.deepEqual(edited.extensions, fromCode.extensions)
    if (sdkSourceAvailable) {
      const sdkFrame = await codeRoundtripPage.evaluate(async ({ url, project }) => {
        const { validateProject, evaluateScene } = await import(url)
        const scene = validateProject(project).scenes[0]
        const node = evaluateScene(scene, 1, { height: 250 }, { canvas: project.canvas }).nodes[0]
        return { x: node.x, y: node.y, radius: node.radius }
      }, { url: sdkSourceUrl, project: edited })
      assert.deepEqual(sdkFrame, { x: 300, y: 250, radius: 32 })
    }
  } finally { await codeRoundtripPage.close() }
  const sharePage = await browser.newPage({ viewport: { width: 1500, height: 960 } })
  try {
    await sharePage.goto(baseURL, { waitUntil: 'networkidle' })
    await sharePage.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '参数' }).click()
    await setEditorSlider(sharePage, '振幅 A', 1.5, 0.2, 1.8)
    await setEditorSlider(sharePage, '播放进度', 2.5, 0, 8)
    const sharedTime = await sharePage.locator('.time-readout').innerText()
    const sharedAmplitude = await sharePage.locator('.param-head').first().innerText()
    await sharePage.getByRole('button', { name: '分享' }).click()
    const shareUrl = await sharePage.getByRole('textbox', { name: '分享链接' }).inputValue()
    assert.match(shareUrl, /#cmanim=v1\./)
    const reopened = await browser.newPage({ viewport: { width: 1500, height: 960 } })
    try {
      await reopened.goto(shareUrl, { waitUntil: 'networkidle' })
      assert.match(await reopened.locator('.statusbar').innerText(), /已从分享链接恢复/)
      assert.equal(await reopened.locator('.time-readout').innerText(), sharedTime)
      await reopened.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '参数' }).click()
      assert.equal(await reopened.locator('.param-head').first().innerText(), sharedAmplitude)
      await reopened.getByRole('navigation', { name: '左侧工具' }).getByRole('button', { name: '图层' }).click()
      await sharePage.getByRole('navigation', { name: '左侧工具' }).getByRole('button', { name: '图层' }).click()
      assert.ok(await reopened.locator('.node-list button').count() > 0)
      assert.equal(await reopened.locator('.node-list button').count(), await sharePage.locator('.node-list button').count())
    } finally { await reopened.close() }
    const invalid = await browser.newPage({ viewport: { width: 1500, height: 960 } })
    try {
      await invalid.goto(new URL('#cmanim=v1.!', baseURL).href, { waitUntil: 'networkidle' })
      assert.match(await invalid.locator('.statusbar').innerText(), /分享链接无效/)
      await invalid.getByRole('heading', { name: /正弦函数/ }).waitFor()
    } finally { await invalid.close() }
  } finally { await sharePage.close() }
  const layoutPage = await browser.newPage({ viewport: { width: 1500, height: 960 } })
  try {
    await layoutPage.goto(baseURL, { waitUntil: 'networkidle' })
    await layoutPage.getByRole('button', { name: '新建', exact: true }).click()
    await layoutPage.getByRole('button', { name: '添加对象' }).click()
    await layoutPage.getByRole('menuitem', { name: '圆形' }).click()
    await chooseOption(layoutPage, '布局锚点', '画布中心')
    assert.equal(await layoutPage.getByRole('spinbutton', { name: 'X 位置' }).inputValue(), '410')
    await layoutPage.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '项目' }).click()
    await layoutPage.getByRole('spinbutton', { name: '画布宽度' }).fill('1600')
    await layoutPage.getByRole('spinbutton', { name: '画布宽度' }).press('Tab')
    await layoutPage.getByRole('spinbutton', { name: '画布高度' }).fill('900')
    await layoutPage.getByRole('spinbutton', { name: '画布高度' }).press('Tab')
    await layoutPage.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '属性' }).click()
    assert.equal(await layoutPage.getByRole('spinbutton', { name: 'X 位置' }).inputValue(), '570')
    assert.equal(await layoutPage.getByRole('spinbutton', { name: 'Y 位置' }).inputValue(), '370')
    await chooseOption(layoutPage, '布局锚点', '自由位置')
    assert.equal(await layoutPage.getByRole('spinbutton', { name: 'X 位置' }).inputValue(), '570')
  } finally { await layoutPage.close() }
  const routePage = await browser.newPage({ viewport: { width: 1500, height: 960 } })
  try {
    await routePage.goto(baseURL, { waitUntil: 'networkidle' })
    await routePage.getByRole('button', { name: '新建', exact: true }).click()
    await routePage.getByRole('button', { name: '添加对象' }).click()
    await routePage.getByRole('menuitem', { name: '路径' }).click()
    await routePage.getByRole('button', { name: '添加对象' }).click()
    await routePage.getByRole('menuitem', { name: '圆形' }).click()
    await chooseOption(routePage, '跟随路径', '路径')
    await routePage.getByRole('spinbutton', { name: '路径进度' }).fill('0.5')
    await routePage.getByRole('spinbutton', { name: '路径进度' }).press('Tab')
    assert.equal(await routePage.getByRole('spinbutton', { name: 'X 位置' }).inputValue(), '500')
    assert.equal(await routePage.getByRole('spinbutton', { name: 'Y 位置' }).inputValue(), '200')
    assert.equal(await routePage.getByRole('spinbutton', { name: 'X 位置' }).isDisabled(), true)
    await routePage.getByRole('textbox', { name: '进度表达式' }).fill('t/8')
    await routePage.getByRole('textbox', { name: '进度表达式' }).press('Tab')
    await setEditorSlider(routePage, '播放进度', 4, 0, 8)
    assert.ok(Math.abs(Number(await routePage.getByRole('spinbutton', { name: 'X 位置' }).inputValue()) - 500) < 2)
  } finally { await routePage.close() }
  const trailPage = await browser.newPage({ viewport: { width: 1500, height: 960 }, acceptDownloads: true })
  try {
    await trailPage.goto(baseURL, { waitUntil: 'networkidle' })
    await trailPage.getByRole('button', { name: '新建', exact: true }).click()
    await trailPage.getByRole('button', { name: '添加对象' }).click()
    await trailPage.getByRole('menuitem', { name: '圆形' }).click()
    await trailPage.locator('input[placeholder="X ="]').fill('100+50*t')
    await trailPage.locator('input[placeholder="X ="]').press('Tab')
    await chooseOption(trailPage, '轨迹残影', '开启')
    await trailPage.getByLabel('残影颜色').fill('#ff0000')
    await trailPage.getByLabel('残影颜色').press('Tab')
    const trailRuler = trailPage.locator('.ruler-line')
    const trailRulerBounds = await trailRuler.boundingBox()
    await trailRuler.click({ position: { x: trailRulerBounds.width / 4, y: trailRulerBounds.height / 2 } })
    const coloredPixels = await trailPage.locator('.canvas-shell canvas').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(90, 270, 70, 20).data
      let count = 0
      for (let index = 0; index < data.length; index += 4) if (data[index] > 50 && data[index + 1] < 50 && data[index + 2] < 50) count++
      return count
    })
    assert.ok(coloredPixels > 0, '历史轨迹应在画布中绘制为红色残影')
    const trailDownloadPromise = trailPage.waitForEvent('download')
    await trailPage.getByRole('button', { name: '保存项目' }).click()
    const trailDownload = await trailDownloadPromise
    const trailProject = JSON.parse(strFromU8(unzipSync(await readFile(await trailDownload.path()))['project.json']))
    assert.equal(trailProject.scenes[0].nodes[0].trail.color, '#ff0000')
  } finally { await trailPage.close() }
  const comboPage = await browser.newPage({ viewport: { width: 1500, height: 960 }, acceptDownloads: true })
  try {
    await comboPage.goto(baseURL, { waitUntil: 'networkidle' })
    await comboPage.getByRole('button', { name: '新建', exact: true }).click()
    await comboPage.getByRole('button', { name: '添加对象' }).click()
    await comboPage.getByRole('menuitem', { name: '圆形' }).click()
    await comboPage.getByRole('textbox', { name: '名称' }).fill('目标圆')
    await comboPage.getByRole('textbox', { name: '名称' }).press('Tab')
    await comboPage.getByRole('spinbutton', { name: 'X 位置' }).fill('200')
    await comboPage.getByRole('spinbutton', { name: 'X 位置' }).press('Tab')
    await comboPage.getByRole('button', { name: '添加对象' }).click()
    await comboPage.getByRole('menuitem', { name: '圆形' }).click()
    await chooseOption(comboPage, '匹配对象变形', '目标圆')
    await setEditorSlider(comboPage, '播放进度', 1, 0, 8)
    assert.ok(Math.abs(Number(await comboPage.getByRole('spinbutton', { name: 'X 位置' }).inputValue()) - 305) < 20)
    await chooseOption(comboPage, '动画组合', '脉冲缩放')
    await comboPage.getByRole('button', { name: '应用动画组合' }).click()
    const comboDownloadPromise = comboPage.waitForEvent('download')
    await comboPage.getByRole('button', { name: '保存项目' }).click()
    const comboDownload = await comboDownloadPromise
    const comboProject = JSON.parse(strFromU8(unzipSync(await readFile(await comboDownload.path()))['project.json']))
    assert.equal(comboProject.scenes[0].nodes[1].matchTransform.targetId, comboProject.scenes[0].nodes[0].id)
    assert.equal(comboProject.scenes[0].tracks.find(track => track.nodeId === comboProject.scenes[0].nodes[1].id && track.property === 'scale').keyframes[1].value, 1.25)
  } finally { await comboPage.close() }
  const keyboardPage = await browser.newPage({ viewport: { width: 1500, height: 960 } })
  try {
    await keyboardPage.goto(baseURL, { waitUntil: 'networkidle' })
    const playButton = keyboardPage.getByRole('button', { name: '播放', exact: true })
    await playButton.focus()
    await keyboardPage.keyboard.press('Enter')
    await keyboardPage.getByRole('button', { name: '暂停', exact: true }).waitFor()
    await keyboardPage.keyboard.press('Enter')
    await keyboardPage.getByRole('button', { name: '播放', exact: true }).waitFor()
    const progress = keyboardPage.getByRole('slider', { name: '播放进度' })
    await progress.focus()
    const beforeProgress = Number(await progress.getAttribute('aria-valuenow'))
    await keyboardPage.keyboard.press('ArrowRight')
    assert.ok(Number(await progress.getAttribute('aria-valuenow')) > beforeProgress)
    await keyboardPage.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '参数' }).click()
    const amp = keyboardPage.getByRole('slider', { name: '振幅 A' })
    await amp.focus()
    const beforeAmp = Number(await amp.getAttribute('aria-valuenow'))
    await keyboardPage.keyboard.press('ArrowRight')
    assert.ok(Number(await amp.getAttribute('aria-valuenow')) > beforeAmp)
    await keyboardPage.getByRole('button', { name: '新建', exact: true }).click()
    await keyboardPage.getByRole('button', { name: '添加对象' }).click()
    await keyboardPage.getByRole('menuitem', { name: '圆形' }).click()
    const layer = keyboardPage.locator('.node-list button').first()
    await layer.focus()
    await keyboardPage.keyboard.press('Enter')
    assert.match(await keyboardPage.locator('.canvas-badge').innerText(), /圆形/)
    const xField = keyboardPage.getByRole('spinbutton', { name: 'X 位置' })
    await xField.focus()
    await keyboardPage.keyboard.press('ControlOrMeta+A')
    await keyboardPage.keyboard.type('520')
    await keyboardPage.keyboard.press('Tab')
    assert.equal(await xField.inputValue(), '520')
  } finally { await keyboardPage.close() }
  const mobile = await browser.newPage({ viewport: { width: 720, height: 900 } })
  try {
    await mobile.goto(baseURL, { waitUntil: 'networkidle' })
    assert.equal(await mobile.locator('#left-panel').isVisible(), false)
    assert.equal(await mobile.locator('#right-panel').isVisible(), false)
    await mobile.getByRole('navigation', { name: '左侧工具' }).getByRole('button', { name: '场景' }).click()
    assert.equal(await mobile.locator('#left-panel').isVisible(), true)
    assert.equal(await mobile.locator('.scene-list button').count(), 1)
    await mobile.getByRole('navigation', { name: '右侧工具' }).getByRole('button', { name: '参数' }).click()
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
    assert.equal(await phone.locator('.ruler-line span:visible').count(), 5)
  } finally { await phone.close() }
  console.log(`${browserName} smoke passed: light theme, tool rails and panels, guide, editor, six templates, timeline, project roundtrip, exports, SDK demo${sdkSourceAvailable ? ' and player isolation' : ''}`)
} finally {
  await browser.close()
}
