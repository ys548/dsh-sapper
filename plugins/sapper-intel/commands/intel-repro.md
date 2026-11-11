---
description: 从 sapper store 挑一个待复现的情报工单，在本机隔离环境自动复现，结论回写
argument-hint: [intentId]
---

对开源情报复现工单执行一轮自动复现（全程**只在本机隔离环境**，不对任何真实目标发请求）。

## 0. 选单

无参数时：列出 store 中 status 为 open/claimed 的 intent（`sapper.py --store <store> show` 或 graph），取最老的一个；有参数则用指定的 intentId。读取其 --from 的 fact 拿到 repo/sha/url。

## 1. 理解漏洞（读 fix diff，不猜）

`gh api repos/<repo>/commits/<fixSha> --jq '.files[] | {file, patch}'`

- **第一件事：找上游回归测试**。测试文件里经常直接给出 PoC 字节/请求（i001 试点即如此：test_spellfile.vim 内含 4 个 .spl hex blob）。有现成 PoC 字节就先用它，成功率远高于自己构造。
- 无现成 PoC 时，从 diff 反推触发条件：改了哪个解析函数、缺了什么校验、什么输入会走进去。

## 2. 策略分型

- **文件解析/内存安全类**：WSL 构建漏洞版本（父提交），内存类加 ASAN（CFLAGS="-fsanitize=address -g -O1 -fno-omit-frame-pointer"）。构建命令模板与 i001 相同（vim 案例：configure --with-features=huge --disable-gui... + make -j$(nproc)，约 2 分钟）。
- **Web 类**（CMS/框架）：本机起漏洞版本服务，**只绑 127.0.0.1**；按 diff 构造请求验证行为差异（如修复前 200/泄露、修复后 403/报错）。

## 3. 实验

- Lab 目录：`D:/demo/intel-lab/repro/<intentId>-<slug>/{src,poc,logs}`
- 先声明一个 `claim`（`sapper.py --store <store> claim <intentId>`）再动手。
- 每次触发结果如实记录：ASAN 报告存 logs/；Web 类存请求/响应对。
- **失败模式区分**：解析静默通过 ≠ 复现失败——先试上游测试的**全部** blob 变体（i001 的 b1/b3/b4 静默通过，b2 才崩）；ASAN 抓不到结构体内越界，优先找 free/UAF 类信号。
- **实验工程纪律**（i001 踩过的坑）：多变体循环跑在**脚本文件**里，不要嵌套 shell 引号传参（外层 for 的变量传不进内层 bash 会静默全落回第一变体）；每个变体独立目录并在触发后**核对 verbose 日志确认文件真的被加载**（`-V3`），否则"静默通过"可能只是文件没读到；修复版对照用错误码（如 E759）验证拒绝原因，退出码在 -es 模式不可靠。

## 4. 结论回写（三选一，如实）

- **复现成功**：`sapper.py --store <store> done <intentId> --fact "<触发条件+崩溃信号/行为差异，含证据路径>" --title "复现结论：..." --kind note -d repro=reproducible -d sha=<fixSha> --worker repro-lab`
- **未能自动复现**（试过主要路径仍无信号）：`-d repro=needs-manual`，fact 写明试过什么、卡在哪——**绝不写"漏洞不存在"**：自动复现失败只代表没找到触发路径。
- **环境不可行**（编译依赖缺失/服务起不来等）：`-d repro=blocked`，写清缺什么。

## 5. 红线

- 一切服务只绑 127.0.0.1；一切输入只打本机 lab 里的实例。
- 结论只描述"漏洞版本在本机可触发"，不外推到任何真实目标。
- 时间盒：单工单 ~30 分钟跑不完就如实 needs-manual，不要无限深入。
