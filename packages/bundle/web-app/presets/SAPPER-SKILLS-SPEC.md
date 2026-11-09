# sapper 技能库与车道规格规范

> 本文件是 sapper 预设内置技能库（`presets/sapper-skills/`）与车道规格（`presets/sapper-lanes/`）的**唯一权威目录规范**。
> 新增、改名、合并、删除技能时必须同步更新本文件；改完必须跑 `D:\demo\dsh-fork\verify-normalized.mjs` 与 `verify-skills.mjs`。

## 一、总览

| 项 | 值 |
|---|---|
| 技能总数 | **43** 条（目录形态 43 个 `<name>/SKILL.md`） |
| 车道规格 | **7** 条（`lane-*.md`，同样是技能，可 `skill('lane-recon')` 加载） |
| 车道绑定 | 合计 **46** 次引用 |
| 磁盘占用 | 17.00 MB / 2111 文件 |
| 常驻开销 | 技能 6629 字符 + 车道 993 字符 ≈ 合计 **7622 字符 ≈ 1954 tokens**，每条请求都发；正文按需加载 |

分组：`pentest-*` 25 条、`ext-*` 7 条、情报源 5 条、报告 1 条、sapper 元技能 5 条、`lane-*` 7 条。

## 二、目录结构

```
presets/
├── sapper.patch.yml          # 指挥官预设（persona 内嵌）
├── sapper-worker.patch.yml   # 执行者预设
├── sapper-skills/            # 技能库（customSkillDirs 挂载点 1）
│   ├── pentest-00-orchestration/SKILL.md   ... pentest-24-c2-egress/      # 25 条：攻击面方法论
│   ├── ext-00-binary-analysis/             ... ext-06-ctf-solver/        # 7 条：扩展域（带 refs/ 参考资料）
│   ├── fofa-api/ quake/ hunter-qianxin/ xiaolanben/ infogather/          # 5 条：情报源（带脚本）
│   ├── report-00-report/                   # 1 条：报告写法 + 模板 + md2docx.py
│   └── sapper-reason/ sapper-explore/ sapper-thinking/ sapper-scoring/ sapper-setup/   # 5 条：sapper 元技能
└── sapper-lanes/             # 车道规格（customSkillDirs 挂载点 2）
    └── lane-recon.md lane-web.md lane-authz.md lane-rce.md lane-intranet.md lane-verify.md lane-auditor.md
```

**统一形态**：一条技能 = 一个目录 + 一个 `SKILL.md`（附带的脚本、模板、参考资料放同目录子目录）。不再使用「根目录平铺 `<name>.md`」形态，两种形态混用会让编号与挂载变得不可预测。

## 三、命名规范

| 前缀 | 规则 | 示例 | 编号含义 |
|---|---|---|---|
| `pentest-NN-<slug>` | 两位十进制，`NN` 从 00 连续到 24 | `pentest-07-injection` | 按**攻击面**排序：00 总纲 → 01 工具 → 02 速胜表 → 03-05 侦察/资产/信息泄露 → 06-18 Web 与协议族 → 19-24 打点/后渗透 |
| `ext-NN-<slug>` | 两位十进制，00-06 | `ext-01-code-audit` | 按**领域**排序：二进制/代码审计/免杀/云/应急/攻防/CTF，按需加载 |
| `fofa-api` `quake` `hunter-qianxin` `xiaolanben` `infogather` | **保持原名，不加前缀** | `quake` | 见下「情报源例外」 |
| `report-NN-<slug>` | 只有 `report-00-report` | — | 报告正文写法与模板 |
| `sapper-<verb/noun>` | 指挥官/执行者的元技能 | `sapper-reason` | reason 决策、explore 执行、thinking 思考工具、scoring 定级、setup 开工 |
| `lane-<lane>` | 必须与 `presets/sapper-lanes/lane-<lane>.md` 的 `name` 一致 | `lane-web` | 七条车道 |

