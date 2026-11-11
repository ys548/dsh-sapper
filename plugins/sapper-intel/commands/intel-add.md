---
description: 登记一个 GitHub 仓库到开源漏洞情报监控
argument-hint: <owner/repo> [sapper store 绝对路径]
---

用户要登记开源情报监控仓库。参数：`$ARGUMENTS`

执行：

1. 第一个词是仓库（`owner/repo` 形式）；若还给了第二个参数（以 `/` 或盘符开头的路径），作为绑定 store 传入。
2. 调用 intel MCP 的 `intel_add` 工具（参数 repo、store）。
3. 向用户报告：监控的仓库、分支、绑定 store、基线策略（首次登记只记基线，不判读历史提交）。
4. 若工具返回限流错误（HTTP 403），提示用户设置 `INTEL_GITHUB_TOKEN` 或 `GITHUB_TOKEN` 环境变量（未认证每小时仅 60 次请求，监控场景必须带 token）。
