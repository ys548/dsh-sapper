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

## 仓库结构

本仓库**就是那个 bundle 包**（根目录即包根），`lib/` 是已构建产物，因此克隆下来即可安装：

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
├── src/                      # 源码：profile 级入口、工具包装、画板浏览器半区
└── scripts/
    ├── verify-package.mjs    # 独立校验（不需要 DSH 源码树）
    ├── check-lib.mjs         # 只查 lib 能否 import + 默认值是否安装相对路径
    ├── check-skills.mjs      # 用真实 provider 跑一遍技能发现（需要 DSH 源码树）
    └── sync-assets.mjs       # 从 DSH 源码树同步 presets/ 与 sapper/（需要 DSH 源码树）
```

## 校验

```bash
node scripts/verify-package.mjs
```

无需任何依赖，检查：`lib/` 能否 import、有没有残留装饰器语法、`Config` 默认值是否为安装相对路径、
43 条技能是否都是 `<name>/SKILL.md` 且 frontmatter `name` 与目录一致、7 条车道、预设行是否指向包内 `dsh-sapper/tool` 且不残留绝对路径。

## 重新构建（需要 DSH 源码树）

本包是 DSH `0.2.1-rc.3` 的二开产物，构建时会把 DSH 的框架包**全内联**进 `lib/`（只保留 `node:`），
所以构建必须在 DSH 源码树里做，不能只克隆本仓库：

```bash
# 1. 把本仓库放到 DSH 源码树的 packages/bundle/dsh-sapper/
# 2. 同步随包资产（预设与技能的唯一来源仍是 packages/bundle/web-app/presets）
SAPPER_SOURCE=/path/to/sapper-v2-18 node packages/bundle/dsh-sapper/scripts/sync-assets.mjs
# 3. 构建 + 类型检查（在 DSH 源码树根目录）
pnpm --filter=dsh-sapper exec tsdown
pnpm exec tsc -b packages/bundle/dsh-sapper/tsconfig.json
```

`presets/` 与 `sapper/` 是生成物，不要在包里手改（改了会被下一次 `sync-assets` 覆盖）。

## 重建后回归验证清单

`lib/` 里的行为补丁以三处为单位同步：**源码**（本仓库 `src/` 是 client 主源；fork 树
`deepseek-harness/packages/client/ui-sapper-board/` 持有 host 路由与 client 镜像）→
**产物**（`lib/client.js`、`lib/index.js`）→ **安装副本**（`~/.dsh/profiles/desktop/node_modules/dsh-sapper/`，
GUI 实际加载这里）。本机没有 DSH 源码树、跑不了 tsdown 时，改动靠手工三写；
重建会按源码重新生成产物，之后必须逐条核对下表——任何一条不对，就是对应源码改动没进构建：

| # | 行为 | 怎么验 | 源码位置 |
|---|------|--------|----------|
| 1 | 目标下拉向左展开，右侧不被裁掉 | 打开漏洞报告面板，点开右上角「全部目标」 | `VulnLibrary.tsx` TargetSwitch 菜单 `right: 0` |
| 2 | 重开面板秒显上次内容（不闪「正在读取事实图…」） | 切走再切回漏洞报告面板 | `useSapperGraph.ts` 模块级缓存（stale-while-revalidate） |
| 3 | 面板记住上次选的目标 | 选一个目标 → 切走 → 回来仍停在它 | `VulnLibrary.tsx` `TARGET_KEY`（localStorage） |
| 4 | 工具栏按钮悬停高亮 | 悬停文件夹/箭头/「全部目标」/搜索框 | `VulnLibrary.tsx` `HOVER_CSS` |
| 5 | 报告跨 engagement 并集 | 默认「全部目标」直接列出所有项目的报告（含 `pentest-dsh/reports`） | fork `ui-sapper-board/src/index.ts` `reportsForStore` + 路由并集 |
| 6 | 工具栏搜索框即时过滤 | 输入关键字，列表与计数同步变化 | `VulnLibrary.tsx` 工具栏 input（`query`） |
| 7 | 页面隐藏时停止轮询，回来立即刷新一次 | 切到别的窗口，Network 面板无 4s 周期请求；切回立即出现一次请求 | `useSapperGraph.ts` `visibilitychange` |
| 8 | 目标下拉键盘可用 | 聚焦后 ↑↓ 移动高亮、Enter 选择、Esc 关闭 | `VulnLibrary.tsx` TargetSwitch `onKeyDown` |

验证命令：`node scripts/check-lib.mjs && node scripts/verify-package.mjs`（无需依赖）。

### 预设改动的同步链（2026-11-10 起）

`presets/` 由 `sync-assets` 从 fork 树 `packages/bundle/web-app/presets/` 生成。2026-11-10 的两处改动
（`sapper.patch.yml` 三档输出风格、`pentest-01-tools/SKILL.md` 后台启动器说明）当时只落在安装副本里，
现已拉回本仓库并回写 fork 源头。**之后改预设文案，直接改 fork 源头**，再 `sync-assets` + 重建 + 同步安装副本；
不要再直接改安装副本（会再次分叉）。

### sapper CLI 与 sapper_init 的同步链（2026-11-19 起）

`sapper init` 对已存在图的语义按图状态分流，全程**归档，绝不删除**，并修复了 Windows
junction/symlink 上的 traceback；`sapper_init` 工具新增 `force` 参数。行为：

- 旧图 **active**（或 project.json 不可读）→ 不报错：打印摘要与指引后 exit 0（继续用
  `sapper board`，或 `--force` 归档旧图开新交战）
- 旧图 **completed** → 无需 force，自动归档为 `*.archived-<时间戳>`（同秒冲突加 `-2` 后缀）后建新图
- junction/symlink → 只替换链接本身，目标 store 原样；dangling 链接视同无图直接重建
- 归档 rename 失败（有会话持 `.lock`）转清晰报错

两条同步链，共五处副本：

| 层 | 源头（canonical） | 副本 |
|---|---|---|
| Python CLI | `sapper-v2-18-champion/lib/sapper.py`（`_is_linklike`/`_read_project` + `cmd_init` 分流归档） | 本仓库 `sapper/lib/sapper.py`、安装副本 `sapper/lib/sapper.py`、fork 树 `packages/bundle/dsh-sapper/sapper/lib/sapper.py` |
| 工具 schema | fork 树 `packages/todo/tool-sapper/src/index.ts`（`sapper_init` 的 `force` 参数与描述） | 本仓库 `lib/tool.js` 与安装副本 `lib/tool.js`（同块手工镜像，含 execute 的 `--force` 注入） |

回归验证（临时目录冒烟，无需 GUI）：active 图重复 `init` → exit 0 指引；completed 图重复 `init`
→ 自动归档 + 新图；`init --force`（含同一秒两次）→ 归档带去重后缀；指向 active store 的 junction
无 force 为 no-op、带 force 后根路径变真实目录且目标完好；dangling junction 直接重建。

fork 源码树整体镜像在同一远程的 **`source-tree` 分支**（与本仓库 master 是两条无关历史，各自独立演进，
勿互相覆盖）；本机没有源码树时，可从该分支取回 host 路由与 client 源头。

## 已知限制

- **桌面端（DSH 应用）与浏览器里的 Web GUI 都正常**：两者都跑 `web-app` bundle，`sapper` / `sapper-worker` 预设照常加载。
- 只有 **`dsh headless`（一次性 CLI 模式）** 不加载 sapper：headless bundle 不组合预设名单，agent 直接按 profile 行组合，预设不会 mount。需要脚本驱动时走 Web 端（会话 + 工具调用），或用 `sapper_cli` 直接操作 `.sapper` 事实图。
- 画板与工具都依赖工作区里有 `.sapper/`；没有图时画板显示空态。
- 包内 CLI 只是运行集，不含上游的 `docker/`、`skill/`、`templates/`、`peers/` 等旁路能力。
