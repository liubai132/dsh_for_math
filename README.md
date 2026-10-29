# 数学工坊 · Math Atelier

一个跑在 **DeepSeek Harness（DSH）** 面板里的数学科普 / 数学研究插件。

面板首页是一圈「风铃环」，节点挂着不同的数学专题；点进去是深色的专题页，左边环形目录、右边正文。每个专题都可以挂可交互的「拓展」——插值轨迹、CG 变形、PBD 布料、相图……

计算全部交给插件自带的 Python 引擎（FastAPI + SymPy + mpmath），插件启动时会自动把它拉起来。

## 功能

| 专题 | 内容 |
|---|---|
| 凸优化 | 凸集、凸函数、问题形式、对偶、KKT、算法；拓展：插值轨迹、衣服轮廓变形、PBD 百褶裙 |
| 数值分析 | 概览、常微分方程、稳定性；拓展：相图（向量场 / 轨线 / 平衡点分类） |

数学库里有 100+ 个函数（符号计算、数论、常数、插值、折叠几何、相图），文档里的函数标签点一下就能跳过去。

## 安装

前置：[DSH](https://github.com/deepseek-ai) + Python 3.10+。

```powershell
# 1. 克隆到本地
git clone https://github.com/<你的用户名>/math-atelier.git

# 2. 装依赖（引擎随插件打包，只需一次）
pip install -r math-atelier/plugin/math-atelier/requirements.txt

# 3. 在 DSH 里安装插件，指向这个目录
plugin_manager install_bundle  →  <克隆路径>\plugin\math-atelier
```

重启 DSH 后，侧边栏出现「数学工坊」图标，点开就是首页。

插件启动时会尝试 `python -m app.server`（端口 8899）；已有健康的引擎就复用，不会重复拉起。

## 目录结构

```
math-atelier/
├─ plugin/math-atelier/
│  ├─ index.js           宿主半边：代理 /plugin/math-atelier → 引擎
│  ├─ client.js          面板 UI：风铃环、专题页、拓展演示
│  ├─ cordis.patch.yml   把面板挂进 DSH
│  ├─ app/               数学引擎（随插件打包）
│  │  ├─ api.py          全部 HTTP 路由
│  │  ├─ server.py       启动入口
│  │  └─ engine/         cas / numbers / interp / fold / phase / catalog …
│  ├─ tests/             55 个 unittest
│  └─ requirements.txt
├─ docs/                 设计与数学说明
└─ CONTRIBUTING.md
```

## 开发

```powershell
cd plugin/math-atelier
pip install -r requirements.txt

# 只跑引擎（带热重载，改完刷新面板即可）
python -m app.server

# 测试
python -m unittest discover -s tests -p "test_*.py"

# 前端语法检查
node --check client.js
node --check index.js
```

### 加一个专题

1. 在 `client.js` 里加一份 `PAGES` 数据（`id / num / label / title / lead / formulas / bullets`）
2. 挂到 `RING_NODES` 的某个节点
3. 需要交互就在 `extensions` 里加一个组件

### 加一个数学函数

1. 在 `app/engine/` 写函数，第一行 docstring 会成为数学库里的简介
2. 注册到 `catalog.py` 的 `MODULES`
3. 需要 HTTP 就在 `api.py` 加路由，并在 `tests/` 补用例

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 协作

见 [CONTRIBUTING.md](CONTRIBUTING.md)。四个方向：数学内容、引擎、前端、插件基建。

提交前跑一遍测试与语法检查，PR 里写清楚「改了什么、为什么、怎么验证」。

## 路线图

- [ ] 数值分析：数值积分、线性方程组、特征值
- [ ] 凸优化：对偶与 KKT 的交互示例
- [ ] 布料：阴影与自碰撞
- [ ] 把 `client.js` 拆成模块，布料独立成包
- [ ] 每个专题配一个可操作的演示

## 许可

MIT，见 [LICENSE](LICENSE)。
