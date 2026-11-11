---
description: 查看开源情报监控清单、待判读队列与最近判读记录
---

调用 intel MCP 的 `intel_list` 工具，向用户展示：

1. 监控清单表：仓库 / 分支 / 绑定 store / 待判读数 / 基线 SHA
2. 待判读队列条目（若有）：sha + 提交信息，提示可用 `/intel-check` 判读
3. 最近判读记录（时间 / 仓库 / sha / 结论 / 动作）
4. GitHub token 是否已配置（未配置且监控仓库多时会撞限流，提示设置 `INTEL_GITHUB_TOKEN`）
