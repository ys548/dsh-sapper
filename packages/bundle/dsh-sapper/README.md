# dsh-sapper

把 [sapper](https://github.com/) 的蜂群式授权渗透协同能力打包成 **一个可安装的 DSH bundle**：
装进任意 stock DSH（`0.2.1-rc.3`+）即可获得 20 个 `sapper_*` 工具、两块协作画板、
两套智能体预设（指挥官 / 执行者）、50 条技能与 7 条车道规格。

包内自带全部业务代码（Node 侧只 import `node:` 内建模块），不依赖 DSH 源码树里的任何
`@deepseek-ai/*` 工作区包，因此可以从一个普通目录直接安装。

## 安装

在 DSH 会话里（或 Web GUI 的插件面板）：

```text
plugin_manager({ action: "install_bundle", target: "D:/path/to/dsh-sapper" })
```

或使用 CLI：

```bash
dsh plugin --profile web add file:/path/to/dsh-sapper
```

安装后在 GUI 的预设下拉里会出现 `sapper`（指挥官）与 `sapper-worker`（执行者）两个预设，
侧边栏出现「协作画板」。

## 装好之后

| 能力 | 位置 |
| --- | --- |
| 20 个工具 | `sapper_board` / `sapper_init` / `sapper_fact` / `sapper_intent` / `sapper_frontier` / `sapper_claim` / `sapper_release` / `sapper_done` / `sapper_complete` / `sapper_confirm` / `sapper_doc` / `sapper_show` / `sapper_recall` / `sapper_validate` / `sapper_hint` / `sapper_kb` / `sapper_flag` / `sapper_report` / `sapper_cli` / `sapper_drive` |
| 事实图 | 工作区下的 `.sapper/`（`sapper_init` 创建） |
| 协作画板 | 侧边栏「协作画板」，路由 `GET /api/sapper/graph` |
| 技能 | 50 条（43 技能 + 7 车道），由 bundle 的 profile 级 provider 注入，路径随包解析 |
| 预设 | `sapper`（指挥官，含 `sapper_drive` 四步循环）/ `sapper-worker`（执行者，不能派单） |

`sapper_drive` 的循环是 `reason → explore → verify → audit`：reason 决定下一步，
explore 在真实目标上执行并交卷，verify 复核真伪，audit 过 Supervisor 五关；
`sapper_report` 只给审计 `pass` 的漏洞生成交付文件，其余进总报告「待补证」一节。

## 环境要求

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `SAPPER_PYTHON` | 跑 `sapper` CLI 的 Python 可执行文件 | `python` |
| `SAPPER_ROOT` | `sapper` CLI 源码根（需含 `lib/sapper.py`） | 包内 `sapper/` |

包内 `sapper/` 是 CLI 的最小运行集（`lib/*.py` + 模板），跨平台锁已打过 `msvcrt` 兼容补丁。
Windows 上若 `python` 不在 PATH，请设 `SAPPER_PYTHON`，例如：

```text
SAPPER_PYTHON=D:\Compiler\python3\python.exe
```

技能里的 Chrome MCP 截屏流程需要 profile 自己配置 `chrome-devtools-mcp`；
FOFA / Quake / Hunter / 小蓝本 四条情报源技能需要各自的 API key（未配置时技能会提示跳过）。

## 包结构

```text
dsh-sapper/
├── cordis.patch.yml          # profile 级：画板路由 + 技能 provider
├── presets/
│   ├── sapper.patch.yml      # 指挥官预设（id: sapper）
│   ├── sapper-worker.patch.yml
│   ├── sapper-skills/        # 43 条技能（pentest-* / ext-* / report-* / sapper-* / 情报源）
│   └── sapper-lanes/         # 7 条车道规格
├── sapper/                   # 内置 sapper CLI（python）
├── lib/                      # 构建产物：index.js / tool.js / client.js
└── scripts/sync-assets.mjs   # 从仓库源码同步 presets/ 与 sapper/（开发用）
```

## 开发

```bash
# 从 packages/bundle/web-app 与 client 源码重新同步随包资产
node packages/bundle/dsh-sapper/scripts/sync-assets.mjs

# 构建（Node 半区全内联 + 浏览器半区）
pnpm --filter=dsh-sapper exec tsdown

# 类型检查
pnpm exec tsc -b packages/bundle/dsh-sapper/tsconfig.json
```

改动 `web-app/presets/sapper*.patch.yml` 或技能库之后，务必先跑 `sync-assets.mjs`，
否则包内副本会落后于源码；`presets/` 与 `sapper/` 是生成物，不要手改。

## 已知限制

- 只能在 **Web** 端跑：headless bundle 不组合任何预设名单，`dsh headless` 无法加载 sapper。
- 画板与工具都依赖工作区里有 `.sapper/`；没有图时画板显示空态。
- 包内 CLI 只是运行集，不含上游的 `docker/`、`skill/`、`templates/`、`peers/` 等旁路能力。
