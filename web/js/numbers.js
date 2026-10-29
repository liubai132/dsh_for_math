/* 数字实验室页面逻辑 */
(function () {
  'use strict';

  const SAMPLES = [
    { n: 1729, label: '1729 · 的士数' },
    { n: 2024, label: '2024' },
    { n: 496, label: '496 · 完美数' },
    { n: 97, label: '97 · 素数' },
    { n: 12345, label: '12345' },
    { n: 65536, label: '65536 = 2¹⁶' },
  ];

  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function stat(label, value, sub) {
    return '<div class="stat"><div class="label">' + label + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }

  function tag(text, tone) {
    const style = tone === 'amber'
      ? 'background:var(--amber-soft);border-color:#f0d9b8;color:var(--amber)'
      : 'background:var(--accent-soft);border-color:#cfe6e1;color:var(--accent)';
    return '<span class="tab" style="cursor:default;' + style + '">' + M.escapeHtml(text) + '</span>';
  }

  function renderFacts(facts) {
    const box = M.$('#facts');
    if (!facts || !facts.length) {
      box.innerHTML = '<p class="hint">这个数没有特别有趣的性质，或者它太普通了——普通本身也是一种性质。</p>';
      return;
    }
    box.innerHTML = facts.map(function (item) {
      return '<div class="fact"><h4>' + M.escapeHtml(item.title) + '</h4>' +
        '<p>' + M.escapeHtml(item.detail) + '</p></div>';
    }).join('');
  }

  function render(data) {
    M.$('#lab-result').style.display = 'block';
    M.$('#big-number').textContent = M.formatInt(data.n);

    const factorLine = M.$('#factor-line');
    factorLine.innerHTML = '';
    if (data.n < 2) {
      factorLine.textContent = data.n === 0 ? '0 没有质因数分解' : '1 没有质因数分解';
    } else {
      M.tex(factorLine, data.n + ' = ' + data.factorization_latex, false);
    }

    const tags = [];
    if (data.prime.is_prime) tags.push(tag('素数', 'amber'));
    else if (data.n > 1) tags.push(tag('合数'));
    (data.classifications || []).forEach(function (name) { tags.push(tag(name, 'amber')); });
    if (data.square) tags.push(tag('完全平方'));
    if (data.cube) tags.push(tag('完全立方'));
    if (data.triangular_index) tags.push(tag('三角数'));
    if (data.is_palindrome) tags.push(tag('回文'));
    if (data.armstrong) tags.push(tag('水仙花数'));
    if (data.harshad) tags.push(tag('哈沙德数'));
    if (data.squarefree) tags.push(tag('无平方因子'));
    if (data.fibonacci_index) tags.push(tag('斐波那契数', 'amber'));
    M.$('#tags').innerHTML = tags.join('');

    renderFacts(data.facts);

    const primeList = (data.factorization || []).map(function (item) { return item.prime; });
    M.$('#stats').innerHTML = [
      stat('约数个数 τ', M.formatInt(data.divisor_total)),
      stat('约数和 σ', M.formatInt(data.divisor_sum)),
      stat('真约数和 s', M.formatInt(data.aliquot_sum), data.abundance > 0 ? '多出 ' + M.formatInt(data.abundance) : ''),
      stat('欧拉函数 φ', M.formatInt(data.phi), '与 n 互素的个数'),
      stat('莫比乌斯 μ', data.mu),
      stat('根 rad(n)', M.formatInt(data.radical)),
      stat('质因数个数 ω / Ω', data.omega + ' / ' + data.big_omega),
      stat('最小 / 最大质因数',
        primeList.length ? primeList[0] + ' / ' + primeList[primeList.length - 1] : '—'),
      stat('数字和', data.digit_sum, '数字根 ' + data.digital_root),
      stat('位数', data.digits),
    ].join('');

    M.$('#bases').innerHTML = [
      stat('二进制', data.bases.binary.replace('0b', '')),
      stat('八进制', data.bases.octal.replace('0o', '')),
      stat('十六进制', data.bases.hex.replace('0x', '')),
      stat('罗马数字', data.bases.roman || '—'),
    ].join('');

    const cf = data.sqrt_cf || {};
    const cfBox = M.$('#cf');
    if (cf.period_len) {
      const period = cf.period.slice(0, 14).join(', ');
      cfBox.innerHTML = '√' + data.n + ' = [' + cf.a0 + '; ' + period +
        (cf.period_len > 14 ? ', …' : '') + ']，循环节长度 <strong>' + cf.period_len + '</strong>。';
    } else if (data.square) {
      cfBox.innerHTML = '√' + data.n + ' = ' + data.square_root + '，是有理数，连分数在第一步就结束了。';
    } else {
      cfBox.innerHTML = '—';
    }

    M.drawBars(M.$('#freq-chart'), DIGITS,
      DIGITS.map(function (d) { return data.digit_freq[d] || 0; }));
    M.$('#freq-note').textContent = '数字 ' + data.n + ' 里 0–9 各出现了几次。位数越多越接近均匀分布。';

    const seq = data.collatz.sequence || [];
    M.drawLineSeries(M.$('#collatz-chart'), seq, seq);
    M.$('#collatz-note').textContent = data.collatz.converged
      ? ('从 ' + data.n + ' 到 1 共 ' + data.collatz.steps + ' 步，峰值 ' +
         M.formatInt(data.collatz.max) + '。' + (seq.length < data.collatz.steps ? '（图上只画了前 ' + seq.length + ' 步）' : ''))
      : '前 ' + data.collatz.steps + ' 步还没到 1。';

    M.$('#divisor-count').textContent = '共 ' + data.divisor_total + ' 个';
    M.$('#divisors').innerHTML = data.divisors.map(function (d) {
      return '<span>' + M.formatInt(d) + '</span>';
    }).join('');
    M.$('#divisor-note').textContent = data.divisor_total > data.divisors.length
      ? '约数太多，只显示前 ' + data.divisors.length + ' 个。'
      : '所有的约数都在这里了。';

    const prime = data.prime || {};
    const cells = [];
    if (prime.prev) cells.push(stat('上一个素数', M.formatInt(prime.prev), '相差 ' + (data.n - prime.prev)));
    if (prime.next) cells.push(stat('下一个素数', M.formatInt(prime.next), '相差 ' + (prime.next - data.n)));
    if (prime.index) cells.push(stat('素数序号', '第 ' + M.formatInt(prime.index) + ' 个'));
    if (data.goldbach) {
      cells.push(stat('哥德巴赫', data.goldbach.p + ' + ' + data.goldbach.q,
        data.goldbach.count + ' 种写法'));
    }
    M.$('#prime-neighbors').innerHTML = cells.join('') || '<p class="hint">没有数据。</p>';

    const warnings = data.warnings || [];
    const status = M.$('#lab-status');
    status.textContent = warnings.length ? '⚠ ' + warnings.join(' ') : '✓ 分析完成';
    M.render(M.$('#lab-result'));
  }

  function setStatus(text, isError) {
    const el = M.$('#lab-status');
    el.textContent = text;
    el.style.color = isError ? 'var(--danger)' : '';
  }

  async function analyze(value) {
    const raw = String(value).trim().replace(/,/g, '').replace(/_/g, '');
    if (!/^\d+$/.test(raw)) {
      setStatus('请输入一个非负整数。', true);
      return;
    }
    M.$('#analyze').disabled = true;
    setStatus('正在拆 ' + raw + ' …');
    try {
      const data = await M.api('/api/number/' + encodeURIComponent(raw));
      render(data);
      history.replaceState(null, '', '?n=' + raw + location.hash);
    } catch (err) {
      setStatus('× ' + err.message, true);
      M.$('#lab-result').style.display = 'none';
    } finally {
      M.$('#analyze').disabled = false;
    }
  }

  // ---------------------------------------------------------------- 区间扫描

  async function runScan() {
    const start = parseInt(M.$('#scan-start').value, 10);
    const end = parseInt(M.$('#scan-end').value, 10);
    const status = M.$('#scan-status');
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      status.textContent = '起点和终点都要是整数。';
      return;
    }
    M.$('#scan-run').disabled = true;
    status.textContent = '正在扫描 ' + start + ' 到 ' + end + ' …';
    try {
      const data = await M.api('/api/scan?start=' + start + '&end=' + end);
      const prime = data.prime;
      M.$('#scan-stats').innerHTML = [
        stat('区间内整数', M.formatInt(data.count)),
        stat('素数个数', M.formatInt(prime.count), '密度 ' + (prime.density * 100).toFixed(2) + '%'),
        stat('最大间隙', prime.max_gap ? prime.max_gap.gap : '—',
          prime.max_gap ? '在 ' + M.formatInt(prime.max_gap.after) + ' 之后' : ''),
        stat('最大的素数', prime.last.length ? M.formatInt(prime.last[prime.last.length - 1]) : '—'),
        stat('完美数', data.perfect.length ? data.perfect.join(', ') : '区间内没有'),
      ].join('');

      const points = (data.gaps || []).map(function (pair, index) {
        return [index + 1, pair[1]];
      });
      M.drawLineSeries(M.$('#gap-chart'),
        points.map(function (p) { return p[0]; }),
        points.map(function (p) { return p[1]; }),
        '#0f6b5f');

      M.$('#scan-collatz').innerHTML = data.collatz_top.map(function (item) {
        return '<span>' + M.formatInt(item.n) + ' × ' + item.steps + ' 步</span>';
      }).join('');
      M.$('#scan-tau').innerHTML = data.tau_top.map(function (item) {
        return '<span>' + M.formatInt(item.n) + ' · ' + item.tau + ' 个约数</span>';
      }).join('');

      M.$('#scan-result').style.display = 'block';
      status.textContent = '✓ 扫完了，用时不到一秒。第一个素数是 ' +
        (prime.first.length ? prime.first[0] : '无') + '，最后一个 ' +
        (prime.last.length ? prime.last[prime.last.length - 1] : '无') + '。';
    } catch (err) {
      status.textContent = '× ' + err.message;
      M.$('#scan-result').style.display = 'none';
    } finally {
      M.$('#scan-run').disabled = false;
    }
  }

  // ---------------------------------------------------------------- 常数

  function groupDigits(text) {
    const [whole, frac] = text.split('.');
    const chunks = [];
    for (let i = 0; i < frac.length; i += 10) chunks.push(frac.slice(i, i + 10));
    return whole + '.<br>' + chunks.join(' ');
  }

  async function loadConstants() {
    try {
      const data = await M.api('/api/constants');
      const select = M.$('#const-select');
      select.innerHTML = data.constants.map(function (item) {
        return '<option value="' + item.name + '">' + M.escapeHtml(item.label) + '</option>';
      }).join('');
      const first = data.constants[0];
      M.$('#const-blurb').textContent = first ? first.blurb : '';
      runConstant();
    } catch (err) {
      M.$('#const-blurb').textContent = '常数列表加载失败：' + err.message;
    }
  }

  async function runConstant() {
    const name = M.$('#const-select').value || 'pi';
    const digits = Math.max(10, Math.min(2000, parseInt(M.$('#const-digits').value, 10) || 120));
    M.$('#const-digits').value = digits;
    const box = M.$('#const-value');
    const note = M.$('#const-note');
    box.style.display = 'block';
    box.textContent = '计算中…';
    note.textContent = '';
    try {
      const data = await M.api('/api/constant/' + name + '?digits=' + digits);
      box.innerHTML = groupDigits(data.value);
      M.$('#const-blurb').textContent = data.blurb;
      M.$('#const-chart').style.display = 'block';
      M.drawBars(M.$('#const-chart'), DIGITS,
        DIGITS.map(function (d) { return data.digit_freq[d] || 0; }), '#b45309');
      note.textContent = '共 ' + digits + ' 位小数。理论上每个数字出现的频率都应当趋近 1/10，' +
        '目前最高的是 ' + DIGITS.slice().sort(function (a, b) {
          return (data.digit_freq[b] || 0) - (data.digit_freq[a] || 0);
        })[0] + '。';
    } catch (err) {
      box.textContent = '× ' + err.message;
      M.$('#const-chart').style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    M.$('#samples').innerHTML = SAMPLES.map(function (item) {
      return '<button class="tab" data-n="' + item.n + '">' + item.label + '</button>';
    }).join('');

    M.$('#samples').addEventListener('click', function (event) {
      const btn = event.target.closest('.tab');
      if (!btn) return;
      M.$('#n-input').value = btn.dataset.n;
      analyze(btn.dataset.n);
    });

    M.$('#analyze').addEventListener('click', function () {
      analyze(M.$('#n-input').value);
    });

    M.$('#n-input').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') analyze(M.$('#n-input').value);
    });

    M.$('#random').addEventListener('click', function () {
      const value = 1 + Math.floor(Math.random() * 999999);
      M.$('#n-input').value = value;
      analyze(value);
    });

    M.$('#const-run').addEventListener('click', runConstant);
    M.$('#const-select').addEventListener('change', runConstant);
    M.$('#scan-run').addEventListener('click', runScan);

    loadConstants();

    const fromUrl = new URLSearchParams(location.search).get('n');
    if (fromUrl) {
      M.$('#n-input').value = fromUrl;
      analyze(fromUrl);
    } else {
      analyze(M.$('#n-input').value);
    }
  });
})();
