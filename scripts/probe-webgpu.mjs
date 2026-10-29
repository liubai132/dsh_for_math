// 用 CDP 真正等待 requestAdapter，判断这台机器能不能用 WebGPU
import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/webgpu-probe.html'
const PORT = 9633
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const flags = process.argv.slice(2)
const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:\\ai数学\\.chrome-gpu',
  ...flags,
  'about:blank',
], { stdio: 'ignore' })

let ws
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id
  pending.set(mid, resolve)
  ws.send(JSON.stringify({ id: mid, method, params }))
})

try {
  await sleep(2000)
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(1500)

  const result = await send('Runtime.evaluate', {
    expression: `(async function () {
      const out = { hasGpu: !!navigator.gpu }
      if (!navigator.gpu) return out
      try {
        const adapter = await navigator.gpu.requestAdapter()
        out.adapter = !!adapter
        if (adapter) {
          out.info = adapter.info ? { vendor: adapter.info.vendor, arch: adapter.info.architecture, desc: adapter.info.description } : 'no-info'
          const device = await adapter.requestDevice()
          out.device = !!device
          out.limits = device ? device.limits.maxComputeWorkgroupSizeX : null
        }
      } catch (error) {
        out.error = String(error)
      }
      return out
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  console.log(JSON.stringify(result.result?.result?.value ?? result.result?.exceptionDetails, null, 2))
} catch (error) {
  console.error('失败:', error.message)
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
