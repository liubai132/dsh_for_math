/* 公共工具：请求、公式渲染、画布绘图 */
(function () {
  'use strict';

  const M = (window.M = window.M || {});

  M.$ = (sel, root) => (root || document).querySelector(sel);
  M.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  M.escapeHtml = function (text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  };

  M.formatInt = function (value) {
    if (value === null || value === undefined) return '—';
    if (typeof value !== 'number') return String(value);
    return value.toLocaleString('en-US');
  };

  M.api = async function (path, options) {
    const opts = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {});
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (err) { data = {}; }
    if (!res.ok) {
      const detail = data && data.detail ? data.detail : `请求失败（HTTP ${res.status}）`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return data;
  };

  M.katexReady = false;

  M.render = function (root) {
    const scope = root || document.body;
    if (!window.renderMathInElement) return false;
    window.renderMathInElement(scope, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$$', right: '$$', display: true },
      ],
      throwOnError: false,
      ignoredClasses: ['no-math'],
    });
    return true;
  };

  M.tex = function (target, latex, display) {
    if (!target) return;
    if (window.katex) {
      try {
        window.katex.render(latex, target, {
          displayMode: display !== false,
          throwOnError: false,
          strict: false,
          trust: false,
        });
        return;
      } catch (err) { /* 落到纯文本 */ }
    }
    target.textContent = latex;
  };

  window.onKatexLoaded = function () {
    M.katexReady = true;
    M.render(document.body);
  };

  // 超时还没等到 KaTeX（多半是没联网）：提示一下，并把公式按纯文本显示
  window.setTimeout(function () {
    if (window.katex) return;
    document.body.classList.add('no-katex');
    const note = M.$('.fallback-note');
    if (note) note.style.display = 'block';
  }, 4000);

  // ---------------------------------------------------------------- 画布

  const COLORS = {
    ink: '#1b1d21', muted: '#6a6f78', line: '#e4dfd3',
    accent: '#0f6b5f', amber: '#b45309', grid: '#eee9dd',
  };

  M.setupCanvas = function (canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width || canvas.parentElement.clientWidth || 320, 240);
    const h = height || Number(canvas.dataset.height || 260);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    return { ctx, w, h, pad: { l: 48, r: 16, t: 16, b: 28 } };
  };

  M.drawPlot = function (canvas, points, xRange, yRange) {
    if (!canvas || !points || !points.length) return;
    const { ctx, w, h, pad } = M.setupCanvas(canvas, 300);
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const [x0, x1] = xRange;
    const [y0, y1] = yRange;
    const sx = (x) => pad.l + ((x - x0) / (x1 - x0)) * plotW;
    const sy = (y) => pad.t + plotH - ((y - y0) / (y1 - y0)) * plotH;

    // 网格
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const y = pad.t + (plotH * i) / ticks;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
    }
    for (let i = 0; i <= ticks; i++) {
      const x = pad.l + (plotW * i) / ticks;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
    }

    // 坐标轴
    ctx.strokeStyle = COLORS.muted;
    ctx.lineWidth = 1.2;
    if (y0 <= 0 && y1 >= 0) {
      const zeroY = sy(0);
      ctx.beginPath(); ctx.moveTo(pad.l, zeroY); ctx.lineTo(pad.l + plotW, zeroY); ctx.stroke();
    }
    if (x0 <= 0 && x1 >= 0) {
      const zeroX = sx(0);
      ctx.beginPath(); ctx.moveTo(zeroX, pad.t); ctx.lineTo(zeroX, pad.t + plotH); ctx.stroke();
    }

    // 刻度文字
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const value = y0 + ((y1 - y0) * (4 - i)) / 4;
      ctx.fillText(M.niceTick(value), pad.l - 6, pad.t + (plotH * i) / 4);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const value = x0 + ((x1 - x0) * i) / 4;
      ctx.fillText(M.niceTick(value), pad.l + (plotW * i) / 4, pad.t + plotH + 6);
    }

    // 曲线（遇到 null 断开）
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, plotW, plotH);
    ctx.clip();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let drawing = false;
    for (const [x, y] of points) {
      if (y === null || !isFinite(y)) { drawing = false; continue; }
      const px = sx(x), py = sy(y);
      if (!drawing) { ctx.moveTo(px, py); drawing = true; } else { ctx.lineTo(px, py); }
    }
    ctx.stroke();
    ctx.restore();
  };

  M.niceTick = function (value) {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs >= 1e6 || abs < 1e-3) return value.toExponential(1);
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return Number(value.toFixed(digits)).toString();
  };

  M.drawBars = function (canvas, labels, values, color) {
    if (!canvas) return;
    const { ctx, w, h, pad } = M.setupCanvas(canvas, 180);
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const max = Math.max.apply(null, values.concat([1]));
    const slot = plotW / values.length;
    const barW = Math.min(slot * 0.62, 40);
    ctx.fillStyle = color || COLORS.accent;
    values.forEach((value, i) => {
      const bh = (value / max) * plotH;
      const x = pad.l + slot * i + (slot - barW) / 2;
      const y = pad.t + plotH - bh;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, bh, 4) : ctx.rect(x, y, barW, bh);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(labels[i], pad.l + slot * i + slot / 2, pad.t + plotH + 6);
      if (value > 0) {
        ctx.fillStyle = COLORS.ink;
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(value), x + barW / 2, y - 3);
      }
      ctx.fillStyle = color || COLORS.accent;
    });
  };

  M.drawLineSeries = function (canvas, xs, ys, color) {
    if (!canvas) return;
    const { ctx, w, h, pad } = M.setupCanvas(canvas, 260);
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const maxY = Math.max.apply(null, ys.concat([1]));
    const minY = Math.min.apply(null, ys.concat([0]));
    const sx = (i) => pad.l + (plotW * (xs.length <= 1 ? 0 : i / (xs.length - 1)));
    const sy = (y) => pad.t + plotH - ((y - minY) / Math.max(maxY - minY, 1)) * plotH;

    ctx.strokeStyle = COLORS.grid;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (plotH * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
    }

    ctx.strokeStyle = color || COLORS.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ys.forEach((y, i) => {
      const px = sx(i), py = sy(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(maxY), pad.l - 6, pad.t + 4);
    ctx.fillText(String(minY), pad.l - 6, pad.t + plotH - 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('第 1 步', pad.l, pad.t + plotH + 6);
    ctx.fillText(`第 ${xs.length} 步`, pad.l + plotW, pad.t + plotH + 6);
  };

  M.toast = function (message) {
    let box = M.$('#toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast';
      box.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
        'background:#1b1d21;color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;' +
        'z-index:99;opacity:0;transition:opacity .2s ease;pointer-events:none';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.style.opacity = '1';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => { box.style.opacity = '0'; }, 2200);
  };
})();
