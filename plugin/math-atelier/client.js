window.__ModuleLoader__.load({
  id: '@local/math-atelier',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/plugin/math-atelier/api'

    // 记住"上次看到哪"：切换面板会卸载组件，所以存在模块级 + localStorage
    const VIEW_KEY = 'math-atelier-view-v1'
    const VIEW = { page: null, section: 'overview', yaw: -0.18, pitch: 0, loaded: false, restored: false }

    function loadView() {
      if (VIEW.loaded) return VIEW
      VIEW.loaded = true
      try {
        const raw = window.localStorage.getItem(VIEW_KEY)
        if (raw) {
          const saved = JSON.parse(raw)
          if (saved && typeof saved === 'object') {
            if (saved.page === 'convex' || saved.page === 'numeric') VIEW.page = saved.page
            if (typeof saved.section === 'string') VIEW.section = saved.section
            if (typeof saved.yaw === 'number') VIEW.yaw = saved.yaw
            if (typeof saved.pitch === 'number') VIEW.pitch = saved.pitch
            VIEW.restored = Boolean(VIEW.page)
          }
        }
      } catch {
        /* localStorage 不可用就只用内存 */
      }
      return VIEW
    }

    function saveView(patch) {
      Object.assign(VIEW, patch)
      try {
        window.localStorage.setItem(
          VIEW_KEY,
          JSON.stringify({ page: VIEW.page, section: VIEW.section, yaw: VIEW.yaw, pitch: VIEW.pitch }),
        )
      } catch {
        /* 忽略 */
      }
    }

    // ---------------------------------------------------------------- 工具

    async function call(path, options) {
      const response = await fetch(API + path, {
        headers: { 'content-type': 'application/json' },
        ...options,
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok) {
        throw new Error(data.detail || `请求失败（HTTP ${response.status}）`)
      }
      return data
    }

    function MathBlock({ latex, text, small }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const node = ref.current
        if (!node) return
        node.textContent = ''
        if (window.katex && latex) {
          try {
            window.katex.render(latex, node, { displayMode: !small, throwOnError: false })
            return
          } catch {
            /* 回落到纯文本 */
          }
        }
        node.textContent = text || latex || ''
      }, [latex, text, small])
      return h('div', { ref, className: small ? 'ma-math ma-math-sm' : 'ma-math' })
    }

    function StatGrid({ stats }) {
      const entries = Object.entries(stats || {})
      if (!entries.length) return null
      return h(
        'div',
        { className: 'ma-stats' },
        entries.map(([key, value]) =>
          h(
            'div',
            { className: 'ma-stat', key },
            h('div', { className: 'ma-stat-label' }, key),
            h('div', { className: 'ma-stat-value' }, String(value)),
          ),
        ),
      )
    }

    function ErrorLine({ message }) {
      if (!message) return null
      return h('div', { className: 'ma-error' }, message)
    }

    function Row({ children }) {
      return h('div', { className: 'ma-row' }, children)
    }

    function Button({ children, onClick, kind, disabled }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'ma-btn' + (kind ? ' ma-btn-' + kind : ''),
          onClick,
          disabled,
        },
        children,
      )
    }

    // ---------------------------------------------------------------- 计算

    const OPS = [
      { key: 'simplify', label: '化简', placeholder: '(x+1)^2 - x^2' },
      { key: 'expand', label: '展开', placeholder: '(x+1)^3' },
      { key: 'factor', label: '因式分解', placeholder: 'x^3 - x' },
      { key: 'solve', label: '解方程', placeholder: 'x^2 - 4 = 0', point: null },
      { key: 'diff', label: '求导', placeholder: 'x^3*sin(x)', order: true },
      { key: 'integrate', label: '积分', placeholder: 'exp(-x^2)', bounds: true },
      { key: 'limit', label: '极限', placeholder: 'sin(x)/x', point: true },
      { key: 'series', label: '级数', placeholder: 'exp(x)', order: true, point: true },
      { key: 'evaluate', label: '求值', placeholder: 'sqrt(2)', digits: true },
    ]

    function CalcTab({ onBackendError }) {
      const [op, setOp] = React.useState(OPS[0])
      const [expr, setExpr] = React.useState('')
      const [vars, setVars] = React.useState({ var: 'x', order: '2', lower: '', upper: '', point: '0', digits: '15' })
      const [result, setResult] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [elapsed, setElapsed] = React.useState(null)

      function update(key, value) {
        setVars((current) => ({ ...current, [key]: value }))
      }

      async function run() {
        if (!expr.trim()) {
          setError('先写一个表达式')
          return
        }
        setBusy(true)
        setError('')
        const started = performance.now()
        try {
          const payload = { op: op.key, expr: expr.trim(), var: vars.var || 'x' }
          if (op.order) payload.order = Number(vars.order) || 1
          if (op.bounds && vars.lower.trim()) payload.lower = vars.lower.trim()
          if (op.bounds && vars.upper.trim()) payload.upper = vars.upper.trim()
          if (op.point) payload.point = vars.point || '0'
          if (op.digits) payload.digits = Number(vars.digits) || 15
          const data = await call('/cas', { method: 'POST', body: JSON.stringify(payload) })
          setResult(data)
          setElapsed(Math.round(performance.now() - started))
        } catch (err) {
          setError(err.message)
          setResult(null)
          if (/引擎|启动/.test(err.message)) onBackendError?.()
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'ma-pane' },
        h(
          'div',
          { className: 'ma-card' },
          h(
            'div',
            { className: 'ma-chips' },
            OPS.map((item) =>
              h(
                'button',
                {
                  key: item.key,
                  type: 'button',
                  className: 'ma-chip' + (item.key === op.key ? ' ma-chip-active' : ''),
                  onClick: () => setOp(item),
                },
                item.label,
              ),
            ),
          ),
          h('textarea', {
            className: 'ma-input ma-textarea',
            value: expr,
            placeholder: '例如 ' + op.placeholder,
            spellCheck: false,
            onChange: (event) => setExpr(event.target.value),
            onKeyDown: (event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') run()
            },
          }),
          h(
            Row,
            null,
            h(
              'label',
              { className: 'ma-field' },
              h('span', null, '变量'),
              h('input', {
                className: 'ma-input',
                value: vars.var,
                onChange: (event) => update('var', event.target.value),
              }),
            ),
            op.order
              ? h(
                  'label',
                  { className: 'ma-field' },
                  h('span', null, '阶数'),
                  h('input', {
                    className: 'ma-input',
                    type: 'number',
                    value: vars.order,
                    onChange: (event) => update('order', event.target.value),
                  }),
                )
              : null,
            op.bounds
              ? h(
                  'label',
                  { className: 'ma-field' },
                  h('span', null, '下限（空=不定积分）'),
                  h('input', {
                    className: 'ma-input',
                    value: vars.lower,
                    onChange: (event) => update('lower', event.target.value),
                  }),
                )
              : null,
            op.bounds
              ? h(
                  'label',
                  { className: 'ma-field' },
                  h('span', null, '上限'),
                  h('input', {
                    className: 'ma-input',
                    value: vars.upper,
                    onChange: (event) => update('upper', event.target.value),
                  }),
                )
              : null,
            op.point
              ? h(
                  'label',
                  { className: 'ma-field' },
                  h('span', null, '趋近点'),
                  h('input', {
                    className: 'ma-input',
                    value: vars.point,
                    onChange: (event) => update('point', event.target.value),
                  }),
                )
              : null,
            op.digits
              ? h(
                  'label',
                  { className: 'ma-field' },
                  h('span', null, '有效数字'),
                  h('input', {
                    className: 'ma-input',
                    type: 'number',
                    value: vars.digits,
                    onChange: (event) => update('digits', event.target.value),
                  }),
                )
              : null,
          ),
          h(
            Row,
            null,
            h(Button, { kind: 'primary', onClick: run, disabled: busy }, busy ? '计算中…' : '计算'),
            h('span', { className: 'ma-hint' }, 'Ctrl + Enter 也可以'),
          ),
        ),
        h(ErrorLine, { message: error }),
        result
          ? h(
              'div',
              { className: 'ma-card' },
              h(
                'div',
                { className: 'ma-status' },
                '✓ 完成' + (elapsed !== null ? ` · ${elapsed} ms` : ''),
              ),
              h(MathBlock, { latex: result.result_latex, text: result.result_text }),
              (result.notes || []).length
                ? h(
                    'ul',
                    { className: 'ma-notes' },
                    result.notes.map((note, index) => h('li', { key: index }, note)),
                  )
                : null,
              (result.steps || []).length
                ? h(
                    'div',
                    { className: 'ma-steps' },
                    result.steps.map((step, index) =>
                      h(
                        'div',
                        { className: 'ma-step', key: index },
                        h('div', { className: 'ma-step-title' }, step.title),
                        h(MathBlock, { latex: step.latex, small: true }),
                      ),
                    ),
                  )
                : null,
              h(
                'details',
                { className: 'ma-details' },
                h('summary', null, 'LaTeX 源码'),
                h('pre', null, result.result_latex),
              ),
            )
          : null,
      )
    }

    // ---------------------------------------------------------------- 序列

    function SeqTab({ onBackendError }) {
      const [terms, setTerms] = React.useState('1, 1, 2, 3, 5, 8, 13, 21')
      const [result, setResult] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      async function run() {
        setBusy(true)
        setError('')
        try {
          const data = await call('/sequence', {
            method: 'POST',
            body: JSON.stringify({ terms, oeis: true }),
          })
          setResult(data)
        } catch (err) {
          setError(err.message)
          setResult(null)
          if (/引擎|启动/.test(err.message)) onBackendError?.()
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'ma-pane' },
        h(
          'div',
          { className: 'ma-card' },
          h('div', { className: 'ma-label' }, '数列（逗号或空格分隔，至少 3 项）'),
          h('textarea', {
            className: 'ma-input ma-textarea',
            value: terms,
            spellCheck: false,
            onChange: (event) => setTerms(event.target.value),
            onKeyDown: (event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') run()
            },
          }),
          h(Row, null, h(Button, { kind: 'primary', onClick: run, disabled: busy }, busy ? '分析中…' : '分析')),
        ),
        h(ErrorLine, { message: error }),
        result
          ? h(
              'div',
              { className: 'ma-card' },
              result.known
                ? h(
                    'div',
                    { className: 'ma-kv' },
                    h('span', null, '识别为'),
                    h('strong', null, `${result.known.name}（${result.known.oeis}）`),
                  )
                : null,
              result.polynomial_text
                ? h(
                    'div',
                    { className: 'ma-kv' },
                    h('span', null, '通项'),
                    h('code', null, result.polynomial_text),
                  )
                : null,
              result.recurrence && result.recurrence.length
                ? h(
                    'div',
                    { className: 'ma-kv' },
                    h('span', null, '线性递推'),
                    h(
                      'code',
                      null,
                      'a(n) = ' + result.recurrence.map((c, i) => `${c}·a(n-${i + 1})`).join(' + '),
                    ),
                  )
                : null,
              result.next_terms && result.next_terms.length
                ? h('div', { className: 'ma-kv' }, h('span', null, '后续项'), h('code', null, result.next_terms.join(', ')))
                : null,
              result.oeis && result.oeis.items && result.oeis.items.length
                ? h(
                    'div',
                    { className: 'ma-oeis' },
                    result.oeis.items.map((item) =>
                      h(
                        'div',
                        { key: item.id, className: 'ma-oeis-item' },
                        h(
                          'a',
                          {
                            href: `https://oeis.org/${item.id}`,
                            target: '_blank',
                            rel: 'noreferrer',
                          },
                          item.id,
                        ),
                        ' ',
                        item.name,
                      ),
                    ),
                  )
                : null,
              (result.notes || []).length
                ? h(
                    'ul',
                    { className: 'ma-notes' },
                    result.notes.map((note, index) => h('li', { key: index }, note)),
                  )
                : null,
            )
          : null,
      )
    }

    // ---------------------------------------------------------------- 猜想

    function ConjTab({ onBackendError }) {
      const [catalogue, setCatalogue] = React.useState([])
      const [key, setKey] = React.useState('goldbach')
      const [limit, setLimit] = React.useState('2000')
      const [result, setResult] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        call('/conjectures')
          .then((data) => {
            setCatalogue(data.conjectures || [])
            const first = data.conjectures?.[0]
            if (first) {
              setKey(first.key)
              setLimit(String(first.default_limit))
            }
          })
          .catch((err) => {
            setError(err.message)
            onBackendError?.()
          })
      }, [])

      const current = catalogue.find((item) => item.key === key)

      async function run() {
        setBusy(true)
        setError('')
        try {
          const data = await call(`/conjecture/${encodeURIComponent(key)}?limit=${Number(limit) || 0}`)
          setResult(data)
        } catch (err) {
          setError(err.message)
          setResult(null)
          if (/引擎|启动/.test(err.message)) onBackendError?.()
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'ma-pane' },
        h(
          'div',
          { className: 'ma-card' },
          h(
            Row,
            null,
            h(
              'label',
              { className: 'ma-field ma-grow' },
              h('span', null, '猜想'),
              h(
                'select',
                {
                  className: 'ma-input',
                  value: key,
                  onChange: (event) => {
                    setKey(event.target.value)
                    const item = catalogue.find((x) => x.key === event.target.value)
                    if (item) setLimit(String(item.default_limit))
                  },
                },
                catalogue.map((item) => h('option', { key: item.key, value: item.key }, item.title)),
              ),
            ),
            h(
              'label',
              { className: 'ma-field' },
              h('span', null, '范围'),
              h('input', {
                className: 'ma-input',
                type: 'number',
                value: limit,
                onChange: (event) => setLimit(event.target.value),
              }),
            ),
          ),
          current ? h('div', { className: 'ma-hint ma-block' }, current.statement) : null,
          h(Row, null, h(Button, { kind: 'primary', onClick: run, disabled: busy }, busy ? '检验中…' : '检验')),
        ),
        h(ErrorLine, { message: error }),
        result
          ? h(
              'div',
              { className: 'ma-card' },
              h(
                'div',
                {
                  className:
                    'ma-verdict ' + (/反例/.test(result.verdict) ? 'ma-verdict-bad' : 'ma-verdict-ok'),
                },
                result.verdict,
              ),
              h(StatGrid, { stats: result.stats }),
              (result.notes || []).length
                ? h(
                    'ul',
                    { className: 'ma-notes' },
                    result.notes.map((note, index) => h('li', { key: index }, note)),
                  )
                : null,
              h(
                'a',
                {
                  className: 'ma-link',
                  href: `${API}/export/conjecture.csv?key=${encodeURIComponent(key)}&limit=${Number(limit) || 0}`,
                  download: `${key}-${limit}.csv`,
                },
                '下载这次的数据 CSV',
              ),
            )
          : null,
      )
    }

    // ---------------------------------------------------------------- 数字

    function NumberTab({ onBackendError }) {
      const [value, setValue] = React.useState('1729')
      const [result, setResult] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      async function run() {
        const raw = value.trim().replace(/,/g, '')
        if (!/^\d+$/.test(raw)) {
          setError('请输入非负整数')
          return
        }
        setBusy(true)
        setError('')
        try {
          const data = await call(`/number/${raw}`)
          setResult(data)
        } catch (err) {
          setError(err.message)
          setResult(null)
          if (/引擎|启动/.test(err.message)) onBackendError?.()
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'ma-pane' },
        h(
          'div',
          { className: 'ma-card' },
          h(
            Row,
            null,
            h('input', {
              className: 'ma-input ma-grow',
              value,
              onChange: (event) => setValue(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') run()
              },
            }),
            h(Button, { kind: 'primary', onClick: run, disabled: busy }, busy ? '分析中…' : '分析'),
          ),
        ),
        h(ErrorLine, { message: error }),
        result
          ? h(
              'div',
              { className: 'ma-card' },
              h('div', { className: 'ma-factor' }, h(MathBlock, {
                latex: result.factorization_latex,
                text: (result.factorization || []).length
                  ? result.n + ' = ' + result.factorization
                      .map((item) => (item.exp > 1 ? `${item.prime}^${item.exp}` : String(item.prime)))
                      .join(' × ')
                  : '没有质因数分解',
                small: true,
              })),
              h(StatGrid, {
                stats: {
                  '约数个数': result.divisor_total,
                  '约数和': result.divisor_sum,
                  '欧拉 φ': result.phi,
                  '莫比乌斯 μ': result.mu,
                  '质因数个数': `${result.omega} / ${result.big_omega}`,
                  '科拉茨步数': result.collatz?.steps ?? '—',
                  '十六进制': result.bases?.hex ?? '—',
                  '罗马数字': result.bases?.roman ?? '—',
                },
              }),
              (result.facts || []).length
                ? h(
                    'ul',
                    { className: 'ma-notes' },
                    result.facts.slice(0, 6).map((item, index) =>
                      h('li', { key: index }, h('strong', null, item.title + '：'), item.detail),
                    ),
                  )
                : null,
            )
          : null,
      )
    }

    // ---------------------------------------------------------------- 场景

    // ---------------------------------------------------------------- 左侧竖环 + 右侧内容

    // 环上的节点：角度决定它在环上的位置，0° 正好对着中线（也就是"当前浏览"的位置）
    const RING_NODES = [
      { angle: 0, title: '凸优化', page: 'convex' },
      { angle: 72, title: '数值分析', page: 'numeric' },
      { angle: 144, title: '节点三' },
      { angle: 216, title: '节点四' },
      { angle: 288, title: '节点五' },
    ]

    const TAU = Math.PI * 2

    function wrapAngle(value) {
      let angle = value % TAU
      if (angle > Math.PI) angle -= TAU
      if (angle < -Math.PI) angle += TAU
      return angle
    }

    function clamp(value, low, high) {
      return Math.min(high, Math.max(low, value))
    }

    // 数值分析的分节
    const NUMERIC_PAGES = [
      {
        id: 'overview',
        num: '00',
        label: '概览',
        title: '连续的问题，离散地算',
        lead:
          '数值分析研究的是：当解析解拿不到时，怎样用有限步计算逼近它，并且知道误差有多大。' +
          '核心是三件事——离散化、稳定性、误差估计。',
        formulas: [
          ['离散步长', 'h = (b − a) / N'],
          ['整体误差', 'E(h) = O(h^p)'],
          ['稳定性', '‖误差‖ 不随步数放大'],
        ],
        bullets: [
          '离散化把无穷维的问题变成有限维',
          '稳定性决定误差会不会被放大',
          '阶数 p 决定加密一步能换多少精度',
        ],
        note: '这一节先搭结构，常微分方程已经写好。',
      },
      {
        id: 'ode',
        num: '01',
        label: '常微分方程',
        title: '常微分方程：从斜率一点点走出解',
        lead:
          '给定 y′ = f(t, y) 和初值 (t₀, y₀)，解析解往往不存在。数值方法做的事是：在每一点用斜率估计下一步，' +
          '把连续的解换成一条折线。',
        formulas: [
          ['初值问题', 'y′ = f(t, y),  y(t₀) = y₀'],
          ['欧拉法', 'yₙ₊₁ = yₙ + h·f(tₙ, yₙ)'],
          ['中点法', 'yₙ₊₁ = yₙ + h·f(tₙ + h/2, yₙ + h/2·f(tₙ, yₙ))'],
          ['经典 RK4', 'yₙ₊₁ = yₙ + h/6·(k₁ + 2k₂ + 2k₃ + k₄)'],
        ],
        bullets: [
          '欧拉法是一阶：步长减半，误差减半',
          '中点法二阶，RK4 四阶：同样的步数精度高得多',
          '显式方法受稳定性限制：步长太大就会发散',
        ],
        extensions: [
          {
            type: 'phase',
            tag: '拓展',
            title: '相图：把解画成一张图',
            desc:
              '把 x 和 y 当作平面上的坐标，每一点画一个箭头表示 y′ 的方向，再从若干初值出发积分，就得到相图。' +
              '平衡点（箭头消失的地方）按雅可比矩阵的迹和行列式分类：结点、焦点、鞍点或中心。',
            uses: ['phase.portrait', 'phase.equilibria', 'phase.classify'],
          },
        ],
        note: '欧拉法和 RK4 的差别，在同样的步数下非常直观。',
      },
      {
        id: 'quad',
        num: '02',
        label: '数值积分',
        title: '数值积分：把面积切成小块',
        lead:
          '定积分是曲线下的面积。解析原函数求不出来时，就用规则的小块去逼近它。' +
          '块切得越细，误差越小；不同规则的收敛速度差别很大。',
        formulas: [
          ['梯形法', '∫ ≈ h/2 · [f₀ + 2f₁ + … + 2fₙ₋₁ + fₙ]'],
          ['中点法', '∫ ≈ h · [f(½) + f(1½) + …]'],
          ['辛普森法', '∫ ≈ h/3 · [f₀ + 4f₁ + 2f₂ + … + fₙ]'],
          ['误差阶', '梯形 O(h²)　中点 O(h²)　辛普森 O(h⁴)'],
        ],
        bullets: [
          '梯形法把每一小块当成梯形，误差来自曲边',
          '辛普森法用抛物线拟合，n 翻倍误差降 16 倍',
          '阶数越高，同样的精度需要的分点越少',
        ],
        extensions: [
          {
            type: 'quad',
            tag: '拓展',
            title: '误差随分点翻倍怎么变',
            desc:
              '固定被积函数和区间，把 n 逐个翻倍，看三种方法的绝对误差和实测收敛阶。' +
              '阶数就是误差每翻一倍 n 缩小多少倍的对数：2 表示缩 4 倍，4 表示缩 16 倍。',
            uses: ['integrate.integrate', 'integrate.order_table'],
          },
        ],
        note: '辛普森法要求 n 为偶数；表里自动取最近的偶数。',
      },
      {
        id: 'stiff',
        num: '03',
        label: '稳定性',
        title: '稳定性：步长不能随便给',
        lead:
          '同一个方程，用显式欧拉法时步长超过某个阈值就会数值爆炸；隐式方法则无条件稳定。' +
          '这解释了为什么刚性问题必须用隐式格式。',
        formulas: [
          ['显式欧拉', 'yₙ₊₁ = yₙ + h·λyₙ  →  |1 + hλ| ≤ 1'],
          ['隐式欧拉', 'yₙ₊₁ = yₙ / (1 − hλ)  →  恒稳定'],
        ],
        bullets: [
          'λ 越负（衰减越快），显式方法允许的步长越小',
          '刚性方程：λ 的实部跨度很大，显式方法会被最小的那个卡死',
          '隐式方法每步要解方程，但步长可以大得多',
        ],
        note: '这一节的内容还没写深，先把页面结构定下来。',
      },
    ]

    // 右侧内容页（目前只有凸优化）
    const CONVEX_PAGES = [
      {
        id: 'overview',
        num: '00',
        label: '概览',
        title: '局部最优，就是全局最优',
        lead:
          '凸优化研究的是这样一类问题：目标函数和可行域都是“凸”的。这个条件看起来苛刻，但它换来一个极强的性质——' +
          '任何局部最优解都是全局最优解。于是求解从“到处试探”变成了“沿着下降方向走到底”。',
        formulas: [
          ['minimize', 'f(x)'],
          ['subject to', 'gᵢ(x) ≤ 0,  i = 1…m'],
          ['', 'hⱼ(x) = 0,  j = 1…p'],
        ],
        bullets: [
          '凸性把“局部最优”直接升级成“全局最优”',
          '可行域与目标都能逐点验证，不依赖运气',
          '对偶问题给出下界，也给出可计算的停止准则',
        ],
      },
      {
        id: 'sets',
        num: '01',
        label: '凸集',
        title: '凸集：两点之间，不能跑出去',
        lead:
          '把 x 和 y 之间的点写成 z(λ) = λx + (1 − λ)y：逐个坐标按比例混合，λ = 0 得 y，λ = 1 得 x，' +
          'λ = 0.5 是中点。λ 只在 [0,1] 里取值时，扫出的是线段；放开到任意实数，扫出的就是整条直线。' +
          '凸集的定义正是：任意两点之间这段插值，整段都不能跑到集合外面。',
        formulas: [
          ['组合', 'z(λ) = λx + (1 − λ)y'],
          ['逐坐标', 'zᵢ(λ) = λxᵢ + (1 − λ)yᵢ'],
          ['线段 / 直线', 'λ ∈ [0, 1] 为线段；λ ∈ ℝ 为整条直线'],
          ['凸集', '∀x, y ∈ C,  λ ∈ [0, 1]  ⇒  z(λ) ∈ C'],
        ],
        extensions: [
          {
            type: 'interp',
            tag: '拓展',
            title: '轨迹不一定是直线',
            desc:
              '线性插值只会在两点之间画线段，因为它是仿射组合。换一种参数化方式——比如插值角度而不是位置——轨迹就会变成圆弧；' +
              '再换成贝塞尔、正弦摆动或螺旋，又能得到别的形状。下面这些轨迹都由数学库生成。',
            uses: ['interp.trajectory', 'interp.convex_combination'],
          },
          {
            type: 'morph',
            tag: '拓展二',
            title: '用匀速插值插一件衣服',
            desc:
              '两件衣服的轮廓点数、疏密都不一样，直接按顶点索引插值会扭曲。正确做法是先按弧长均匀重采样到同样点数，' +
              '让每个点在两条边上的“沿边比例”一致，再逐点插值——这就是匀速插值在 CG 变形里的用法。',
            uses: ['interp.resample_closed', 'interp.morph_polygons', 'interp.polygon_perimeter'],
          },
          {
            type: 'cloth',
            tag: '拓展三',
            title: 'PBD 布料：一条会垂下来的百褶裙',
            desc:
              '位置动力学不积分力，而是先把点往前推，再迭代地把违反约束的位置拉回来。' +
              '这条裙子有距离、剪切、弯曲三类约束，腰头固定，重力往下拉，碰到身体就推开。' +
              '褶是烘进静止形状里的，所以不会被解算抹平。',
            uses: [],
          },
        ],
        bullets: [
          'λ = 0 得到 y，λ = 0.5 得到中点，λ = 1 得到 x',
          'λ < 0 或 λ > 1 是外推：点跑到线段外面去了',
          '这里的“线性”指参数化方式对 λ 是线性的，不是说集合本身是直线或平面——圆盘、球、立方体都可以是凸集',
          '两个凸集的交仍是凸集，这就是约束可以一层层叠加的原因',
        ],
      },
      {
        id: 'functions',
        num: '02',
        label: '凸函数',
        title: '凸函数：图像永远在弦下方',
        lead: '凸函数的图像是“碗形”的：图像上任意两点连成的弦，永远落在图像上方。这是后面一切结论的来源。',
        formulas: [
          ['定义', 'f(θx + (1 − θ)y) ≤ θf(x) + (1 − θ)f(y)'],
          ['一阶条件', 'f(y) ≥ f(x) + ∇f(x)ᵀ(y − x)'],
          ['二阶条件', '∇²f(x) ⪰ 0'],
        ],
        bullets: [
          '一阶条件说：任意点的切平面都是全局下界',
          '保凸运算：非负加权和、逐点最大、仿射复合',
          '强凸 + 光滑，才能给出收敛速率的具体常数',
        ],
        figure: 'convex',
      },
      {
        id: 'problem',
        num: '03',
        label: '凸问题',
        title: '凸问题：目标与约束一起变凸',
        lead:
          '目标函数凸、不等式约束 gᵢ 凸、等式约束仿射，这样的问题就是凸优化问题。它的可行域是凸集，目标在可行域上也是凸的。',
        formulas: [
          ['标准形式', 'minimize f(x)   s.t.  gᵢ(x) ≤ 0,  Ax = b'],
          ['要求', 'f, gᵢ 为凸函数；等式约束必须是仿射的'],
        ],
        bullets: [
          '可行域是凸集，最优解集也是凸集',
          '“局部最优 = 全局最优”在这一类问题里成立',
          '判断一个问题是凸的，往往比求解它更难',
        ],
      },
      {
        id: 'dual',
        num: '04',
        label: '对偶',
        title: '对偶：从下界逼近最优',
        lead:
          '把约束乘上乘子加进目标，得到拉格朗日函数 L(x, λ, ν)。对 x 取下确界就得到对偶函数 g(λ, ν)——它永远是原问题最优值的下界。',
        formulas: [
          ['拉格朗日函数', 'L(x, λ, ν) = f(x) + Σ λᵢgᵢ(x) + Σ νⱼhⱼ(x)'],
          ['对偶函数', 'g(λ, ν) = infₓ L(x, λ, ν)  ≤  p*'],
          ['强对偶', 'd* = p*   （Slater 条件可保证）'],
        ],
        bullets: [
          '对偶函数总是凹的，无论原问题凸不凸',
          '强对偶成立时，两个问题的最优值相等',
          '对偶间隙 p* − d* 是可计算的质量指标',
        ],
      },
      {
        id: 'kkt',
        num: '05',
        label: 'KKT 条件',
        title: 'KKT：最优解的四个条件',
        lead: '在强对偶成立时，最优解必须满足下面四条。它们既是必要条件，也几乎就是算法的验收标准。',
        formulas: [
          ['平稳性', '∇f(x*) + Σ λᵢ∇gᵢ(x*) + Σ νⱼ∇hⱼ(x*) = 0'],
          ['原始可行', 'gᵢ(x*) ≤ 0,   hⱼ(x*) = 0'],
          ['对偶可行', 'λᵢ ≥ 0'],
          ['互补松弛', 'λᵢ gᵢ(x*) = 0'],
        ],
        bullets: [
          '凸问题 + Slater 条件下，KKT 从必要变成充分',
          '互补松弛的意思是：约束要么紧，要么乘子为零',
          '乘子 λ 常被解读为“放松这条约束的边际收益”',
        ],
      },
      {
        id: 'algorithms',
        num: '06',
        label: '算法',
        title: '算法：让 KKT 残差不断变小',
        lead:
          '无约束时，梯度下降每步沿负梯度走；牛顿法用 Hessian 修正方向，收敛更快但每步更贵。带约束时，内点法把不等式约束变成障碍函数，沿着中心路径逼近最优解。',
        formulas: [
          ['梯度下降', 'xₖ₊₁ = xₖ − α∇f(xₖ)'],
          ['牛顿步', 'xₖ₊₁ = xₖ − ∇²f(xₖ)⁻¹∇f(xₖ)'],
        ],
        bullets: [
          '梯度下降线性收敛，牛顿法在最优解附近二次收敛',
          '内点法把“能不能走”换成“走进去要付多少代价”',
          '工程上更要紧的是停止准则：KKT 残差、对偶间隙、梯度范数',
        ],
      },
    ]

    function ConvexFigure() {
      return h(
        'svg',
        { viewBox: '0 0 360 170', role: 'img', 'aria-label': '凸函数：弦在图像上方' },
        h('path', { d: 'M20 150 L340 150', stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1, fill: 'none' }),
        h('path', { d: 'M30 92 Q180 200 330 92', stroke: '#4fb3a3', strokeWidth: 2, fill: 'none' }),
        h('path', {
          d: 'M95 122 L265 122',
          stroke: 'rgba(255,255,255,0.5)',
          strokeWidth: 1.2,
          strokeDasharray: '4 4',
          fill: 'none',
        }),
        h('circle', { cx: 95, cy: 122, r: 3.2, fill: '#e7e9ec' }),
        h('circle', { cx: 265, cy: 122, r: 3.2, fill: '#e7e9ec' }),
        h('circle', { cx: 180, cy: 143, r: 3.2, fill: '#4fb3a3' }),
        h('circle', { cx: 180, cy: 122, r: 2.4, fill: 'rgba(231,233,236,0.55)' }),
        h(
          'text',
          { x: 180, y: 166, fill: 'rgba(231,233,236,0.5)', fontSize: 11, textAnchor: 'middle' },
          'f(θx + (1−θ)y) ≤ θf(x) + (1−θ)f(y)',
        ),
      )
    }

    // 正文下面的"拓展"块，可折叠
    function Extension({ tag, title, desc, initialOpen, children }) {
      const [open, setOpen] = React.useState(initialOpen !== false)
      return h(
        'section',
        { className: 'ma-ext' + (open ? ' ma-ext-open' : '') },
        h(
          'button',
          {
            type: 'button',
            className: 'ma-ext-head',
            onClick: () => setOpen(!open),
            'aria-expanded': open ? 'true' : 'false',
          },
          h('span', { className: 'ma-ext-tag' }, tag || '拓展'),
          h('span', { className: 'ma-ext-title' }, title),
          h('span', { className: 'ma-ext-chevron' }, open ? '−' : '+'),
        ),
        open
          ? h(
              'div',
              { className: 'ma-ext-body' },
              desc ? h('p', { className: 'ma-ext-desc' }, desc) : null,
              children,
            )
          : null,
      )
    }

    // 凸集的插值演示：数据来自数学库 /api/interp，点从 a 走到 b 再返回
    const INTERP_KINDS = [
      { key: 'linear', label: '线性', hint: '仿射组合，轨迹只能是直线段' },
      { key: 'arc', label: '圆弧', hint: '插值角度，轨迹必然是圆' },
      { key: 'bezier', label: '贝塞尔', hint: '控制点把轨迹拉弯' },
      { key: 'wave', label: '波动', hint: '直线前进 + 垂直方向正弦' },
      { key: 'spiral', label: '螺旋', hint: '半径随角度增长' },
    ]

    const INTERP_FALLBACK = (() => {
      const list = []
      for (let i = 0; i < 140; i++) {
        const raw = i / 139
        const t = 1 - Math.abs(2 * raw - 1)
        list.push({ t: t, point: [4 * t, 3 * t] })
      }
      return list
    })()

    function InterpDemo() {
      const canvasRef = React.useRef(null)
      const framesRef = React.useRef(null)
      const [kind, setKind] = React.useState('arc')
      const [uniform, setUniform] = React.useState(true)
      const [metrics, setMetrics] = React.useState(null)
      const [source, setSource] = React.useState('')

      React.useEffect(() => {
        let alive = true
        setSource('载入中…')
        fetch(API + '/interp/curve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: kind,
            a: [0, 0],
            b: [4, 3],
            frames: 140,
            mode: 'roundtrip',
            bulge: 0.45,
            uniform: uniform,
          }),
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            if (!alive) return
            if (data && Array.isArray(data.frames) && data.frames.length) {
              framesRef.current = data.frames
              setMetrics({
                path: data.path_length,
                chord: data.chord_length,
                ratio: data.length_ratio,
              })
              setSource('数学库 /api/interp/curve')
            } else {
              framesRef.current = null
              setMetrics(null)
              setSource('本地回退（线性）')
            }
          })
          .catch(() => {
            if (!alive) return
            framesRef.current = null
            setMetrics(null)
            setSource('本地回退（线性）')
          })
        return () => {
          alive = false
        }
      }, [kind, uniform])

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx = canvas.getContext('2d')
        const started = performance.now()
        const duration = 6000
        let raf = 0
        let width = 0
        let height = 0

        function resize() {
          const dpr = window.devicePixelRatio || 1
          width = canvas.clientWidth || 400
          height = canvas.clientHeight || 200
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas)

        function draw(now) {
          const list = framesRef.current || INTERP_FALLBACK
          const phase = ((now - started) % duration) / duration
          const index = Math.min(list.length - 1, Math.floor(phase * (list.length - 1)))
          const frame = (Array.isArray(list) && list[index]) || (Array.isArray(list) && list[0]) || { t: 0, point: [0, 0] }
          const point = Array.isArray(frame.point) ? frame.point : [0, 0]

          const pad = 30
          const minX = -0.6
          const maxX = 4.6
          const minY = -0.6
          const maxY = 3.6
          const sx = (x) => pad + ((x - minX) / (maxX - minX)) * (width - pad * 2)
          const sy = (y) => height - pad - ((y - minY) / (maxY - minY)) * (height - pad * 2)

          ctx.clearRect(0, 0, width, height)

          // 轨迹本身
          const trail = framesRef.current || INTERP_FALLBACK
          ctx.beginPath()
          trail.forEach(function (item, i) {
            const p = Array.isArray(item.point) ? item.point : [0, 0]
            if (i === 0) ctx.moveTo(sx(p[0]), sy(p[1]))
            else ctx.lineTo(sx(p[0]), sy(p[1]))
          })
          ctx.strokeStyle = 'rgba(79,179,163,0.55)'
          ctx.lineWidth = 1.6
          ctx.stroke()

          // 弦（虚线），用来说明 a、b 之间的直线参考
          ctx.beginPath()
          ctx.moveTo(sx(0), sy(0))
          ctx.lineTo(sx(4), sy(3))
          ctx.setLineDash([4, 5])
          ctx.strokeStyle = 'rgba(255,255,255,0.16)'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.setLineDash([])

          ctx.beginPath()
          ctx.arc(sx(2), sy(1.5), 3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(231,233,236,0.35)'
          ctx.fill()

          ;[
            ['a', 0, 0],
            ['b', 4, 3],
          ].forEach((item) => {
            ctx.beginPath()
            ctx.arc(sx(item[1]), sy(item[2]), 4.5, 0, Math.PI * 2)
            ctx.fillStyle = '#e7e9ec'
            ctx.fill()
            ctx.font = '12px ui-monospace, Consolas, monospace'
            ctx.fillStyle = 'rgba(231,233,236,0.6)'
            ctx.fillText(item[0], sx(item[1]) + 9, sy(item[2]) - 9)
          })

          const px = sx(point[0])
          const py = sy(point[1])
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 18)
          glow.addColorStop(0, 'rgba(79,179,163,0.55)')
          glow.addColorStop(1, 'rgba(79,179,163,0)')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(px, py, 18, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(px, py, 5, 0, Math.PI * 2)
          ctx.fillStyle = '#4fb3a3'
          ctx.fill()

          ctx.font = '12px ui-monospace, Consolas, monospace'
          ctx.fillStyle = 'rgba(231,233,236,0.78)'
          ctx.fillText('λ = ' + Number(frame.t).toFixed(2), pad, pad)
          ctx.fillStyle = 'rgba(231,233,236,0.38)'
          ctx.fillText('z(λ) = (' + point.map((v) => Number(v).toFixed(2)).join(', ') + ')', pad, pad + 18)

          raf = requestAnimationFrame(draw)
        }
        raf = requestAnimationFrame(draw)

        return () => {
          cancelAnimationFrame(raf)
          observer.disconnect()
        }
      }, [])

      const current = INTERP_KINDS.find((item) => item.key === kind) || INTERP_KINDS[0]

      return h(
        'div',
        { className: 'ma-demo' },
        h(
          'div',
          { className: 'ma-demo-kinds' },
          INTERP_KINDS.map((item) =>
            h(
              'button',
              {
                key: item.key,
                type: 'button',
                className: 'ma-demo-chip' + (item.key === kind ? ' ma-demo-chip-active' : ''),
                onClick: () => setKind(item.key),
              },
              item.label,
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip ma-demo-uniform' + (uniform ? ' ma-demo-chip-active' : ''),
              title: '按弧长等距取点：每一帧走的距离相同',
              onClick: () => setUniform(!uniform),
            },
            '匀速',
          ),
        ),
        h('canvas', { ref: canvasRef, 'aria-label': '插值轨迹动画' }),
        h(
          'p',
          { className: 'ma-demo-note' },
          current.hint +
            (metrics
              ? ' · 总长 ' + Number(metrics.path).toFixed(2) + ' / 弦长 ' + Number(metrics.chord).toFixed(2) +
                ' = ' + Number(metrics.ratio).toFixed(2) + '×'
              : '') +
            ' · 数据来源：' + (source || '载入中…'),
        ),
      )
    }

    function ConvexPage({ origin, instant, onClose, pages, heading }) {
      const pageList = pages || CONVEX_PAGES
      const [closing, setClosing] = React.useState(false)
      const [current, setCurrent] = React.useState(() => {
        const saved = loadView().section
        return pageList.some((entry) => entry.id === saved) ? saved : 'overview'
      })

      const goTo = React.useCallback((id) => {
        setCurrent(id)
        saveView({ section: id })
      }, [])
      const [offset, setOffset] = React.useState(0)
      const [dragging, setDragging] = React.useState(false)
      const offsetRef = React.useRef(0)
      const wheelDrag = React.useRef({ active: false, y: 0, moved: 0, captured: false })
      const backRef = React.useRef(null)

      const close = React.useCallback(() => {
        setClosing(true)
        window.setTimeout(onClose, 240)
      }, [onClose])

      React.useEffect(() => {
        backRef.current?.focus()
        const onKey = (event) => {
          if (event.key === 'Escape') close()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [close])

      const page = pageList.find((item) => item.id === current) || pageList[0]
      const STEP = 360 / pageList.length

      function wheelDown(event) {
        if (event.button !== 0) return
        wheelDrag.current = { active: true, y: event.clientY, moved: 0, captured: false }
        setDragging(true)
      }

      function wheelMove(event) {
        const state = wheelDrag.current
        if (!state.active) return
        const dy = event.clientY - state.y
        state.y = event.clientY
        state.moved += Math.abs(dy)

        if (!state.captured) {
          if (state.moved <= 4) return
          state.captured = true
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId)
          } catch {
            /* 合成事件 */
          }
        }

        const next = offsetRef.current - dy * 0.55
        offsetRef.current = next
        setOffset(next)
      }

      function wheelUp(event) {
        const state = wheelDrag.current
        if (!state.active) return
        state.active = false
        setDragging(false)
        if (state.captured) {
          state.captured = false
          try {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
          } catch {
            /* 同上 */
          }
        }

        const steps = Math.round(offsetRef.current / STEP)
        offsetRef.current = 0
        setOffset(0)
        if (steps !== 0) {
          const index = pageList.findIndex((entry) => entry.id === current)
          const nextIndex = ((index + steps) % pageList.length + pageList.length) % pageList.length
          goTo(pageList[nextIndex].id)
        }
      }

      function stepBy(direction) {
        const index = pageList.findIndex((entry) => entry.id === current)
        const nextIndex = ((index + direction) % pageList.length + pageList.length) % pageList.length
        goTo(pageList[nextIndex].id)
      }

      return h(
        'div',
        {
          className:
            'ma-dark' + (closing ? ' ma-dark-closing' : '') + (instant && !closing ? ' ma-dark-instant' : ''),
          style: { '--ma-origin-x': (origin || 50) + '%' },
          role: 'region',
          'aria-label': heading || '专题',
        },
        h(
          'div',
          { className: 'ma-dark-bar' },
          h(
            'button',
            { ref: backRef, type: 'button', className: 'ma-dark-back', onClick: close, 'aria-label': '关闭' },
            '←',
          ),
          h('span', { className: 'ma-dark-title' }, heading || '专题'),
          h('span', { className: 'ma-dark-crumb' }, page.num + ' / ' + page.label),
        ),
        h(
          'div',
          { className: 'ma-dark-main' },
          h(
            'nav',
            {
              className: 'ma-wheel' + (dragging ? ' ma-wheel-dragging' : ''),
              'aria-label': (heading || '专题') + '目录',
              onPointerDown: wheelDown,
              onPointerMove: wheelMove,
              onPointerUp: wheelUp,
              onPointerCancel: wheelUp,
              onWheel: (event) => stepBy(event.deltaY > 0 ? 1 : -1),
            },
            h(
              'div',
              { className: 'ma-wheel-stage' },
              h(
                'svg',
                { className: 'ma-wheel-ring', viewBox: '0 0 120 330', 'aria-hidden': true },
                h('ellipse', {
                  cx: 60,
                  cy: 165,
                  rx: 50,
                  ry: 126,
                  fill: 'none',
                  stroke: 'rgba(79,179,163,0.18)',
                  strokeWidth: 1,
                  strokeDasharray: '3 6',
                }),
              ),
              pageList.map((item, index) => {
                const activeIndex = pageList.findIndex((entry) => entry.id === current)
                const delta = index - activeIndex
                const theta = -delta * STEP + offset
                const depth = Math.cos((theta * Math.PI) / 180)
                return h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    className: 'ma-wheel-item',
                    'data-active': delta === 0 ? 'true' : 'false',
                    'aria-current': delta === 0 ? 'page' : 'false',
                    style: {
                      transform:
                        'translateY(-50%) rotateX(' + theta + 'deg) translateZ(126px) rotateX(' + -theta + 'deg)',
                      opacity: delta === 0 ? 1 : Math.max(0.14, depth * 0.5),
                      zIndex: String(60 - Math.abs(delta)),
                      pointerEvents: Math.abs(delta) > 3 ? 'none' : 'auto',
                    },
                    onClick: () => {
                      if (wheelDrag.current.moved > 4) return
                      goTo(item.id)
                    },
                  },
                  h('span', { className: 'ma-wheel-num' }, item.num),
                  h('span', { className: 'ma-wheel-label' }, item.label),
                )
              }),
            ),
          ),
          h(
            'div',
            { className: 'ma-dark-body' },
            h(
              'article',
              { className: 'ma-doc ma-page', key: page.id },
              h('p', { className: 'ma-doc-eyebrow' }, page.num + '  ·  ' + page.label),
              h('h1', { className: 'ma-doc-title' }, page.title),
              h('p', { className: 'ma-doc-lead' }, page.lead),
              page.formulas && page.formulas.length
                ? h(
                    'div',
                    { className: 'ma-formula' },
                    page.formulas.map((row, index) =>
                      h(
                        'div',
                        { className: 'ma-formula-line', key: index },
                        h('span', { className: 'ma-formula-kw' }, row[0]),
                        row[1],
                      ),
                    ),
                  )
                : null,
              page.figure === 'convex' ? h('div', { className: 'ma-figure' }, h(ConvexFigure, null)) : null,

              page.bullets && page.bullets.length
                ? h(
                    'ul',
                    { className: 'ma-points' },
                    page.bullets.map((text, index) => h('li', { key: index }, text)),
                  )
                : null,
              (page.extensions || []).map((ext) =>
                h(
                  Extension,
                  {
                    key: ext.type,
                    tag: ext.tag,
                    title: ext.title,
                    desc: ext.desc,
                    initialOpen: ext.type !== 'cloth',
                  },
                  ext.type === 'interp' ? h(InterpDemo, null) : null,
                  ext.type === 'morph' ? h(MorphDemo, null) : null,
                  ext.type === 'cloth' ? h(ClothDemo, null) : null,
                  ext.type === 'phase' ? h(PhaseDemo, null) : null,
                  ext.type === 'quad' ? h(QuadDemo, null) : null,
                  ext.uses && ext.uses.length
                    ? h(
                        'div',
                        { className: 'ma-uses' },
                        h('span', { className: 'ma-uses-label' }, '用到的函数'),
                        ext.uses.map((id) => h(FunctionTag, { key: id, id: id })),
                      )
                    : null,
                ),
              ),
              page.note ? h('p', { className: 'ma-doc-note' }, page.note) : null,
            ),
          ),
        ),
      )
    }

    function HomeScene() {
      const sceneRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const nodeRefs = React.useRef([])
      const initialView = loadView()
      const camera = React.useRef({
        yaw: initialView.yaw,
        pitch: initialView.pitch,
        targetYaw: initialView.yaw,
        targetPitch: initialView.pitch,
      })
      const drag = React.useRef({ active: false, x: 0, y: 0, moved: 0, captured: false })
      const lastNode = React.useRef(null)

      const [page, setPage] = React.useState(initialView.page)
      const [instant, setInstant] = React.useState(initialView.restored)
      const [origin, setOrigin] = React.useState(50)
      const [hint, setHint] = React.useState(true)
      const [grabbing, setGrabbing] = React.useState(false)

      React.useEffect(() => {
        const scene = sceneRef.current
        const canvas = canvasRef.current
        if (!scene || !canvas) return undefined
        const ctx = canvas.getContext('2d')
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        let width = 0
        let height = 0
        let raf = 0
        let last = performance.now()
        let comet = Math.PI * 0.86
        let brand = 'rgb(15,107,95)'
        let muted = 'rgb(106,111,120)'

        function readToken(name, fallback) {
          const probe = document.createElement('span')
          probe.style.color = 'var(' + name + ')'
          probe.style.display = 'none'
          scene.appendChild(probe)
          const value = getComputedStyle(probe).color
          probe.remove()
          return value && value !== 'rgba(0, 0, 0, 0)' ? value : fallback
        }

        function rgba(color, alpha) {
          const match = String(color).match(/rgba?\(([^)]+)\)/)
          if (!match) return 'rgba(15,107,95,' + alpha + ')'
          const parts = match[1].split(',').map(Number)
          return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + alpha + ')'
        }

        function resize() {
          const rect = scene.getBoundingClientRect()
          const dpr = window.devicePixelRatio || 1
          width = Math.max(1, rect.width)
          height = Math.max(1, rect.height)
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          canvas.style.width = width + 'px'
          canvas.style.height = height + 'px'
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          brand = readToken('--dsw-alias-brand-primary', 'rgb(15,107,95)')
          muted = readToken('--dsw-alias-label-secondary', 'rgb(106,111,120)')
        }

        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(scene)
        const colorTimer = window.setInterval(resize, 2500)

        function render() {
          const cam = camera.current
          const sinPitch = Math.abs(Math.sin(cam.pitch))
          const R = Math.min(width * 0.38, (height * 0.4) / (1.35 * Math.max(sinPitch, 0.22)))
          const distance = R * 4.5
          const cy = Math.cos(cam.yaw)
          const sy = Math.sin(cam.yaw)
          const cp = Math.cos(cam.pitch)
          const sp = Math.sin(cam.pitch)

          function project(angle) {
            const x = Math.cos(angle) * R
            const z = Math.sin(angle) * R
            const x1 = x * cy - z * sy
            const z1 = x * sy + z * cy
            const y2 = -z1 * sp
            const z2 = z1 * cp
            const f = distance / (distance + z2)
            return { x: width / 2 + x1 * f, y: height / 2 + y2 * f, z: z2, f: f }
          }

          ctx.clearRect(0, 0, width, height)

          const steps = 240
          const points = []
          for (let i = 0; i <= steps; i++) points.push(project((i / steps) * Math.PI * 2))

          ctx.beginPath()
          points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y)
            else ctx.lineTo(point.x, point.y)
          })
          ctx.strokeStyle = rgba(brand, 0.16)
          ctx.lineWidth = 1.2
          ctx.stroke()

          ctx.beginPath()
          let drawing = false
          for (const point of points) {
            if (point.z < 0) {
              if (drawing) ctx.lineTo(point.x, point.y)
              else ctx.moveTo(point.x, point.y)
              drawing = true
            } else {
              drawing = false
            }
          }
          ctx.strokeStyle = rgba(brand, 0.34)
          ctx.lineWidth = 1.6
          ctx.stroke()

          // 沿环移动的光
          const tail = Math.PI * 0.62
          const segments = 44
          ctx.lineCap = 'round'
          for (let i = 0; i < segments; i++) {
            const u = i / segments
            const a = project(comet - u * tail)
            const b = project(comet - ((i + 1) / segments) * tail)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = rgba(brand, Math.pow(1 - u, 2.4) * 0.95)
            ctx.lineWidth = 1.2 + (1 - u) * 2.4
            ctx.stroke()
          }

          const head = project(comet)
          const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 24)
          glow.addColorStop(0, rgba(brand, 0.55))
          glow.addColorStop(0.35, rgba(brand, 0.2))
          glow.addColorStop(1, rgba(brand, 0))
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(head.x, head.y, 24, 0, Math.PI * 2)
          ctx.fill()

          ctx.beginPath()
          ctx.arc(head.x, head.y, 1.7, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.fill()

          // 节点：从环上垂下来，像风铃
          RING_NODES.forEach((node, index) => {
            const element = nodeRefs.current[index]
            if (!element) return
            const anchor = project((node.angle * Math.PI) / 180)
            const depth = clamp((R - anchor.z) / (2 * R), 0, 1)
            const scale = clamp(anchor.f, 0.72, 1.25)
            const hang = 30 + (index % 3) * 11
            const px = anchor.x
            const py = anchor.y + hang

            ctx.beginPath()
            ctx.moveTo(anchor.x, anchor.y)
            ctx.lineTo(px, py)
            ctx.strokeStyle = rgba(brand, 0.18 + depth * 0.22)
            ctx.lineWidth = 1
            ctx.stroke()

            ctx.beginPath()
            ctx.arc(anchor.x, anchor.y, 1.5, 0, Math.PI * 2)
            ctx.fillStyle = rgba(brand, 0.35 + depth * 0.3)
            ctx.fill()

            element.style.transform =
              'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) translate(-50%,-50%) scale(' + scale.toFixed(3) + ')'
            element.style.opacity = (0.62 + depth * 0.38).toFixed(3)
            element.style.zIndex = String(10 + Math.round(depth * 90))
          })

          // 朝前的节点都标名字（未命名的节点不标）
          ctx.font = '12px system-ui, "Microsoft YaHei", sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          RING_NODES.forEach((node, index) => {
            if (!node.title || node.title.indexOf('节点') === 0) return
            const anchor = project((node.angle * Math.PI) / 180)
            const depth = clamp((R - anchor.z) / (2 * R), 0, 1)
            const hang = 30 + (index % 3) * 11
            ctx.fillStyle = rgba(muted, 0.32 + depth * 0.55)
            ctx.fillText(node.title, anchor.x, anchor.y + hang + 16)
          })
        }

        function frame(now) {
          const dt = Math.min((now - last) / 1000, 0.05)
          last = now
          const cam = camera.current
          const ease = Math.min(1, dt * 9)
          cam.pitch += (cam.targetPitch - cam.pitch) * ease
          cam.yaw += (cam.targetYaw - cam.yaw) * ease
          if (!reduced) comet = (comet + dt * 0.5) % (Math.PI * 2)
          render()
          raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)

        return () => {
          cancelAnimationFrame(raf)
          observer.disconnect()
          window.clearInterval(colorTimer)
        }
      }, [])

      function onPointerDown(event) {
        if (event.button !== 0 || page) return
        drag.current = { active: true, x: event.clientX, y: event.clientY, moved: 0, captured: false }
      }

      function onPointerMove(event) {
        const state = drag.current
        if (!state.active || page) return
        const dx = event.clientX - state.x
        const dy = event.clientY - state.y
        state.moved += Math.abs(dx) + Math.abs(dy)

        if (!state.captured) {
          if (state.moved <= 6) return
          state.captured = true
          setGrabbing(true)
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId)
          } catch {
            /* 合成事件 */
          }
        }

        state.x = event.clientX
        state.y = event.clientY
        const cam = camera.current
        cam.targetYaw += dx * 0.008
        cam.targetPitch = clamp(cam.targetPitch + dy * 0.007, 0, 1)
        if (state.moved > 10 && hint) setHint(false)
        saveView({ yaw: camera.current.targetYaw, pitch: camera.current.targetPitch })
      }

      function onPointerUp(event) {
        const state = drag.current
        state.active = false
        if (state.captured) {
          state.captured = false
          setGrabbing(false)
          try {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
          } catch {
            /* 同上 */
          }
        }
      }

      function openNode(index, event) {
        if (drag.current.moved > 10) return
        const node = RING_NODES[index]
        if (!node.page) return
        lastNode.current = nodeRefs.current[index]
        const rect = event.currentTarget.getBoundingClientRect()
        const scene = sceneRef.current
        if (scene) {
          const sceneRect = scene.getBoundingClientRect()
          setOrigin(((rect.left + rect.width / 2 - sceneRect.left) / sceneRect.width) * 100)
        }
        setInstant(false)
        setPage(node.page)
        saveView({ page: node.page })
      }

      function closePage() {
        setPage(null)
        setInstant(false)
        saveView({ page: null })
        window.setTimeout(() => lastNode.current?.focus?.(), 0)
      }

      return h(
        'div',
        {
          ref: sceneRef,
          className: 'ma-scene' + (grabbing ? ' ma-scene-grabbing' : ''),
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
          onDoubleClick: () => {
            if (page) return
            camera.current.targetPitch = 0
            camera.current.targetYaw = -0.18
          },
        },
        h('canvas', { ref: canvasRef, className: 'ma-ring-canvas' }),
        RING_NODES.map((node, index) =>
          h(
            'button',
            {
              key: node.title,
              ref: (element) => {
                nodeRefs.current[index] = element
              },
              type: 'button',
              className: 'ma-node' + (node.page ? ' ma-node-primary' : ''),
              style: { '--ma-delay': index * 0.9 + 's' },
              'aria-label': node.title,
              onClick: (event) => openNode(index, event),
            },
            h('span', { className: 'ma-node-halo' }),
            h('span', { className: 'ma-node-dot' }),
          ),
        ),
        page === null && hint
          ? h('div', { className: 'ma-hint-drag' }, '拖动改变视角 · 双击回到侧视')
          : null,
        page
            ? h(ConvexPage, {
                origin: origin,
                instant: instant,
                onClose: closePage,
                pages: page === 'numeric' ? NUMERIC_PAGES : CONVEX_PAGES,
                heading: page === 'numeric' ? '数值分析' : '凸优化',
              })
            : null,
      )
    }

    // ---------------------------------------------------------------- 形态插值（CG 衣服）

    function MorphDemo() {
      const canvasRef = React.useRef(null)
      const dataRef = React.useRef(null)
      const [uniform, setUniform] = React.useState(true)
      const [info, setInfo] = React.useState(null)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        let alive = true
        setError('')
        fetch(API + '/morph/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ source: 'shirt', target: 'dress', count: 160, uniform: uniform }),
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((data) => {
            if (!alive) return
            dataRef.current = data
            setInfo(data)
          })
          .catch((err) => {
            if (alive) setError(err.message)
          })
        return () => {
          alive = false
        }
      }, [uniform])

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx = canvas.getContext('2d')
        let raf = 0
        let width = 0
        let height = 0
        const started = performance.now()
        const duration = 7000

        function resize() {
          const dpr = window.devicePixelRatio || 1
          width = canvas.clientWidth || 520
          height = canvas.clientHeight || 360
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas)

        function path(points, sx, sy) {
          ctx.beginPath()
          points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(sx(point[0]), sy(point[1]))
            else ctx.lineTo(sx(point[0]), sy(point[1]))
          })
          ctx.closePath()
        }

        function draw(now) {
          const data = dataRef.current
          ctx.clearRect(0, 0, width, height)
          if (!data) {
            raf = requestAnimationFrame(draw)
            return
          }

          const phase = ((now - started) % duration) / duration
          const t = 1 - Math.abs(2 * phase - 1)

          const pad = 26
          const size = Math.min(width - pad * 2, height - pad * 2)
          const offsetX = (width - size) / 2
          const offsetY = (height - size) / 2
          const sx = (x) => offsetX + x * size
          const sy = (y) => offsetY + y * size

          // 目标轮廓（虚线参考）
          path(data.b, sx, sy)
          ctx.setLineDash([4, 5])
          ctx.strokeStyle = 'rgba(255,255,255,0.2)'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.setLineDash([])

          // 起点轮廓
          path(data.a, sx, sy)
          ctx.strokeStyle = 'rgba(255,255,255,0.2)'
          ctx.stroke()

          // 插值中的形状
          const mixed = data.a.map((point, index) => [
            point[0] + (data.b[index][0] - point[0]) * t,
            point[1] + (data.b[index][1] - point[1]) * t,
          ])
          path(mixed, sx, sy)
          ctx.fillStyle = 'rgba(79,179,163,0.16)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(79,179,163,0.9)'
          ctx.lineWidth = 1.6
          ctx.stroke()

          // 对应点：每 10 个点画一个，能看出是否沿边均匀
          ctx.fillStyle = 'rgba(79,179,163,0.6)'
          mixed.forEach((point, index) => {
            if (index % 10 !== 0) return
            ctx.beginPath()
            ctx.arc(sx(point[0]), sy(point[1]), 1.8, 0, Math.PI * 2)
            ctx.fill()
          })

          // λ
          ctx.font = '12px ui-monospace, Consolas, monospace'
          ctx.fillStyle = 'rgba(231,233,236,0.6)'
          ctx.fillText('λ = ' + t.toFixed(2), pad, pad)

          raf = requestAnimationFrame(draw)
        }
        raf = requestAnimationFrame(draw)

        return () => {
          cancelAnimationFrame(raf)
          observer.disconnect()
        }
      }, [])

      return h(
        'div',
        { className: 'ma-morph' },
        h(
          'div',
          { className: 'ma-morph-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (uniform ? ' ma-demo-chip-active' : ''),
              onClick: () => setUniform(true),
            },
            '等弧长对应',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (!uniform ? ' ma-demo-chip-active' : ''),
              onClick: () => setUniform(false),
            },
            '按顶点索引',
          ),
        ),
        h('canvas', { ref: canvasRef, className: 'ma-morph-canvas', 'aria-label': '衣服轮廓插值' }),
        error ? h('div', { className: 'ma-error' }, error) : null,
        h(
          'p',
          { className: 'ma-morph-note' },
          info
            ? '短袖（周长 ' + Number(info.perimeter_a).toFixed(2) + '）→ 长裙（周长 ' +
              Number(info.perimeter_b).toFixed(2) + '） · ' + info.count + ' 个采样点 · ' +
              (info.uniform ? '按弧长均匀取点' : '按原顶点等距取点') +
              ' · 两种对应方式下，点连线的走向完全不同'
            : '载入中…',
        ),
      )
    }

    // ---------------------------------------------------------------- 数值积分演示

    const QUAD_EXPRESSIONS = [
      { id: 'sin', label: 'sin x', expression: 'sin(x)', a: 0, b: 3.141592653589793 },
      { id: 'poly', label: 'x²', expression: 'x**2', a: 0, b: 1 },
      { id: 'gauss', label: 'e^(−x²)', expression: 'exp(-x**2)', a: -2, b: 2 },
    ]

    function QuadDemo() {
      const [pick, setPick] = React.useState(0)
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        let alive = true
        setError('')
        const target = QUAD_EXPRESSIONS[pick]
        fetch(API + '/integrate/table', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expression: target.expression,
            a: target.a,
            b: target.b,
            ns: [8, 16, 32, 64, 128],
          }),
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((result) => {
            if (alive) setData(result)
          })
          .catch((err) => {
            if (alive) setError(err.message)
          })
        return () => {
          alive = false
        }
      }, [pick])

      const rows = data ? data.rows : []
      const fmt = (value) => {
        if (value === null || value === undefined) return '—'
        if (value === 0) return '0'
        if (Math.abs(value) < 1e-4) return value.toExponential(2)
        return value.toPrecision(4)
      }

      return h(
        'div',
        { className: 'ma-quad' },
        h(
          'div',
          { className: 'ma-quad-head' },
          QUAD_EXPRESSIONS.map((item, index) =>
            h(
              'button',
              {
                key: item.id,
                type: 'button',
                className: 'ma-demo-chip' + (index === pick ? ' ma-demo-chip-active' : ''),
                onClick: () => setPick(index),
              },
              item.label,
            ),
          ),
          h('span', { className: 'ma-quad-exact' }, data && data.exact !== null ? '精确值 ' + fmt(data.exact) : ''),
        ),
        error ? h('div', { className: 'ma-error' }, error) : null,
        h(
          'table',
          { className: 'ma-quad-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, 'n'),
              h('th', null, '梯形误差'),
              h('th', null, '阶'),
              h('th', null, '辛普森误差'),
              h('th', null, '阶'),
            ),
          ),
          h(
            'tbody',
            null,
            rows.map((row) =>
              h(
                'tr',
                { key: row.n },
                h('td', null, String(row.n)),
                h('td', null, fmt(row.trapezoidError)),
                h('td', { className: 'ma-quad-order' }, row.trapezoidOrder === null ? '—' : row.trapezoidOrder.toFixed(2)),
                h('td', null, fmt(row.simpsonError)),
                h('td', { className: 'ma-quad-order' }, row.simpsonOrder === null ? '—' : row.simpsonOrder.toFixed(2)),
              ),
            ),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- 相图演示

    const PHASE_SYSTEMS = [
      { id: 'oscillator', label: '阻尼振子' },
      { id: 'saddle', label: '鞍点' },
      { id: 'lotka', label: '捕食者-猎物' },
      { id: 'pendulum', label: '单摆' },
    ]

    function PhaseDemo() {
      const canvasRef = React.useRef(null)
      const dataRef = React.useRef(null)
      const [system, setSystem] = React.useState('oscillator')
      const [info, setInfo] = React.useState('')
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        let alive = true
        setError('')
        const bounds =
          system === 'lotka'
            ? { xmin: 0.1, xmax: 3, ymin: 0.1, ymax: 3 }
            : system === 'pendulum'
              ? { xmin: -7, xmax: 7, ymin: -3, ymax: 3 }
              : { xmin: -2, xmax: 2, ymin: -2, ymax: 2 }
        fetch(API + '/phase/portrait', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ system: system, grid: 13, t_end: 10, dt: 0.02, ...bounds }),
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((data) => {
            if (!alive) return
            dataRef.current = data
            const eq = (data.equilibria || [])
              .map((p) => '(' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ') ' + p.kind + (p.stable ? '·稳定' : '·不稳定'))
              .join('  ')
            setInfo((data.formula || '') + (eq ? ' · 平衡点 ' + eq : ''))
          })
          .catch((err) => {
            if (alive) setError(err.message)
          })
        return () => {
          alive = false
        }
      }, [system])

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx = canvas.getContext('2d')
        let raf = 0
        let width = 0
        let height = 0

        function resize() {
          const dpr = window.devicePixelRatio || 1
          width = canvas.clientWidth || 520
          height = canvas.clientHeight || 320
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas)

        function draw() {
          const data = dataRef.current
          ctx.clearRect(0, 0, width, height)
          if (!data) {
            raf = requestAnimationFrame(draw)
            return
          }

          const pad = 20
          const b = data.bounds
          const sx = (x) => pad + ((x - b.xmin) / (b.xmax - b.xmin)) * (width - pad * 2)
          const sy = (y) => height - pad - ((y - b.ymin) / (b.ymax - b.ymin)) * (height - pad * 2)
          const toScreenScale = (width - pad * 2) / (b.xmax - b.xmin)

          // 坐标轴
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(pad, sy(0))
          ctx.lineTo(width - pad, sy(0))
          ctx.moveTo(sx(0), pad)
          ctx.lineTo(sx(0), height - pad)
          ctx.stroke()

          // 向量场
          let maxLen = 0
          for (const a of data.arrows) {
            const len = Math.sqrt(a.dx * a.dx + a.dy * a.dy)
            if (len > maxLen) maxLen = len
          }
          maxLen = maxLen || 1
          ctx.strokeStyle = 'rgba(79,179,163,0.35)'
          for (const a of data.arrows) {
            const len = Math.sqrt(a.dx * a.dx + a.dy * a.dy)
            if (len < 1e-6) continue
            const ux = a.dx / len
            const uy = a.dy / len
            const size = 5 + 7 * Math.min(1, len / maxLen)
            const x0 = sx(a.x) - ux * size * 0.5
            const y0 = sy(a.y) + uy * size * 0.5
            const x1 = sx(a.x) + ux * size * 0.5
            const y1 = sy(a.y) - uy * size * 0.5
            ctx.beginPath()
            ctx.moveTo(x0, y0)
            ctx.lineTo(x1, y1)
            ctx.stroke()
            // 箭头
            const angle = Math.atan2(y1 - y0, x1 - x0)
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x1 - 2.5 * Math.cos(angle - 0.5), y1 - 2.5 * Math.sin(angle - 0.5))
            ctx.lineTo(x1 - 2.5 * Math.cos(angle + 0.5), y1 - 2.5 * Math.sin(angle + 0.5))
            ctx.closePath()
            ctx.fillStyle = 'rgba(79,179,163,0.35)'
            ctx.fill()
          }

          // 轨线
          ctx.strokeStyle = 'rgba(140,200,255,0.5)'
          ctx.lineWidth = 1
          for (const curve of data.curves || []) {
            ctx.beginPath()
            curve.forEach((point, index) => {
              const x = sx(point[0])
              const y = sy(point[1])
              if (index === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.stroke()
          }

          // 平衡点
          for (const point of data.equilibria || []) {
            const x = sx(point.x)
            const y = sy(point.y)
            ctx.beginPath()
            ctx.arc(x, y, 5, 0, Math.PI * 2)
            ctx.fillStyle = point.stable ? 'rgba(79,179,163,0.95)' : 'rgba(235,120,110,0.95)'
            ctx.fill()
            ctx.beginPath()
            ctx.arc(x, y, 9, 0, Math.PI * 2)
            ctx.strokeStyle = point.stable ? 'rgba(79,179,163,0.4)' : 'rgba(235,120,110,0.4)'
            ctx.lineWidth = 1
            ctx.stroke()
          }

          raf = requestAnimationFrame(draw)
        }
        raf = requestAnimationFrame(draw)

        return () => {
          cancelAnimationFrame(raf)
          observer.disconnect()
        }
      }, [])

      return h(
        'div',
        { className: 'ma-phase' },
        h(
          'div',
          { className: 'ma-phase-head' },
          PHASE_SYSTEMS.map((item) =>
            h(
              'button',
              {
                key: item.id,
                type: 'button',
                className: 'ma-demo-chip' + (item.id === system ? ' ma-demo-chip-active' : ''),
                onClick: () => setSystem(item.id),
              },
              item.label,
            ),
          ),
        ),
        h('canvas', { ref: canvasRef, className: 'ma-phase-canvas', 'aria-label': '相图' }),
        error ? h('div', { className: 'ma-error' }, error) : null,
        h('p', { className: 'ma-phase-note' }, info || '载入中…'),
      )
    }

    // ---------------------------------------------------------------- PBD 布料（百褶裙）

    // 褶数、布宽、高度决定一切；半径和外观都是折出来的结果
    const GARMENT_SPEC = {
      pleats: 18,
      columnsPerPleat: 9,
      rows: 20,
      bandRows: 2,
      fabricWidth: 0.03,   // 腰围处的窄面布宽 w（宽面 2w）
      fabricWidthHem: 0.03,  // 布宽上下一致；外扩只来自褶的松开
      height: 0.92,
      openMax: 0.5,        // 下摆处褶打开的程度：0.5 = 宽窄面等宽（尽量展平）
    }

    const CLOTH_BUILD = '2.4.0'
    const CLOTH_PLEATS = GARMENT_SPEC.pleats
    const CLOTH_COLS = GARMENT_SPEC.pleats * GARMENT_SPEC.columnsPerPleat
    const CLOTH_ROWS = GARMENT_SPEC.rows
    const CLOTH_WAIST_Y = 0.95

    function buildCloth(lengthScale) {
      const spec = GARMENT_SPEC
      const N = spec.pleats
      const cols = CLOTH_COLS
      const rows = CLOTH_ROWS
      const height = spec.height * (lengthScale || 1)
      const w = spec.fabricWidth

      // 面层前进 α，回折层退回 β，净前进 Δ = α − β，正好一行接下一褶：
      //   外折痕 ──面层 10──▶ 内折痕 ──回折 5──▶ 下一个外折痕
      // 两条弦的长度比解成 2:1，布长才是 10 : 5。
      const delta = (Math.PI * 2) / N
      const perPleat = CLOTH_COLS / N

      function chord(r1, r2, angle) {
        return Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(angle))
      }

      const particles = []
      const constraints = []

      for (let j = 0; j < rows; j++) {
        const u = j / (rows - 1)
        const y = CLOTH_WAIST_Y - u * height
        const open = Math.max(0, Math.min(1, (u - 0.05) / 0.95))
        // 腰头压紧：两层几乎贴住；下摆松开：折痕变浅、半径变大
        const depth = 0.009 + 0.026 * open
        const radius = 0.2 + 0.02 * open

        // 解 α：面层弦长 / 回折层弦长 = 2，且 α − β = Δ
        let lo = delta * 1.0001
        let hi = delta + Math.PI * 0.5
        for (let it = 0; it < 60; it++) {
          const mid = (lo + hi) / 2
          const ratio = chord(radius, radius, mid) / chord(radius - depth, radius - depth, mid - delta)
          if (ratio < 2) lo = mid
          else hi = mid
        }
        const alpha = (lo + hi) / 2
        const beta = alpha - delta

        for (let i = 0; i < CLOTH_COLS; i++) {
          const pleat = Math.floor(i / perPleat)
          const f = (i - pleat * perPleat) / perPleat
          let theta
          let r
          if (f < 0.5) {
            const t = f / 0.5
            theta = pleat * delta + t * alpha
            r = radius
          } else {
            const t = (f - 0.5) / 0.5
            theta = pleat * delta + alpha - t * beta
            r = radius - depth
          }
          const x = Math.cos(theta) * r
          const z = Math.sin(theta) * r
          particles.push({
            x: x,
            y: y,
            z: z,
            rx: x,
            ry: y,
            rz: z,
            px: x,
            py: y,
            pz: z,
            vx: 0,
            vy: 0,
            vz: 0,
            invMass: j === 0 ? 0 : 1,
          })
        }
      }

      const index = (i, j) => j * CLOTH_COLS + (((i % CLOTH_COLS) + CLOTH_COLS) % CLOTH_COLS)

      function add(a, b) {
        const pa = particles[a]
        const pb = particles[b]
        const dx = pa.x - pb.x
        const dy = pa.y - pb.y
        const dz = pa.z - pb.z
        constraints.push({ a: a, b: b, rest: Math.sqrt(dx * dx + dy * dy + dz * dz) })
      }

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          add(index(i, j), index(i + 1, j))
          // 弯曲约束：隔两点锁住夹角（三点边长确定夹角），
          // 再隔四点锁住整个褶的轮廓，防止解算把褶压平
          add(index(i, j), index(i + 2, j))
          add(index(i, j), index(i + 4, j))
          if (j + 1 < rows) {
            add(index(i, j), index(i, j + 1))
            add(index(i, j), index(i + 1, j + 1))
            add(index(i + 1, j), index(i, j + 1))
          }
          if (j + 2 < rows) add(index(i, j), index(i, j + 2))
        }
      }

      // 折痕角度约束：折边两侧的三点夹角，用 PBD 角度投影维持
      const creaseA = Math.floor(perPleat / 2)
      function angleOf(a, b, c) {
        const pa = particles[a]
        const pb = particles[b]
        const pc = particles[c]
        const ux = pa.x - pb.x
        const uy = pa.y - pb.y
        const uz = pa.z - pb.z
        const vx = pc.x - pb.x
        const vy = pc.y - pb.y
        const vz = pc.z - pb.z
        const lu = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-6
        const lv = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-6
        const cos = (ux * vx + uy * vy + uz * vz) / (lu * lv)
        return Math.acos(Math.max(-1, Math.min(1, cos)))
      }

      // 整个面都加角度约束：每一点的夹角都记住，
      // 否则网格可以被压扁（边长不变但形状塌掉）
      for (let j = 1; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = j * cols + ((i - 1 + cols) % cols)
          const b = j * cols + i
          const c = j * cols + ((i + 1) % cols)
          constraints.push({
            type: 'angle',
            a: a,
            b: b,
            c: c,
            target: angleOf(a, b, c),
            soft: i === creaseA || i === creaseA + 1 ? 0.7 : 0.15,
          })
        }
      }

      return { particles: particles, constraints: constraints, time: 0 }
    }

    function collideCloth(particles) {
      for (let k = 0; k < particles.length; k++) {
        const p = particles[k]
        if (p.invMass === 0) continue
        // 躯干 / 胯 / 腿：用几段圆柱近似身体
        let centerX = 0
        let radius = 0
        if (p.y > 0.55) {
          radius = 0.2
        } else if (p.y > 0.34) {
          radius = 0.245
        } else {
          // 腿不再往外撑：裙摆应该自然垂到最下面
          centerX = 0
          radius = 0.02
        }
        const dx = p.x - centerX
        const dz = p.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < radius && dist > 1e-6) {
          const push = radius / dist
          p.x = centerX + dx * push
          p.z = dz * push
        }
      }
    }

    // PBD 角度约束：三点夹角 θ，目标 θ₀，沿梯度投影
    function solveAngleConstraint(particles, item, stiffness) {
      const A = particles[item.a]
      const B = particles[item.b]
      const C = particles[item.c]
      if (A.invMass + B.invMass + C.invMass === 0) return

      const ax = A.x - B.x
      const ay = A.y - B.y
      const az = A.z - B.z
      const cx = C.x - B.x
      const cy = C.y - B.y
      const cz = C.z - B.z
      const la = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-6
      const lc = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1e-6
      const ux = ax / la
      const uy = ay / la
      const uz = az / la
      const vx = cx / lc
      const vy = cy / lc
      const vz = cz / lc
      const cosA = Math.max(-1, Math.min(1, ux * vx + uy * vy + uz * vz))
      const angle = Math.acos(cosA)
      const diff = angle - item.target
      if (Math.abs(diff) < 1e-5) return

      // ∂θ/∂A、∂θ/∂C、∂θ/∂B
      const n1x = (vx - cosA * ux) / la
      const n1y = (vy - cosA * uy) / la
      const n1z = (vz - cosA * uz) / la
      const n2x = (ux - cosA * vx) / lc
      const n2y = (uy - cosA * vy) / lc
      const n2z = (uz - cosA * vz) / lc
      const nbx = -(n1x + n2x)
      const nby = -(n1y + n2y)
      const nbz = -(n1z + n2z)

      const wsum =
        (n1x * n1x + n1y * n1y + n1z * n1z) +
        (n2x * n2x + n2y * n2y + n2z * n2z) +
        (nbx * nbx + nby * nby + nbz * nbz)
      if (wsum < 1e-9) return

      const lambda = (-diff / wsum) * stiffness

      // 修正量限幅：不限制的话每步都会过冲，位置被反复改写、速度被带出来，
      // 表现就是「一直在动」。限幅后是温和收敛。
      const MAX_STEP = 0.0012
      const apply = (P, nx, ny, nz) => {
        let dx = lambda * nx * P.invMass
        let dy = lambda * ny * P.invMass
        let dz = lambda * nz * P.invMass
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (len > MAX_STEP) {
          const k = MAX_STEP / len
          dx *= k
          dy *= k
          dz *= k
        }
        P.x += dx
        P.y += dy
        P.z += dz
      }
      apply(A, n1x, n1y, n1z)
      apply(C, n2x, n2y, n2z)
      apply(B, nbx, nby, nbz)
    }

    function stepCloth(sim, dt, breeze, grab, creaseStiffness) {
      const particles = sim.particles
      const constraints = sim.constraints
      const gravity = -5.4
      const damping = 0.97
      const iterations = grab && grab.active ? 14 : 6
      const stiffness = 0.95

      for (let k = 0; k < particles.length; k++) {
        const p = particles[k]
        if (p.invMass === 0) continue
        p.vy += gravity * dt
        if (breeze) {
          const phase = sim.time * 1.6 + p.y * 4
          p.vx += Math.sin(phase) * 0.5 * dt
          p.vz += Math.cos(phase * 0.7) * 0.35 * dt
        }
        p.px = p.x
        p.py = p.y
        p.pz = p.z
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
      }

      for (let iter = 0; iter < iterations; iter++) {
        for (let c = 0; c < constraints.length; c++) {
          const item = constraints[c]
          if (item.type === 'angle') {
            solveAngleConstraint(particles, item, stiffness * creaseStiffness * (item.soft || 1))
            continue
          }
          const a = particles[item.a]
          const b = particles[item.b]
          const w = a.invMass + b.invMass
          if (w === 0) continue
          let dx = a.x - b.x
          let dy = a.y - b.y
          let dz = a.z - b.z
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
          const diff = ((len - item.rest) / len) * stiffness
          dx *= diff
          dy *= diff
          dz *= diff
          const wa = a.invMass / w
          const wb = b.invMass / w
          a.x -= dx * wa
          a.y -= dy * wa
          a.z -= dz * wa
          b.x += dx * wb
          b.y += dy * wb
          b.z += dz * wb
        }
        collideCloth(particles)

        if (grab && grab.active) {
          for (let g = 0; g < grab.items.length; g++) {
            const item = grab.items[g]
            const p = particles[item.index]
            p.x += (item.target.x - p.x) * 0.2
            p.y += (item.target.y - p.y) * 0.2
            p.z += (item.target.z - p.z) * 0.2
          }
        }

      }

      // 位移上限：单个点离静止位置不能超过 maxOffset，避免被拉成长条
      const maxOffset = 0.3
      for (let k = 0; k < particles.length; k++) {
        const p = particles[k]
        if (p.invMass === 0) continue
        const dx = p.x - p.rx
        const dy = p.y - p.ry
        const dz = p.z - p.rz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist > maxOffset) {
          const scale = maxOffset / dist
          p.x = p.rx + dx * scale
          p.y = p.ry + dy * scale
          p.z = p.rz + dz * scale
        }
      }

      // 形状记忆：每步很弱地拉回静止形状，甩完能自己恢复
      for (let k = 0; k < particles.length; k++) {
        const p = particles[k]
        if (p.invMass === 0) continue
        p.x += (p.rx - p.x) * 0.008
        p.y += (p.ry - p.y) * 0.008
        p.z += (p.rz - p.z) * 0.008
      }

      for (let k = 0; k < particles.length; k++) {
        const p = particles[k]
        if (p.invMass === 0) continue
        p.vx = ((p.x - p.px) / dt) * damping
        p.vy = ((p.y - p.py) / dt) * damping
        p.vz = ((p.z - p.pz) / dt) * damping
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz)
        const maxSpeed = 2.2
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed
          p.vx *= scale
          p.vy *= scale
          p.vz *= scale
        }
      }
      // 静止判定：整体速度极小时直接归零，避免解算残差让它一直微动
      let maxSpeed = 0
      for (let k = 0; k < particles.length; k++) {
        const p = particles[k]
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz)
        if (speed > maxSpeed) maxSpeed = speed
      }
      if (maxSpeed < 0.035) {
        for (let k = 0; k < particles.length; k++) {
          const p = particles[k]
          p.vx = 0
          p.vy = 0
          p.vz = 0
        }
      }

      sim.time += dt
    }

    // ---------------------------------------------------------------- WebGPU 渲染

    const CLOTH_WGSL = `
struct Uniforms {
  mvp: mat4x4<f32>,
  light: vec4<f32>,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) normal: vec3<f32>,
  @location(3) ao: f32,
}

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) ao: f32
) -> VSOut {
  var out: VSOut;
  out.position = u.mvp * vec4<f32>(position, 1.0);
  out.world = position;
  out.uv = uv;
  out.normal = normal;
  out.ao = ao;
  return out;
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4<f32> {
  // 用屏幕空间导数求几何法线：每个三角形一个面，褶的转折更利落
  var n = normalize(cross(dpdx(input.world), dpdy(input.world)));
  if (dot(n, normalize(input.normal)) < 0.0) {
    n = -n;
  }
  let h1 = fract(sin(dot(input.uv * 37.0, vec2<f32>(127.1, 311.7))) * 43758.5453) - 0.5;
  let h2 = fract(sin(dot(input.uv * 53.0, vec2<f32>(269.5, 183.3))) * 43758.5453) - 0.5;
  n = normalize(n + vec3<f32>(h1, h2, 0.0) * 0.1);

  let l = normalize(u.light.xyz);
  let diff = max(dot(n, l), 0.0);
  let v = normalize(-input.world);
  let hv = normalize(l + v);
  let spec = pow(max(dot(n, hv), 0.0), 28.0) * 0.22;
  let rim = pow(1.0 - max(dot(n, v), 0.0), 2.5) * 0.3;
  let base = vec3<f32>(0.155, 0.155, 0.17);
  let vgrad = 0.86 + 0.14 * clamp(input.world.y, 0.0, 1.0);
  let ambientTerm = base * 0.12 * mix(0.25, 1.0, input.ao) * vec3<f32>(0.85, 0.9, 1.05);
  let diffuseTerm = base * 1.7 * diff * mix(0.5, 1.0, input.ao);
  var color = (ambientTerm + diffuseTerm) * vgrad;
  color += vec3<f32>(0.95, 0.96, 1.0) * spec;
  color += vec3<f32>(0.22, 0.3, 0.42) * rim;

  let c = fract(input.uv);
  let du = min(c.x, 1.0 - c.x);
  let dv = min(c.y, 1.0 - c.y);
  let lineU = du < 0.075;
  let lineV = dv < 0.035;
  let bandU = c.x > 0.42 && c.x < 0.58;
  let bandV = c.y > 0.42 && c.y < 0.58;
  if (lineU || lineV) {
    let t = select(0.24, 0.38, lineU && lineV);
    color = mix(color, vec3<f32>(0.46, 0.46, 0.5), t);
  } else if (bandU || bandV) {
    color = mix(color, vec3<f32>(0.16, 0.16, 0.18), 0.3);
  }
  return vec4<f32>(color, 1.0);
}
`

    function mat4Identity() {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    }

    function mat4Multiply(a, b) {
      const out = new Float32Array(16)
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          let sum = 0
          for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
          out[c * 4 + r] = sum
        }
      }
      return out
    }

    function mat4Perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2)
      const nf = 1 / (near - far)
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
      ])
    }

    function mat4RotateX(angle) {
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
    }

    function mat4RotateY(angle) {
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
    }

    function mat4Translate(x, y, z) {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
    }

    // 默认关闭：Electron 里 WebGPU 一旦设备丢失会整页黑屏，先退回 canvas 2D。
    // 想试的话把它改成 true（或在控制台设 localStorage['math-atelier-webgpu'] = '1'）。
    const ENABLE_WEBGPU = false

    async function createClothGPU(canvas) {
      if (!canvas || !navigator.gpu) return null
      try {
        const adapter = await navigator.gpu.requestAdapter()
        if (!adapter) return null
        const device = await adapter.requestDevice()
        const context = canvas.getContext('webgpu')
        if (!context) return null
        const format = navigator.gpu.getPreferredCanvasFormat()
        context.configure({ device: device, format: format, alphaMode: 'premultiplied' })

        const module = device.createShaderModule({ code: CLOTH_WGSL })
        const pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module: module,
            entryPoint: 'vs',
            buffers: [
              {
                arrayStride: 24,
                attributes: [
                  { shaderLocation: 0, offset: 0, format: 'float32x3' },
                  { shaderLocation: 1, offset: 12, format: 'float32x3' },
                  { shaderLocation: 2, offset: 24, format: 'float32x2' },
                  { shaderLocation: 3, offset: 32, format: 'float32' },
                ],
              },
            ],
          },
          fragment: { module: module, entryPoint: 'fs', targets: [{ format: format }] },
          primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
          depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        })

        const uniformBuffer = device.createBuffer({
          size: 80,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        })

        let vertexBuffer = null
        let indexBuffer = null
        let depthTexture = null
        let vertexCount = 0
        let indexCount = 0
        let depthWidth = 0
        let depthHeight = 0

        function ensureBuffers(particles, cols, rows) {
          const count = particles.length
          if (!vertexBuffer || vertexCount !== count) {
            vertexBuffer = device.createBuffer({
              size: count * 2 * 36,
              usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            })
            vertexCount = count
            const indices = []
            for (let j = 0; j < rows - 1; j++) {
              for (let i = 0; i < cols; i++) {
                const i2 = (i + 1) % cols
                const a = j * cols + i
                const b = j * cols + i2
                const c = (j + 1) * cols + i
                const d = (j + 1) * cols + i2
                indices.push(a, b, c, b, d, c)
              }
            }
            indexCount = indices.length
            indexBuffer = device.createBuffer({
              size: indices.length * 4,
              usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            })
            device.queue.writeBuffer(indexBuffer, 0, new Uint32Array(indices))
          }
        }

        function ensureDepth(width, height) {
          if (depthTexture && depthWidth === width && depthHeight === height) return
          depthTexture = device.createTexture({
            size: { width: width, height: height, depthOrArrayLayers: 1 },
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
          depthWidth = width
          depthHeight = height
        }

        const data = new Float32Array(0)

        function render(particles, cols, rows, camera, cssWidth, cssHeight) {
          const dpr = window.devicePixelRatio || 1
          const width = Math.max(1, Math.round(cssWidth * dpr))
          const height = Math.max(1, Math.round(cssHeight * dpr))
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
          }
          ensureBuffers(particles, cols, rows)
          ensureDepth(width, height)

          const vertexData = new Float32Array(particles.length * 9)
          const gpuRowMax = new Float32Array(rows)
          for (let k = 0; k < particles.length; k++) {
            const p = particles[k]
            const row = Math.floor(k / cols)
            const r = Math.sqrt(p.x * p.x + p.z * p.z)
            if (r > gpuRowMax[row]) gpuRowMax[row] = r
          }
          const normals = new Float32Array(particles.length * 3)
          for (let j = 0; j < rows - 1; j++) {
            for (let i = 0; i < cols; i++) {
              const i2 = (i + 1) % cols
              const a = j * cols + i
              const b = j * cols + i2
              const c = (j + 1) * cols + i
              const d = (j + 1) * cols + i2
              const tri = [
                [a, b, c],
                [b, d, c],
              ]
              for (let t = 0; t < 2; t++) {
                const [ia, ib, ic] = tri[t]
                const pa = particles[ia]
                const pb = particles[ib]
                const pc = particles[ic]
                const ux = pb.x - pa.x
                const uy = pb.y - pa.y
                const uz = pb.z - pa.z
                const vx = pc.x - pa.x
                const vy = pc.y - pa.y
                const vz = pc.z - pa.z
                const nx = uy * vz - uz * vy
                const ny = uz * vx - ux * vz
                const nz = ux * vy - uy * vx
                for (const index of [ia, ib, ic]) {
                  normals[index * 3] += nx
                  normals[index * 3 + 1] += ny
                  normals[index * 3 + 2] += nz
                }
              }
            }
          }
          for (let k = 0; k < particles.length; k++) {
            const p = particles[k]
            let nx = normals[k * 3]
            let ny = normals[k * 3 + 1]
            let nz = normals[k * 3 + 2]
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
            const col = k % cols
            const row = Math.floor(k / cols)
            const radius = Math.sqrt(p.x * p.x + p.z * p.z)
            const ao = gpuRowMax[row] > 1e-6 ? Math.min(1, Math.max(0.3, radius / gpuRowMax[row])) : 1
            vertexData[k * 9] = p.x
            vertexData[k * 9 + 1] = p.y
            vertexData[k * 9 + 2] = p.z
            vertexData[k * 9 + 3] = nx / len
            vertexData[k * 9 + 4] = ny / len
            vertexData[k * 9 + 5] = nz / len
            vertexData[k * 9 + 6] = ((col + 2.0) / cols) * 18
            vertexData[k * 9 + 7] = (row / rows) * 6
            vertexData[k * 9 + 8] = ao
          }
          device.queue.writeBuffer(vertexBuffer, 0, vertexData)

          const projection = mat4Perspective(0.86, width / height, 0.1, 10)
          const view = mat4Multiply(
            mat4Translate(0, 0, -camera.dist),
            mat4Multiply(mat4RotateX(-camera.pitch), mat4Multiply(mat4RotateY(camera.yaw), mat4Translate(0, -0.48, 0))),
          )
          const mvp = mat4Multiply(projection, view)
          const uniforms = new Float32Array(20)
          uniforms.set(mvp, 0)
          const light = camera.light || [0.45, 0.8, 0.55]
          uniforms[16] = light[0]
          uniforms[17] = light[1]
          uniforms[18] = light[2]
          uniforms[19] = 0
          device.queue.writeBuffer(uniformBuffer, 0, uniforms)

          const encoder = device.createCommandEncoder()
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'store',
              },
            ],
            depthStencilAttachment: {
              view: depthTexture.createView(),
              depthClearValue: 1,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
          })
          pass.setPipeline(pipeline)
          pass.setBindGroup(0, bindGroup)
          pass.setVertexBuffer(0, vertexBuffer)
          pass.setIndexBuffer(indexBuffer, 'uint32')
          pass.drawIndexed(indexCount)
          pass.end()
          device.queue.submit([encoder.finish()])
        }

        function dispose() {
          try {
            device.destroy()
          } catch (error) {
            /* 忽略 */
          }
        }

        return { render: render, dispose: dispose, backend: 'webgpu', lost: device.lost }
      } catch (error) {
        console.warn('[math-atelier] WebGPU 初始化失败，回退 canvas 2D', error)
        return null
      }
    }

    // ---------------------------------------------------------------- WebGL 渲染（可选）

    function createClothGL(canvas) {
      const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
      if (!gl) return null
      // 必须先取一次扩展，着色器里的 #extension 指令才会被接受
      gl.getExtension('OES_standard_derivatives')

      const vertexSource = `
        attribute vec3 aPos;
        attribute vec3 aNormal;
        attribute vec2 aUv;
        attribute float aAo;
        uniform mat4 uMvp;
        varying vec3 vNormal;
        varying vec3 vWorld;
        varying vec2 vUv;
        varying float vAo;
        void main() {
          gl_Position = uMvp * vec4(aPos, 1.0);
          vNormal = aNormal;
          vWorld = aPos;
          vUv = aUv;
          vAo = aAo;
        }
      `
      const fragmentSource = `#extension GL_OES_standard_derivatives : enable
precision mediump float;
        varying vec3 vNormal;
        varying vec3 vWorld;
        varying vec2 vUv;
        varying float vAo;
        uniform vec3 uLight;
        void main() {
          // 用屏幕空间导数求几何法线：每个三角形一个面，折痕更硬
          vec3 nFlat = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          vec3 nSmooth = normalize(vNormal);
          if (dot(nFlat, nSmooth) < 0.0) nFlat = -nFlat;
          vec3 n = nFlat;
          // 纤维微法线：按格子坐标扰动，做出布面颗粒
          float h1 = fract(sin(dot(vUv * 37.0, vec2(127.1, 311.7))) * 43758.5453) - 0.5;
          float h2 = fract(sin(dot(vUv * 53.0, vec2(269.5, 183.3))) * 43758.5453) - 0.5;
          n = normalize(n + vec3(h1, h2, 0.0) * 0.1);

          vec3 L = normalize(uLight);
          float diff = max(dot(n, L), 0.0);
          vec3 V = normalize(-vWorld);
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(n, H), 0.0), 28.0) * 0.22;
          float fresnel = pow(1.0 - max(dot(n, V), 0.0), 2.5) * 0.3;
          vec3 base = vec3(0.155, 0.155, 0.17);
          float vgrad = 0.86 + 0.14 * clamp(vWorld.y, 0.0, 1.0);
          // 环境光只给一点点，阴影里要接近黑，否则黑布会发灰
          vec3 ambientTerm = base * 0.12 * mix(0.25, 1.0, vAo) * vec3(0.85, 0.9, 1.05);
          vec3 diffuseTerm = base * 1.7 * diff * mix(0.5, 1.0, vAo);
          vec3 color = (ambientTerm + diffuseTerm) * vgrad;
          color += vec3(0.95, 0.96, 1.0) * spec;
          color += vec3(0.22, 0.3, 0.42) * fresnel;

          vec2 c = fract(vUv);
          float du = min(c.x, 1.0 - c.x);
          float dv = min(c.y, 1.0 - c.y);
          bool lineU = du < 0.075;
          bool lineV = dv < 0.035;
          bool bandU = c.x > 0.42 && c.x < 0.58;
          bool bandV = c.y > 0.42 && c.y < 0.58;
          if (lineU || lineV) {
            float t = (lineU && lineV) ? 0.38 : 0.24;
            color = mix(color, vec3(0.46, 0.46, 0.5), t);
          } else if (bandU || bandV) {
            color = mix(color, vec3(0.16, 0.16, 0.18), 0.3);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `

      function compile(type, source) {
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.warn('[math-atelier] shader 编译失败', gl.getShaderInfoLog(shader))
          return null
        }
        return shader
      }

      const vs = compile(gl.VERTEX_SHADER, vertexSource)
      const fs = compile(gl.FRAGMENT_SHADER, fragmentSource)
      if (!vs || !fs) return null

      const program = gl.createProgram()
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[math-atelier] program 链接失败', gl.getProgramInfoLog(program))
        return null
      }

      const aPos = gl.getAttribLocation(program, 'aPos')
      const aNormal = gl.getAttribLocation(program, 'aNormal')
      const aUv = gl.getAttribLocation(program, 'aUv')
      const aAo = gl.getAttribLocation(program, 'aAo')
      const uMvp = gl.getUniformLocation(program, 'uMvp')
      const uLight = gl.getUniformLocation(program, 'uLight')

      const vbo = gl.createBuffer()
      const ibo = gl.createBuffer()
      let indexCount = 0
      let built = false

      const THICK = 0.0035

      // 外层 + 内层 + 下摆 rim：用同一份粒子算两张偏移面，布料就有厚度
      function ensureMesh(cols, rows) {
        if (built) return
        const indices = []
        const outer = (j, i) => j * cols + ((i % cols) + cols) % cols
        // 外层
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols; i++) {
            const i2 = (i + 1) % cols
            const a = outer(j, i)
            const b = outer(j, i2)
            const c = outer(j + 1, i)
            const d = outer(j + 1, i2)
            indices.push(a, b, c, b, d, c)
          }
        }
        // 内层（顶点索引偏移 count，绕序反过来）
        const count = cols * rows
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols; i++) {
            const i2 = (i + 1) % cols
            const a = count + outer(j, i)
            const b = count + outer(j, i2)
            const c = count + outer(j + 1, i)
            const d = count + outer(j + 1, i2)
            indices.push(a, c, b, b, c, d)
          }
        }
        // 下摆 rim：外层最底行与内层最底行缝一圈
        const hem = rows - 1
        for (let i = 0; i < cols; i++) {
          const i2 = (i + 1) % cols
          const o1 = outer(hem, i)
          const o2 = outer(hem, i2)
          const n1 = count + outer(hem, i)
          const n2 = count + outer(hem, i2)
          indices.push(o1, n1, o2, o2, n1, n2)
        }

        indexCount = indices.length
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)
        built = true
      }

      function render(particles, cols, rows, camera, cssWidth, cssHeight) {
        const dpr = window.devicePixelRatio || 1
        const width = Math.max(1, Math.round(cssWidth * dpr))
        const height = Math.max(1, Math.round(cssHeight * dpr))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        gl.viewport(0, 0, width, height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.enable(gl.DEPTH_TEST)
        gl.disable(gl.CULL_FACE)

        ensureMesh(cols, rows)

        const count = cols * rows
        const normals = new Float32Array(count * 3)
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols; i++) {
            const i2 = (i + 1) % cols
            const a = j * cols + i
            const b = j * cols + i2
            const c = (j + 1) * cols + i
            const d = (j + 1) * cols + i2
            const tris = [
              [a, b, c],
              [b, d, c],
            ]
            for (let t = 0; t < 2; t++) {
              const [ia, ib, ic] = tris[t]
              const pa = particles[ia]
              const pb = particles[ib]
              const pc = particles[ic]
              const ux = pb.x - pa.x
              const uy = pb.y - pa.y
              const uz = pb.z - pa.z
              const vx = pc.x - pa.x
              const vy = pc.y - pa.y
              const vz = pc.z - pa.z
              const nx = uy * vz - uz * vy
              const ny = uz * vx - ux * vz
              const nz = ux * vy - uy * vx
              for (const index of [ia, ib, ic]) {
                normals[index * 3] += nx
                normals[index * 3 + 1] += ny
                normals[index * 3 + 2] += nz
              }
            }
          }
        }

        // 两张面：外层沿法线外偏，内层内偏
        const data = new Float32Array(count * 2 * 9)
        for (let k = 0; k < count; k++) {
          const p = particles[k]
          let nx = normals[k * 3]
          let ny = normals[k * 3 + 1]
          let nz = normals[k * 3 + 2]
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
          nx /= len
          ny /= len
          nz /= len
          const col = k % cols
          const row = Math.floor(k / cols)
          const u = ((col + 2) / cols) * 18
          const v = (row / rows) * 6
          const radius = Math.sqrt(p.x * p.x + p.z * p.z) || 1e-6
          const o = k * 9
          data[o] = p.x + nx * THICK
          data[o + 1] = p.y + ny * THICK
          data[o + 2] = p.z + nz * THICK
          data[o + 3] = nx
          data[o + 4] = ny
          data[o + 5] = nz
          data[o + 6] = u
          data[o + 7] = v
          data[o + 8] = Math.min(1, Math.max(0.3, radius / 0.26))
          const q = (count + k) * 9
          data[q] = p.x - nx * THICK
          data[q + 1] = p.y - ny * THICK
          data[q + 2] = p.z - nz * THICK
          data[q + 3] = -nx
          data[q + 4] = -ny
          data[q + 5] = -nz
          data[q + 6] = u
          data[q + 7] = v
          data[q + 8] = Math.min(1, Math.max(0.3, radius / 0.26))
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)

        gl.useProgram(program)
        gl.enableVertexAttribArray(aPos)
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0)
        gl.enableVertexAttribArray(aNormal)
        gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 36, 12)
        if (aUv >= 0) {
          gl.enableVertexAttribArray(aUv)
          gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 36, 24)
        }
        if (aAo >= 0) {
          gl.enableVertexAttribArray(aAo)
          gl.vertexAttribPointer(aAo, 1, gl.FLOAT, false, 36, 32)
        }

        const projection = mat4Perspective(0.86, width / height, 0.1, 10)
        const view = mat4Multiply(
          mat4Translate(0, 0, -camera.dist),
          mat4Multiply(mat4RotateX(-camera.pitch), mat4Multiply(mat4RotateY(camera.yaw), mat4Translate(0, -0.48, 0))),
        )
        gl.uniformMatrix4fv(uMvp, false, mat4Multiply(projection, view))
        const light = camera.light || [0.45, 0.8, 0.55]
        gl.uniform3f(uLight, light[0], light[1], light[2])

        gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
      }

      function dispose() {
        try {
          gl.deleteBuffer(vbo)
          gl.deleteBuffer(ibo)
          gl.deleteProgram(program)
        } catch (error) {
          /* 忽略 */
        }
      }

      return { render: render, dispose: dispose }
    }

    function ClothDemo() {
      const stageRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const gpuCanvasRef = React.useRef(null)
      const gpuRef = React.useRef(null)
      const glCanvasRef = React.useRef(null)
      const glRef = React.useRef(null)
      const [glOn, setGlOn] = React.useState(false)
      const [skirtLength, setSkirtLength] = React.useState(0.82)
      const [paused, setPaused] = React.useState(false)
      const [crease, setCrease] = React.useState(0.35)
      const creaseRef = React.useRef(0.35)
      const lastInputRef = React.useRef(0)
      const pausedRef = React.useRef(false)
      const simRef = React.useRef(null)
      const [gpuReady, setGpuReady] = React.useState(false)
      const camera = React.useRef({ yaw: 0.5, pitch: 0.2, dist: 2.35, dragging: false, lastX: 0, lastY: 0 })
      const flags = React.useRef({ wire: false, breeze: false })
      const viewRef = React.useRef(null)
      const grabRef = React.useRef({ active: false, items: [], mode: 'camera', lastX: 0, lastY: 0 })

      function projectPoint(point, view) {
        const x = point.x
        const y = point.y - 0.48
        const z = point.z
        const x1 = x * view.cosY - z * view.sinY
        const z1 = x * view.sinY + z * view.cosY
        const y1 = y * view.cosP - z1 * view.sinP
        const z2 = y * view.sinP + z1 * view.cosP + view.dist
        const f = view.scale / z2
        return { x: view.cx + x1 * f, y: view.cy - y1 * f, depth: z2 }
      }

      function unprojectPoint(sx, sy, depth, view) {
        const x1 = ((sx - view.cx) * depth) / view.scale
        const y1 = (-(sy - view.cy) * depth) / view.scale
        const zRel = depth - view.dist
        const Y = y1 * view.cosP + zRel * view.sinP
        const z1 = -y1 * view.sinP + zRel * view.cosP
        return {
          x: x1 * view.cosY + z1 * view.sinY,
          y: 0.48 + Y,
          z: -x1 * view.sinY + z1 * view.cosY,
        }
      }
      const [wire, setWire] = React.useState(false)
      const [breeze, setBreeze] = React.useState(false)
      const [stats, setStats] = React.useState('')

      React.useEffect(() => {
        flags.current.wire = wire
      }, [wire])

      React.useEffect(() => {
        flags.current.breeze = breeze
      }, [breeze])

      React.useEffect(() => {
        pausedRef.current = paused
      }, [paused])

      React.useEffect(() => {
        creaseRef.current = crease
      }, [crease])

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        const ctx = canvas.getContext('2d')
        const sim = buildCloth(skirtLength)
      console.log('[math-atelier] cloth build', CLOTH_BUILD)
        simRef.current = sim
        setStats(sim.particles.length + ' 个粒子 · ' + sim.constraints.length + ' 条约束')

        let disposed = false

        // 默认用 WebGL（厚度 + 逐像素格纹），失败再回退 2D
        if (!disposed) {
          const glRenderer = createClothGL(glCanvasRef.current)
          if (glRenderer) {
            glRef.current = glRenderer
            setGlOn(true)
          }
        }

        let webgpuAllowed = ENABLE_WEBGPU
        try {
          webgpuAllowed = webgpuAllowed || window.localStorage.getItem('math-atelier-webgpu') === '1'
        } catch {
          /* localStorage 不可用 */
        }

        if (webgpuAllowed) {
          createClothGPU(gpuCanvasRef.current).then((renderer) => {
            if (disposed) {
              if (renderer) renderer.dispose()
              return
            }
            if (!renderer) return
            gpuRef.current = renderer
            setGpuReady(true)
            if (renderer.lost) {
              renderer.lost.then((info) => {
                console.warn('[math-atelier] WebGPU 设备丢失，回退 canvas 2D', info)
                gpuRef.current = null
                setGpuReady(false)
              })
            }
          })
        }

        let raf = 0
        let width = 0
        let height = 0
        let last = performance.now()
        let acc = 0

        function resize() {
          const dpr = window.devicePixelRatio || 1
          width = canvas.clientWidth || 520
          height = canvas.clientHeight || 380
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas)

        function render() {
          const cam = camera.current

          // 固定光源：世界空间里从左上前方照来，不随视角变化
          if (!cam.light) {
            const lx0 = -0.45
            const ly0 = 0.72
            const lz0 = -0.53
            const len = Math.sqrt(lx0 * lx0 + ly0 * ly0 + lz0 * lz0) || 1
            cam.light = [lx0 / len, ly0 / len, lz0 / len]
          }

          if (gpuRef.current) {
            viewRef.current = {
              cosY: Math.cos(cam.yaw),
              sinY: Math.sin(cam.yaw),
              cosP: Math.cos(cam.pitch),
              sinP: Math.sin(cam.pitch),
              scale: height / 2 / Math.tan(0.43),
              cx: width / 2,
              cy: height / 2,
              dist: cam.dist,
            }
            gpuRef.current.render(sim.particles, CLOTH_COLS, CLOTH_ROWS, cam, width, height)
            return
          }

          if (glRef.current) {
            // 抓取需要屏幕→布料的换算参数，GL 路径也要更新
            viewRef.current = {
              cosY: Math.cos(cam.yaw),
              sinY: Math.sin(cam.yaw),
              cosP: Math.cos(cam.pitch),
              sinP: Math.sin(cam.pitch),
              scale: height / 2 / Math.tan(0.43),
              cx: width / 2,
              cy: height / 2,
              dist: cam.dist,
            }
            glRef.current.render(sim.particles, CLOTH_COLS, CLOTH_ROWS, cam, width, height)
            return
          }
          const cosY = Math.cos(cam.yaw)
          const sinY = Math.sin(cam.yaw)
          const cosP = Math.cos(cam.pitch)
          const sinP = Math.sin(cam.pitch)
          const scale = Math.min(width, height) * 1.32
          const cx = width / 2
          const cy = height * 0.44
          const dist = cam.dist || 2.35
          const particles = sim.particles
          viewRef.current = { cosY: cosY, sinY: sinY, cosP: cosP, sinP: sinP, scale: scale, cx: cx, cy: cy, dist: dist }
          const projected = new Array(particles.length)

          for (let k = 0; k < particles.length; k++) {
            const p = particles[k]
            const x = p.x
            const y = p.y - 0.48
            const z = p.z
            const x1 = x * cosY - z * sinY
            const z1 = x * sinY + z * cosY
            const y1 = y * cosP - z1 * sinP
            const z2 = y * sinP + z1 * cosP + dist
            const f = scale / z2
            projected[k] = {
              x: cx + x1 * f,
              y: cy - y1 * f,
              depth: z2,
            }
          }

          const l1 = { x: 0.62, y: 0.68, z: 0.42 }
          const l2 = { x: -0.55, y: 0.2, z: 0.62 }
          function normalize(v) {
            const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1
            return { x: v.x / len, y: v.y / len, z: v.z / len }
          }
          const L1 = normalize(l1)
          const L2 = normalize(l2)

          const tris = []
          for (let j = 0; j < CLOTH_ROWS - 1; j++) {
            for (let i = 0; i < CLOTH_COLS; i++) {
              const i2 = (i + 1) % CLOTH_COLS
              const a = j * CLOTH_COLS + i
              const b = j * CLOTH_COLS + i2
              const c = (j + 1) * CLOTH_COLS + i
              const d = (j + 1) * CLOTH_COLS + i2
              tris.push([a, b, c])
              tris.push([b, d, c])
            }
          }

          const faces = []
          for (let t = 0; t < tris.length; t++) {
            const [ia, ib, ic] = tris[t]
            const pa = particles[ia]
            const pb = particles[ib]
            const pc = particles[ic]
            const ux = pb.x - pa.x
            const uy = pb.y - pa.y
            const uz = pb.z - pa.z
            const vx = pc.x - pa.x
            const vy = pc.y - pa.y
            const vz = pc.z - pa.z
            let nx = uy * vz - uz * vy
            let ny = uz * vx - ux * vz
            let nz = ux * vy - uy * vx
            const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6
            nx /= nlen
            ny /= nlen
            nz /= nlen
            // 折痕两侧绕序相反，用法线·径向把法线统一朝外
            const cx3 = (pa.x + pb.x + pc.x) / 3
            const cz3 = (pa.z + pb.z + pc.z) / 3
            if (nx * cx3 + nz * cz3 < 0) {
              nx = -nx
              ny = -ny
              nz = -nz
            }
            // 光照放在相机空间：光从镜头左上方来，保证朝向镜头的面一定被照亮
            const nx1 = nx * cosY - nz * sinY
            const ny1 = ny * cosP - (nx * sinY + nz * cosY) * sinP
            const nz2 = ny * sinP + (nx * sinY + nz * cosY) * cosP
            const key = Math.max(0, nx1 * 0.3 + ny1 * 0.35 - nz2 * 0.89)
            const fill = Math.max(0, -nx1 * 0.55 + ny1 * 0.1 - nz2 * 0.83)
            // 纵向自阴影：越靠近腰头越暗（被裙身挡住），越往下越亮
            const rowIndex = Math.floor(ia / CLOTH_COLS)
            const vertical = 0.86 + 0.14 * (rowIndex / CLOTH_ROWS)
            const shade = (0.2 + 0.7 * key + 0.18 * fill) * vertical
            const r = Math.round(26 * shade + 7)
            const g = Math.round(26 * shade + 7)
            const b = Math.round(30 * shade + 9)
            const z = (projected[ia].depth + projected[ib].depth + projected[ic].depth) / 3
            const front = nz2 < 0
            const isBand = Math.floor(ia / CLOTH_COLS) < 2
            let cr = isBand ? Math.round(8 + 14 * shade) : r
            let cg = isBand ? Math.round(8 + 14 * shade) : g
            let cb = isBand ? Math.round(10 + 16 * shade) : b

            // 格子：按布料坐标 (列, 行) 取图案，跟着褶一起折
            if (!isBand) {
              const checkU = ((ia % CLOTH_COLS + 2.0) / CLOTH_COLS) * 18
              const checkV = (Math.floor(ia / CLOTH_COLS) / CLOTH_ROWS) * 6
              const su = checkU - Math.floor(checkU)
              const sv = checkV - Math.floor(checkV)
              const lineU = Math.min(su, 1 - su) < 0.09
              const lineV = Math.min(sv, 1 - sv) < 0.06
              const bandU = su > 0.42 && su < 0.58
              const bandV = sv > 0.42 && sv < 0.58
              let mix = 0
              let tr = 176
              let tg = 176
              let tb = 180
              if (lineU || lineV) {
                mix = lineU && lineV ? 0.72 : 0.46
              } else if (bandU || bandV) {
                mix = 0.2
                tr = 62
                tg = 62
                tb = 68
              }
              if (mix > 0) {
                cr = Math.round(cr * (1 - mix) + tr * mix)
                cg = Math.round(cg * (1 - mix) + tg * mix)
                cb = Math.round(cb * (1 - mix) + tb * mix)
              }
            }
            // 按格子坐标做一点确定性的颗粒，避免大片死平
            const grain = ((ia * 73856093) ^ (rowIndex * 19349663)) % 7 - 3
            cr = Math.max(0, Math.min(255, cr + grain))
            cg = Math.max(0, Math.min(255, cg + grain))
            cb = Math.max(0, Math.min(255, cb + grain))
            faces.push({
              ia: ia,
              ib: ib,
              ic: ic,
              z: z,
              front: front,
              color: 'rgb(' + cr + ',' + cg + ',' + cb + ')',
              back:
                'rgb(' +
                Math.round(cr * 0.45 + 6) + ',' +
                Math.round(cg * 0.45 + 8) + ',' +
                Math.round(cb * 0.45 + 14) + ')',
            })
          }
          faces.sort((p1, p2) => p2.z - p1.z)

          ctx.clearRect(0, 0, width, height)

          // 地面阴影：把世界原点投影到屏幕，再画一个扁椭圆
          const groundWorldY = -0.48
          const gx1 = 0
          const gz1 = 0
          const gy1 = groundWorldY * cosP - gz1 * sinP
          const gz2 = groundWorldY * sinP + gz1 * cosP + dist
          const gf = scale / gz2
          ctx.beginPath()
          ctx.ellipse(cx + gx1 * gf, cy - gy1 * gf, 0.34 * gf, 0.1 * gf, 0, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,0,0,0.3)'
          ctx.fill()

          const wireMode = flags.current.wire

          // 腰头上沿（画在面之前，背面的那半会被裙身挡住）
          if (!wireMode) {
            ctx.beginPath()
            for (let i = 0; i < CLOTH_COLS; i++) {
              const point = projected[i]
              if (i === 0) ctx.moveTo(point.x, point.y)
              else ctx.lineTo(point.x, point.y)
            }
            ctx.closePath()
            ctx.strokeStyle = 'rgba(170,190,240,0.4)'
            ctx.lineWidth = 1
            ctx.stroke()
          }

          // 腰口：用一块暗色椭圆补上裙子里面，不然会看到背景
          if (!wireMode) {
            let wx = 0
            let wy = 0
            let radiusSum = 0
            for (let i = 0; i < CLOTH_COLS; i++) {
              wx += projected[i].x
              wy += projected[i].y
            }
            wx /= CLOTH_COLS
            wy /= CLOTH_COLS
            for (let i = 0; i < CLOTH_COLS; i++) {
              radiusSum += Math.sqrt((projected[i].x - wx) * (projected[i].x - wx) + (projected[i].y - wy) * (projected[i].y - wy))
            }
            const radius = radiusSum / CLOTH_COLS
            ctx.beginPath()
            ctx.ellipse(wx, wy, radius * 0.9, radius * 0.16, 0, 0, Math.PI * 2)
            ctx.fillStyle = 'rgb(8,11,20)'
            ctx.fill()
          }

          function drawFace(face, color) {
            const a = projected[face.ia]
            const b = projected[face.ib]
            const c = projected[face.ic]
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.lineTo(c.x, c.y)
            ctx.closePath()
            if (wireMode) {
              ctx.strokeStyle = 'rgba(120,170,255,0.35)'
              ctx.lineWidth = 0.6
              ctx.stroke()
            } else {
              ctx.fillStyle = color
              ctx.fill()
              ctx.strokeStyle = color
              ctx.lineWidth = 0.5
              ctx.stroke()
            }
          }

          // 双面渲染：朝向镜头的面用外侧色，背对镜头的用内侧暗色
          for (let f = 0; f < faces.length; f++) {
            const face = faces[f]
            drawFace(face, face.front ? face.color : face.back)
          }

          // 腰口：暗色椭圆补上裙子里面
          if (!wireMode) {
            let wx = 0
            let wy = 0
            let radiusSum = 0
            for (let i = 0; i < CLOTH_COLS; i++) {
              wx += projected[i].x
              wy += projected[i].y
            }
            wx /= CLOTH_COLS
            wy /= CLOTH_COLS
            for (let i = 0; i < CLOTH_COLS; i++) {
              const dx = projected[i].x - wx
              const dy = projected[i].y - wy
              radiusSum += Math.sqrt(dx * dx + dy * dy)
            }
            const radius = radiusSum / CLOTH_COLS
            ctx.beginPath()
            ctx.ellipse(wx, wy, radius * 0.95, radius * 0.35, 0, 0, Math.PI * 2)
            ctx.fillStyle = 'rgb(8,11,20)'
            ctx.fill()
          }

          ctx.font = '12px ui-monospace, Consolas, monospace'
          ctx.fillStyle = 'rgba(231,233,236,0.5)'
          ctx.fillText('PBD · ' + CLOTH_COLS + '×' + CLOTH_ROWS + ' · 4 次迭代', 14, 22)
        }

        let lastPaint = 0
        function frame(now) {
          const dt = Math.min((now - last) / 1000, 0.05)
          last = now
          acc += dt
          // 布料演示限到 30fps，降低渲染压力
          if (now - lastPaint < 33) {
            raf = requestAnimationFrame(frame)
            return
          }
          lastPaint = now
          const fixed = 1 / 120
          // 无操作 3 秒后完全停步，避免残余抖动让人以为它在自己动
          const idle = performance.now() - lastInputRef.current > 3000
          let guard = 0
          while (!pausedRef.current && !idle && !flags.current.breeze && acc >= fixed && guard < 6) {
            stepCloth(sim, fixed, flags.current.breeze, grabRef.current, creaseRef.current)
            acc -= fixed
            guard += 1
          }
          render()
          raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)

        return () => {
          disposed = true
          cancelAnimationFrame(raf)
          observer.disconnect()
          if (gpuRef.current) {
            gpuRef.current.dispose()
            gpuRef.current = null
          }
          if (glRef.current) {
            glRef.current.dispose()
            glRef.current = null
          }
        }
      }, [skirtLength])

      function touchInput() {
        lastInputRef.current = performance.now()
      }

      function onPointerDown(event) {
        touchInput()
        const canvas = canvasRef.current
        const sim = simRef.current
        const view = viewRef.current
        if (!canvas || !sim || !view) return
        const rect = canvas.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top
        const grab = grabRef.current
        grab.lastX = px
        grab.lastY = py
        grab.items = []

        if (!event.shiftKey) {
          const hits = []
          for (let k = 0; k < sim.particles.length; k++) {
            const p = sim.particles[k]
            // 腰头是固定粒子，不能被抓走
            if (p.invMass === 0) continue
            const screen = projectPoint(p, view)
            const distance = Math.sqrt((screen.x - px) * (screen.x - px) + (screen.y - py) * (screen.y - py))
            if (distance < 14) {
              hits.push({
                index: k,
                origin: { x: p.x, y: p.y, z: p.z },
                target: { x: p.x, y: p.y, z: p.z },
              })
            }
          }
          if (hits.length) {
            grab.active = true
            grab.mode = 'cloth'
            grab.items = hits
            try {
              canvas.setPointerCapture(event.pointerId)
            } catch {
              /* ignore */
            }
            return
          }
        }

        grab.active = false
        grab.mode = 'camera'
        camera.current.dragging = true
        camera.current.lastX = event.clientX
        camera.current.lastY = event.clientY
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          /* ignore */
        }
      }

      function onPointerMove(event) {
        const grab = grabRef.current
        // 只有真的在拖拽时才唤醒物理；鼠标只是划过画布不算
        if (grab.active || camera.current.dragging) {
          touchInput()
        }
        const view = viewRef.current
        const cam = camera.current

        if (grab.active) {
          if (!view) return
          const canvas = canvasRef.current
          const rect = canvas.getBoundingClientRect()
          const px = event.clientX - rect.left
          const py = event.clientY - rect.top
          const dx = px - grab.lastX
          const dy = py - grab.lastY
          grab.lastX = px
          grab.lastY = py
          for (let g = 0; g < grab.items.length; g++) {
            const item = grab.items[g]
            const screen = projectPoint(item.target, view)
            const next = unprojectPoint(screen.x + dx, screen.y + dy, screen.depth, view)
            // 限制被抓住的点离开抓取起点不超过 0.24
            const ox = next.x - item.origin.x
            const oy = next.y - item.origin.y
            const oz = next.z - item.origin.z
            const reach = Math.sqrt(ox * ox + oy * oy + oz * oz)
            const limit = 0.1
            const ratio = reach > limit ? limit / reach : 1
            item.target.x = item.origin.x + ox * ratio
            item.target.y = item.origin.y + oy * ratio
            item.target.z = item.origin.z + oz * ratio
          }
          return
        }

        if (!cam.dragging) return
        cam.yaw += (event.clientX - cam.lastX) * 0.01
        cam.pitch = Math.max(-0.5, Math.min(0.9, cam.pitch + (event.clientY - cam.lastY) * 0.006))
        cam.lastX = event.clientX
        cam.lastY = event.clientY
      }

      function onPointerUp(event) {
        const grab = grabRef.current
        grab.active = false
        grab.items = []
        grab.mode = 'camera'
        camera.current.dragging = false
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          /* ignore */
        }
      }

      async function toggleWebGPU() {
        if (gpuRef.current) {
          gpuRef.current.dispose()
          gpuRef.current = null
          setGpuReady(false)
          return
        }
        if (!navigator.gpu) {
          setStats((current) => current + ' · 没有 WebGPU')
          return
        }
        if (glRef.current) {
          glRef.current.dispose()
          glRef.current = null
          setGlOn(false)
        }
        const renderer = await createClothGPU(gpuCanvasRef.current)
        if (!renderer) {
          setStats((current) => current + ' · WebGPU 初始化失败')
          return
        }
        gpuRef.current = renderer
        setGpuReady(true)
        if (renderer.lost) {
          renderer.lost.then((info) => {
            console.warn('[math-atelier] WebGPU 设备丢失，回退 canvas 2D', info)
            gpuRef.current = null
            setGpuReady(false)
          })
        }
      }

      function toggleWebGL() {
        if (glRef.current) {
          glRef.current.dispose()
          glRef.current = null
          setGlOn(false)
          return
        }
        if (gpuRef.current) {
          gpuRef.current.dispose()
          gpuRef.current = null
          setGpuReady(false)
        }
        const renderer = createClothGL(glCanvasRef.current)
        if (!renderer) {
          setStats((current) => current + ' · WebGL 不可用')
          return
        }
        glRef.current = renderer
        setGlOn(true)
      }

      React.useEffect(() => {
        const stage = stageRef.current
        if (!stage) return undefined
        function handleWheel(event) {
          event.preventDefault()
          lastInputRef.current = performance.now()
          const cam = camera.current
          const next = cam.dist + event.deltaY * 0.0016
          cam.dist = Math.max(1.05, Math.min(4.5, next))
        }
        stage.addEventListener('wheel', handleWheel, { passive: false })
        return () => stage.removeEventListener('wheel', handleWheel)
      }, [])

      function gust() {
        const sim = simRef.current
        if (!sim) return
        for (const p of sim.particles) {
          if (p.invMass === 0) continue
          const depth = 1 - p.y
          p.vx += 1.6 * depth
          p.vz += 0.8 * depth * Math.sin(p.y * 8)
        }
      }

      return h(
        'div',
        { className: 'ma-cloth' },
        h(
          'div',
          { className: 'ma-cloth-head' },
          h(
            'span',
            { className: 'ma-cloth-stats' },
            'v' + CLOTH_BUILD + ' · ' + stats + ' · ' + (gpuReady ? 'WebGPU' : glOn ? 'WebGL' : 'Canvas 2D'),
          ),
          h(
            'label',
            { className: 'ma-cloth-length' },
            h('span', null, '折痕刚度'),
            h('input', {
              type: 'range',
              min: '0',
              max: '1',
              step: '0.02',
              value: crease,
              onChange: (event) => setCrease(Number(event.target.value)),
            }),
            h('span', { className: 'ma-cloth-length-value' }, Math.round(crease * 100) + '%'),
          ),
          h(
            'label',
            { className: 'ma-cloth-length' },
            h('span', null, '裙长'),
            h('input', {
              type: 'range',
              min: '0.45',
              max: '1.05',
              step: '0.01',
              value: skirtLength,
              onChange: (event) => setSkirtLength(Number(event.target.value)),
            }),
            h('span', { className: 'ma-cloth-length-value' }, Math.round(skirtLength * 100) + '%'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (paused ? ' ma-demo-chip-active' : ''),
              onClick: () => setPaused(!paused),
            },
            '暂停物理',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (breeze ? ' ma-demo-chip-active' : ''),
              onClick: () => setBreeze(!breeze),
            },
            '微风',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (wire ? ' ma-demo-chip-active' : ''),
              onClick: () => setWire(!wire),
            },
            '线框',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (glOn ? ' ma-demo-chip-active' : ''),
              onClick: toggleWebGL,
            },
            'WebGL',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ma-demo-chip' + (gpuReady ? ' ma-demo-chip-active' : ''),
              onClick: toggleWebGPU,
            },
            'WebGPU',
          ),
          h('button', { type: 'button', className: 'ma-demo-chip', onClick: gust }, '吹一下'),
        ),
        h(
          'div',
          {
            className: 'ma-cloth-stage' + (gpuReady ? ' ma-cloth-gpu-on' : '') + (glOn ? ' ma-cloth-gl-on' : ''),
            ref: stageRef,
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onPointerCancel: onPointerUp,
          },
          h('canvas', {
            ref: canvasRef,
            className: 'ma-cloth-canvas',
            'aria-label': 'PBD 百褶裙布料模拟',
          }),
          h('canvas', { ref: gpuCanvasRef, className: 'ma-cloth-canvas ma-cloth-gpu' }),
          h('canvas', { ref: glCanvasRef, className: 'ma-cloth-canvas ma-cloth-gl' }),
        ),
        h(
          'p',
          { className: 'ma-cloth-note' },
          '腰头固定（逆质量 = 0），其余顶点受重力与约束投影；距离/剪切/弯曲约束共 3 类，每次迭代后做一次身体碰撞。' +
            '直接拖动布面会把它拽起来、松手甩动；Shift + 拖动或拖空白处转视角。',
        ),
      )
    }

    // ---------------------------------------------------------------- 数学库

    const LIB_EVENT = 'math-atelier:library'
    const LIB_CACHE = { data: null, promise: null, target: null }

    function requestLibrary(id) {
      LIB_CACHE.target = id
      try {
        window.dispatchEvent(new CustomEvent(LIB_EVENT, { detail: id }))
      } catch {
        /* 忽略 */
      }
    }

    function FunctionTag({ id }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'ma-fn',
          title: '单击（或 Ctrl + 单击）在数学库里查看这个函数',
          onClick: () => requestLibrary(id),
        },
        id,
      )
    }

    function LibraryTab() {
      const [data, setData] = React.useState(LIB_CACHE.data)
      const [error, setError] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [openId, setOpenId] = React.useState(null)
      const [target, setTarget] = React.useState(LIB_CACHE.target)

      React.useEffect(() => {
        const onRequest = (event) => setTarget(event.detail)
        window.addEventListener(LIB_EVENT, onRequest)
        return () => window.removeEventListener(LIB_EVENT, onRequest)
      }, [])

      React.useEffect(() => {
        if (data) return
        if (!LIB_CACHE.promise) {
          LIB_CACHE.promise = fetch(API + '/library')
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
            .then((payload) => {
              LIB_CACHE.data = payload
              return payload
            })
            .catch((err) => {
              LIB_CACHE.promise = null
              throw err
            })
        }
        LIB_CACHE.promise.then(setData).catch((err) => setError(err.message))
      }, [data])

      React.useEffect(() => {
        if (!target || !data) return
        const node = document.getElementById('fn-' + target.replace('.', '-'))
        if (!node) return
        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
        node.classList.add('ma-fn-target')
        window.setTimeout(() => node.classList.remove('ma-fn-target'), 1800)
        setOpenId(target)
      }, [target, data])

      const keyword = query.trim().toLowerCase()
      const modules = (data ? data.modules : []).map((module) => ({
        ...module,
        functions: module.functions.filter(
          (item) =>
            !keyword ||
            item.name.toLowerCase().includes(keyword) ||
            item.summary.toLowerCase().includes(keyword) ||
            module.title.includes(query.trim()),
        ),
      }))

      return h(
        'div',
        { className: 'ma-lib' },
        h(
          'div',
          { className: 'ma-lib-head' },
          h('input', {
            className: 'ma-input ma-lib-search',
            value: query,
            placeholder: '搜索函数名或说明，例如 trajectory / 插值',
            onChange: (event) => setQuery(event.target.value),
          }),
          h('span', { className: 'ma-lib-meta' }, data ? data.total + ' 个函数' : '载入中…'),
        ),
        error ? h('div', { className: 'ma-error' }, error) : null,
        modules.map((module) =>
          h(
            'section',
            { className: 'ma-lib-group', key: module.id },
            h(
              'h3',
              null,
              module.title,
              h('span', { className: 'ma-lib-count' }, module.count),
            ),
            h('p', { className: 'ma-lib-blurb' }, module.blurb),
            module.functions.map((item) =>
              h(
                'div',
                {
                  key: item.id,
                  className: 'ma-lib-row',
                  id: 'fn-' + item.id.replace('.', '-'),
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => setOpenId(openId === item.id ? null : item.id),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') setOpenId(openId === item.id ? null : item.id)
                  },
                },
                h(
                  'div',
                  { className: 'ma-lib-line' },
                  h('code', { className: 'ma-lib-name' }, item.name),
                  h('span', { className: 'ma-lib-sig' }, item.signature.slice(item.name.length)),
                ),
                h('p', { className: 'ma-lib-sum' }, item.summary || '（没有说明）'),
                openId === item.id ? h('pre', { className: 'ma-lib-doc' }, item.doc || item.signature) : null,
              ),
            ),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- 面板

    const TABS = [
      { key: 'home', label: '首页' },
      { key: 'calc', label: '计算' },
      { key: 'seq', label: '序列' },
      { key: 'conj', label: '猜想' },
      { key: 'num', label: '数字' },
      { key: 'lib', label: '数学库' },
    ]

    function Panel() {
      const [status, setStatus] = React.useState(null)
      const [showLib, setShowLib] = React.useState(false)

      React.useEffect(() => {
        const onRequest = () => setShowLib(true)
        window.addEventListener(LIB_EVENT, onRequest)
        return () => window.removeEventListener(LIB_EVENT, onRequest)
      }, [])

      const checkStatus = React.useCallback(() => {
        fetch('/plugin/math-atelier/status')
          .then((response) => response.json())
          .then(setStatus)
          .catch(() => setStatus({ backend: 'offline' }))
      }, [])

      React.useEffect(() => {
        checkStatus()
      }, [checkStatus])

      const badge =
        status?.backend === 'running'
          ? { text: '引擎在线', className: 'ma-dot ma-dot-ok' }
          : status?.backend === 'starting'
            ? { text: '引擎启动中', className: 'ma-dot ma-dot-warn' }
            : { text: '引擎离线', className: 'ma-dot ma-dot-off' }

      return h(
        'div',
        { className: 'ma-root' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'ma-header' },
          h('div', { className: 'ma-title' }, '数学工坊'),
          h(
            'button',
            { type: 'button', className: 'ma-status-chip', onClick: checkStatus, title: status?.error || '' },
            h('span', { className: badge.className }),
            badge.text,
          ),
        ),
        h(
          'div',
          { className: 'ma-body' + (showLib ? '' : ' ma-body-scene') },
          showLib
            ? h(
                'div',
                { className: 'ma-lib-full' },
                h(
                  'div',
                  { className: 'ma-lib-bar' },
                  h('button', { type: 'button', className: 'ma-dark-back', onClick: () => setShowLib(false) }, '←'),
                  h('span', { className: 'ma-dark-title' }, '数学库'),
                ),
                h(LibraryTab, null),
              )
            : h(HomeScene, null),
        ),
      )
    }

    function Icon({ size = 20, active }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M6 4h12v2.4l-6.6 6.6L18 19.6V22H6v-2.4h5.2l-4.5-4.8 4.9-4.9H6z',
          fill: active ? 'currentColor' : 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 0 : 1.4,
          strokeLinejoin: 'round',
        }),
      )
    }

    const CSS = `
.ma-root, .ma-root * { box-sizing: border-box; }
.ma-root { height:100%; display:flex; flex-direction:column; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-size:14px; }
.ma-header { display:flex; align-items:center; gap:16px; padding:14px 22px; border-bottom:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); }
.ma-title { font-size:17px; font-weight:600; letter-spacing:.02em; }
.ma-lib-full { height:100%; overflow:auto; padding:18px 22px 40px; }
.ma-lib-bar { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
.ma-tabs { display:flex; gap:4px; }
.ma-tab { border:none; background:transparent; color:var(--dsw-alias-label-secondary); padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; }
.ma-tab:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.ma-tab-active { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-brand-primary); font-weight:600; }
.ma-status-chip { margin-left:auto; display:flex; align-items:center; gap:6px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); border-radius:999px; padding:4px 10px; font:inherit; font-size:12px; cursor:pointer; }
.ma-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
.ma-dot-ok { background:var(--dsw-alias-state-success-primary); }
.ma-dot-warn { background:var(--dsw-alias-state-warn-primary); }
.ma-dot-off { background:var(--dsw-alias-state-idle-primary); }
.ma-body { flex:1; overflow:auto; padding:20px 22px 40px; }
.ma-pane { max-width:900px; margin:0 auto; display:flex; flex-direction:column; gap:14px; }
.ma-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:16px; }
.ma-row { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-top:10px; }
.ma-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.ma-grow { flex:1; }
.ma-chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
.ma-chip { border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); border-radius:999px; padding:4px 12px; cursor:pointer; font:inherit; font-size:13px; }
.ma-chip-active { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.ma-input { border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); border-radius:8px; padding:8px 10px; font:inherit; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; width:100%; }
.ma-input:focus { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-1px; }
.ma-textarea { min-height:76px; resize:vertical; }
.ma-btn { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-radius:8px; padding:8px 16px; cursor:pointer; font:inherit; }
.ma-btn:disabled { opacity:.6; cursor:progress; }
.ma-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.ma-hint { font-size:12px; color:var(--dsw-alias-label-secondary); }
.ma-block { margin-top:8px; }
.ma-status { font-size:12px; color:var(--dsw-alias-state-success-primary); margin-bottom:8px; }
.ma-math { overflow-x:auto; padding:10px 12px; background:var(--dsw-alias-bg-layer-2); border-radius:8px; font-family:ui-monospace,Consolas,monospace; }
.ma-math-sm { padding:4px 0; background:transparent; }
.ma-notes { margin:10px 0 0; padding-left:18px; color:var(--dsw-alias-label-secondary); font-size:13px; }
.ma-notes li { margin-bottom:4px; }
.ma-steps { margin-top:12px; display:flex; flex-direction:column; gap:8px; }
.ma-step { border-left:2px solid var(--dsw-alias-border-l2); padding-left:12px; }
.ma-step-title { font-size:12px; color:var(--dsw-alias-label-secondary); margin-bottom:2px; }
.ma-details { margin-top:12px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.ma-details pre { overflow-x:auto; background:var(--dsw-alias-bg-layer-2); padding:10px; border-radius:8px; }
.ma-error { border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); border-radius:10px; padding:10px 14px; font-size:13px; }
.ma-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; margin-top:10px; }
.ma-stat { background:var(--dsw-alias-bg-layer-2); border-radius:8px; padding:8px 10px; }
.ma-stat-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
.ma-stat-value { font-family:ui-monospace,Consolas,monospace; font-size:15px; margin-top:2px; word-break:break-all; }
.ma-verdict { padding:10px 14px; border-radius:10px; font-size:14px; }
.ma-verdict-ok { background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); color:var(--dsw-alias-state-success-primary); }
.ma-verdict-bad { background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); color:var(--dsw-alias-state-error-primary); }
.ma-kv { display:flex; gap:10px; align-items:baseline; margin-bottom:8px; font-size:13px; }
.ma-kv span { color:var(--dsw-alias-label-secondary); min-width:72px; }
.ma-kv code { font-family:ui-monospace,Consolas,monospace; word-break:break-all; }
.ma-oeis { margin-top:12px; border-top:1px solid var(--dsw-alias-border-l1); padding-top:10px; font-size:13px; }
.ma-oeis-item { margin-bottom:6px; color:var(--dsw-alias-label-secondary); }
.ma-link { display:inline-block; margin-top:10px; font-size:13px; color:var(--dsw-alias-brand-primary); }
.ma-factor { font-size:15px; }

/* 全屏环场景：侧视是线，拖动转开 */
.ma-body-scene { padding:0; overflow:hidden; display:flex; }
.ma-scene {
  position:relative; flex:1; min-height:100%; overflow:hidden;
  cursor:grab; touch-action:none; user-select:none;
  background:radial-gradient(70% 60% at 50% 50%, color-mix(in srgb, var(--dsw-alias-bg-layer-2) 40%, transparent), transparent 72%);
}
.ma-scene-grabbing { cursor:grabbing; }
.ma-ring-canvas { position:absolute; inset:0; display:block; pointer-events:none; }
.ma-node {
  position:absolute; left:0; top:0;
  width:30px; height:30px; padding:0; border:0; border-radius:50%;
  background:transparent; cursor:pointer; display:grid; place-items:center;
  transform:translate(-50%,-50%);
  will-change:transform, opacity;
}
.ma-node-dot {
  width:9px; height:9px; border-radius:50%;
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, var(--dsw-alias-bg-base));
  border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, transparent);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-bg-base) 85%, transparent),
             0 0 10px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);
  transition:transform .25s ease, background .25s ease, box-shadow .25s ease, border-color .25s ease;
}
.ma-node-primary .ma-node-dot {
  width:12px; height:12px;
  background:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-bg-base) 80%, transparent),
             0 0 14px color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);
}
.ma-node:hover .ma-node-dot {
  background:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary);
  transform:scale(1.3);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent),
             0 0 14px color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, transparent);
}
.ma-node-halo {
  position:absolute; width:26px; height:26px; border-radius:50%;
  border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  opacity:0;
  animation:ma-node-pulse 4.4s ease-out infinite;
  animation-delay:var(--ma-delay, 0s);
}
@keyframes ma-node-pulse {
  0% { opacity:.45; transform:scale(.55); }
  55% { opacity:0; transform:scale(1.4); }
  100% { opacity:0; transform:scale(1.4); }
}
.ma-hint-drag {
  position:absolute; left:50%; bottom:24px; transform:translateX(-50%);
  font-size:12px; letter-spacing:.06em; color:var(--dsw-alias-label-secondary);
  opacity:.45; pointer-events:none; animation:ma-fade .9s ease both;
}
@keyframes ma-fade { from { opacity:0; } to { opacity:1; } }

/* 全屏内容页（暗色），从节点位置绽开 */
.ma-dark {
  position:absolute; inset:0; z-index:800;
  display:flex; flex-direction:column;
  background:#0b0e12; color:#e7e9ec;
  animation:ma-dark-open .68s cubic-bezier(.22,.9,.24,1) both;
}
@keyframes ma-dark-open {
  from { clip-path:circle(0% at var(--ma-origin-x, 50%) 50%); }
  to { clip-path:circle(160% at var(--ma-origin-x, 50%) 50%); }
}
.ma-dark-closing { animation:ma-dark-close .3s cubic-bezier(.2,.8,.2,1) both; }
.ma-dark-instant { animation:none; }
@keyframes ma-dark-close {
  from { clip-path:circle(160% at var(--ma-origin-x, 50%) 50%); }
  to { clip-path:circle(0% at var(--ma-origin-x, 50%) 50%); }
}
.ma-dark-bar {
  display:flex; align-items:center; gap:12px; height:52px; padding:0 18px;
  border-bottom:1px solid rgba(255,255,255,.07);
  background:rgba(255,255,255,.02);
  flex:0 0 auto;
  animation:ma-dark-bar .4s ease .06s both;
}
@keyframes ma-dark-bar {
  from { opacity:0; transform:translateY(-6px); }
  to { opacity:1; transform:none; }
}
.ma-dark-back {
  width:30px; height:30px; border-radius:50%;
  border:1px solid rgba(255,255,255,.14);
  background:transparent; color:#c9d1d0;
  display:grid; place-items:center; cursor:pointer; font-size:14px; line-height:1;
}
.ma-dark-back:hover { border-color:rgba(255,255,255,.3); color:#fff; }
.ma-dark-title { font-size:14px; letter-spacing:.08em; color:#dfe3e6; }
.ma-dark-crumb { margin-left:auto; font-size:11px; letter-spacing:.14em; color:rgba(255,255,255,.26); }
.ma-dark-body {
  flex:1; min-height:0; overflow-y:auto;
  padding:44px 56px 64px;
  background:radial-gradient(60% 50% at 22% 8%, rgba(15,107,95,.14), transparent 70%);
  animation:ma-dark-body .5s ease .1s both;
}
@keyframes ma-dark-body { from { opacity:0; } to { opacity:1; } }
.ma-dark-main { flex:1; display:flex; min-height:0; }
.ma-wheel {
  position:relative; flex:0 0 210px; width:210px;
  border-right:1px solid rgba(255,255,255,.06);
  overflow:hidden; perspective:900px; perspective-origin:50% 50%;
  cursor:grab; touch-action:none; user-select:none;
}
.ma-wheel-dragging { cursor:grabbing; }
.ma-wheel-dragging .ma-wheel-item { transition:none; }
.ma-wheel-stage { position:absolute; inset:0; transform-style:preserve-3d; transform:translateX(10px) rotateY(-24deg); }
.ma-wheel-ring {
  position:absolute; left:50%; top:50%; width:120px; height:330px;
  transform:translate(-50%,-50%); pointer-events:none;
}
.ma-wheel-item {
  position:absolute; left:50%; top:50%;
  width:46px; margin-left:-23px; padding:5px 0;
  border:0; border-radius:9px; background:transparent;
  color:rgba(231,233,236,.4); font:inherit; text-align:center; white-space:nowrap;
  cursor:pointer;
  transform-style:preserve-3d;
  transition:transform .55s cubic-bezier(.22,.9,.24,1), opacity .45s ease,
             color .3s ease, background .3s ease;
}
.ma-wheel-item:hover { color:#e7e9ec; }
.ma-wheel-item[data-active="true"] { color:#4fb3a3; background:rgba(79,179,163,.12); }
.ma-wheel-num { font-size:12px; letter-spacing:.04em; font-variant-numeric:tabular-nums; }
.ma-wheel-label {
  position:absolute; left:50%; top:calc(100% + 2px); transform:translateX(-50%);
  font-size:12px; letter-spacing:.02em; color:#4fb3a3; opacity:0; pointer-events:none;
  transition:opacity .2s ease;
}
.ma-wheel-item[data-active="true"] .ma-wheel-label { opacity:1; }
.ma-toc {
  flex:0 0 176px; width:176px; padding:24px 10px 24px 16px;
  border-right:1px solid rgba(255,255,255,.06);
  overflow-y:auto;
}
.ma-toc-item {
  display:flex; align-items:baseline; gap:8px; width:100%;
  padding:7px 10px; border:0; border-radius:8px; background:transparent;
  color:rgba(231,233,236,.5); font:inherit; font-size:13px; text-align:left;
  cursor:pointer; transition:color .15s ease, background .15s ease;
}
.ma-toc-item:hover { color:#e7e9ec; background:rgba(255,255,255,.04); }
.ma-toc-item[data-active="true"] { color:#4fb3a3; background:rgba(79,179,163,.1); }
.ma-toc-num { font-size:11px; opacity:.65; font-variant-numeric:tabular-nums; }
.ma-page { animation:ma-page-in .3s cubic-bezier(.2,.8,.2,1) both; }
@keyframes ma-page-in {
  from { opacity:0; transform:translateY(10px); }
  to { opacity:1; transform:none; }
}
.ma-ext {
  margin:34px 0 22px; border:1px solid rgba(255,255,255,.08);
  border-radius:14px; background:rgba(255,255,255,.015); overflow:hidden;
}
.ma-ext-head {
  display:flex; align-items:center; gap:10px; width:100%;
  padding:14px 16px; border:0; background:transparent;
  color:#e7e9ec; font:inherit; font-size:15px; text-align:left; cursor:pointer;
}
.ma-ext-head:hover { background:rgba(255,255,255,.03); }
.ma-ext-tag {
  font-size:11px; letter-spacing:.14em; color:#4fb3a3;
  border:1px solid rgba(79,179,163,.4); border-radius:999px; padding:1px 8px;
}
.ma-ext-title { font-weight:600; }
.ma-ext-chevron { margin-left:auto; color:rgba(231,233,236,.45); font-size:16px; }
.ma-ext-body { padding:0 16px 18px; }
.ma-ext-desc {
  margin:0 0 14px; font-size:13px; line-height:1.85; color:rgba(231,233,236,.55);
}
.ma-demo {
  margin:0 0 26px; padding:10px 12px;
  border-radius:12px; border:1px solid rgba(255,255,255,.07);
  background:rgba(255,255,255,.02);
}
.ma-demo canvas { display:block; width:100%; height:200px; border-radius:8px; }
.ma-demo-kinds { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
.ma-demo-chip {
  border:1px solid rgba(255,255,255,.1); background:transparent;
  color:rgba(231,233,236,.5); border-radius:999px; padding:3px 11px;
  font:inherit; font-size:12px; cursor:pointer;
  transition:color .15s ease, border-color .15s ease, background .15s ease;
}
.ma-demo-chip:hover { color:#e7e9ec; border-color:rgba(255,255,255,.25); }
.ma-demo-chip-active { color:#4fb3a3; border-color:rgba(79,179,163,.5); background:rgba(79,179,163,.1); }
.ma-demo-note { margin:8px 0 0; font-size:11px; color:rgba(231,233,236,.35); }
.ma-uses { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:14px 0 18px; }
.ma-uses-label { font-size:11px; letter-spacing:.08em; color:rgba(231,233,236,.35); }
.ma-fn {
  border:1px solid rgba(79,179,163,.35); background:rgba(79,179,163,.08);
  color:#4fb3a3; border-radius:6px; padding:3px 8px; font-size:12px;
  font-family:ui-monospace, Consolas, monospace; cursor:pointer;
  transition:background .15s ease, border-color .15s ease;
}
.ma-fn:hover { background:rgba(79,179,163,.16); border-color:rgba(79,179,163,.6); }
.ma-cloth-stage { position:relative; }
.ma-cloth-gpu { position:absolute; inset:0; display:none; }
.ma-cloth-gl { position:absolute; inset:0; display:none; }
.ma-cloth-gl-on .ma-cloth-gl { display:block; }
.ma-cloth-gl-on canvas:not(.ma-cloth-gl) { visibility:hidden; }
.ma-cloth-gpu-on .ma-cloth-gpu { display:block; }
.ma-cloth-gpu-on canvas:not(.ma-cloth-gpu) { visibility:hidden; }
.ma-quad-head { display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
.ma-quad-exact { margin-left:auto; font-size:12px; color:rgba(231,233,236,.45); font-family:ui-monospace, Consolas, monospace; }
.ma-quad-table { width:100%; border-collapse:collapse; font-size:12.5px; font-family:ui-monospace, Consolas, monospace; }
.ma-quad-table th { text-align:left; font-weight:500; color:rgba(231,233,236,.42); padding:6px 8px; border-bottom:1px solid rgba(255,255,255,.08); }
.ma-quad-table td { padding:6px 8px; color:rgba(231,233,236,.8); border-bottom:1px solid rgba(255,255,255,.04); }
.ma-quad-order { color:rgba(79,179,163,.9); }
.ma-phase-head { display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
.ma-phase-canvas {
  display:block; width:100%; height:320px; border-radius:10px;
  border:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.02);
}
.ma-phase-note { margin:10px 0 0; font-size:12px; line-height:1.7; color:rgba(231,233,236,.45); font-family:ui-monospace, Consolas, monospace; }
.ma-cloth-head { display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
.ma-cloth-length {
  display:flex; align-items:center; gap:6px; margin-right:auto;
  font-size:12px; color:rgba(231,233,236,.55);
}
.ma-cloth-length input[type='range'] { width:110px; accent-color:#4fb3a3; }
.ma-cloth-length-value { font-family:ui-monospace, Consolas, monospace; min-width:38px; }
.ma-cloth-stats { margin-right:auto; font-size:12px; color:rgba(231,233,236,.4); font-family:ui-monospace, Consolas, monospace; }
.ma-cloth-canvas {
  display:block; width:100%; height:400px; border-radius:10px;
  border:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.02);
  cursor:grab; touch-action:none;
}
.ma-cloth-canvas:active { cursor:grabbing; }
.ma-cloth-note { margin:10px 0 0; font-size:12px; line-height:1.7; color:rgba(231,233,236,.45); }
.ma-morph-head { display:flex; gap:6px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
.ma-morph-canvas {
  width:100%; height:340px; display:block; border-radius:10px;
  border:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.02);
}
.ma-morph-note { margin:10px 0 0; font-size:12px; line-height:1.7; color:rgba(231,233,236,.45); }
.ma-lib { max-width:900px; margin:0 auto; display:flex; flex-direction:column; gap:18px; }
.ma-lib-head { display:flex; gap:12px; align-items:center; }
.ma-lib-search { flex:1; }
.ma-lib-meta { font-size:12px; color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.ma-lib-group h3 {
  display:flex; align-items:baseline; gap:8px;
  margin:0 0 4px; font-size:15px; color:var(--dsw-alias-label-primary);
}
.ma-lib-count {
  font-size:11px; color:var(--dsw-alias-label-secondary);
  border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:0 7px;
}
.ma-lib-blurb { margin:0 0 10px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.ma-lib-row {
  border:1px solid var(--dsw-alias-border-l1); border-radius:10px;
  background:var(--dsw-alias-bg-layer-1); padding:10px 12px; margin-bottom:8px;
  cursor:pointer; transition:border-color .15s ease, box-shadow .15s ease;
}
.ma-lib-row:hover { border-color:var(--dsw-alias-brand-primary); }
.ma-lib-row.ma-fn-target {
  border-color:var(--dsw-alias-brand-primary);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);
}
.ma-lib-line { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
.ma-lib-name { font-family:ui-monospace, Consolas, monospace; font-size:13px; color:var(--dsw-alias-brand-primary); }
.ma-lib-sig { font-family:ui-monospace, Consolas, monospace; font-size:12px; color:var(--dsw-alias-label-secondary); }
.ma-lib-sum { margin:4px 0 0; font-size:13px; color:var(--dsw-alias-label-secondary); }
.ma-lib-doc {
  margin:8px 0 0; padding:10px; border-radius:8px; white-space:pre-wrap;
  background:var(--dsw-alias-bg-layer-2); font-size:12px; line-height:1.7;
  color:var(--dsw-alias-label-secondary);
}
.ma-points { margin:0 0 16px; padding:0; list-style:none; display:grid; gap:8px; }
.ma-points li {
  position:relative; padding-left:18px;
  font-size:14px; line-height:1.8; color:rgba(231,233,236,.62);
}
.ma-points li::before {
  content:"; position:absolute; left:2px; top:.72em;
  width:5px; height:5px; border-radius:50%; background:#4fb3a3; opacity:.7;
}
.ma-doc { max-width:760px; margin:0 auto; }
.ma-sec { padding-bottom:30px; margin-bottom:30px; border-bottom:1px solid rgba(255,255,255,.06); scroll-margin-top:20px; }
.ma-sec:last-of-type { border-bottom:0; }
.ma-sec-head { display:flex; align-items:baseline; gap:10px; margin:0 0 10px; }
.ma-sec-head h2 { margin:0; font-size:20px; font-weight:600; color:#eef0f2; }
.ma-sec-num { font-size:11px; letter-spacing:.12em; color:rgba(79,179,163,.85); }
.ma-sec p { font-size:14px; line-height:1.95; color:rgba(231,233,236,.64); margin:0 0 13px; }
.ma-doc-eyebrow { margin:0 0 14px; font-size:11px; letter-spacing:.22em; color:#4fb3a3; }
.ma-doc-title {
  margin:0 0 12px; font-size:clamp(26px,3.2vw,36px); font-weight:600;
  line-height:1.28; letter-spacing:.01em; color:#f2f4f6;
}
.ma-doc-lead {
  margin:0 0 28px; max-width:640px;
  font-size:15px; line-height:1.9; color:rgba(231,233,236,.62);
}
.ma-formula {
  margin:0 0 30px; padding:18px 22px;
  border-left:2px solid #4fb3a3; border-radius:0 10px 10px 0;
  background:rgba(255,255,255,.03);
  font-family:ui-monospace,Consolas,monospace; font-size:14px; line-height:2; color:#d7dadd;
}
.ma-formula-kw { display:inline-block; width:92px; color:#4fb3a3; }
.ma-formula-indent { padding-left:92px; }
.ma-figure { margin:0 0 34px; }
.ma-figure svg { width:100%; max-width:420px; display:block; }
.ma-doc-sections { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; }
.ma-doc-section {
  border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:16px 18px;
  background:rgba(255,255,255,.02);
  transition:border-color .2s ease, background .2s ease;
}
.ma-doc-section:hover { border-color:rgba(79,179,163,.45); background:rgba(79,179,163,.06); }
.ma-doc-num { font-size:11px; letter-spacing:.12em; color:rgba(79,179,163,.85); }
.ma-doc-section h3 { margin:6px 0 6px; font-size:15px; font-weight:600; color:#eef0f2; }
.ma-doc-section p { margin:0; font-size:13px; line-height:1.7; color:rgba(231,233,236,.55); }
.ma-doc-note { margin:28px 0 0; font-size:12px; color:rgba(231,233,236,.3); }
@media (prefers-reduced-motion: reduce) {
  .ma-node[data-active="true"] .ma-node-halo { animation:none; opacity:.3; }
  .ma-dark, .ma-dark-bar, .ma-dark-body, .ma-dark-closing { animation:none; }
}
`

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'math-atelier',
              order: 20,
              label: () => '数学工坊',
            },
            Icon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'math-atelier' }, Panel),
        )
      },
    }
  },
})
