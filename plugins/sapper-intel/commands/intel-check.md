---
description: 采集各监控仓库的新 commit，逐个判读 diff，达门槛的写入 sapper 事实图并建复现工单
---

执行一轮开源漏洞情报监控（采集 → 判读 → 落图 → 记账）：

## 1. 采集

调用 intel MCP 的 `intel_fetch` 工具。若无待判读提交（各仓库 newCommits 均为 0 或首次基线），报告「本轮无新提交」并结束。某仓库返回 error 时如实列出，不影响其他仓库。

## 2. 逐个判读 diff（核心工作——必须真的读 patch 内容）

对每个待判读提交，读其 files[].patch，按以下特征判断是否**安全相关**：

- 提交信息含 CVE 编号、security / vulnerability / sanitize / overflow / injection / privilege / authz 等安全词
- patch 改动鉴权、会话、权限校验逻辑
- patch 改动输入校验、转义、反序列化、路径拼接、SQL/命令拼接
- 修复边界检查、整数溢出、Use-After-Free 等内存安全问题
- 依赖版本 bump 且注明 security fix

patch 缺失或被截断导致无法判断时，如实按「信息不足」处理（noted），**不要凭提交信息猜 patch 内容**。

## 3. 定级与动作

按判读结果三选一：

**escalated**（安全相关且属于：RCE / 命令注入 / SQL 注入 / 反序列化 / 鉴权绕过 / 任意文件读写上传 / 可远程触发的内存安全）——且该仓库绑定了 store：

1. 若 store 尚未初始化（报错提示 graph 不存在），先运行：
   `python D:/demo/dsh-sapper-pkg/sapper/lib/sapper.py --store <store路径> init --goal "开源漏洞情报监控：跟踪上游仓库安全修复与漏洞引入" --origin "intel-watch"`
2. 写漏洞候选事实（注意：`--store` 是全局参数放最前；`description` 是**位置参数**，放子命令后）：
   `python D:/demo/dsh-sapper-pkg/sapper/lib/sapper.py --store <store路径> fact "<一句话描述：从 diff 推断的成因与影响，注明待验证推断>" --kind vuln --title "<产品名+漏洞类型>" -d repo=<repo> -d sha=<完整sha> -d url=<提交链接> -d freshness=<fresh-1day|known-nday> --doc "<详细 markdown：diff 关键改动、影响版本、验证思路、披露窗口分析>" --creator intel --json`
3. 从返回 JSON 取 fact id，建复现工单：
   `python D:/demo/dsh-sapper-pkg/sapper/lib/sapper.py --store <store路径> intent --from <factId> "<复现一句话>" --title "复现: <漏洞一句话>" --doc "<验证步骤要点；未经授权不得对任何真实目标验证>" --creator intel`

**noted**（安全相关但不达门槛，或未绑定 store）——绑定了 store 则写 note fact：
   `python D:/demo/dsh-sapper-pkg/sapper/lib/sapper.py --store <store路径> fact "<判读依据一句话>" --kind note --title "<一句话>" -d repo=<repo> -d sha=<sha> --creator intel --json`；否则只在汇总里记录。

**skip**（与安全无关：常规重构、文档、CI、无安全语义的依赖升级）——不落图。

## 3.5 新鲜度判定（escalated 与安全类 noted 必做）

确定披露窗口，决定这条情报是"黄金 1day"还是普通 N-day：

1. **修复是否已随版本发布**：`gh api repos/<repo>/tags --jq '.[0:5].[name]'`（或 releases），对比补丁版本号；估算 fix commit 领先最新 release 多少天
2. **CVE/GHSA 是否已公告**：`gh api repos/<repo>/security-advisories` 有内容直接用；否则 WebSearch「<产品名> <漏洞类型> CVE advisory <年份>」
3. **标注**（写入 fact 的 `-d freshness=`）：
   - `fresh-1day` —— 修复已提交但修复版本未发布、且无 CVE/公告：**黄金窗口**，全网旧版本可利用且世界未知，置顶提示用户
   - `known-nday` —— 已有 CVE/GHSA 或修复版本已发布：普通情报
4. 窗口分析写进 fact doc：fix 时间 / 最新 release 时间 / 公告有无 / 该项目发版节奏（月度 release 的项目窗口最长）

## 4. 记账

每个判读完的提交调用 `intel_resolve`（repo、sha、verdict 一句话、action、factId/intentId 有则填）。

## 5. 汇总输出

- 各仓库本轮新提交数
- 判读结果表：sha / 提交信息 / 判定 / 动作
- 写入 store 的 fact id 与 intent id 清单
- 提醒：escalated 的复现工单需人工在**授权环境**执行，本流程不自动对任何真实目标发起验证
