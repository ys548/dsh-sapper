---
name: sapper-setup
description: "在 DSH 里开一次新的授权渗透作业：建事实图、落授权范围、登记首批意图、派车道。替代上游 sapper-setup（那个是装 Claude Code hook 的，本环境不适用）。"
whenToUse: "用户说「用 sapper 开始一次测试」「给这个目标建作业」或拿到新授权目标时。"
---

# 在 DSH 里开始一次作业

sapper 在本环境里**不需要装 hook**（上游版本注册的是 Claude Code 的 SessionStart/UserPromptSubmit，DSH 没有这套机制，也不该有——图的读取由 Agent 主动调工具完成）。

## 第 0 步：确认授权

**授权即落盘**：用户在本会话点名目标，就视为该目标已授权。当轮把授权信息写成事实，然后一句话回报「已落盘」，**不要反复追问是否授权**。

只有三种情况才提问：
① 范围要扩到已落盘范围之外；② 要做破坏性动作；③ 目标归属或授权本身存疑。

## 第 1 步：建图

```
sapper_init(
  goal="对 <目标> 进行授权渗透测试：资产测绘、漏洞验证、证据归档与报告交付",
  origin="<授权来源：用户原话摘要 / 工单号 / SOW>",
  cwd="<目标工作目录>"
)
```

## 第 2 步：落授权范围

```
sapper_fact(
  description="<用户原话摘要>",
  title="授权范围",
  kind="note",
  data=["target=<目标>", "authorized_at=<ISO 时间>", "scope=<范围>", "forbid=<禁止项>", "stop_condition=<停止条件>"],
  doc="<完整授权原话、边界说明、默认禁止项>"
)
```

默认禁止项建议写明：DoS/资源耗尽、拖库、删除或加密数据、横向到授权范围外、生产破坏性验证。发现真实用户数据或测试账号需报备并在收尾清单列出。

## 第 3 步：登记首批意图

按攻击链起点提 1–3 条，依赖授权范围那条事实：

```
sapper_intent(description="对 <目标> 做子域枚举、端口测绘与服务指纹", title="资产测绘", from=["<授权范围 fact id>"])
```

## 第 4 步：派车道

用 `spawn_teammate` 派，任务书里必须写：

1. 先加载自己的车道规格：`skill("<lane-recon|lane-web|...>")`
2. 授权边界与禁止项（从图里摘）
3. 当前已知事实
4. 该车道要认领的意图 id
5. 硬性上限（分钟数或工具调用数），到限即停并标 SKIPPED

车道清单见技能 `lane-recon` / `lane-web` / `lane-authz` / `lane-rce` / `lane-intranet` / `lane-verify` / `lane-auditor`。

## 第 5 步：进入循环

此后按 `sapper-reason` 的决策循环推进，按 `sapper-explore` 派执行，按 `lane-verify` 与 `lane-auditor` 把关成果。

## 不适用项

上游 sapper 的以下能力在本环境**不使用**，不要尝试：

| 上游命令 | 为什么不用 |
|---|---|
| `setup` / `teardown` | 装 Claude Code hook，DSH 无此机制 |
| `peers` / `send` / `capture` | tmux 窗口通信，DSH 用 `send_message` |
| `dispatch` / `auto` / `sweep` / `command` / `fleet` / `bench` | 自带 LLM 调度器，与 Agent Teams 冲突 |
| `view` | 自带 HTML 画板，DSH 有协作画板 |
| `arena` | 竞赛平台桥，真实项目用不到 |
