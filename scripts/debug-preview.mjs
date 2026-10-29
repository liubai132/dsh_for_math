// 调试面板预览：抓控制台日志，并在页面里直接探一次 mock fetch。
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9455
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-preview2',
  '--window-size=1200,860', 'about:blank',
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
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('[console]', m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      console.log('[exception]', d.text, d.exception?.description?.slice(0, 300))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(4000)

  console.log('probe before:', await evaluate('typeof window.__probe + " / " + (window.__fetchCount||0)'))
  await evaluate(`fetch('/plugin/math-atelier/api/cas', {method:'POST', body:'{}'}).then(r=>r.json()).then(d=>{window.__t = d.result_text}).catch(e=>{window.__t='err:'+e.message})`)
  await sleep(1200)
  console.log('probe __t:', await evaluate('String(window.__t)'))
  const before = await evaluate('window.__fetchCount')
  await evaluate('document.querySelector(".ma-btn-primary").click()')
  await sleep(1200)
  const after = await evaluate('window.__fetchCount')
  console.log('click fetch delta:', before, '->', after)
  console.log('cards:', await evaluate('document.querySelectorAll(".ma-card").length'))
  console.log('error text:', await evaluate('(document.querySelector(".ma-error") || {}).textContent || ""'))
  console.log('root html len:', await evaluate('(document.querySelector(".ma-root")?.innerText||"").length'))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('F:\\ai数学\\.shots\\plugin-panel.png', Buffer.from(shot.result.data, 'base64'))
  console.log('shot saved')
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