**硬规则**
1. **frontmatter `name` 必须等于目录名**，否则 `skill('<name>')` 找不到；改名时两处一起改（`verify-normalized.mjs` 会校验）。
2. 编号连续、不撞号、不用十六进制（旧的 `2a/2b/2c/2d` 与 `pentest-20-*` 撞号已修正）。
3. `slug` 用**小写英文 + 连字符**，不写中文、不写空格、不超过 32 字符（会出现在路径与 `skill()` 参数里）。
4. 一个技能只讲一个面。要把两条相关技能合并，先确认真有 ≥30% 内容重复；合并后必须全局重写引用（见第七节）。

**情报源例外（为什么不改名）**：`quake` 同时是 URL 主机名（`https://quake.360.net/...`）与 API 路径片段；`infogather` 是 Python 兄弟目录名，`quake/quake_export.py:27` 有 `sys.path.insert(0, os.path.join(os.path.dirname(SKILL_DIR), "infogather"))`，`:255` 拼 `infogather_report.py`。加 `intel-` 前缀会同时打断 URL、脚本 import 与 `<技能目录>/infogather/...` 相对路径。**这是唯一允许的例外，新增情报源沿用平台原名。**

## 四、SKILL.md 规范

```yaml
---
name: pentest-07-injection          # 必填，必须 == 目录名
description: ……                      # 必填，会常驻上下文，≤120 字符最佳
---
```

**description 写法**（它是唯一常驻的部分，写不好等于白写）：
- 一句话说清「是什么 + 什么时候该加载」，前 60 字符要能独立看懂。
- 用触发词而不是标题词：写「SQL/NoSQL/命令注入/SSTI 的判据与变异」而不是「注入技能说明」。
- 不超过 120 字符。当前最长的是扩展域几条（84-105），全库平均 75 字符。
- 不写本机绝对路径（路径写在正文的「工具」一节，技能要可移植）。

**正文结构**（方法论类技能统一七段，车道规格另有规定）：
1. 一句话定位（这条技能解决什么问题）
2. 前置条件 / 适用面
3. 方法论要点（怎么想、按什么顺序做）
4. 命令与载荷速查（可复制，标出本机路径与限速）
5. **判据**：阳性长什么样、阴性怎么销项（阴性也必须写清「用了什么通道、打了几个样本」）
6. 证据要求（什么算证据、什么不算）
7. 红线与禁止项

**其他约定**
- 编码：UTF-8。CRLF/LF 均可（`parseFrontmatter` 会剥 `\r`），但**新写文件用 LF**。
- 不写密钥。需要 API key 一律写 `os.environ.get("FOFA_API_KEY")` 之类，缺失时提示跳过而不是硬编码。
- 引用其他技能时只写名字（`pentest-05-info-leak-config`），不要写路径。
- 临时/废弃内容不要留在技能目录里：技能发现**只跳过** `skill file ... ignored` 的解析失败，**不会跳过** `_retired_*` 这类目录（它会被当成正常技能注册）。废弃就删。

## 五、加载机制（为什么这样组织）

| 机制 | 行为 | 对本库的含义 |
|---|---|---|
| 挂载 | 预设 `skill-filesystem` 的 `customSkillDirs` 指两个绝对目录：`sapper-skills`、`sapper-lanes` | 加技能只需放目录，不必改代码 |
| 扫描深度 | **只扫根目录一层**：根下目录取 `<dir>/SKILL.md`；根下 `.md` 文件直接当技能；更深层的 `SKILL.md` **不注册** | `ext-*/refs/` 里那 85 个深层 SKILL.md 不会污染技能目录 |
| 渐进加载 | 目录里只有 name+description 常驻；正文由 `skill('<name>')` 按需拉取 | 16.98 MB 只花 1700 tokens 常驻 |
| 校验 | 缺 frontmatter / name / description、YAML 非法 → 该条**静默跳过**并打 `warning` | 改技能后必须看日志有没有 `skill file ... ignored` |

