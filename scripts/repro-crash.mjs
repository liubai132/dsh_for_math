// 复现：打开拓展三 → 收起 → 切标签
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9644
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-crash',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' })

let ws
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id
  pending.set(mid, resolve)
  ws.send(JSON.stringify({ id: mid, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text
}
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\' + name + '.png', Buffer.from(s.result.data, 'base64'))
}

try {
  await sleep(1800)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      console.log('[exception]', d.text, (d.exception && d.exception.description || '').slice(0, 500))
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      console.log('[console.error]', m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 400))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(3000)

  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '首页' }).click()`)
  await sleep(400)
  const box = JSON.parse(await evaluate(`JSON.stringify((function () {
    var r = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })())`))
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(50)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(700)
  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('凸集') }).click()`)
  await sleep(800)

  // 展开拓展三
  await evaluate(`(function () {
    var exts = document.querySelectorAll('.ma-ext')
    var head = exts[2].querySelector('.ma-ext-head')
    if (head.getAttribute('aria-expanded') === 'false') head.click()
    return head.getAttribute('aria-expanded')
  })()`)
  await sleep(2500)
  console.log('running:', await evaluate(`!!document.querySelector('.ma-cloth-canvas')`))

  // 收起拓展三（会卸载）
  await evaluate(`document.querySelectorAll('.ma-ext')[2].querySelector('.ma-ext-head').click()`)
  await sleep(800)
  console.log('after collapse:', await evaluate(`JSON.stringify({
    canvas: !!document.querySelector('.ma-cloth-canvas'),
    body: !!document.querySelector('.ma-root')
  })`))
  await shot('crash-collapse')

  // 切回首页再回来
  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '首页' }).click()`)
  await sleep(800)
  await evaluate(`Array.from(document.querySelectorAll('.ma-tab')).find(function (t) { return t.textContent === '计算' }).click()`)
  await sleep(800)
  console.log('after tabs:', await evaluate(`JSON.stringify({ root: !!document.querySelector('.ma-root'), cards: document.querySelectorAll('.ma-card').length })`))
  await shot('crash-tabs')
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
