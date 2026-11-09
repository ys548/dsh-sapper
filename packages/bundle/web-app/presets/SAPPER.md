# sapper — 蜂群式授权渗透协同（DSH 二开）

本仓库是 **DeepSeek Harness `0.2.1-rc.3` 源码的二开分支**，在保留原产品全部能力的基础上，
新增一整套「事实图驱动的授权渗透协同」：

- 上游方案：sapper v2（攻防比赛方案）的指挥官 / 车道 / 事实图协作模型
- 产品形态：长亭蜂群（DSH 二开）的「指挥官 + 画板 + 多角色智能体」交互
- 两条外部经验：**Supervisor 独立审计**、**复用成熟 Agent 而不是自造全套**

一句话：指挥官只决策与派单，车道执行并落图，审计独立判定，报告只收过审成果。

---

## 一、目录一览

| 路径 | 作用 |
| --- | --- |
| `packages/todo/tool-sapper/` | 宿主插件：20 个 `sapper_*` 工具 + `sapper_drive` 自动循环（`src/index.ts`、`src/drive.ts`） |
| `packages/client/ui-sapper-board/` | 协作画板：宿主侧 `/api/sapper/graph`，客户端侧泳道画布与详情面板 |
| `packages/bundle/web-app/presets/sapper.patch.yml` | 指挥官预设（`id: sapper`，order 30） |
| `packages/bundle/web-app/presets/sapper-worker.patch.yml` | 执行者预设（`id: sapper-worker`，order 31，无派单能力） |
| `packages/bundle/web-app/presets/sapper-skills/` | 43 条技能（攻击面方法论 / 扩展域 / 情报源 / 报告 / 元技能） |
| `packages/bundle/web-app/presets/sapper-lanes/` | 7 条车道规格（recon / web / authz / rce / intranet / verify / auditor） |
| `packages/bundle/web-app/presets/SAPPER-SKILLS-SPEC.md` | 技能库目录规范、命名规则、编号迁移表、新增检查单 |
| `packages/experimental/agent-team/` | 为 `spawn_teammate` 增加 `agentPreset`，队友可按预设创建 |

## 二、启动（本机已验证）

```powershell
# 1) 构建（9 个门禁）
pnpm run build

# 2) 使用隔离的 DSH_HOME，避免与已安装的 DSH 串写
$env:DSH_HOME = 'D:\demo\dsh-fork\.home'

# 3) 启动 Web 界面（token 启动时打印）
node apps\cli\lib\bin.js web --port 63999 --no-open
```

隔离 home 需要三样东西：`profiles/web/`（profile 与 bundle 列表）、`.credentials.yaml`、`.anonymous-user-id`。
`storages/workspace.json` 里预置工作区即可直接打开目标目录。

## 三、20 个工具

| 分组 | 工具 |
| --- | --- |
| 起手 / 读图 | `sapper_init` `sapper_board` `sapper_frontier` `sapper_show` `sapper_recall` |
| 落图 | `sapper_fact` `sapper_intent` `sapper_doc` `sapper_hint` |
| 认领与收工 | `sapper_claim` `sapper_release` `sapper_done` `sapper_complete` `sapper_confirm` |
| 质量 | `sapper_validate` `sapper_flag` |
| 知识 | `sapper_kb` |
| 交付 | `sapper_report`（含 Supervisor 硬门禁） |
| 自动驱动 | `sapper_drive` |
| 逃生口 | `sapper_cli`（直接调 Python CLI 的其余子命令） |

底层是 sapper 的 Python CLI（`sapperRoot` 可配），已做 Windows 兼容补丁（`msvcrt` 替代 `fcntl`）。

## 四、自动循环 `sapper_drive`

```
reason → explore → verify → audit        （每轮四步，可跑 N 轮）
```

- **reason**：作战参谋读图，判断目标是否达成、提下一步意图（去重、单轮上限 8 条）
- **explore**：派工到空闲意图，执行者动手并交卷（`done` → 新事实）
- **verify**：对新的 `vuln` 结论做独立复核，结论由驱动者统一落图（`复核：…`）
- **audit**：对「复核通过且未审计」的结论做交付审计，结论落图（`审计：…`）

参数：`rounds` / `minutes` / `maxIntentsPerRound`（只限派发，不限建意图）/ `agentPreset` / `dryRun` / `cwd`。
`dryRun: true` 会完整走完 LLM 与读图，但不写图 —— 适合验证人格与工具链。