**验证命令**（改完技能必跑）：
```powershell
$node = 'E:\AI\deepseekharness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
& $node D:\demo\dsh-fork\verify-normalized.mjs    # name==dir、旧名残留、常驻开销
& $node D:\demo\dsh-fork\verify-skills.mjs        # 真 · FileSystemSkillProvider 发现流程
```
通过标准：`discovered: 50`、`warnings: 0`、`name!=dir: none`、`leftover old names: 0`。

## 六、全量清单

### 6.1 攻击面方法论（25 条）

| 技能 | SKILL.md | 附带 | description（截断） |
|---|---|---|---|
| `pentest-00-orchestration` | 7412 B | 1 文件 | 总纲与红线:授权铁律、OPSEC、条目路由表、子任务编排纪律与四文件状态管理(scope/memory/ideas/at… |
| `pentest-01-tools` | 8975 B | 1 文件 | 本机渗透工具绝对路径、调用示例、限速参数与未装工具降级映射(2026-09 逐条实测校准)。调用任何扫描/利用/字典类工… |
| `pentest-02-quick-win` | 25216 B | 1 文件 | 速胜表:开局高价值模式速查,89 行四列(认什么/打哪/出什么算成/假点)——对象存储 STS/签名/桶策略、密文 ID… |
| `pentest-03-recon` | 10513 B | 1 文件 | 网络侦察:存活、端口、服务指纹、漏扫、子域与资产测绘。拿到 IP/网段/域名的第一时间使用。 |
| `pentest-04-web-assets-js` | 10848 B | 1 文件 | Web 资产与 JS 逆向:应用入口发现、JS 下载与真实 API/参数提取、签名与加密参数复现。 |
| `pentest-05-info-leak-config` | 11403 B | 1 文件 | 信息泄露与配置:接口/文件/JS 泄露、未授权中间件(swagger/actuator/druid)、CORS、跳转、子… |
| `pentest-06-layer-diff` | 1240 B | 1 文件 | 多层(WAF/反代/应用消毒器/运行时)处理同一输入时的系统差分法:A层改了什么B层没改——删字符/归一化/解码/截断/… |
| `pentest-07-injection` | 14759 B | 1 文件 | 注入族:SQL/NoSQL 注入主流程与表达式/模板/命令/XPath/LDAP/Header 等注入小类,按栈选型打法… |
| `pentest-08-ssrf-xxe` | 8403 B | 1 文件 | SSRF 与 XXE:服务端发起请求(URL 预览/抓取/webhook)与 XML 外部实体全链路,内网边界变可见。 |
| `pentest-09-xss-frontend` | 12897 B | 1 文件 | XSS 与前端:存储/反射/DOM、CSP 绕过、点击劫持、CSRF、原型污染、弱比较、Ghost Bits。 |
| `pentest-10-file-path` | 10233 B | 1 文件 | 文件与路径:上传绕过链、对象存储六枪、路径穿越/LFI 与未登录可达的文件读取高点。 |
| `pentest-11-deserialization-jndi` | 12393 B | 1 文件 | 反序列化与 JNDI:Java 链(Shiro/Fastjson/Log4Shell/WebLogic)与多语言序列化面… |
| `pentest-12-authz` | 14971 B | 1 文件 | 越权与认证:IDOR、八层篡改、认证绕过族、JWT/OAuth/SAML、验证码与短信接口、账户接管。 |
| `pentest-13-business-logic` | 6025 B | 1 文件 | 业务逻辑与竞态:支付/订单/优惠券/库存、状态机跳步、Race Condition 并发窗口。 |
| `pentest-14-api-protocol` | 11267 B | 1 文件 | 接口与协议:GraphQL 内省与绕权、WebSocket、gRPC/SOAP、API 网关绕过、限流绕过与 HPP。 |
| `pentest-15-http-advanced` | 11672 B | 1 文件 | HTTP 高级攻击:请求走私(CL/TE)、HTTP/2、缓存投毒/欺骗、Host 头攻击、DNS 重绑定。 |
| `pentest-16-waf-bypass` | 7038 B | 1 文件 | WAF 绕过:WAF 分型与手法矩阵。仅当参数已有判据(回显/布尔/时间差)且正常 payload 被拦截时才使用。 |
| `pentest-17-ai-cloud-ide` | 4661 B | 1 文件 | AI 与云 IDE:对话口工具真执行、编程台 RPC、LLM 应用边界测试(不是越狱)。 |
| `pentest-18-oob` | 9843 B | 1 文件 | OOB 外回显验证与漏洞判据速查:dnslog/interactsh/反连/时间差,无回显漏洞的确认手段与误报排除。 |
| `pentest-19-external-foothold` | 8394 B | 1 文件 | 红队延伸条目:外网打点——初始访问与云攻击面(OSS/AK/SK/元数据/容器),建立第一个据点。进入内网/全链路阶段才… |
| `pentest-20-execution-privesc` | 5514 B | 1 文件 | 拿到初始执行点后加载:稳定 shell、payload 投递、Linux/Windows 提权到 root/SYSTEM… |
| `pentest-21-credentials-lateral` | 10617 B | 1 文件 | 主机上取证凭据时加载:SAM/LSASS/DPAPI/NTDS 提取、内网发现、凭据复用横移。标志性信号:立足点已稳、要… |
| `pentest-22-ad-intranet` | 16806 B | 1 文件 | 确认目标是 AD 域环境时加载:ADCS ESC1-8、Exchange、SharePoint 域攻击链。标志性信号:见… |
| `pentest-23-persistence-evasion` | 4214 B | 1 文件 | 需要长期立足或遇 AV/EDR 告警时加载:持久化机制、免杀加载器,附撤场清理。标志性信号:要保访问权或被查杀。 |
| `pentest-24-c2-egress` | 4302 B | 1 文件 | 出网受限或要建指挥通道时加载:回连、隧道、代理转发、数据受限外渗。标志性信号:直连不通/要回传数据。 |

### 6.2 扩展域（7 条）

| 技能 | SKILL.md | 附带 | description（截断） |
|---|---|---|---|
| `ext-00-binary-analysis` | 25514 B | 317 文件 | 二进制分析与恶意样本作战：样本登记与处置 SOP、脱壳与混淆、多视角分析、frida/angr 动态、IOC 与检测规则… |
| `ext-01-code-audit` | 29011 B | 1332 文件 | 源码与供应链审计：危险 sink 优先、Fortify 与 OWASP Agentic Top10 规则、调用链与动态验… |
| `ext-02-av-evasion` | 14361 B | 93 文件 | 免杀对抗：AMSI/ETW 机制、call stack spoofing、BYOVD、进程注入、编译链与混淆、自测 SO… |
| `ext-03-cloud-security` | 16258 B | 76 文件 | 云与云原生攻防：AWS/Azure/GCP/阿里云/腾讯云，K8s/容器/Serverless/CI-CD；身份到权限到… |
| `ext-04-incident-response` | 21716 B | 51 文件 | 应急溯源：Windows/Linux 六阶段与 I1-I5 门禁、webshell/内存马/木马/勒索/挖矿排查、攻击链… |
| `ext-05-attack-defense` | 44982 B | 66 文件 | 攻防评估与 Agentic Red Teaming：阶段编排、外网打点、钓鱼社工线、内网四型分流与跨段递进、域内高阶（R… |
| `ext-06-ctf-solver` | 9012 B | 121 文件 | CTF 解题：web/pwn/reverse/crypto/forensics/mobile/cloud/AI/AD 路… |

### 6.3 情报源（5 条）

| 技能 | SKILL.md | 附带 | description（截断） |
|---|---|---|---|
| `fofa-api` | 8498 B | 4 文件 | 🔍 FOFA 官方 API 调用 — 资产搜索/证书查询/ICP备案查询/域名查询/图标检索/时间筛选/Excel导出 |
| `hunter-qianxin` | 10807 B | 1 文件 | 奇安信鹰图平台(Hunter) 资产测绘 — 浏览器导航/JS fetch API 查资产、证书/ICP/组件指纹、 数… |
| `infogather` | 60649 B | 8 文件 | 被动信息收集总纲（13 Mode）— 不碰目标服务器，纯公开渠道收集资产：ICP备案/whois/证书/ 搜索引擎语法/… |
| `quake` | 16341 B | 4 文件 | 360Quake 网络空间测绘 — Chrome MCP 导航/JS fetch API/数据导出/精度分级 |
| `xiaolanben` | 9193 B | 3 文件 | 小蓝本(sou.xiaolanben.com) 股权穿透+域名提取时用。err002签名预热铁律、Vue store 域… |

### 6.4 报告（1 条）

| 技能 | SKILL.md | 附带 | description（截断） |
|---|---|---|---|
| `report-00-report` | 8289 B | 5 文件 | 报告总技能：红队报告结构与定级纪律、单漏洞/总报告模板、平台提交口径（分级、提交字段、证据截图铁律、完整数据包三铁律）、… |

### 6.5 sapper 元技能（5 条）

| 技能 | SKILL.md | 附带 | description（截断） |
|---|---|---|---|
| `sapper-explore` | 1951 B | 1 文件 | 执行者单意图推进：认领一条意图，用只读探针或利用步骤推进它，把确证证据落成带类型的 fact。含事实类型与 data 键… |
| `sapper-reason` | 2904 B | 1 文件 | 指挥官决策循环：在事实图上判断目标是否达成、决定下一步做什么、把提案写成意图。含单目标决策与多目标调度。 |
| `sapper-scoring` | 2653 B | 1 文件 | 甲方漏洞评分与定级口径：单条积分、加分项、资产范围、重复合并、不收清单、各类漏洞定级细则、CVSS 映射与证据硬要求。出… |
| `sapper-setup` | 1796 B | 1 文件 | 在 DSH 里开一次新的授权渗透作业：建事实图、落授权范围、登记首批意图、派车道。替代上游 sapper-setup（那… |
| `sapper-thinking` | 1792 B | 1 文件 | 指挥官的两种思考工具：发散备选方案（把一条意图拆成多个可选路径，避免单线死磕）与盲区分析（收尾前检查漏掉的面）。判断下一… |

## 七、车道 ↔ 技能绑定

**原则**：车道规格只写「怎么做这类活的纪律与判据」，具体方法论一律通过 `skill('<pentest-NN>')` 按需加载。一条车道 4-12 条绑定，超出说明该拆车道。

**分工铁律**：`lane-verify` 查「这个漏洞是不是真的」（重放原请求、不换 payload），`lane-auditor` 查「这份报告能不能交出去」（证据完整性 + 定级）。两者都**不得由产出该结论的车道自己兼**。

### lane-auditor（lane-auditor.md，4545 B，绑定 2 条）

| 技能 | 何时加载 |
|---|---|
| `sapper-scoring` | 开工必读；定级与「是否值得报」的唯一裁判，与报告技能冲突时以它为准 |
| `report-00-report` | 证据链、ATT&CK 映射、撤场清单、低危不输出、平台提交字段与完整包铁律 |


### lane-authz（lane-authz.md，4442 B，绑定 5 条）

| 技能 | 何时加载 |
|---|---|
| `sapper-explore` | 开工必读：认领/交卷流程、事实类型与 data 键、图字段与目标回显的注入防御 |
| `pentest-12-authz` | 开工必读；八层 ID 篡改、JWT 攻击树、账户接管五层递进 |
| `pentest-13-business-logic` | 竞态、支付与流程绕过、验证码/短信缺陷 |
| `pentest-14-api-protocol` | GraphQL 字段级越权、WebSocket、网关与 HPP |
| `pentest-02-quick-win` | 认证/越权/支付组特征快筛，命中再深化 |


### lane-intranet（lane-intranet.md，4477 B，绑定 7 条）

| 技能 | 何时加载 |
|---|---|
| `sapper-explore` | 开工必读：认领/交卷流程、事实类型与 data 键、图字段与目标回显的注入防御 |
| `pentest-20-execution-privesc` | 拿到执行后做提权与主机身份确认 |
| `pentest-21-credentials-lateral` | 抓凭据、验证范围、横向循环 |
| `pentest-22-ad-intranet` | 域内：BloodHound、Kerberoast、委派、ADCS、Exchange |
| `pentest-23-persistence-evasion` | 持久化与免杀（每条须有清理方案） |
| `pentest-24-c2-egress` | 建 C2 隧道、多级回连、数据可达性证明 |
| `ext-03-cloud-security` | 云上凭证循环、信任链、环境还原 |


### lane-rce（lane-rce.md，4462 B，绑定 7 条）

| 技能 | 何时加载 |
|---|---|
| `sapper-explore` | 开工必读：认领/交卷流程、事实类型与 data 键、图字段与目标回显的注入防御 |
| `pentest-11-deserialization-jndi` | 反序列化、Shiro rememberMe、JNDI、Log4Shell |
| `pentest-10-file-path` | 上传 getshell、穿越写文件、对象存储覆盖 |
| `pentest-19-external-foothold` | 初始访问四情形、未授权服务、云凭据边界 |
| `ext-00-binary-analysis` | 样本/固件分析、脱壳还原、IOC 与 YARA |
| `ext-01-code-audit` | 源码审计、危险 sink、RCE 主线、双链确证 |
| `ext-02-av-evasion` | webshell/载荷免杀、AMSI/ETW/EDR 对抗验证 |


### lane-recon（lane-recon.md，5079 B，绑定 10 条）

| 技能 | 何时加载 |
|---|---|
| `sapper-explore` | 开工必读：认领/交卷流程、事实类型与 data 键、图字段与目标回显的注入防御 |
| `pentest-03-recon` | 开工必读；五清单、交接排序与红线 |
| `pentest-01-tools` | 调任何工具前；路径、限速与未装工具降级以它为准 |
| `pentest-02-quick-win` | 拿到入口后先扫特征列，快筛可打面 |
| `pentest-05-info-leak-config` | 出现 .git/actuator/配置/云桶/子域接管线索时 |
| `fofa-api` | 按域名/证书/图标扩面；配额与查询铁律 |
| `quake` | 用子域或 C 段细分拼全量；精度分级与 100 条上限 |
| `hunter-qianxin` | 证书/ICP 反查同类资产；cert= 语法与坑点 |
| `xiaolanben` | 股权穿透拿子公司域名；err002 预热纪律 |
| `infogather` | 被动收集全流程：备案递归、联系人/地址反查、供应链 |


### lane-verify（lane-verify.md，6202 B，绑定 2 条）

| 技能 | 何时加载 |
|---|---|
| `report-00-report` | 核对证据是否满足提交口径（截图、完整包、复现步骤、证据链、撤场清单） |
| `pentest-18-oob` | 盲打、时延、灰区判读的纪律（基线/邻域/差分对照） |


### lane-web（lane-web.md，5043 B，绑定 13 条）

| 技能 | 何时加载 |
|---|---|
| `sapper-explore` | 开工必读：认领/交卷流程、事实类型与 data 键、图字段与目标回显的注入防御 |
| `pentest-04-web-assets-js` | 开工先提 JS 接口清单与签名算法 |
| `pentest-02-quick-win` | 入口特征快筛，命中再深化 |
| `pentest-06-layer-diff` | 单层绕过穷尽仍不破时，换「A 层改了什么、B 层没改」 |
| `pentest-07-injection` | SQL/NoSQL/命令/SSTI/EL/CRLF/HPP |
| `pentest-08-ssrf-xxe` | SSRF、XXE、云元数据与内网探测 |
| `pentest-09-xss-frontend` | XSS、CSRF、点击劫持、前端污染、Ghost Bits |
| `pentest-10-file-path` | 上传、穿越、LFI、对象存储 |
| `pentest-14-api-protocol` | GraphQL、WebSocket、网关变形、HPP |
| `pentest-15-http-advanced` | 请求走私、缓存投毒、Host 头、DNS 重绑定 |
| `pentest-16-waf-bypass` | 被 WAF 拦后做编码/分型/变异 |
| `pentest-17-ai-cloud-ide` | AI 对话口工具执行、云 IDE RPC |
| `pentest-18-oob` | 无回显盲打、OOB 通道与判读纪律 |


## 八、冲突裁决与已知约定

| 争点 | 裁决 |
|---|---|
| nmap 装没装 | **装了**（`E:\信息收集\nmap\nmap.exe` 7.99）。一切「本机未装 nmap」的旧说法以 `pentest-01-tools` 第二节为准；调用必须写全路径，不要裸调 `nmap`。observe_ward 同理已装 |
| 定级口径 | 以 `sapper-scoring` 为准（单条 100/40/10 + 加分项 + 不收清单）；`report-00-report` 里的 20/10/5/1 是**平台计分**，不是定级 |
| 是否收一条漏洞 | `sapper-scoring` 管「收不收 / 算几档」；`report-00-report` 管「怎么写」。冲突时先看 scoring |
| 报告谁写 | 指挥官亲自写，不外包给车道 |
| 台账 | **不引入外部 SQLite 台账**。sapper 的事实图（`sapper_fact` / `sapper_doc`）就是唯一台账，双写会分裂真相 |
| 取证脚本 | 随包不带 CDP 截图脚本（旧 rt-23 那套依赖本机 Chrome 调试端口与固定路径）。需要截图时用 `pwsh` + `System.Drawing` 现写 |
| Chrome MCP | 有 36 处技能提到 Chrome MCP（浏览器取证、OOB 回调确认）。这是**可选**能力：profile 里配了 chrome MCP 就走 MCP，没配就走 `pwsh` 截图 + curl |

## 九、编号迁移表（旧 → 新）

| 旧名 | 新名 | 备注 |
|---|---|---|
| `pentest-2d-short-table` | `pentest-02-quick-win` | 速胜表改名（原「打穿短表」表述已全部清除） |
| `pentest-10-recon` | `pentest-03-recon` |  |
| `pentest-11-web-assets-js` | `pentest-04-web-assets-js` |  |
| `pentest-29-info-leak-config` | `pentest-05-info-leak-config` |  |
| `pentest-20-layer-diff` | `pentest-06-layer-diff` | 原 pentest-20 与 authz 撞号 |
| `pentest-21-injection` | `pentest-07-injection` |  |
| `pentest-22-ssrf-xxe` | `pentest-08-ssrf-xxe` |  |
| `pentest-23-xss-frontend` | `pentest-09-xss-frontend` |  |
| `pentest-24-file-path` | `pentest-10-file-path` |  |
| `pentest-25-deserialization-jndi` | `pentest-11-deserialization-jndi` |  |
| `pentest-20-authz` | `pentest-12-authz` |  |
| `pentest-26-business-logic` | `pentest-13-business-logic` |  |
| `pentest-27-api-protocol` | `pentest-14-api-protocol` |  |
| `pentest-28-http-advanced` | `pentest-15-http-advanced` |  |
| `pentest-2a-waf-bypass` | `pentest-16-waf-bypass` | 原十六进制编号 |
| `pentest-2b-ai-cloud-ide` | `pentest-17-ai-cloud-ide` | 原十六进制编号 |
| `pentest-2c-oob` | `pentest-18-oob` | 原十六进制编号 |
| `pentest-30-external-foothold` | `pentest-19-external-foothold` |  |
| `pentest-31-execution-privesc` | `pentest-20-execution-privesc` |  |
| `pentest-32-credentials-lateral` | `pentest-21-credentials-lateral` |  |
| `pentest-33-ad-intranet` | `pentest-22-ad-intranet` |  |
| `pentest-34-persistence-evasion` | `pentest-23-persistence-evasion` |  |
| `pentest-35-c2-egress` | `pentest-24-c2-egress` |  |
| `rt-26-binary-analysis` | `ext-00-binary-analysis` |  |
| `rt-27-code-audit` | `ext-01-code-audit` |  |
| `rt-28-av-evasion` | `ext-02-av-evasion` |  |
| `rt-29-cloud-security` | `ext-03-cloud-security` |  |
| `rt-30-incident-response` | `ext-04-incident-response` |  |
| `rt-31-attack-defense` | `ext-05-attack-defense` |  |
| `rt-32-ctf-solver` | `ext-06-ctf-solver` |  |
| `pentest-36-report + report-single-vuln + rt-33-report-templates` | `report-00-report` | 三条报告技能合并为一条 |
| `sapper-command` | `sapper-reason` | 并入「多目标调度」一节 |
| `sapper-brainstorm + sapper-blindspot` | `sapper-thinking` | 两条合并为一条 |
| `sapper-verify` | `lane-verify` | 复核方法并入车道规格 |

迁移已用负向前后视正则全局重写（`(?<![A-Za-z0-9_-])…(?![A-Za-z0-9_-])`，按长度降序），覆盖 `presets/` 全部 `.md/.yml/.ts` + 两套 persona + `tool-sapper/src/*.ts`，共 470 处 / 37 文件。**历史文档里出现旧名属预期**（本表保留映射即可）。

## 十、新增 / 改名 / 合并 检查单

**新增一条技能**
- [ ] 目录 `<prefix>-NN-<slug>/`，含 `SKILL.md`，frontmatter `name` == 目录名、`description` ≤120 字符
- [ ] 正文按第四节七段结构写，含判据（阳性/阴性）与证据要求
- [ ] 在「六、全量清单」对应分组加一行
- [ ] 需要某条车道用它 → 在该 `lane-*.md` 的「必读技能」表加一行并写「何时加载」
- [ ] 跑两个验证脚本：`warnings: 0`、`discovered` 数 +1
- [ ] `pnpm run build` 通过（`presets/sapper-skills/**` 已在 `files` 白名单）

**改名一条技能**
- [ ] 目录改名 + frontmatter `name` 改名（两处必须一致）
- [ ] 全局搜索旧名并重写：技能正文、车道规格、两套 persona（`persona-commander.md` / `persona-worker.md` → 用 `inject-persona.mjs` 重新注入）、`tool-sapper/src` 的提示文案
- [ ] 在「九、编号迁移表」补一行
- [ ] 跑两个验证脚本：`leftover old names: 0`

**合并两条技能**
- [ ] 先确认重复 ≥30%，否则只加交叉引用，不合并
- [ ] 保留内容更全的那条为新主体，另一条的独有内容降一级标题并入
- [ ] 全局重写被吞掉的名字（指向新主体），**同义引用要合并成一句**，避免出现「`report-00-report`、`report-00-report`」这种重复
- [ ] 删除旧目录（**不要**改名成 `_retired_*` 留着，它会被注册成技能）
- [ ] persona 技能表、车道绑定表同步增减

**删除一条技能**
- [ ] 全局搜引用，先改引用再删
- [ ] 从「六、全量清单」与所有车道绑定表移除
- [ ] 跑验证脚本确认 `discovered` 数与警告数

## 十一、变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-09 | 初始化：40 条 pentest/rt/情报源技能入库；修 8 处断链引用、规范化 6 处密钥占位、改写 7 处旧平台通道 |
| 2026-11-09 | 规范化：十进制重编号（25 pentest + 7 ext）、报告三合一为 `report-00-report`、`sapper-thinking` 合并 brainstorm+blindspot、`sapper-command`→`sapper-reason`、`sapper-verify`→`lane-verify`；统一目录形态；470 处引用重写；常驻开销 6629 字符 |
