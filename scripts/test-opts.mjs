import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PAGE = 'file:///F:/ai%E6%95%B0%E5%AD%A6/scripts/panel-preview.html'
const PORT = 9699
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\ai数学\\.chrome-opts',
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text
}

try {
  await sleep(1800)
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
  await sleep(2000)

  console.log(await evaluate(`(function () {
    function test(opts) {
      var c = document.createElement('canvas')
      c.width = 400; c.height = 300
      var gl = c.getContext('webgl', opts)
      if (!gl) return 'no ctx'
      var ext = !!gl.getExtension('OES_standard_derivatives')
      var src = '#extension GL_OES_standard_derivatives : enable\\nprecision mediump float;\\nvarying vec3 vW;\\nvoid main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); gl_FragColor = vec4(n,1.0); }'
      var sh = gl.createShader(gl.FRAGMENT_SHADER)
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return JSON.stringify({ ext: ext, compiled: gl.getShaderParameter(sh, gl.COMPILE_STATUS), log: (gl.getShaderInfoLog(sh) || '').slice(0, 120) })
    }
    return JSON.stringify({
      plain: test(undefined),
      ours: test({ alpha: true, antialias: true, premultipliedAlpha: false }),
    })
  })()`))
} finally {
  try { ws?.close() } catch { /* 忽略 */ }
  chrome.kill()
}
