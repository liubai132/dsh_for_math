/* 研究台页面逻辑：序列分析、常数识别、猜想检验、数据导出 */
(function () {
  'use strict';

  const SEQ_SAMPLES = [
    { label: '斐波那契', terms: '1, 1, 2, 3, 5, 8, 13, 21' },
    { label: '素数', terms: '2, 3, 5, 7, 11, 13, 17, 19' },
    { label: '平方数', terms: '1, 4, 9, 16, 25, 36, 49' },
    { label: '三角数', terms: '1, 3, 6, 10, 15, 21, 28' },
    { label: '卡塔兰数', terms: '1, 1, 2, 5, 14, 42, 132, 429' },
    { label: '分拆数 p(n)', terms: '1, 1, 2, 3, 5, 7, 11, 15, 22' },
    { label: '欧拉多项式', terms: '41, 43, 47, 53, 61, 71, 83, 97' },
  ];

  const CONST_SAMPLES = [
    { label: 'π', value: '3.14159265358979323846' },
    { label: 'e', value: '2.71828182845904523536' },
    { label: 'φ', value: '1.61803398874989484820' },
    { label: '√2', value: '1.41421356237309504880' },
    { label: 'γ', value: '0.57721566490153286061' },
    { label: 'ζ(3)', value: '1.20205690315959428540' },
    { label: '3/8', value: '0.375' },
    { label: 'π²/6', value: '1.64493406684822643647' },
  ];

  let catalogue = [];

  // ---------------------------------------------------------------- 标签切换

  function switchPanel(name) {
    M.$$('#bench-tabs .tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.panel === name);
    });
    M.$$('.panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + name);
    });
    if (location.hash.slice(1) !== name) {
      history.replaceState(null, '', '#' + name);
    }
  }

  // ---------------------------------------------------------------- 序列

  function runSequence() {
    const terms = M.$('#seq-input').value.trim();
    const oeis = M.$('#seq-oeis').checked;
    const status = M.$('#seq-status');
    status.textContent = '分析中…';
    status.style.color = '';
    M.api('/api/sequence', { method: 'POST', body: JSON.stringify({ terms: terms, oeis: oeis }) })
      .then(function (data) {
        renderSequence(data);
        status.textContent = '✓ 分析完成';
      })
      .catch(function (err) {
        status.textContent = '× ' + err.message;
        status.style.color = 'var(--danger)';
        M.$('#seq-result').style.display = 'none';
      });
  }

  function renderSequence(data) {
    const summary = M.$('#seq-summary');
    const parts = [];

    if (data.known) {
      parts.push('<p style="margin-bottom:8px"><strong>看起来是：' + M.escapeHtml(data.known.name) +
        '</strong>（OEIS ' + M.escapeHtml(data.known.oeis) + '，从第 ' +
        (data.known.offset + 1) + ' 项起匹配 ' + data.known.matched + ' 项）</p>');
    }
    if (data.polynomial) {
      parts.push('<p style="margin-bottom:8px">通项公式：</p><div class="result-latex" id="seq-poly"></div>');
    }
    if (data.recurrence && data.recurrence.length) {
      const body = data.recurrence.map(function (c, i) {
        return (c < 0 ? ' - ' : (i === 0 ? '' : ' + ')) + Math.abs(c) + 'a_{n-' + (i + 1) + '}';
      }).join('');
      parts.push('<p style="margin:10px 0 6px">线性递推：<code>a_n = ' + M.escapeHtml(body) + '</code></p>');
    }
    if (data.next_terms && data.next_terms.length) {
      parts.push('<p style="margin:10px 0 0">接下来几项：<code>' + data.next_terms.join(', ') + '</code></p>');
    }
    if (!parts.length) {
      parts.push('<p class="hint">没有识别出已知序列、多项式或线性递推。它可能是随机数据，也可能只是项数不够。</p>');
    }
    summary.innerHTML = parts.join('');
    if (data.polynomial) {
      const box = M.$('#seq-poly');
      if (box) M.tex(box, data.polynomial, true);
    }

    // 差分表
    const diff = M.$('#seq-diff');
    const rows = [data.terms].concat(data.differences);
    let html = '<table class="diff"><thead><tr><th>阶</th>';
    const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    for (let i = 0; i < width; i++) html += '<th>' + (i + 1) + '</th>';
    html += '</tr></thead><tbody>';
    rows.forEach(function (row, index) {
      html += '<tr><td>' + (index === 0 ? '原序列' : index + ' 阶') + '</td>';
      for (let i = 0; i < width; i++) {
        html += '<td>' + (i < row.length ? row[i] : '') + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    diff.innerHTML = html;

    // OEIS
    const oeisBox = M.$('#seq-oeis-result');
    if (data.oeis === null) {
      oeisBox.innerHTML = '这次没有查 OEIS（或者查询失败）。';
    } else if (data.oeis && data.oeis.items && data.oeis.items.length) {
      oeisBox.innerHTML = data.oeis.items.map(function (item) {
        return '<p style="margin-bottom:10px"><a href="https://oeis.org/' + item.id + '" target="_blank" rel="noopener">' +
          item.id + '</a> ' + M.escapeHtml(item.name) + '</p>';
      }).join('');
    } else {
      oeisBox.innerHTML = 'OEIS 里没有找到匹配项。';
    }

    M.$('#seq-notes').innerHTML = (data.notes || []).map(function (note) {
      return '<li>' + M.escapeHtml(note) + '</li>';
    }).join('');

    M.$('#seq-result').style.display = 'block';
  }

  // ---------------------------------------------------------------- 常数

  function runIdentify() {
    const value = M.$('#const-value').value.trim();
    const digits = parseInt(M.$('#const-digits').value, 10) || 40;
    const status = M.$('#const-status');
    status.textContent = '识别中…';
    status.style.color = '';
    M.api('/api/identify', { method: 'POST', body: JSON.stringify({ value: value, digits: digits }) })
      .then(function (data) {
        const box = M.$('#const-guesses');
        box.innerHTML = data.guesses.map(function (guess) {
          return '<div class="guess"><div class="kind">' + M.escapeHtml(guess.kind) + '</div>' +
            '<div class="result-latex" style="margin:6px 0 4px;background:transparent;padding:4px 0"></div>' +
            '<div class="note">' + M.escapeHtml(guess.note) + '</div></div>';
        }).join('');

        M.$$('#const-guesses .guess').forEach(function (node, index) {
          const target = node.querySelector('.result-latex');
          M.tex(target, data.guesses[index].latex, true);
        });

        const cf = data.continued_fraction || [];
        M.$('#const-cf').textContent = cf.length
          ? '[' + cf[0] + '; ' + cf.slice(1).join(', ') + ']'
          : '（算不出连分数）';

        M.$('#const-notes').innerHTML = (data.notes || []).map(function (note) {
          return '<li>' + M.escapeHtml(note) + '</li>';
        }).join('');

        M.$('#const-result').style.display = 'block';
        status.textContent = '✓ 找到 ' + data.guesses.length + ' 个候选';
      })
      .catch(function (err) {
        status.textContent = '× ' + err.message;
        status.style.color = 'var(--danger)';
        M.$('#const-result').style.display = 'none';
      });
  }

  // ---------------------------------------------------------------- 猜想

  function loadCatalogue() {
    M.api('/api/conjectures').then(function (data) {
      catalogue = data.conjectures;
      const options = catalogue.map(function (item) {
        return '<option value="' + item.key + '">' + M.escapeHtml(item.title) + '</option>';
      }).join('');
      M.$('#conj-select').innerHTML = options;
      M.$('#data-conj').innerHTML = options;

      const samples = M.$('#conj-samples');
      samples.innerHTML = catalogue.map(function (item) {
        return '<button class="tab" data-key="' + item.key + '">' + M.escapeHtml(item.title) + '</button>';
      }).join('');
      samples.addEventListener('click', function (event) {
        const btn = event.target.closest('.tab');
        if (!btn) return;
        const item = catalogue.find(function (x) { return x.key === btn.dataset.key; });
        M.$('#conj-select').value = btn.dataset.key;
        if (item) M.$('#conj-limit').value = item.default_limit;
        updateStatement();
        runConjecture();
      });

      M.$('#conj-select').addEventListener('change', function () {
        const item = catalogue.find(function (x) { return x.key === M.$('#conj-select').value; });
        if (item) M.$('#conj-limit').value = item.default_limit;
        updateStatement();
      });
      updateStatement();
    }).catch(function () {
      M.$('#conj-statement').textContent = '猜想列表加载失败。';
    });
  }

  function updateStatement() {
    const key = M.$('#conj-select').value;
    const item = catalogue.find(function (x) { return x.key === key; });
    if (!item) return;
    M.$('#conj-statement').textContent = item.statement + '（' + item.limit_hint + '）';
    if (item.default_limit && !M.$('#conj-limit').value) {
      M.$('#conj-limit').value = item.default_limit;
    }
  }

  function runConjecture() {
    const key = M.$('#conj-select').value;
    const limit = parseInt(M.$('#conj-limit').value, 10) || 0;
    if (!key) return;
    const status = M.$('#conj-statement');
    M.$('#conj-run').disabled = true;
    status.textContent = '检验中…';
    M.api('/api/conjecture/' + key + '?limit=' + limit)
      .then(function (data) {
        const verdict = M.$('#conj-verdict');
        verdict.textContent = data.verdict;
        verdict.className = 'verdict ' + (/反例/.test(data.verdict) ? 'bad' : 'ok');

        M.$('#conj-stats').innerHTML = Object.keys(data.stats || {}).map(function (name) {
          return '<div class="stat"><div class="label">' + M.escapeHtml(name) + '</div>' +
            '<div class="value" style="font-size:16px">' + M.escapeHtml(String(data.stats[name])) + '</div></div>';
        }).join('');

        const canvas = M.$('#conj-chart');
        if (data.series && data.series.length > 2) {
          canvas.style.display = 'block';
          M.drawLineSeries(canvas,
            data.series.map(function (p) { return p[0]; }),
            data.series.map(function (p) { return p[1]; }),
            '#0f6b5f');
        } else {
          canvas.style.display = 'none';
        }

        const exportLink = M.$('#conj-export');
        exportLink.href = '/api/export/conjecture.csv?key=' + encodeURIComponent(key) + '&limit=' + limit;
        exportLink.setAttribute('download', key + '-' + limit + '.csv');

        M.$('#conj-notes').innerHTML = (data.notes || []).map(function (note) {
          return '<li>' + M.escapeHtml(note) + '</li>';
        }).join('');

        M.$('#conj-result').style.display = 'block';
        status.textContent = data.statement;
      })
      .catch(function (err) {
        status.textContent = '× ' + err.message;
        status.style.color = 'var(--danger)';
      })
      .finally(function () {
        M.$('#conj-run').disabled = false;
      });
  }

  // ---------------------------------------------------------------- 导出

  function updateDownloads() {
    const start = parseInt(M.$('#data-start').value, 10) || 1;
    const end = parseInt(M.$('#data-end').value, 10) || 500;
    M.$('#data-download').href = '/api/export/number-table.csv?start=' + start + '&end=' + end;

    const key = M.$('#data-conj').value || 'goldbach';
    const limit = parseInt(M.$('#data-limit').value, 10) || 2000;
    M.$('#data-conj-download').href = '/api/export/conjecture.csv?key=' + encodeURIComponent(key) + '&limit=' + limit;
  }

  document.addEventListener('DOMContentLoaded', function () {
    M.$('#bench-tabs').addEventListener('click', function (event) {
      const tab = event.target.closest('.tab');
      if (tab) switchPanel(tab.dataset.panel);
    });

    // 序列
    M.$('#seq-samples').innerHTML = SEQ_SAMPLES.map(function (item) {
      return '<button class="tab" data-terms="' + M.escapeHtml(item.terms) + '">' + item.label + '</button>';
    }).join('');
    M.$('#seq-samples').addEventListener('click', function (event) {
      const btn = event.target.closest('.tab');
      if (!btn) return;
      M.$('#seq-input').value = btn.dataset.terms;
      runSequence();
    });
    M.$('#seq-run').addEventListener('click', runSequence);
    M.$('#seq-input').addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runSequence();
    });

    // 常数
    M.$('#const-samples').innerHTML = CONST_SAMPLES.map(function (item) {
      return '<button class="tab" data-value="' + item.value + '">' + item.label + '</button>';
    }).join('');
    M.$('#const-samples').addEventListener('click', function (event) {
      const btn = event.target.closest('.tab');
      if (!btn) return;
      M.$('#const-value').value = btn.dataset.value;
      runIdentify();
    });
    M.$('#const-run').addEventListener('click', runIdentify);

    // 猜想
    loadCatalogue();
    M.$('#conj-run').addEventListener('click', runConjecture);

    // 导出
    M.$('#data-start').addEventListener('input', updateDownloads);
    M.$('#data-end').addEventListener('input', updateDownloads);
    M.$('#data-conj').addEventListener('change', updateDownloads);
    M.$('#data-limit').addEventListener('input', updateDownloads);
    updateDownloads();

    // 面板 hash
    const hash = location.hash.slice(1);
    if (['seq', 'const', 'conj', 'data'].indexOf(hash) >= 0) switchPanel(hash);

    // 首屏直接给一个结果
    runSequence();
  });
})();
