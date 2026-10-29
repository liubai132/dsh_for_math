/* 数学引擎页面逻辑 */
(function () {
  'use strict';

  const FIELDS = {
    var: { label: '变量', type: 'text', value: 'x', width: 80 },
    order: { label: '阶数', type: 'number', value: 2, width: 80 },
    lower: { label: '下限（空=不定积分）', type: 'text', value: '', width: 150 },
    upper: { label: '上限', type: 'text', value: '', width: 100 },
    point: { label: '趋近点', type: 'text', value: '0', width: 100 },
    direction: {
      label: '方向', type: 'select', value: '+-', width: 110,
      options: [['+-', '双侧'], ['+', '右侧'], ['-', '左侧']],
    },
    subs: { label: '代入（如 x=1,y=2）', type: 'text', value: '', width: 170 },
    digits: { label: '有效数字', type: 'number', value: 15, width: 110 },
    start: { label: '左端点', type: 'number', value: -6, width: 90 },
    end: { label: '右端点', type: 'number', value: 6, width: 90 },
  };

  const MATRIX_EXAMPLES = ['1,2;3,4', '2,0,1;1,3,2;1,1,1', '1,2,3;4,5,6;7,8,9'];

  const OPS = [
    {
      key: 'simplify', label: '化简', hint: '把式子整理成最简形式', fields: ['var'],
      placeholder: '(x+1)^2 - x^2',
      examples: ['(x+1)^2 - x^2', 'sin(x)^2 + cos(x)^2', '(x^3 - 1)/(x - 1)', 'sqrt(8) + sqrt(18)'],
    },
    {
      key: 'expand', label: '展开', hint: '把括号和乘方全部乘开', fields: ['var'],
      placeholder: '(x+1)^3',
      examples: ['(x+1)^3', '(a+b)^5', '(x^2-1)*(x^2+1)'],
    },
    {
      key: 'factor', label: '因式分解', hint: '多项式拆成因式；整数拆成质数', fields: ['var'],
      placeholder: 'x^3 - x',
      examples: ['x^3 - x', 'x^4 - 1', 'x^2 + 2*x + 1', '2^40 - 1'],
    },
    {
      key: 'solve', label: '解方程', hint: '写成 x^2-4=0；不写等号默认等于 0', fields: ['var'],
      placeholder: 'x^2 - 4 = 0',
      examples: ['x^2 - 4 = 0', 'x^3 - 6*x^2 + 11*x - 6 = 0', 'sin(x) = 0', '2^x = 8'],
    },
    {
      key: 'diff', label: '求导', hint: '阶数可以填 1 到 12', fields: ['var', 'order'],
      placeholder: 'x^3*sin(x)',
      examples: ['x^3*sin(x)', 'exp(-x^2)', 'ln(x)/x', 'tan(x)'],
    },
    {
      key: 'integrate', label: '积分', hint: '上限留空就是不定积分', fields: ['var', 'lower', 'upper'],
      placeholder: '1/x',
      examples: ['1/x', 'sin(x)^2', 'exp(-x^2)', '1/(1+x^2)'],
    },
    {
      key: 'limit', label: '极限', hint: '趋近点可以写 oo 或 -oo', fields: ['var', 'point', 'direction'],
      placeholder: 'sin(x)/x',
      examples: ['sin(x)/x', '(1+1/x)^x', '(1-cos(x))/x^2', 'x*ln(x)', 'x^2/exp(x)'],
    },
    {
      key: 'series', label: '级数展开', hint: '泰勒展开到指定阶', fields: ['var', 'point', 'order'],
      placeholder: 'exp(x)',
      examples: ['exp(x)', 'ln(1+x)', 'sin(x)/x', '1/(1-x)'],
    },
    {
      key: 'evaluate', label: '求值', hint: '可以代入，也可以只算数值', fields: ['var', 'subs', 'digits'],
      placeholder: 'sqrt(2)',
      examples: ['sqrt(2)', 'pi', 'exp(1)'],
    },
    {
      key: 'matrix.det', label: '行列式', hint: '写作 1,2;3,4（分号分列行）', fields: [],
      placeholder: '1,2;3,4', examples: MATRIX_EXAMPLES,
    },
    {
      key: 'matrix.inv', label: '矩阵求逆', hint: '写作 1,2;3,4', fields: [],
      placeholder: '1,2;3,4', examples: MATRIX_EXAMPLES,
    },
    {
      key: 'matrix.rref', label: '行最简形', hint: '高斯消元', fields: [],
      placeholder: '1,2;3,4', examples: MATRIX_EXAMPLES,
    },
    {
      key: 'matrix.eigen', label: '特征值', hint: '给特征多项式与特征值', fields: [],
      placeholder: '1,2;3,4', examples: MATRIX_EXAMPLES,
    },
    {
      key: 'matrix.rank', label: '秩', hint: '矩阵的秩', fields: [],
      placeholder: '1,2;3,4', examples: MATRIX_EXAMPLES,
    },
    {
      key: 'plot', label: '函数图像', hint: '画 y = f(x)', fields: ['var', 'start', 'end'],
      placeholder: 'sin(x)/x',
      examples: ['sin(x)/x', 'x^2', '1/x', 'exp(-x^2)', 'x^3 - 3*x'],
    },
  ];

  const state = { op: OPS[0], lastLatex: '', busy: false };

  function opByKey(key) {
    return OPS.find(function (item) { return item.key === key; }) || OPS[0];
  }

  function buildTabs() {
    const box = M.$('#op-tabs');
    box.innerHTML = OPS.map(function (item) {
      return '<button class="tab" data-op="' + item.key + '">' + item.label + '</button>';
    }).join('');
    box.addEventListener('click', function (event) {
      const btn = event.target.closest('.tab');
      if (!btn) return;
      select(btn.dataset.op);
    });
  }

  function buildOptions() {
    const box = M.$('#options');
    const fields = state.op.fields || [];
    box.innerHTML = fields.map(function (key) {
      const field = FIELDS[key];
      let control;
      if (field.type === 'select') {
        control = '<select class="input" data-field="' + key + '">' +
          field.options.map(function (pair) {
            return '<option value="' + pair[0] + '">' + pair[1] + '</option>';
          }).join('') + '</select>';
      } else {
        control = '<input class="input" type="' + field.type + '" data-field="' + key +
          '" value="' + field.value + '">';
      }
      return '<div class="field" style="flex:1 1 ' + field.width + 'px;margin-bottom:0">' +
        '<label>' + field.label + '</label>' + control + '</div>';
    }).join('');
    if (!fields.length) box.innerHTML = '';
  }

  function buildExamples() {
    const box = M.$('#examples');
    box.innerHTML = (state.op.examples || []).map(function (text) {
      return '<button class="tab" data-example="' + M.escapeHtml(text) + '">' +
        M.escapeHtml(text) + '</button>';
    }).join('');
  }

  function select(key) {
    state.op = opByKey(key);
    M.$$('.tab[data-op]').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.op === key);
    });
    const textarea = M.$('#expr');
    textarea.placeholder = '例如 ' + (state.op.placeholder || 'x^2');
    M.$('#op-hint').textContent = state.op.hint;
    buildOptions();
    buildExamples();

    const saved = localStorage.getItem('math-op-' + key);
    textarea.value = saved || (state.op.examples && state.op.examples[0]) || '';

    if (state.op.key === 'plot') {
      M.$('#result-latex').style.display = 'none';
      M.$('#chart').style.display = 'block';
      M.$('#chart').style.opacity = '.45';
    } else {
      M.$('#chart').style.display = 'none';
    }
    M.$('#status').className = 'status';
    M.$('#status').textContent = '等着你输入表达式。按 Ctrl + Enter 也能直接算。';
    M.$('#result-text').textContent = '';
    M.$('#notes').innerHTML = '';
    M.$('#steps').innerHTML = '';
    M.$('#copy').style.display = 'none';
  }

  function collect() {
    const body = { op: state.op.key, expr: M.$('#expr').value.trim() };
    M.$$('[data-field]').forEach(function (el) {
      const key = el.dataset.field;
      let value = el.value;
      if (key === 'order' || key === 'digits') value = parseInt(value, 10);
      if (key === 'start' || key === 'end') value = parseFloat(value);
      if ((key === 'lower' || key === 'upper' || key === 'subs') && !String(value).trim()) return;
      body[key] = value;
    });
    return body;
  }

  function setBusy(flag) {
    state.busy = flag;
    const btn = M.$('#run');
    btn.disabled = flag;
    btn.textContent = flag ? '计算中…' : '计算 ⏎';
  }

  function showError(message) {
    const status = M.$('#status');
    status.className = 'status error';
    status.textContent = '× ' + message;
  }

  function renderResult(data) {
    const status = M.$('#status');
    status.className = 'status ok';
    status.textContent = '✓ 完成，用时 ' + data.elapsed_ms + ' ms';

    if (data.operation === 'plot') {
      M.$('#result-latex').style.display = 'none';
      const canvas = M.$('#chart');
      canvas.style.display = 'block';
      canvas.style.opacity = '1';
      M.drawPlot(canvas, data.points, data.x_range, data.y_range);
      const text = M.$('#result-text');
      text.className = 'result-latex';
      text.innerHTML = '';
      M.tex(text, 'y = ' + data.expr_latex, false);
      M.$('#steps').innerHTML = '';
      M.$('#notes').innerHTML = '';
      return;
    }

    const latexBox = M.$('#result-latex');
    latexBox.style.display = 'block';
    latexBox.innerHTML = '';
    M.tex(latexBox, data.result_latex, true);
    M.$('#result-text').textContent = data.result_text && data.result_text !== data.result_latex
      ? '文本形式：' + data.result_text : '';

    const notes = M.$('#notes');
    notes.innerHTML = (data.notes || []).map(function (note) {
      return '<li>' + M.escapeHtml(note) + '</li>';
    }).join('');

    const steps = M.$('#steps');
    steps.innerHTML = '';
    (data.steps || []).forEach(function (step) {
      const li = document.createElement('li');
      const title = document.createElement('div');
      title.className = 'step-title';
      title.textContent = step.title;
      const body = document.createElement('div');
      M.tex(body, step.latex, true);
      li.appendChild(title);
      li.appendChild(body);
      steps.appendChild(li);
    });

    state.lastLatex = data.result_latex;
    M.$('#copy').style.display = 'inline-flex';
  }

  async function run() {
    if (state.busy) return;
    const expr = M.$('#expr').value.trim();
    if (!expr) {
      M.toast('先输入一个表达式');
      M.$('#expr').focus();
      return;
    }
    localStorage.setItem('math-op-' + state.op.key, expr);
    setBusy(true);
    try {
      const data = await M.api('/api/cas', {
        method: 'POST',
        body: JSON.stringify(collect()),
      });
      renderResult(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildTabs();
    select('simplify');

    // 支持分享链接：/engine.html?op=diff&expr=x^3&run=1
    const params = new URLSearchParams(location.search);
    const opKey = params.get('op');
    if (opKey && OPS.some(function (item) { return item.key === opKey; })) {
      select(opKey);
    }
    const expr = params.get('expr');
    if (expr) {
      M.$('#expr').value = expr;
      if (params.get('run') !== '0') run();
    }

    M.$('#run').addEventListener('click', run);
    M.$('#clear').addEventListener('click', function () {
      M.$('#expr').value = '';
      M.$('#expr').focus();
    });
    M.$('#copy').addEventListener('click', async function () {
      if (!state.lastLatex) return;
      try {
        await navigator.clipboard.writeText(state.lastLatex);
        M.toast('LaTeX 已复制');
      } catch (err) {
        M.toast('复制失败，请手动选中');
      }
    });

    M.$('#examples').addEventListener('click', function (event) {
      const btn = event.target.closest('.tab');
      if (!btn) return;
      M.$('#expr').value = btn.dataset.example;
      run();
    });

    M.$('#expr').addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
  });
})();