## 五、Supervisor 三道门

| 门 | 谁做 | 判什么 | 落图 |
| --- | --- | --- | --- |
| 复核 | `lane-verify` | 漏洞是不是真的（重放同一请求，不换 payload） | `复核：<名>` note，`verdict=verified/refuted/insufficient` |
| 审计 | `lane-auditor` | 能不能交给甲方（证据可复现 / 危害有实据 / 定级有依据 / 报告口径齐 / 撤场干净） | `审计：<名>` note，`verdict=pass/reject` + `level` + `missing` |
| 报告门禁 | `sapper_report` | 只有 `pass` 的 `vuln` 才生成交付文件 | 被打回与未审计进总报告「待补证」一节 |

两道关都不许由产出结论的车道自己做；`includeUnaudited: true` 只用于写草稿。

## 六、技能库与车道

43 条技能 = 25 条 `pentest-*`（`pentest-00` 总纲 + 24 条攻击面）+ 7 条 `ext-*` 扩展域
+ 5 条情报源（`fofa-api` / `quake` / `hunter-qianxin` / `xiaolanben` / `infogather`）
+ `report-00-report` + 5 条元技能（`sapper-reason` / `sapper-explore` / `sapper-thinking` / `sapper-scoring` / `sapper-setup`）。

7 条车道共 46 次技能绑定；`ext-04/05/06`（应急响应 / 攻防演练 / CTF）是场景型，按客户类型临时加载。

技能只扫目录一层（`<dir>/SKILL.md` 或根下 `<name>.md`），深层 `refs/` 不会被注册；
目录描述常驻开销约 1.9K tokens，正文按需加载。规范细节见 `SAPPER-SKILLS-SPEC.md`。

## 七、两套人设

- 指挥官：授权铁律 → 技能总表 → 速胜表留痕 → 调度循环 → 派单纪律（必带 `agentPreset`）→ 写报告 → 攻击面穷尽闸 → 审计两道关
- 执行者：只做被派的事，一次一条意图，判据优先于手感，阴性也是结论，见好就收

派单必须显式带预设，否则队友继承指挥官人格而「拒绝亲自动手」：

```
spawn_teammate(name, task, agentPreset: "sapper-worker")
```

## 八、环境依赖

| 依赖 | 说明 |
| --- | --- |
| Python 3 | 默认 `D:\Compiler\python3\python.exe`（工具配置 `pythonPath`） |
| `python-docx` | 报告 `md2docx.py` 输出 Word（本机 1.2.0） |
| nmap / nuclei / observe_ward | 侦察车道用，路径写全路径（技能里已固化） |
| FOFA / Quake / Hunter / 小蓝本 key | 情报源技能可选，未配置时相关技能会提示跳过 |
| Chrome MCP | 浏览器类技能可选依赖，需在 profile 里挂 MCP |

## 九、开发脚本（仓库外，位于 `D:\demo\dsh-fork\`）

| 脚本 | 用途 |
| --- | --- |
| `drive-e2e.mjs` / `drive-cap.mjs` | `sapper_drive` 桩测（假 subagents，验证四步流程、去重、意图上限） |
| `report-gate.mjs` | 报告门禁端到端测试（真 CLI + 真工具代码） |
| `verify-skills.mjs` / `verify-normalized.mjs` | 技能发现与命名校验（真实 `FileSystemSkillProvider`） |
| `check-refs.mjs` / `check-coverage.mjs` | 技能引用是否存在、车道绑定覆盖率 |
| `gen-spec.mjs` | 生成 `SAPPER-SKILLS-SPEC.md` |
| `inject-persona.mjs` | 把人设 Markdown 注入两套 preset |
| `skill-normalize.mjs` | 技能库改名 / 合并 / 全局引用重写 |

## 十、已知限制

- 真实模型下的端到端验收尚未完成（桩测已覆盖除 LLM 外的全链路）；`dsh headless` **不能**跑 sapper，因为 headless bundle 不组预设栈，验收必须走 Web 端。
- 尚未打包成可安装 bundle，只能以本仓库源码 + 隔离 `DSH_HOME` 运行。
- 战果库 `D:\demo\Usual\.sapper` 里 `f010` 是一条脏数据（`i001.to` 指向它，只能改内容不能删）。
- 报告模板里若涉及截图取证，需要自备截图脚本（原先依赖 CDP 的脚本未随包搬运）。
