// 验证：进入凸优化某一节 → 卸载重挂（模拟切走再回来）→ 应当还在那一节
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9555
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-persist',
  '--window-size=1280,860', 'about:blank',
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

try {
  await sleep(2000)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', m.params.exceptionDetails.exception?.description?.slice(0, 300))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(3500)

  // 点凸优化节点
  const box = JSON.parse(
    await evaluate(`JSON.stringify((function () {
      var rect = document.querySelectorAll('.ma-node')[0].getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })())`),
  )
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(800)

  // 切到 05 KKT
  await evaluate(`Array.from(document.querySelectorAll('.ma-wheel-item')).find(function (b) { return b.textContent.includes('KKT') }).click()`)
  await sleep(500)
  console.log('before remount:', await evaluate(`JSON.stringify({
    crumb: (document.querySelector('.ma-dark-crumb') || {}).textContent
  })`))

  // 模拟切走再回来
  await evaluate('window.__remount()')
  await sleep(1200)
  console.log('after remount:', await evaluate(`JSON.stringify({
    dark: !!document.querySelector('.ma-dark'),
    crumb: (document.querySelector('.ma-dark-crumb') || {}).textContent,
    saved: window.localStorage.getItem('math-atelier-view-v1')
  })`))

  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\chime-restored.png', Buffer.from(s.result.data, 'base64'))
  console.log('done')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
