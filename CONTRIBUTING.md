# 参与贡献

这个项目分四块，任何一块都欢迎：

| 方向 | 需要做的事 | 主要文件 |
|---|---|---|
| 数学内容 | 写专题、补公式、把直觉讲清楚 | `plugin/math-atelier/client.js` 里的 `*_PAGES` |
| 引擎 | 算法实现、数值稳定性、性能 | `plugin/math-atelier/app/engine/*.py` |
| 前端 | 面板 UI、可视化、交互 | `plugin/math-atelier/client.js` 的渲染部分 |
| 插件 / 基建 | DSH 适配、CI、发布、文档 | `plugin/math-atelier/index.js`、`.github/` |

## 开发环境

```powershell
cd plugin/math-atelier
pip install -r requirements.txt
python -m app.server          # 引擎：http://127.0.0.1:8899
```

装插件需要 [DeepSeek Harness](https://github.com/deepseek-ai)；插件会自己拉起引擎，不用手动起服务。

## 提交前检查

```powershell
cd plugin/math-atelier
python -m unittest discover -s tests -p "test_*.py"
node --check client.js
node --check index.js
```

三条都过再提 PR。CI 也会跑这三条。

## 写数学函数

1. 放在 `app/engine/` 对应模块里，**第一行 docstring** 会成为数学库里的简介
2. 参数尽量用基本类型（`float`、`list[float]`、`str`），返回值用 `dict`
3. 失败时抛 `ValueError`，`api.py` 会统一转成 4xx
4. 在 `tests/test_engine.py` 补一个用例，覆盖正常路径 + 一个边界

## 写专题内容

专题是纯数据，不需要写组件：

```js
const MY_PAGES = [
  {
    id: 'intro',
    num: '00',
    label: '概览',
    title: '一句话讲清楚这一页在干什么',
    lead: '两三句话的导语，给直觉。',
    formulas: [['名字', '公式']],
    bullets: ['要点一', '要点二'],
    note: '可选：底部小字',
  },
]
```

需要交互演示时，在条目里加 `extensions`，写一个组件，返回 `h('div', ...)`（项目里不用 JSX）。

## 风格约定

- 中文文案，术语保留英文原词（如 PBD、XPBD、AO）
- 代码里不写行内注释解释显而易见的事；关键处的「为什么」要写
- 新增依赖前先开 issue 讨论
- 提交信息用一句话说清改了什么，例如 `phase: 加鞍点分类测试`

## 分支与合并

- 从 `main` 拉分支：`feat/…`、`fix/…`、`docs/…`
- 一个 PR 只做一件事
- 至少一位维护者 review 后合并
- CI 不过不合并

## 大改动怎么走

按改动规模分档，别一上来就提一个大 PR：

| 规模 | 流程 |
|---|---|
| 文案、测试、小 bug | 直接提 PR |
| 新函数、新专题、新演示 | 先开 issue 说明要加什么，再提 PR |
| 动架构（拆模块、换算法、改接口） | 先写 design note（issue 里 300 字：现状、方案、影响面），维护者同意再动手 |
| 重构 + 功能 | 拆成两个 PR：先重构（行为不变、测试全过），再功能 |

### 硬性要求

1. **单 PR 超过约 400 行**：在描述里给阅读顺序，或者拆开
2. **改行为不变的重构**：必须先有测试覆盖，PR 说明「测试没改、全部通过」
3. **改接口或数据结构**：在 PR 里列出受影响的调用方
4. **不允许自我合并**：提交者不能批准自己的 PR

### 为什么这么严

插件里 `client.js` 是单文件、引擎的输出直接影响面板显示，改一处很容易牵动别处。大 PR 一旦合进去出问题，回滚的代价比拆分大得多。

