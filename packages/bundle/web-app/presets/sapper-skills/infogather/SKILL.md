---
name: infogather
description: >-
  被动信息收集总纲（13 Mode）— 不碰目标服务器，纯公开渠道收集资产：ICP备案/whois/证书/
  搜索引擎语法/网盘泄露/GitHub泄露/网空测绘聚合。Use when 红队侦察阶段做被动情报收集。
---

# infogather — 被动信息收集 Skill

> 基于《被动信息收集.md》中的可自动化部分，用 Claude Code 现有工具实现。
> 目标：不碰目标服务器，纯公开渠道收集资产。

---

## 一、工作流总览

```
Step0: 输入目标名称
  ├─ Mode1: 域名收集（公司名 → 主域名/子域名）
  ├─ Mode2: 扩大攻击面（🔥 子公司/下属单位全流程 — 备案反查/联系人反查/地址反查/递归）
  ├─ Mode3: 子域名/URL 枚举
  ├─ Mode4: 边缘资产发现（证书/图标/body/ICP）
  ├─ Mode5: 信息泄露搜索（网盘/语雀/源码/GitHub/人员泄露/社交媒体/手机号/QQ-IM 🔥）
  ├─ Mode6: DNS 解析 & CDN 识别
  ├─ Mode7: 招标反哺搜索（🔥 用社工到的系统名/厂商名追加搜 IP）
  ├─ Mode8: Quake 360 测绘 API
  ├─ Mode9: DNS 子域名验证与可达性确认
  ├─ Mode10: 供应链/供应商发散搜索
  ├─ Mode11: DNS 暴力枚举子域名（🔥 无需API Key，纯PowerShell遍历常见前缀）
  ├─ Mode12: 下级单位攻击面收集（🔥 子公司/分公司专项）
  └─ Mode13: OneForAll/Subfinder 异步子域名扫描 🚀（异步启动，不阻塞，结果通过Hook回调）
```

---

## Mode 1: 域名收集（公司名 → 域名）

### 1.1 备案查询

```python
# WebFetch ICP 备案查询
WebFetch(url="https://beian.miit.gov.cn/", prompt="搜索 <公司名> 的备案信息")
WebFetch(url="https://icp.chinaz.com/", prompt="搜索 <公司名> ICP 备案域名")
```

**搜索语法（WebSearch）：**
```
# 公司名 + 官网
WebSearch(query=""公司名" 官网 OR 首页 OR www OR http")

# 公司名 + 域名相关
WebSearch(query=""公司名" 域名 OR 网址 OR site")
```

### 1.2 crt.sh 证书透明度

```python
# crt.sh JSON 接口（最稳定）
WebFetch(url="https://crt.sh/?q=%25.<domain>%25&output=json", prompt="提取所有证书中的域名")
```

**返回示例：** JSON 数组，每个条目含 `name_value`（证书中的域名，可能含换行符分隔多个域名）

### 1.3 VirusTotal 关系查询

```python
# VT 域名关系页
WebFetch(url="https://www.virustotal.com/gui/domain/<domain>/relations", prompt="提取所有关联域名（subdomains、同类证书域名）")
```

### 1.4 DNS Dumpster

```python
# DNS Dumpster 查询
WebFetch(url="https://dnsdumpster.com/", prompt="查询 <domain> 的 DNS 记录")
```

### 1.5 公司邮箱提取

```python
# 爱企查搜索（通过 Bing 找邮箱 → 推断域名后缀）
WebSearch(query=""<公司名>" 邮箱 OR @ 爱企查 OR 联系方式")
# 邮箱后缀 @xxx.com / @xxx.cn 就是域名
```

---

## Mode 2: 扩大攻击面（子公司/下属单位）🔥

> **2026-07-14 实战重写。** 某客户实战证明：子公司往往是母公司防护最薄弱的环节，招标公告暴露的下级单位信息可以直接反哺找到新系统入口。

### 2.1 企业架构侦察（先画组织树）

```python
# 分批搜索找到所有下属单位名称
WebSearch(query=""<公司名>" 子公司 OR 分公司 OR 下属 OR 全资")
WebSearch(query=""<公司名>" 投资 OR 控股 OR 持股")
WebSearch(query=""<公司名>" 成员企业 OR 旗下 OR 所属")

# 搜索企查查/启信宝公开信息页（文本摘要即可获取单位列表）
WebSearch(query="<公司名> 启信宝 OR 企查查 分公司 OR 子公司 名单")
```

输出格式（强制表格）：

| 单位类型 | 单位全称 | 简称/别名 | 所在省份 | 主营业务 | 来源 |
|---------|---------|----------|---------|---------|------|
| 全资子公司 | 某客户鑫业有限公司 | 某客户鑫业 | 青海 | 铝业/电解铝 | B2搜索 |
| 分公司 | 龙羊峡发电分公司 | 龙羊峡 | 青海 | 水电发电 | 招标公告 |

### 2.2 备案号递归反查（核心 🔥）

**原理：** 一个主体的备案号编号连续（-1、-2、-3...），每个数字可能对应一个子站。

```python
# Step 1: 找到主备案号
WebSearch(query="<公司名> ICP 备案号 OR 青ICP备")
# → 发现 "青ICP备05001236号"

# Step 2: 遍历子备案号
WebSearch(query="青ICP备05001236号-2 网站 OR 域名")
WebSearch(query="青ICP备05001236号-3 网站 OR 域名")
WebSearch(query="青ICP备05001236号-4 网站 OR 域名")
# ... 测到 -N 直到搜不到新结果

# Step 3: 用备案信息中的IP地址反查C段
WebSearch(query="203.0.113.1 备案 OR 网站")
WebSearch(query="203.0.113.2/24 WHOIS OR 归属")
```

**实战成果：** 青ICP备05001236号-2 → ljxsdz.com（李家峡）、-3 → 203.0.113.1、-4 → 203.0.113.3

### 2.3 企业信息平台提取（联系人/电话/邮箱）

企业信息页面（数据之家/启信宝/企查查/盯工程等）经常包含下级单位的联系人、邮箱、电话。

```python
# 搜下级单位全称 → 找企业信息页
WebSearch(query="<下级单位全称> 联系人 OR 电话 OR 邮箱")

# 搜招标联系人邮箱 → 可能管理其他资产
WebSearch(query="<邮箱前缀>@126.com OR @qq.com 招标 OR 项目")
WebSearch(query="<邮箱前缀>@<目标域名> OR <邮箱前缀>@public.xn.qh.cn IP OR 系统")

# 电话号码反查
WebSearch(query="<电话前7位> 系统 OR 管理")
```

**实战成果：**
- <邮箱> → 某客户物资有限公司招标联系人
- <邮箱> → 拉西瓦发电分公司邮箱
- <邮箱> → 某客户邮箱
- 0971-6326517 / 0971-6326537 → 某客户物资有限公司电话

### 2.4 招标公告全量提取（系统/厂商/地址/IP四合一）

每个招标公告都是一个信息宝藏。**提取模板：**

```python
WebSearch(query="<公司名> 招标 OR 中标 OR 采购 OR 询价 2024 OR 2025")
```

对每个返回的招标公告标题，提取以下字段并填入系统资产表：

| 字段 | 提取目标 | 实战案例 |
|------|---------|---------|
| 招标项目名 | 暴露系统名称 | "西宁发电分公司SIS系统改造" |
| 招标人 | 确定下级单位全称 | "某客户水电开发有限责任公司拉西瓦发电分公司" |
| 项目地点 | 暴露部署地址 | "五四西路57号" → 搜地址找同址其他系统 |
| 技术参数 | 暴露技术栈/版本 | "南瑞NC2000 V3.0" → 搜默认口令 |
| 供货周期 | 暴露可攻击窗口期 | "75天完成" |
| 业绩要求 | 暴露同类系统部署单位 | "近5年2个功率预测业绩" |

### 2.5 地址反查（🔥 发现同址多系统）

招标公告中的部署地址可以反查是否托管了其他系统：

```python
WebSearch(query="<招标公告中的地址> 系统 OR 平台 OR 服务器 OR 机房")
WebSearch(query="<地址关键词> 系统 OR 登录 OR admin")
```

### 2.6 联系人/管理员反查（🔥 发现新IP段）

WHOIS联系人邮箱或管理员信息可以反查到多个IP段：

```python
# 邮件反查
WebSearch(query="<邮箱前缀>@public.xn.qh.cn IP OR 服务器")

# 人名反查
WebSearch(query="<姓名> 系统 OR 管理 OR 网络")
```

**实战成果：** <邮箱> → 管理 220.167.176-222 等5+个IP段

### 2.7 递归收集（强制）

```
对 Mode2 找到的每个新下级单位：
  1. 记录：单位全称 / 简称 / 地址 / 电话 / 邮箱
  2. 回到 Mode1 搜它的域名
  3. 回到 Mode3/4 搜它的系统和子域名
  4. 回到 2.4 搜它的招标公告
  → 直到没有新资产为止
```

---

## Mode 3: 子域名/URL 枚举

### 3.1 搜索引擎 site 语法

```python
# Bing 搜索 site 语法（批量）
WebSearch(query="site:<domain> -www -mail")
WebSearch(query="site:<domain> intitle:登录 OR intitle:后台 OR intitle:管理")
WebSearch(query="site:<domain> intitle:test OR intitle:dev OR intitle:uat")
WebSearch(query="site:<domain> intitle:phpinfo OR inurl:phpinfo OR inurl:.git")
```

### 3.2 crt.sh 子域名导出

```python
# crt.sh 导出所有证书域名（比任何工具都全）
WebFetch(url="https://crt.sh/?q=%25.<domain>%25&output=json", prompt="列出所有域名，每行一个，去重")
```

### 3.3 DNS 基础解析

```powershell
# 通过 PowerShell 做基础 DNS 解析
nslookup <domain>  # A 记录
nslookup -type=mx <domain>  # MX 记录 → 可能暴露自建邮箱真实 IP
nslookup -type=ns <domain>  # NS 记录
```

---

## Mode 4: 边缘资产发现

### 4.1 Body 关键字搜索（核心）

```python
# Bing Body 搜索（找未备案/供应链/边缘资产）
WebSearch(query=""<公司特征body>" 系统 OR 平台 OR 管理 OR 登录")
WebSearch(query=""<公司名>" OR "<下属单位名>" 登录 OR admin OR 后台 OR portal")
```

**实战案例对照：** 文档中 body="XXX单位" 搜到非目标域名 → 弱口令进入 → 内部数据确认为目标单位。

### 4.2 证书搜索（被动）

```python
# 用 Bing 探测目标证书特征
WebSearch(query="cert=\"<domain>\" OR cert.subject_org=\"<公司名>\"")  # 引号精确搜索

# crt.sh 通过 O（组织）字段匹配
WebFetch(url="https://crt.sh/?O=<公司英文名>&output=json", prompt="提取所有证书域名")
```

### 4.3 图标 Hash 指引（需要 FOFA/Hunter API）

> **注意：** Claude Code 无法直接搜索 FOFA/Hunter，但可以：
> 1. 计算 favicon hash 供你手动去 FOFA/Hunter 搜
> 2. 通过在线接口获取 hash

```bash
# 下载 favicon 并计算 MD5（供 Hunter 搜索）
curl -sL "http://<domain>/favicon.ico" -o favicon.ico
certutil -hashfile favicon.ico MD5 | findstr /v "CertUtil"
# → web.icon=="<md5>"

# 在线 hash 计算接口
WebFetch(url="https://favicon-hash.kmsec.uk/?url=https://<domain>", prompt="提取 favicon hash 值")
```

### 4.4 ICP 备案反查 IP

```python
# 备案号已知时搜索对应 IP
WebSearch(query="<备案号> IP OR 服务器 OR 地址")
WebSearch(query="icp=<备案号>")

# 已知 IP 时查 C 段
WebSearch(query="<IP>/24 OR <IP段> 系统 OR 后台")
```

### 4.5 历史解析 IP

```python
# 多地 ping / 历史解析
WebFetch(url="https://site.ip138.com/<domain>", prompt="提取历史解析 IP 记录")
```

### 4.6 Google Dork 语法指南（输出给用户手动/参考）

> 以下语法输出给用户，供其在 Google/Bing 中使用：

| 语法 | 说明 | 示例 |
|------|------|------|
| `site:domain.com` | 指定域名搜索 | `site:target.com` |
| `inurl:` | URL 包含关键词 | `inurl:admin` |
| `intitle:` | 标题包含关键词 | `intitle:后台管理` |
| `intext:` | 页面内容包含关键词 | `intext:密码` |
| `filetype:` | 指定文件类型 | `filetype:xls 密码` |

---

## Mode 5: 信息泄露搜索

### 5.1 网盘搜索（指引）

```python
# 这些需要用户浏览器操作，但可生成搜索指引
# 凌风云: https://www.lingfengyun.com/
# 云盘搜索: https://www.yunpz.net/
# 搜索关键词: <公司名> + 通讯录 / 调研表 / 内部 / 密码
WebSearch(query=""<公司名>" 通讯录 OR 内部资料 OR 员工表 filetype:xls OR filetype:pdf")
```

### 5.2 语雀搜索

```python
# 语雀公开文档搜索
WebFetch(url="https://www.yuque.com/search?q=<公司名>", prompt="提取公开文档标题和摘要，寻找敏感泄露")

# 更多语雀关键词
WebFetch(url="https://www.yuque.com/search?q=<公司名>+密码", ...)
WebFetch(url="https://www.yuque.com/search?q=<公司名>+内部", ...)
```

### 5.3 代码搜索

```python
# SearchCode
WebFetch(url="https://searchcode.com/?q=<公司名>+OR+<domain>", prompt="提取代码片段中的域名、密码、API Key、URL等敏感信息")

# GitHub 搜索（WebSearch 有限，但可试）
WebSearch(query="site:github.com \"<domain>\" password OR secret OR config OR \".cn\"")
WebSearch(query="site:github.com \"<公司名>\" config OR internal OR database")
WebSearch(query="site:github.com \"smtp.<domain>\" OR \"mail.<domain>\" password")

# Gitee
WebSearch(query="site:gitee.com \"<domain>\" OR \"<公司名>\"")
```

### 5.4 Telegram 搜索（指引）

```python
# Meow TG 搜索引擎
WebFetch(url="https://meow.tg/", prompt="搜索 <公司名> 相关频道或消息")
```

### 5.5 源码泄露搜索 🔥（2026-08-05 新增）

> 源码泄露是最高价值的泄露——直接拿到内部逻辑/密钥/后台路径。

**🔑 首选：Sourcegraph 流式 API（2026-08-05 突破，无需 token）**

> grep.app 429 限流 / GitHub code search 需 token / WebFetch 被 claude.ai 域名验证拦截。
> **Sourcegraph `search/stream` 流式 API 无需认证，PowerShell/Python 直连可用**。

```powershell
# 单关键词搜索
python <技能目录>/infogather/sg_code_search.py "某客户"
python <技能目录>/infogather/sg_code_search.py "spscm.某客户" --pattern "fork:yes"

# 批量搜索（文件每行一个关键词，自动逐词跑+汇总）
# 推荐流程：把所有专有标识(域名/邮箱/系统名)写进 words.txt → 批量跑 → 结果落地
python <技能目录>/infogather/sg_code_search.py --list words.txt --output results.txt

# 或 PowerShell 直连
Invoke-WebRequest -Uri "https://sourcegraph.com/search/stream?q=<关键词>&v=V3" -Headers @{"Accept"="text/event-stream"}
# 解析响应中 "repository":"github.com/..." 和 "line":"..." 字段
```

**关键词铁律：必须足够特定！**
- ✅ 完整域名 `<目标域名>` / 邮箱 `<邮箱>@某客户` / 系统名 `某客户`
- ❌ 泛词 `某客户` → 229 仓库 565 条全是无关同名

**其他来源（辅助）：**
```python
# 1. 代码托管平台（GitHub/Gitlab/Gitee/Codeberg）
WebSearch(query="site:github.com \"<domain>\" password OR secret OR token OR config")
WebSearch(query="site:github.com \"<公司名>\" 数据库 OR 配置 OR 内网 OR api")
WebSearch(query="site:gitee.com \"<domain>\" OR \"<公司名>\" password OR config")

# 2. 其他代码搜索（注意限流/拦截）
WebSearch(query="site:grep.app \"<domain>\"")     # grep.app 429 时等重试
# searchcode/sourcegraph WebFetch 可能被域名验证拦截 → 用 PowerShell 直连 API

# 3. 泄露数据库/文库
WebSearch(query="<domain> 源码 OR 泄露 OR dump OR 备份 site:github.com OR site:gitee.com")

# 4. 云存储代码包
WebSearch(query="<domain> OR <公司名> 代码包 OR source.zip OR backup filetype:zip OR filetype:tar")
```

**价值排序：** Sourcegraph 流式API > GitHub 裸搜 > grep.app > searchcode

**🔴 GitHub token 状态（2026-08-05）：**
- GitHub code search API 需认证 token → 浏览器登录 GitHub 失败（账号登录/Google/Apple/passkey 均未成功）
- ✅ **不依赖 token 也能跑**：Sourcegraph 流式 API 就是主通道，无需登录
- 待办：以后有空在浏览器登录 GitHub → 到 `github.com/settings/tokens/new` 创建 fine-grained token（只授 code 读取权限）→ 配置 `GH_TOKEN` 环境变量 → 打通 code search 双保险

### 5.6 社交媒体泄露 🔥（2026-08-05 新增）

> 人员是社会工程的核心入口。微博/脉脉/领英暴露职位+关系，招聘平台暴露技术栈。

```python
# 微博（搜公司+关键词，可能搜到内部人员吐槽/截图）
WebSearch(query="site:weibo.com \"<公司名>\" OR \"<domain>\" 内部 OR 系统 OR 后台")
WebSearch(query="site:weibo.com \"<公司名>\" 加班 OR 离职 OR 年终")

# 脉脉/领英（暴露员工职位、部门、关系网 → 推断 IT 岗/高管）
WebSearch(query="site:maimai.cn \"<公司名>\"")
WebSearch(query="site:linkedin.com \"<公司名>\" OR \"<domain>\"")
WebSearch(query="<公司名> 脉脉 OR 领英 IT OR 运维 OR 工程师")

# 招聘平台（JD 泄露技术栈/系统名 → 反哺测绘）
WebSearch(query="site:zhipin.com OR site:lagou.com \"<公司名>\" 运维 OR 开发 OR 安全")
WebSearch(query="<公司名> 招聘 运维 OR 开发 JD 要求")

# 技术社区（CSDN/掘金 可能发内部系统截图）
WebSearch(query="site:csdn.net \"<domain>\" OR \"<公司名>\"")
WebSearch(query="site:juejin.cn \"<公司名>\" 后台 OR 系统")
```

**关键转化：** 招聘 JD 里的系统名 → 反哺 Mode 7 搜该系统的登录页/默认口令

### 5.7 手机号反查 🔥（2026-08-05 新增）

> 拿到手机号 → 反查机主 → 反查名下其他公司/资产（人员溯源的中间环节）。

```python
# 手机号 → 机主信息/关联（企业信息平台泄露）
WebSearch(query="<手机号> 企业 OR 法人 OR 联系人 OR 电话")

# 手机号 → 名下公司（企查查/爱企查公开页）
WebSearch(query="<手机号> 企查查 OR 爱企查 OR 天眼查")

# 手机号 → 微信/QQ/微博关联
WebSearch(query="<手机号> 微信 OR 微博 OR QQ")

# 手机号 → 简历/社交（可能泄露职务）
WebSearch(query="<手机号> 简历 OR 工程师 OR 经理")
```

> ⚠️ 手机号来源：招标公告、企业信息平台（爱企查详情页）、简历泄露。拿到后先反查再反哺。

### 5.8 QQ / IM 反查 🔥（2026-08-05 新增）

```python
# QQ 号 → 绑定的公司/邮箱/手机
WebSearch(query="<QQ号> 企业 OR 邮箱 OR 绑定")

# 微信号 → 招聘/名片/公开资料
WebSearch(query="<微信号> OR \"vx:<微信号>\" <公司名>")

# 企业 QQ / 客服号 → 背后公司
WebSearch(query="<QQ号> <公司名> 客服 OR 销售 OR 技术")

# IM 群泄露 → 人员+系统名
WebSearch(query="<公司名> QQ群 OR 微信群 泄露 OR 截图")
```

### 5.9 人员泄露完整链路（溯源图）🔥（2026-08-05 新增）

```
IP → 域名 → WHOIS注册人/邮箱/电话
              ↓
      邮箱反查 → 其他域名/系统（已有 Mode 2.3）
      手机号反查 → 名下公司 → 新资产
      QQ/微信反查 → 关联人员 → 社交关系
      社交媒体 → 职位/部门 → 找 IT 岗/高管 → 社会工程入口
              ↓
      招聘 JD → 技术栈/系统名 → 反哺 Mode 7 找系统
```

**人员收集优先级：** 邮箱 > 手机号 > QQ/微信 > 社交账号。每拿到一个 → 立即反查关联资产。

---

## Mode 6: DNS 解析 & CDN 识别

### 6.1 域名解析查询

```powershell
# PowerShell 批量解析
$domains = @("www.<domain>", "mail.<domain>", "api.<domain>", "admin.<domain>", "test.<domain>")
foreach ($d in $domains) {
    try { $ip = [System.Net.Dns]::GetHostAddresses($d) | Select-Object -First 1; Write-Output "$d -> $($ip.IPAddressToString)" }
    catch { Write-Output "$d -> 解析失败" }
}
```

### 6.2 CDN 检测

```powershell
# 多地 Ping 查询
# 境外请求 → 多个 IP = CDN，单个固定 IP = 真实服务器
```

### 6.3 真实 IP 绕过 CDN 线索

```
1. 子域名爆破 → 找到未加 CDN 的子域名 → 同 IP 扫端口
2. MX 记录 → 自建邮箱服务器的 IP（通常无 CDN）
3. 历史解析 IP → target.ip138.com 查早期未上 CDN 时的 IP
4. 证书/图标/ICP → 同组织其他IP资产
5. 境外访问 → 部分地区无 CDN 节点
```

---

## Mode 7: 招标反哺搜索（🔥 核心 — 反复追加关键词）

> **实战案例：** 某客户渗透中，从招标公告社工到"浙江正元智慧一卡通""某供应商 Luculent""致远 A8 OA""Damsafety2010"等系统名，反哺 Bing 搜索 → 发现新的 IP、URL、登录页。

### 核心原理

招标公告中泄露的信息类型：

| 泄露类型 | 举例 | 可反哺搜索的关键词 |
|---------|------|------------------|
| **系统名称** | "正元智慧一卡通""致远A8""某供应商运维平台" | 系统名 + 单位名 → 找登录页 |
| **厂商/技术栈** | "中通服科信""浙江正元""Luculent" | 厂商名 + 单位名 → 找同类系统 |
| **版本号** | "4.0.20.0531""H9000 V4.0""DSIMS4.0" | 版本号 + IP → 找未授权访问 |
| **部署地址** | "五四西路57号""生物园区经四路8-2号" | 地址关键词 → 找关联系统 |
| **技术参数** | "nginx""Tomcat""Oracle EBS""SQL Server" | 技术栈 + 单位名 → 找开放端口 |
| **IP/备案号** | "203.0.113.4""青ICP备05001236号-3" | IP段 → C段扫描 / 备案反查 |
| **供应商名称** | "某客户物资公司""青海某客户能源工程咨询" | 供应商名 → 找供应链系统 |
| **管理员信息** | "庞晓萌""金慧英""<邮箱>" | 联系人 → 找其他管理资产 |
| **招标编号** | "DNYZC-2024-04-01-127-01" | 编号 → 找同一批次其他项目 |

### 7.1 系统名反搜 IP

> 招标公告中暴露了系统名 + 厂商 → 用这些关键词搜登录页/IP

```python
# 系统名 + 目标单位
WebSearch(query=""正元智慧" OR "一卡通" "某客户鑫业" 登录 OR 系统 OR IP")
WebSearch(query=""致远A8" "某客户" OR "某客户" 登录 OR 后台")
WebSearch(query=""某供应商" OR "Luculent" "某客户" OR "某客户" 登录 OR 平台")
WebSearch(query=""Damsafety" OR "DSIMS4.0" 登录 OR 系统 OR IP")

# 系统名 + 通用后缀
WebSearch(query=""正元智慧" /CardManager/ OR /SmartCard/ OR 登录")
WebSearch(query=""致远A8" /seeyon/index.jsp 登录")
```

### 7.2 厂商名反搜同类系统

> 同一家供应商可能服务多个单位，搜厂商名找同类暴露系统

```python
# 厂商名 + 系统类型
WebSearch(query=""中通服科信" 智能化 OR 管控 OR 系统 登录")
WebSearch(query=""浙江正元智慧" 一卡通 OR 食堂 登录")
WebSearch(query=""某供应商智慧" OR "luculent" 运维 OR 管理 平台 登录")
```

### 7.3 IP 段反搜

> 从 WHOIS 发现 IP 段 → 用段内每个 IP 搜关联系统

```python
# C段内已知 IP 反搜
WebSearch(query="203.0.113.1 OR 203.0.113.4 OR 203.0.113.3 系统 OR 后台 OR 管理")
WebSearch(query=""218.95.226" 水电 OR hhsd OR 某客户 OR 青海 系统")

# 已知 IP 全端口搜索
WebSearch(query="203.0.113.4 8080 OR 8443 OR 8000 OR 9090 OR 443")
```

### 7.4 版本号反搜漏洞/默认口令

> 招标公告中的版本号可直接用来搜默认口令/漏洞

```python
WebSearch(query=""4.0.20.0531" 默认密码 OR 漏洞 OR 弱口令")
WebSearch(query=""H9000 V4.0" 默认密码 OR 漏洞")
WebSearch(query=""iP9000" 默认 OR 漏洞 OR 登录")
```

### 7.5 备案号反搜 IP

> 备案号直接对应 IP 或域名，搜其他备案子号找到更多资产

```python
# 已知备案号 → 找同主体下的其他域名/IP
WebSearch(query="青ICP备05001236号 子站 OR 备案 OR 域名")
WebSearch(query="青ICP备05001236号-1 OR -2 OR -3 OR -4 OR -5 网站")

# 已知 IP → 搜对应备案
WebSearch(query="203.0.113.1 备案 OR ICP")
```

### 7.6 供应商/联系人反搜

> 招标公告中的联系人邮箱、电话、名字 → 搜其他系统

```python
# 管理员邮箱 → 搜管理过的其他 IP
WebSearch(query=""<邮箱>" OR "<邮箱>" IP OR 服务器")

# 联系人 → 搜负责的其他资产
WebSearch(query=""庞晓萌" OR "金慧英" 系统 OR 管理 OR 网络")

# 招标联系人邮箱
WebSearch(query="<邮箱> 招标 OR 项目")
```

### 7.7 地址反搜机房/系统

> 招标公告中的部署地址 → 搜该地址关联的其他系统

```python
WebSearch(query="五四西路57号 系统 OR 机房 OR 服务器")
WebSearch(query=""同仁路8号" 服务器 OR 网络 OR 机房")
```

---

## Mode 7 实战案例：某客户反哺流水线

```
Step 1: 招标公告 → "浙江正元智慧一卡通系统 4.0.20.0531"
Step 2: 反哺搜索 "正元智慧 一卡通 登录 某客户" → 发现 /CardManager/ 路径
Step 3: 反哺搜索 "浙江正元智慧 一卡通 默认密码" → 发现默认口令
Step 4: 反哺搜索 "正元智慧 4.0.20.0531 漏洞" → 发现历史漏洞

Step 1: 备案查询 → "青ICP备05001236号"
Step 2: 反哺搜索 "青ICP备05001236号-2" → 发现 ljxsdz.com（李家峡）
Step 3: 反哺搜索 "青ICP备05001236号-4" → 发现 203.0.113.3（新IP）
Step 4: 反哺搜索 "203.0.113.2/24 WHOIS" → 确认整个C段属于目标

Step 1: 管理员信息 → "庞晓萌 <邮箱>"
Step 2: 反哺搜索 "庞晓萌 IP 服务器" → 发现 5 个额外管理段
Step 3: 反哺搜索 "<邮箱>" → 发现海北/海南节点
```

```python
# 当用户输入公司名时，按以下顺序执行：

Phase 1: 域名收集
  ├─ WebSearch("公司名 官网 OR 首页") → 主域名
  ├─ WebFetch(crt.sh, domain) → 所有证书域名
  └─ WebFetch(VT relations, domain) → 关联域名

Phase 2: 扩大面
  ├─ WebSearch("公司名 子公司 OR 分公司")
  ├─ WebSearch("公司名 投资 OR 控股")
  ├─ WebSearch("公司名 招标 OR 采购 site:gov.cn")
  ├─ 备案号递归反查（-1到-N搜所有子站）
  ├─ 地址反查（搜招标中的部署地址）
  ├─ 联系人/邮箱反查
  └─ 对每个新公司名 → Phase 1

Phase 3: 子域名挖掘
  ├─ WebSearch("site:domain -www")
  ├─ crt.sh 全量导出
  └─ nslookup 常见子域名

Phase 4: 边缘资产
  ├─ WebSearch("公司特征body 登录 OR 管理 OR 后台")
  ├─ WebSearch("下属单位名 系统 OR 平台")
  ├─ WebFetch(favicon-hash, domain) → icon hash
  ├─ WebFetch(ip138, domain) → 历史IP
  └─ C段/备案号关联

Phase 5: 泄露搜索
  ├─ WebSearch("公司名 filetype:xls OR filetype:pdf 通讯录")
  ├─ WebSearch("site:github.com 公司名 config OR password")
  ├─ WebFetch(yuque.com, 公司名)
  └─ WebFetch(searchcode, 公司名/域名)

Phase 6: DNS/CDN
  ├─ nslookup A/MX/NS
  ├─ 多地 Ping 指引
  └─ CDN 绕过线索

Phase 7: 招标反哺搜索 🔥
  ├─ 从招标公告提取：系统名 / 厂商 / 版本号 / 地址 / 联系人
  ├─ WebSearch("系统名 + 单位名 + 登录") → 发现登录页
  ├─ WebSearch("厂商名 + 系统类型") → 发现同类暴露系统
  ├─ WebSearch("联系人/邮箱 IP") → 发现新 IP 段
  ├─ WebSearch("备案号 -2 -3 -4") → 发现新域名/IP
  ├─ WebSearch("版本号 漏洞/默认口令") → 发现弱口令
  └─ WebSearch("IP段 8080/8443/8000") → 发现开放端口

Phase 8: DNS 暴力枚举（Mode 11）
  ├─ 常见前缀字典（auth/sso/git/api/vpn/oa/elink/uat/...）
  ├─ 子公司域名模式猜测（拼音缩写+fd/sdz/power/solar）
  ├─ PowerShell 批量 nslookup
  └─ IP段聚类分析判断系统重要性

Phase 9: 下级单位攻击面（Mode 12）
  ├─ 每个下级单位单独查独立域名
  ├─ 每个下级单位搜系统/登录/平台
  ├─ 每个下级单位搜招标暴露系统
  ├─ 每个下级单位DNS爆破
  └─ 每个下级单位的技术栈专项搜索（如NC2000/DCS/一卡通）

Phase 10: OneForAll/Subfinder 异步扫描（Mode 13）🚀
  ├─ 用户确认后启动
  ├─ Start-Process 开新窗口 → 不阻塞
  ├─ 继续执行 Phase 1-9（不等待扫描完成）
  └─ Hook 回调：扫描完成后解析 CSV 结果并整合到 xlsx
```

---
---

## Mode 11: DNS 暴力枚举子域名 🔥

> **2026-07-14 新增。** 这是本次某客户实战产出的核心打法。通过 PowerShell 批量 DNS 解析常见子域名前缀，配合主域名的主IP段，可以在短时间内发现大量真实可达的子域名系统。

### 11.1 核心原理

多数企业的 DNS 枚举工具（如 subfinder/OneForAll）需要 API Key，但直接用 PowerShell `[System.Net.Dns]::GetHostAddresses()` 遍历常见前缀即可发现大多数子域名：

```
某客户实战结果：60个常见前缀枚举 → 发现19个有效子域名（31.7%命中率）
```

**优点：** 不需要任何API Key、不需要任何工具、纯系统功能。

### 11.2 通用子域名前缀字典（🔥 必跑）

```powershell
$domains = @(
    # 认证/入口
    'sso','login','signin','passport','auth','cas','id','uc','elink',
    # 门户
    'portal','my','home','www','mail','webmail',
    # 办公
    'oa','office','work','workflow','bpm','form','report',
    # 业务系统
    'erp','crm','scm','pms','tms','wms','hrm','hr','ehr','fin','pay','billing',
    # 开发/运维
    'git','gitlab','jenkins','jira','confluence','wiki','doc','help','support',
    # API/服务
    'api','open','developer','console','dashboard','admin','manage','backend',
    # 测试
    'test','uat','dev','stage','pre','preprod','demo','sandbox',
    # 安全
    'vpn','safe','sec','waf','fw','monitor','zabbix','nagios',
    # 存储
    'nas','backup','storage','file','upload','download',
    # 基础架构
    'cloud','k8s','docker','rancher','harbor','nexus','elk','kibana','grafana',
    # 通信
    'im','chat','meeting','video','voip',
    # 其他
    'm','mobile','app','h5','weixin','wechat','miniapp',
    # 业务
    'order','trade','shop','store','product','item','logistics','supplier','vendor',
    # 数据
    'data','bi','etl','sync','db','mysql','redis','mq','kafka',
    # 某客户特有
    'ny','dsj','tsp','nc','ncc','yonyou','u8','kingdee'
)
# 批处理模板：
foreach ($d in $domains) {
    $fqdn = "$d.<主域名>"
    try {
        $ips = [System.Net.Dns]::GetHostAddresses($fqdn) | Select-Object -First 1
        Write-Output "$fqdn -> $($ips.IPAddressToString) (OK)"
    } catch { }
}
```

### 11.3 下级单位域名模式猜测（🔥 实战经验）

根据这次实战，发现中国企业的子域名/域名模式：

| 模式 | 示例 | 预测公式 |
|------|------|---------|
| 拼音缩写+fd(发电) | lyxfd.com, lxwfd.com | 龙羊峡(lyx)+fd, 拉西瓦(lxw)+fd |
| 拼音缩写+fd(发电) | hhsdxnfd.com | hhsd(某客户)+xn(西宁)+fd |
| 公司缩写+sdz(水电站) | ljxsdz.com | ljx(李家峡)+sdz |
| 公司名+拼音缩写 | hhdcsilicon.com | hhd(某客户电)+silicon |
| 品牌+solar | <目标域名> | 某客户+solar |
| 品牌+h hp v | xahhpv.com | xa(西安)+hh(某客户)+pv |

```powershell
# 尝试拼音缩写 + 常见后缀
# 后缀: fd(发电), sdz(水电站), power, solar, silicon, pv, energy, electric
$baseNames = @('lyx','lxw','ljx','gbx','jsx','bd','yq')  # 水电站拼音缩写
$suffixes = @('fd.com','sdz.com','power.com','energy.com')
foreach ($b in $baseNames) {
    foreach ($s in $suffixes) {
        $d = "$b$s"
        try {
            $ips = [System.Net.Dns]::GetHostAddresses($d) | Select-Object -First 1
            Write-Output "$d -> $($ips.IPAddressToString) (OK)"
        } catch { }
    }
}
```

### 11.4 DNS 解析后的验证铁律

```
域名有A记录 ≠ 可达 ≠ 属于目标
```

| DNS结果 | 含义 | 处理方式 |
|---------|------|---------|
| ✅ 有A记录，IP属于主公司IP段 | 该子域名有效 | 列入资产表 |
| ✅ 有A记录，IP为云服务（阿里/腾讯/AWS） | 可能子公司自行运维 | 列入⚠️待确认 |
| ✅ 有A记录，IP为境外/未知段 | 可能误命中 | 需WebFetch/Chrome验证 |
| ❌ 解析失败 | 域名不存在 | 跳过 |

### 11.5 IP段聚类分析（🔥 判断系统重要性）

对枚举到的所有IP做聚类：

```powershell
# 统计哪些IP段出现最多
# 相同段=同一数据中心=可能同一管理员
$allIps | Group-Object { $_.Split('.')[0..2] -join '.' } | Sort Count -Descending
```

**实战判断标准：**
```
同一/24段内出现5+个域名 → 核心系统集群 → 重点
出现在多个不同/24段     → 系统分布广 → 可能各有独立管理员
只有一个域名的/24段      → 独立系统 → 可能弱防护
```

---
---

## Mode 12: 下级单位攻击面收集（子公司/分公司专项）🔥

> **2026-07-14 新增。** 子公司的防护通常比母公司弱，是很好的突破口方向。

### 12.1 下级单位域名发现优先级

| 类型 | 发现方式 | 优先级 |
|------|---------|--------|
| 已有ICP备案的独立域名 | 备案反查 | ⭐⭐⭐ |
| 有登录页的管理系统 | WebSearch/Bing | ⭐⭐⭐ |
| 正在招标建设的系统 | 招标公告提取 | ⭐⭐⭐ |
| 疑似但未确认的域名 | DNS爆破推测 | ⭐⭐ |
| 使用总部域名的子路径 | <目标域名>/xxx | ⭐⭐ |

### 12.2 每个下级单位必查项

对 Mode 2 找到的每个下级单位，执行以下检查：

```python
# 1. 搜独立域名
WebSearch(query="<下级单位全称> 官网 OR 域名 OR 网站")

# 2. 搜登录/管理系统
WebSearch(query="<下级单位简称> 系统 OR 平台 OR 登录 OR 管理")

# 3. 搜招标暴露的系统名
WebSearch(query="<下级单位全称> 招标 OR 系统改造 OR 信息化")

# 4. DNS爆破（用简称+常见后缀）
# PowerShell 执行

# 5. 搜公开联系方式 → 反查其他系统
WebSearch(query="<下级单位电话前缀> 系统 OR 管理")
WebSearch(query="<下级单位邮箱> IP OR 域名")
```

### 12.3 下级单位专有技术栈收集

不同行业的下级单位可能使用完全不同的系统：

```python
# 发电分公司常见系统
WebSearch(query="<发电分公司名> NC2000 OR H9000 OR 计算机监控 OR SCADA")

# 制造/化工类子公司常见系统
WebSearch(query="<子公司名> DCS OR MES OR ERP OR 控制系统")

# 后勤/服务类子公司
WebSearch(query="<子公司名> 一卡通 OR 门禁 OR OA OR 办公")
```

### 12.4 实战成果参照表

| 下级单位 | 发现的域名/系统 | 发现方法 |
|---------|---------------|---------|
| 西宁发电分公司 | hhsdxnfd.com/Home/Login (有登录页) | 企业信息页 |
| 西安太阳能电力 | <目标域名> (官网) | ICP备案反查 |
| 新能源分公司 | hhdcsilicon.com + admin.hhdcsilicon.com (管理后台) | DNS爆破 |
| 李家峡发电分公司 | ljxsdz.com (青ICP备05001236号-2) | 备案号反查 |
| 龙羊峡(疑似) | lyxfd.com (203.0.113.5) | DNS爆破+模式猜测 |
| 拉西瓦(疑似) | lxwfd.com (203.0.113.6, <邮箱>) | DNS爆破+邮箱确认 |
| 某客户检修 | jxgs.com (青ICP备2020000942号) | 企业信息页

> **2026-07-14 重写。** 🔴 **实战教训：不要用假 token，不要用 `chrome_network_request` 调用 API。**
> 正确方式：**在 Quake 页面内用 `chrome_javascript` 执行 fetch，传 `credentials: 'include'` 继承浏览器登录态。**

### 🔴 致命错误清单（实战教训）

| 错误做法 | 后果 | 正确做法 |
|---------|------|---------|
| 优先调 JS fetch API 而非导航 | 漏掉非HTTP端口（Redis/MongoDB/SSH） | **导航方案优先**，API 仅作补充 |
| 照搬 `Authorization: 233` | 未鉴权，API 返回空 | 不要写死任何 token，用导航方案 |
| 用 `chrome_network_request` 调 API | 无浏览器 Cookie，返回空 | 导航页面读文本 OR 页面内 JS fetch |
| 不加 `credentials: 'include'` | fetch 不带 Cookie，返回空 | 必须带这个选项 |
| 不检查用户已有 Quake 标签页 | 重复开页，浪费上下文 | 先 `get_windows_and_tabs` 找现有 tab |
| 误判 "总共0条 → 目标无资产" | 跳过真正有 assets 的目标 | 换 domain: 搜索或导航页面确认 |

### ⚠️ 前置铁律：搜索结果精度分级

实战测试（35家公司 + body搜索对比）得出以下精度分级：

| 级别 | 搜索方式 | data[] 能返回? | data[] 可信度 | 典型误报率 |
|------|---------|---------------|-------------|-----------|
| **A** | `domain:"xxx.com"` | ✅ 能返回IP | 🟢 **可信** | ~0% |
| **B** | `"精确公司全名"` (聚合) | ❌ data[]空 | 🟡 知有资产但拿不到IP | — |
| **C** | `"精确短名"` (聚合) | ⚠️ data[]少量 | 🟡 部分可信 | 中 |
| **D** | `无引号公司名` | ✅ 能返回IP | 🔴 **不可信** | 60-90% |
| **E** | `body:"关键词"` | ✅ 能返回IP | 🔴 **不可信** | 70-99% |
| **F** | `body:"A" AND body:"B"` | ⚠️ 大部分为空 | 🔴 极少返回 | — |

**🔴 重要结论：body 搜索和精确公司全名搜索不能用于提取实际 IP。**

真正可信的来源只有两类：
1. **`domain:xxx.com`** — DNS注册即在目标手内
2. **`"精确短名"` 且 data[] 有返回** — 仅适用于部分公司

---

### 8.1 前置操作：找到/创建 Quake 页面（必须先做）

> **🔴 铁律：任何 Quake API 调用前，必须先确保有一个已登录 Quake 的标签页。**

```python
# Step 1: 查找已有 Quake 标签页
# 用 get_windows_and_tabs 查找
# 如果已有 Quake 标签页 → 直接用，不要新建

# Step 2: 如果没有 → 导航到 quake.360.net
chrome_navigate(url="https://quake.360.net")

# Step 3: 验证是否已登录（检查页面是否有 "检索" 等登录后元素）
chrome_get_web_content → 检查页面内容
# 如果未登录 → 提示用户 "请先登录 Quake 360"
```

**快速导航到搜索页模板（⭐ 主方案，推荐）：**
```python
# ⭐ 主方案：导航到搜索页读渲染文本（最稳、数据最全）
# 优点：能看到所有端口（HTTP+非HTTP，如Redis/MongoDB/SSH/自定义端口）
# URL 中 &size=30 控制每页条数（默认30，最大60）
chrome_navigate(url="https://quake.360.net/quake/#/searchResult?searchVal=<关键词>&selectIndex=quake_service&latest=true&size=30")
# 导航后读页面文本内容提取资产
chrome_get_web_content
# → 从文本解析关键信息：
#   "共X条 , 含Y个独立IP" → total=X, uniqueIP=Y
#   每条记录解析出：IP / 端口 / 服务名 / 标题 / 地理位置 / 运营商
```

---

### 8.2 核心原理：三个 Quake 索引行为

| 索引 | API端点 | domain搜 | 精确公司名 | body搜 | 最大返回 |
|------|---------|---------|-----------|--------|---------|
| `quake_service` | `/api/search/query_string/quake_service` | ✅ 24 IP | ❌ data[]空 | ✅ 但不可信 | **60条** |
| `quake_host` | `/api/search/query_string/quake_host` | ❌ 空 | ❌ 空 | ❌ 空 | — |
| `aggregations` | `/api/aggregations/quake_service` | — | ✅ uniqueIP计数 | — | — |

---

### ⭐ 2026-07-17 新增：body 关键词搜系统名（中小企业利器）

**实战案例（热付通/辽宁北软）：**

| 搜索方式 | 结果 | 原因 |
|:---------|:-----|:-----|
| `domain:"heatingpay.cn"` | ❌ **0条** | 域名太小，Quake 没收录 DNS 记录 |
| `"heatingpay"` (body搜) | ✅ **168条** | 页面 Title/body 含目标关键词 |
| 命中 IP | **203.0.113.7** | 单 IP 承载 27+ 个系统 |

**核心发现：** 对中小企业，`domain:` 搜索经常扑空，但 `"品牌名/系统名"` body 搜索才是真正有效的搜索方式。

**⚠️ 注意：** 这不违背之前"body 搜索不可信"的铁律——对于大公司 body 搜出来一堆无关 IP 是因为关键词太常见。但对于**中小型公司/特有产品名**，body 搜索反而比 domain 更准。

**判断标准：**
```
搜索命中的 IP 数 <= 10 且 系统标题全部指向目标 → body 搜索结果可信
搜索命中的 IP 数 > 50 且 标题混杂无关内容 → body 搜索误报
```

### ⭐ 2026-07-17 新增：Batch Quake 搜索 → xlsx 输出全流程

Quake 搜索产出数据直接用 `infogather_report.py` 输出到 xlsx：

```
Step 1: 在 Quake 页面内执行 JS fetch API 拉原始数据
  chrome_javascript 执行 quakeSearch('"heatingpay"')

Step 2: AI 将原始记录去重整理 → 组装 JSON（6个sheet映射）
  去重规则: 相同 (IP, port, title) 只保留一条
  字段映射见下方

Step 3: 喂脚本
  python infogather_report.py --target "目标名" --input data.json --output report.xlsx
```

**JSON 速查（6个 sheet 字段映射）：**

| sheet | JSON key | 字段 |
|:------|:---------|:-----|
| 域名资产 | `domains` | domain, unit, ip, source, note |
| IP资产 | `ips` | ip, domain, location, isp, type, source |
| URL资产 | `urls` | url, system, accessible, ip, source, note |
| 系统资产 | `systems` | system, tech, unit, ports, source |
| 社工线索 | `social` | type, content, belong, source |
| 待办列表 | `todos` | priority, action |

**实战命令：**
```bash
cd <技能目录>/infogather
python infogather_report.py \
  --target "热付通/辽宁北软" \
  --input data.json \
  --output report.xlsx
```

---

**🔴 API 硬限制（已验证）：**
- 单次查询最大返回 **60条记录**
- **不支持分页**（`start>0` 返回空数据，`size>60` 返回空数据）
- 所以不要尝试遍历页码取全量——办不到
- `quake_host` 索引对中文公司名完全不可用

---

### 8.3 ⭐ 主方案：导航到搜索页读结果（推荐，数据最全）

> **2026-07-16 更新：** 导航 + `chrome_get_web_content` 读渲染文本已替代 JS fetch API 成为主方案。
> 优势：能看到**所有端口服务**（HTTP+非HTTP如Redis/MongoDB/SSH），不需要处理 credentials/CORS，稳定可靠。

```python
# ⭐ 主方案：导航到 Quake 搜索结果页
chrome_navigate(url="https://quake.360.net/quake/#/searchResult?searchVal=<关键词>&selectIndex=quake_service&latest=true&size=30")

# 读页面文本
chrome_get_web_content
```

**从页面文本解析资产的规则：**
```
头部统计：
  "共X条 , 含Y个独立IP , 用时Z秒" → total=X, uniqueIP=Y

每条记录文本格式（注意换行解析）：
  [hostname] [精度标签]  [IP] [更新时间] [端口] [协议] [组织]
  [自治域编号] [运营商] [IP归属]
  [网站服务器/编程语言/路径/主机名]
  [HTTP响应头片段]
  [页面标题 / 技术栈特征]
  ↓
  解析出：hostname, ip, port, service_name, title, location, isp
```

**实战案例：** 导航 `searchVal=ip%3A%20%22175.6.213.77%22&size=30` 后读文本，
直接提取到11条结果，包括 HTTP(80/8765/8082)、MongoDB(10015)、Redis(10016)、SSH(22)，
**API 模式只能拿到 HTTP 服务，非 HTTP 端口全部漏掉。**

**参数说明（URL中的参数）：**
| 参数 | 说明 |
|------|------|
| `searchVal` | 搜索词（URL编码），如 `ip%3A%20%203.0.113.8%22` 或 `domain%3A%22xxx.com%22` |
| `selectIndex` | 索引类型，填 `quake_service` |
| `latest` | 仅最新数据，填 `true` |
| `size` | 每页条数，**推荐 `30`**（默认30，最大60） |

> ⚠️ `size` 参数在页面 URL 中设置，控制每页显示条数。
> 当前版本不支持真正分页（`start` 偏移参数无效），所以一次最多看到60条。
> 如果资产超过60条，需要用 `domain:"xxx.com"` 缩小范围再搜。

---

### 8.4 备用方案：在 Quake 页面内调 JS fetch API

> 导航页读文本拿不到结构化 JSON 时，可以用此方案补充（只返回 HTTP/HTTPS 服务）。

**🔴 铁律：** 必须在 Quake 页面内通过 `chrome_javascript` 执行，传 `credentials: 'include'` 继承 Cookie。
**绝不能用 `chrome_network_request`，绝不能用硬编码 `Authorization` 头。**

```javascript
// ⭐ 在 Quake 页面内执行（chrome_javascript + credentials: 'include'）
async function quakeSearch(query) {
  const res = await fetch('https://quake.360.net/api/search/query_string/quake_service', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    credentials: 'include',          // 🔴 必须！继承浏览器 Cookie
    body: JSON.stringify({
      query: query,
      latest: "true",
      start: 0,
      size: 30,                      // 推荐 30，最大 60
    })
  });
  const data = await res.json();
  const records = Array.isArray(data.data) ? data.data : [];
  return {
    total: data?.meta?.pagination?.total || 0,
    count: records.length,
    samples: records.slice(0, 5).map(r => ({
      ip: r.ip, port: r.port, hostname: r.hostname || '',
      title: (r.service?.http?.title || '').substring(0, 40),
      service: r.service?.name || ''
    }))
  };
}
// 调用: return await quakeSearch('domain:"xxx.com"');
```

**参数说明：**
| 参数 | 说明 |
|------|------|
| `query` | 搜索语句，`domain:"xxx.com"` 格式 |
| `latest` | `"true"` |
| `start` | 🔴 **不支持分页，必须填 `0`** |
| `size` | 推荐 `30`，最大 `60` |
| `credentials` | 🔴 必须 `'include'` |

---

### 8.5 精确公司名聚合 — 知有资产但拿不到 IP

**关键发现：** `"青海某客户水电开发有限责任公司"` 聚合返回 uniqueIP=59，
但 data API 返回空列表。**不是分页问题，是索引设计问题。**

**对策：**
```
1. 聚合确认 uniqueIP > 0 → 知道该公司确有资产
2. 用 domain:母公司域名 拉全量（但不到具体子公司）
3. 去 Quake 网页手动翻列表模式复制
4. 用 FOFA/Hunter 搜 icp_name / org 替代
```

如需在报告中记录聚合值：

```javascript
// 在 Quake 页面内执行（credentials: 'include'）
async function quakeAggCount(queries) {
  async function count(q) {
    const res = await fetch('https://quake.360.net/api/aggregations/quake_service', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'include',
      body: JSON.stringify({query: q, latest: true, start: 0, size: 1,
        aggregation_list: ["unique_ip", "port", "service_and_version"]})
    });
    const d = await res.json();
    return {
      query: q,
      uniqueIP: d?.data?.unique_ip?.value || 0,
      ports: (d?.data?.port || []).map(p => p.key + '(' + p.doc_count + ')').join(', '),
      services: (d?.data?.service_and_version || []).map(s => s.key + '(' + s.doc_count + ')').join(', ')
    };
  }
  var results = [];
  for (var i = 0; i < queries.length; i++) {
    results.push(await count(queries[i]));
  }
  return results;
}
// 调用: return await quakeAggCount(['"龙羊峡发电分公司"', '"某客户鑫业"']);
```

---

### 8.6 完整工作流

```
Phase 0: 前置准备（🔴 必须先做）
  ├─ get_windows_and_tabs → 找已有 Quake 标签页
  ├─ 无 → chrome_navigate("https://quake.360.net")
  ├─ 确认已登录（页面内容含"检索"）
  └─ 未登录 → 提示用户手动登录

Phase 1: 导航搜 IP/域名（⭐ 主方案）
  ├─ 构造 URL 含 &size=30
  ├─ chrome_navigate → chrome_get_web_content 读文本
  ├─ 从文本提取：所有端口/服务/标题/地理位置
  ├─ 注意区分 HTTP 服务和非 HTTP 服务（Redis/MongoDB/SSH等）
  └─ 如果 asset > 60 条 → 缩小搜索词分段查

Phase 2: JS fetch 补充（备选）
  ├─ 导航方案拿不到结构化数据时使用
  ├─ 只在 Quake 页面内 chrome_javascript + credentials:'include'
  └─ 注意：只返回 HTTP/HTTPS 服务，不包含非HTTP端口

Phase 3: 精确短名聚合（知有资产）
  ├─ 对子公司/电站/系统名逐个查聚合
  ├─ 记录 uniqueIP 数、端口分布、服务分布
  └─ 标记"聚合确认有资产但无法拉取IP"

Phase 4: 输出
  ├─ 可信资产 → 表格输出（IP/端口/服务/标题）
  ├─ 聚合值 → 标注"待手工提取"
  └─ ⚠️ 绝不用 body 搜索/无引号搜索的 IP 混入可信集
```

### 8.7 ⚠️ 坑点与铁律

| # | 坑点 | 说明 |
|---|------|------|
| 1 | **size 上限 60** | `size` 参数最大 60，超过返回空。推荐 `30` |
| 2 | **不支持分页** | `start>0` 无效，不要尝试遍历页码 |
| 3 | **API 只返回 HTTP/HTTPS** | JS fetch API 看不到 Redis/MongoDB/SSH 等非 HTTP 服务 |
| 4 | **导航方案看全量** | ✅ 读页面文本能看到**所有端口**，包括非 HTTP |
| 5 | **精确全名 data[] 空** | `"公司全名"` 聚合有值但 data API 返回 0，不是 bug 是索引设计 |
| 6 | **body 搜索不可信** | 聚合值再大也不能当真，一条条验证 |
| 7 | **`quake_host` 索引对中文无效** | 不要浪费时间 |
| 8 | ❌ **不用 `chrome_network_request`** | 不带 Cookie，返回空 |
| 9 | ❌ **不用硬编码 `Authorization`** | 每个会话 token 不同，写死必失败 |
| 10 | ✅ **导航最稳** | 什么都不依赖，页面渲染什么就能读什么 |

---

## Mode 9: DNS 子域名验证与可达性确认 🔥

> **2026-07-08 新增。** Quake 的 domain 搜索和子域名列表只是第一步，必须用 DNS 解析 + Chrome 导航验证实际可达性。
> 实战结果：30个子域名 → 25个有DNS解析(83%) → 其中部分可公开访问。

### 9.1 核心工作流

```
域名列表（从Quake/crt.sh等获取）
    ↓
Step 1: DNS 批量解析（PowerShell）→ 确认域名真实存在
    ↓
Step 2: Chrome MCP 逐个导航 → 确认HTTP可达性和页面类型
    ↓
Step 3: 记录结果到资产表 → 分级标注（公开/内网/测试环境/404）
```

### 9.2 DNS 批量解析脚本

```powershell
# PowerShell 批量 DNS 解析
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$domains = @('<目标域名>', '<目标域名>', '<目标域名>')
foreach ($d in $domains) {
    try {
        $ips = [System.Net.Dns]::GetHostAddresses($d) | Select-Object -First 2
        $ipStr = ($ips.IPAddressToString) -join ', '
        Write-Output "$d -> $ipStr (OK)"
    } catch {
        Write-Output "$d -> 解析失败"
    }
}
```

### 9.3 Chrome MCP 域名验证脚本

对 DNS 解析成功的域名，用 Chrome MCP 打开验证：
- 先 `chrome_navigate({url:"https://domain"})`
- 再用 `chrome_get_web_content` 读取页面标题和内容
- 判断页面类型：登录页 / 管理后台 / API文档 / 404 / 错误

```javascript
async function verifyDomains(domains) {
  /**
   * domains: string[] — 完整 URL 列表（如 ['https://<目标域名>']）
   * 用于 chrome_javascript 中逐个验证域名可达性
   * 注意：CORS 限制会导致 fetch 失败，必须用 navigate 方式
   */
  const results = [];
  for (const url of domains) {
    try {
      // 用 fetch HEAD 快速验证（但会被 CORS 拦截）
      const res = await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(5000)});
      results.push({url, status: res.status, ok: true});
    } catch(e) {
      // CORS 失败不代表不可达，需要 navigate
      results.push({url, status: 0, corsBlocked: true, error: e.message.substring(0,60)});
    }
  }
  return results;
}
```

### 9.4 域名分级标注

DNS 解析确认后，按以下分级标注到 xlsx：

| 分级 | 含义 | 示例 | 响应策略 |
|------|------|------|---------|
| 🟢 **公开** | Chrome可访问，有页面内容 | <目标域名> | 直接注册/浏览 |
| 🟡 **有解析未知** | DNS有A记录，未验证HTTP | <目标域名> | 需逐个navigate |
| 🔴 **内网/错误** | DNS解析但Chrome报错 | <目标域名> | 可能仅内网可达 |
| ⚫ **IP段异常** | IP与其他域名不同段 | <目标域名>(203.0.113.9) | ⭐ 独立系统可能弱防护 |
| 🟣 **云部署** | IP属于公有云(阿里/腾讯) | <目标域名>(203.0.113.10) | 非自有IP段 |

### 9.5 ⭐ 重点标签

DNS 解析和 Chrome 验证后，以下类型**优先深入**：

| 类型 | 原因 | 实战案例 |
|------|------|---------|
| **测试环境** (UAT/POC/Dev) | 常有弱口令/默认配置 | <目标域名>, <目标域名> |
| **独立IP段** | 与其他域名不同IP | <目标域名> (203.0.113.9 vs 1.207.126.*) |
| **云部署** | 可能由子公司自行运维 | <目标域名> (阿里云) |
| **对象存储** | 可能配置不当导致泄露 | <目标域名> (MinIO) |
| **HR/财务** | 敏感数据 | <目标域名>, <目标域名> |
| **SSO统一认证** | 单点登录入口 | <目标域名> |

---

## Mode 10: 供应链/供应商发散搜索 🔥

> **2026-07-08 新增。** 当目标单位的 DMZ 资产测完发现不多时，核心打法转变：
> **不找目标，找目标用的供应商**。找到供应商后搜「供应商+其他单位暴露的实例」。

### 10.1 核心原理

```
目标单位买的软件系统，同款系统也卖给了其他单位
→ 其他单位的实例可能安全防护弱
→ 找到默认口令/漏洞后，反哺到目标单位
```

**实战案例：**
```
招标公告 → 某客户公司用某供应商LiEMS运维平台
→ 某供应商官网显示服务前十大发电集团
→ Google搜 "某供应商 LiEMS 登录"
→ 可能找到其他暴露的LiEMS实例
```

### 10.2 供应商信息源

| 来源 | 提取的信息 | 优先级 |
|------|-----------|--------|
| **招标公告** | 系统名 + 供应商名 + 版本号 | ⭐⭐⭐ |
| **供应商官网案例页** | 客户列表 + 系统截图 | ⭐⭐⭐ |
| **百度百科** | 供应商背景 + 产品线 | ⭐⭐ |
| **北极星电力网** | 行业新闻 + 签约公告 | ⭐⭐ |
| **招聘网站** | JD中的技术栈 | ⭐ |
| **微信公众号** | 合作动态 | ⭐ |

### 10.3 供应链发散搜索模板

```python
# 搜索模板 — 用 WebSearch 执行

# 1. 供应商官网找案例页
WebSearch(query="<供应商名> 案例 OR 客户 OR 合作伙伴")

# 2. 供应商产品名 + 暴露实例
WebSearch(query="<供应商产品名> 登录 OR admin OR 系统 OR portal")
WebSearch(query="<供应商产品名> site:github.com")
WebSearch(query="<供应商产品名> 默认密码 OR 弱口令 OR 漏洞")

# 3. 系统名 + 目标单位（反查是否有其他暴露入口）
WebSearch(query="<系统名> <目标单位> 登录 OR admin")
WebSearch(query="<系统名> <目标行业> 登录")

# 4. 供应商 + 竞品单位（找同类暴露实例）
WebSearch(query="<供应商名> <竞品单位名> 系统")
```

### 10.4 实战案例：某客户公司供应链发散全流程

```
Step 1: 读已有的资产汇总表 internal_systems sheet
  发现 → 某供应商 LiEMS 7.0、木联能新能源集控系统、正元智慧一卡通

Step 2: 搜供应商官网
  WebSearch("某供应商智慧 某客户 OR 某客户 OR 某客户 运维平台")
  → luculent.net 官网案例页：覆盖40+电站(23光伏/10风电/4水电)，陕甘青3区域

Step 3: 搜同款系统暴露实例
  WebSearch("某供应商 LiEMS 登录 OR 系统 OR portal")
  WebSearch("luculent LiEMS 默认密码 OR 弱口令")
  → 可能找到其他电力集团的暴露LiEMS

Step 4: 搜供应商其他子公司/合资公司
  WebSearch("某供应商 合资 OR 子公司 OR 投资")
  → 某供应商+某客户河南公司合资成立"某客户"
  → 这个合资公司的系统可能同时服务某客户

Step 5: 搜招标公告找更多供应商
  WebSearch("<目标单位> SIS系统 OR 运维平台 OR 集控系统 招标")
  → 西宁发电SIS系统改造公告(2026年) → 确认系统版本和信创计划
```

### 10.5 电力行业核心供应商清单

| 供应商 | 产品 | 关联系统 | Quake搜索语法 |
|-------|------|---------|-------------|
| 某供应商智慧(luculent.net) | LiEMS 运维平台 | 智能运维/SIS/工业互联网安全 | `"某供应商" "LiEMS"` / `"luculent"` |
| 木联能(mlnsoft.net) | 新能源集控系统 | 远程集控/光伏运营分析 | `"木联能"` / `"mlnsoft"` |
| 正元智慧 | 一卡通系统 | 门禁/食堂/考勤 | `"正元智慧"` |
| 中通服科信 | 智能化/信息化 | 弱电/网络集成 | `"中通服科信"` |
| 致远互联 | A8+协同办公 | OA/公文/流程审批 | `"致远A8"` / `"seeyon"` |
| 电能易购(<目标域名>) | 电商平台 | 光e链/企业商城/招标 | `domain:"<目标域名>"` |
| 天枢一号 | 综合智慧能源 | 能源管控/三网融合 | `"天枢一号"` |
| openKylin(麒麟) | 操作系统/4A | 统一认证桌面 | `"4A" "认证" "某客户"` |

### 10.6 xlsx 资产表更新规范

每次供应链发散找到新资产后，按以下规则更新：

| Sheet | 新增内容 | 示例 |
|-------|---------|------|
| **新发现** `new_discoveries` | 每个供应商/系统/子域名一条 | 某供应商LiEMS为某客户40+电站提供运维 |
| **供应链发散** 🆕 | 供应商维度表格 | 供应商/产品/关系/覆盖范围/技术栈/来源 |
| **域名验证** 🆕 | DNS+HTTP验证结果 | 域名/解析IP/状态/备注 |
| **域名资产** `domains` | DNS确认的域名 | <目标域名> → 203.0.113.11 |

---

## Mode 13: OneForAll/Subfinder 异步子域名扫描 🚀

> **2026-07-14 新增。** 利用本地的 OneForAll（全量）和 Subfinder（快速）工具进行异步子域名爆破。
> 不阻塞、不等待，新窗口独立运行，结果通过 Hook/Agent 回调接入管线。

### 13.1 工具位置

| 工具 | 路径 | 特点 |
|------|------|------|
| **OneForAll** | `<本地路径>\<本地路径>SubDomain\` | 全量收集（30+数据源+爆破），较慢但全 |
| **Subfinder** | `<本地路径>\<本地路径>SubDomain\Subfinder\` | 快速API收集，较快但浅 |

### 13.2 启动前确认

🔴 **铁律：必须先让用户确认，不能自动启动。**

```
用户确认步骤:
  1. 展示要扫描的域名列表
  2. 说明扫描预估时间（OneForAll: 30min-2h / Subfinder: 5-15min）
  3. 问:"确认启动异步扫描？"
  4. 用户确认 → 执行启动
  5. 用户拒绝 → 跳过，不阻塞管线
```

### 13.3 异步启动（非阻塞方式）

```powershell
# ⭐ OneForAll 异步启动（推荐 — 全量收集）
# 先把目标域名写进 domain.txt
Set-Content -Path "<本地路径>\<本地路径>SubDomain\domain.txt" -Value "<domain>" -Encoding utf8

# 开新窗口执行，不阻塞当前会话
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command",
    "cd '<本地路径>\<本地路径>SubDomain'; python oneforall.py --targets domain.txt run"
    -WindowStyle Normal

# ⭐ Subfinder 异步启动（快速 — 备选）
# 写入domain.txt（同上）
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command",
    "cd '<本地路径>\<本地路径>SubDomain\Subfinder'; .\subfinder.exe -dL '<本地路径>\<本地路径>SubDomain\domain.txt' -o 'subfinder_res.txt'"
    -WindowStyle Normal
```

### 13.4 结果产出位置

```powershell
# OneForAll 产出
# ─── CSV结果（主产出，含IP/标题/CDN信息）───
#   <本地路径>\<本地路径>SubDomain\all_subdomain_result_*.csv
#   <本地路径>\<本地路径>SubDomain\all_subdomain_result_*.txt
# ─── SQLite数据库（全部结构化数据）───
#   <本地路径>\<本地路径>SubDomain\result.sqlite3
# ─── massdns日志 ───
#   <本地路径>\<本地路径>SubDomain\massdns.log

# Subfinder 产出
#   <本地路径>\<本地路径>SubDomain\Subfinder\subfinder_res.txt
#   或 <本地路径>\<本地路径>SubDomain\Subfinder\<MMDD>\subfinder_res_<MMDD>_<N>.txt
```

### 13.5 Hook 回调：结果接入管线 🔥

OneForAll/Subfinder 异步启动后，**不等待**，继续执行其他 Mode。

当需要接入扫描结果时，通过 Agent 或手动读取结果文件：

```powershell
# ⭐ CSV 解析（OneForAll CSV → 可用的资产数据）
# CSV列: subdomain, ip, port, title, cdn, ...
$csvPath = Get-ChildItem "<本地路径>\<本地路径>SubDomain\all_subdomain_result_*.csv" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName

if ($csvPath -and (Test-Path $csvPath)) {
    Import-Csv $csvPath | ForEach-Object {
        [PSCustomObject]@{
            domain   = $_.subdomain
            ip       = $_.ip
            port     = $_.port
            title    = $_.title
            cdn      = $_.cdn
            status   = $_.status
        }
    }
}

# ⭐ Subfinder 结果解析（纯域名列表）
$subfinderPath = Get-ChildItem "<本地路径>\<本地路径>SubDomain\Subfinder\subfinder_res*.txt" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName

if ($subfinderPath -and (Test-Path $subfinderPath)) {
    Get-Content $subfinderPath | Where-Object { $_ -match '\.' }
}
```

### ⭐ 13.6 Subfinder 结果合并到 A+B 线（强制步骤）

Subfinder 产出的是**纯域名**，必须合并到 A线 TS/SPRAY/EHole 和 B线 desapi：

```powershell
$sub = Get-Content "$env:USERPROFILE\<本地路径>SubDomain\Subfinder\subfinder_res.txt"

# A线 ip.txt — 纯域名（TS 直接吃域名）
$existing = Get-Content "$env:USERPROFILE\<本地路径>Des_ehole\ts\ip.txt" -ErrorAction SilentlyContinue
$sub | Where-Object { $_ -notin $existing } | Add-Content "$env:USERPROFILE\<本地路径>Des_ehole\ts\ip.txt"

# A线 url.txt — 转 http/https URL（SPRAY+EHole 吃完整 URL）
$existing_url = Get-Content "$env:USERPROFILE\<本地路径>Des_ehole\url.txt" -ErrorAction SilentlyContinue
$sub | Where-Object { $_ -notin ($existing_url -replace 'https?://','') } | ForEach-Object {
    "http://$_`nhttps://$_"
} | Add-Content "$env:USERPROFILE\<本地路径>Des_ehole\url.txt"

# B线 url.txt — 转 https URL（desapi 吃完整 URL）
$existing_b = Get-Content "$env:USERPROFILE\<本地路径>desapi-v3\url.txt" -ErrorAction SilentlyContinue
$sub | Where-Object { $_ -notin ($existing_b -replace 'https?://','') } | ForEach-Object {
    "https://$_"
} | Add-Content "$env:USERPROFILE\<本地路径>desapi-v3\url.txt"

Write-Host "[Subfinder] 域名已合并到 A线 ip.txt/url.txt + B线 url.txt"
```

**合并时机：** Subfinder 异步跑完后，Cron 检查到 subfinder_res.txt 有更新 → 立即执行合并 → 推进管线。

### 13.7 结果去重与整合

```python
# OneForAll CSV 解析 + 去重 + 汇总到 xlsx
# 去重规则：
#   1. domain.ip.port 三元组唯一
#   2. 相同 domain 多个端口 → 只保留一条（优先 443 > 80 > 其他）
#   3. CDN IP 标记不删除，但标注 "CDN"

# 整合到 domains/ips/urls/systems sheets:
import csv, json

def parse_oneforall_csv(csv_path):
    """OneForAll CSV → infogather JSON 格式"""
    domains, ips, urls = [], [], []
    seen_domains = set()

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sub = row.get('subdomain','').strip()
            ip = row.get('ip','').strip()
            port = row.get('port','').strip()
            title = (row.get('title','') or '').strip()
            cdn = row.get('cdn','').strip()

            if not sub or sub in seen_domains:
                continue
            seen_domains.add(sub)

            domains.append({
                "domain": sub,
                "unit": "<目标单位>",
                "ip": ip,
                "source": "OneForAll扫描",
                "note": f"port:{port} {title}" + (" CDN" if cdn == "true" else "")
            })

    return {"domains": domains, "ips": ips, "urls": urls}
```

### 13.7 执行流程

```
Step 1: 用户确认要启动异步扫描
Step 2: 写 domain.txt → Start-Process 新窗口启动 OneForAll
Step 3: 继续执行 Mode 2-12 的其他收集工作（不等待）
Step 4: 其他收集完成后，检查结果文件是否已存在：
  ├─ ✅ 已存在 → 解析并整合到 xlsx
  └─ ❌ 未完成 → 告诉用户"扫描仍在后台运行，结果文件在: <本地路径>\<本地路径>SubDomain\"
Step 5: 如果有新发现的域名 → 回到 Mode 3/4/6 对新域名做验证
```

### 13.8 ⚠️ 注意事项

1. **OneForAll 运行时间较长**（10min-2h），取决于目标大小和字典
2. **新窗口启动后不要杀进程** — 否则中间结果会丢失
3. **不要同时启动多个 OneForAll** — 结果文件会覆盖
4. **结果去重很重要** — OneForAll 可能会有大量重复
5. **Subfinder 更适合做快速补充** — 可与 OneForAll 并行
6. **扫描完成后记得写通知** — 告诉用户后台任务已产出结果

---

## ⚙️ 工具依赖说明

| 工具 | 在 Claude Code 中是否可用 |
|------|--------------------------|
| WebSearch | ✅ Bing 搜索 |
| WebFetch | ✅ 网页内容抓取 |
| Chrome MCP | ⚠️ 需配置（chrome_navigate等）|
| PowerShell nslookup | ✅ 基础 DNS 解析 |
| curl (Bash) | ✅ 下载 favicon |
| certutil (cmd) | ✅ 计算 MD5 |
| **infogather_report.py** | ✅ **本 skill 配套脚本** |
| **infogather_dns.ps1** | ✅ **本 skill 配套脚本** |

**不可用的（需用户自行操作）：**
- ❌ OneForAll（需要 Python 环境 + API Key）
- ❌ Subfinder（需要 Go + API Key）
- ❌ FOFA/Hunter 直接搜索（无 API 工具）
- ❌ ENScan（需要 Cookie/API）
- ❌ ARL/EZ（需要部署）

---

## 📝 输出格式（强制表格）

**所有资产输出必须使用表格，禁止用列表/要点格式。**

### 域名资产表

| 域名 | 所属单位 | IP | 来源 | 备注 |
|------|---------|-----|------|------|
| www.example.com | 集团公司 | 1.2.3.4 | ICP备案 | 官网 |
| mail.example.com | 集团公司 | 203.0.113.12 | DNS MX记录 | 邮件服务器 |

### IP 资产表

| IP | 域名 | 地理位置 | 运营商 | 类型 | 来源 |
|----|------|---------|--------|------|------|
| 1.2.3.4 | example.com | 北京 | 电信 | CDN节点 | DNS解析 |
| 1.2.3.0/24 | example.com | 北京 | 电信 | C段 | WHOIS |

### URL 资产表

| URL | 系统类型 | 可访问性 | IP | 来源 |
|-----|---------|---------|-----|------|
| https://dev.example.com/login | OA登录页 | ✅ 公开 | 1.2.3.4 | Bing site语法 |
| http://1.2.3.4:8080 | Tomcat管理 | ❓ 未知 | 1.2.3.4 | 证书反查 |

### 系统资产表

| 系统 | 技术栈 | 单位 | 端口猜测 | 来源 |
|------|--------|------|---------|------|
| OA系统 | 致远A8 | 集团公司 | 8080/8443 | 招标公告 |
| ERP | Oracle EBS | 集团公司 | 8000/8001 | 招标公告 |

### 社工线索表

| 类型 | 内容 | 归属 | 来源 |
|------|------|------|------|
| 邮箱 | <邮箱> | 某部门 | ICP备案 |
| 电话 | 010-xxxxxxx | 总部 | WHOIS |

---

## 🛠 配套脚本工具

### 脚本位置

所有脚本位于本 skill 目录下：
```
<技能目录>/infogather/
├── SKILL.md                     ← 本文件
├── infogather_report.py         ← xlsx 报告生成器
├── infogather_quake.py          ← Quake 数据质检+转换工具
└── infogather_dns.ps1           ← 批量 DNS 解析
```

### 使用方式

搜索完成后，Claude Code 会自动调用这些脚本产出 xlsx/pdf 报告到桌面。

### infogather_report.py — xlsx 报告生成器

```bash
# 生成 xlsx 报告（带多 sheet）
python.exe <技能目录>/infogather/infogather_report.py \
  --target "目标名称" \
  --output "<本地路径>\<本地路径>infogather_结果.xlsx"

# 从 JSON 文件导入已有数据
python.exe <技能目录>/infogather/infogather_report.py \
  --target "目标名称" \
  --input data.json \
  --output report.xlsx
```

**🔴 铁律：JSON → xlsx 字段映射表（字段名必须严格匹配脚本预期）**

| sheet | JSON key | 字段名(按顺序) | 字段说明 |
|-------|---------|---------------|---------|
| **股权结构** 🆕 | `equity` | `level, company, share, capital, person, date, insured, website, icp, emails, address, source` | 层级/公司名称/持股比例/注册资本/法人/成立日期/参保数/官网域名/ICP备案/邮箱/地址/来源 |
| 域名资产 | `domains` | `domain, unit, ip, source, note` | 域名/所属单位/IP/来源/备注 |
| IP资产 | `ips` | `ip, domain, location, isp, type, source` | IP/关联域名/地理位置/运营商/类型/来源 |
| URL资产 | `urls` | `url, system, accessible, ip, source, note` | URL/系统类型/可访问性/IP/来源/备注 |
| 系统资产 | `systems` | `system, tech, unit, ports, source` | 系统/技术栈/归属单位/端口猜测/来源 |
| 社工线索 | `social` | `type, content, belong, source` | 类型/内容/归属/来源 |
| 待办列表 | `todos` | `priority, action` | 优先级/操作建议 |

**JSON 示例（字段名必须与此完全一致）：**

```json
{
  "equity": [
    {"level": "母公司", "company": "某客户（中国）投资有限公司", "share": "—", "capital": "1.281亿USD", "person": "汪涛", "date": "1999-06-01", "insured": "10人", "website": "<目标域名>", "icp": "", "emails": "jianling.liu@<目标域名>", "address": "上海徐汇区...", "source": "小蓝本"},
    {"level": "├─ 子公司", "company": "某客户供应链管理（张家港）", "share": "100%", "capital": "3亿", "person": "黄多多", "date": "2022-04-13", "insured": "3人", "website": "无独立官网", "icp": "", "emails": "lulu.guo@<目标域名>", "address": "张家港保税区...", "source": "小蓝本股权穿透"},
    {"level": "│   └─ 孙公司", "company": "兰州博阅物流有限公司", "share": "100%", "capital": "9500万", "person": "黄多多", "date": "2019-04-04", "insured": "0人", "website": "无独立官网", "icp": "", "emails": "Lucy.Ma@<目标域名>", "address": "甘肃省兰州市...", "source": "小蓝本股权穿透"}
  ],
  "domains": [
    {"domain": "example.com", "unit": "目标公司", "ip": "1.2.3.4", "source": "ICP备案", "note": "官网"}
  ],
  "ips": [
    {"ip": "1.2.3.0/24", "domain": "example.com", "location": "北京", "isp": "电信", "type": "C段", "source": "WHOIS"}
  ],
  "urls": [
    {"url": "https://admin.example.com", "system": "后台管理", "accessible": "公网可达", "ip": "1.2.3.4", "source": "DNS爆破", "note": "⭐可深入"}
  ],
  "systems": [
    {"system": "OA系统", "tech": "致远A8", "unit": "目标公司", "ports": "8080", "source": "招标公告"}
  ],
  "social": [
    {"type": "邮箱", "content": "<邮箱>", "belong": "信息部", "source": "企业信息"}
  ],
  "todos": [
    {"priority": "⭐⭐⭐", "action": "测试目标系统弱口令"}
  ]
}
```

**🚨 写入铁律：**
1. JSON 的顶级 key 必须是 `equity`/`domains`/`ips`/`urls`/`systems`/`social`/`todos`，**不能自定义**（如 `internal_systems`/`contacts`/`ip_segments` 统统不识别）
2. `equity` sheet 的 `level` 字段用层级树标识（`母公司`/`├─ 子公司`/`│   └─ 孙公司`），脚本原样写入
3. 每个对象的字段名必须与上表 `字段名` 列完全一致，大小写敏感
4. 字段顺序不重要，但**字段名必须对**（如 `unit` 不是 `belong_to`，`system` 不是 `name`）
5. 缺少字段不会报错（自动写空），但**多余字段会被静默忽略**
6. 如果数据量巨大（>1000条），xlsx打开较慢，建议分成多个JSON分别导入

### infogather_quake.py — Quake 数据质检 & 报告转换

```bash
# 1. body 搜索产出质检（判断搜索结果是否可信）
python infogather_quake.py check quake_records.json "热付通"
# → 输出 confidence: high/medium/low + IP数 + 标题匹配率

# 2. Quake 原始记录 → 直接喂 infogather_report.py
python infogather_quake.py to-report quake_records.json "目标名" report_data.json
python infogather_report.py --target "目标名" --input report_data.json --output report.xlsx

# 3. 一键完成（从 Quake 原始记录到 xlsx）
python infogather_quake.py to-report data.json "热付通" /dev/stdout | \
  python infogather_report.py --target "热付通" --input /dev/stdin --output report.xlsx
```

### infogather_dns.ps1 — 批量 DNS 解析

```powershell
# 从文件读取域名列表，批量解析 IP
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<技能目录>/infogather/infogather_dns.ps1" -InputFile domains.txt -OutputFile dns_results.csv

# 直接传参
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<技能目录>/infogather/infogather_dns.ps1" -Domains "www.hhsd.com.cn,mail.hhsd.com.cn,api.hhsd.com.cn"
```

---

## Mode 14: 爱企查 (aiqicha.baidu.com) — 高效股权穿透管线 ⭐

> **2026-07-18 新增。** 某客户/某客户中国实战证明：小蓝本（Vue SPA）导航不稳定、数据不全，
> 而**爱企查（百度系）渲染稳定、数据全、搜索准**，更适合批量子公司收集。

### 14.1 核心优势 vs 小蓝本

| 对比维度 | 爱企查（aiqicha.baidu.com） | 小蓝本（sou.xiaolanben.com） |
|---------|---------------------------|---------------------------|
| SPA稳定性 | ✅ 百度系SPA，导航稳定 | ❌ Vue SPA频繁断连 |
| 子公司展示 | ✅ 搜"某客户供应链"→ **53家** | ❌ 只显示VIP可查看数量 |
| 联系方式 | ✅ 电话/邮箱全量显示 | ⚠️ 部分脱敏 |
| 搜索可靠性 | ✅ `chrome_navigate(url)` 稳定 | ❌ JS跳转经常不渲染 |
| 数据详实度 | ✅ 注册资本/法人都齐全 | ⚠️ 经常"undefined" |

### 14.2 爱企查搜索模板

```python
# 搜索公司（最稳 — 直接导航到URL）
chrome_navigate(url="https://aiqicha.baidu.com/s?q=公司名&t=0")
# → 用 chrome_get_web_content 读渲染结果
# → 搜到的结果从页面正文提取，比read_page更全

# 搜索关键词（批量搜子公司别名）
chrome_navigate(url="https://aiqicha.baidu.com/s?q=关键词&t=0")
```

**参数说明：**
| URL参数 | 说明 |
|---------|------|
| `q` | 搜索词（URL编码），如 `某客户供应链管理` |
| `t=0` | 搜索全部（企业/品牌/项目） |

### 14.3 批量子公司发现（核心打法 🔥）

**原理：** 搜母公司简称/品牌名 → 爱企查返回所有关联的子公司 → 文本提取名称+资本+法人+邮箱+电话

```python
# 1. 搜"某客户供应链" → 发现53条记录
chrome_navigate(url="https://aiqicha.baidu.com/s?q=某客户供应链&t=0")

# 2. 从 get_web_content 文本解析每个公司条目
# 每条记录格式：
#   某客户供应链管理（XXX）有限公司 [状态]
#   法定代表人：黄多多
#   注册资本：X,XXX万(元)
#   成立时间：YYYY-MM-DD
#   电话： 021-XXXXXXXX
#   邮箱： xxx@<目标域名>
#   地址：XXXX
#   品牌项目：某客户供应链

# 3. 提取关键字段
#   法人统一 → 某客户系（全是黄多多）
#   邮箱后缀 → 全是 @<目标域名> → 确认是某客户直接管理
#   地址分布 → 掌握全国布局
```

### 14.4 爱企查实战提取模板（从页面文本解析）

```python
# 从 get_web_content 返回的 textContent 解析
# 正则匹配模式：
re_company = r"([^。]+?)有限公司[^。]*?(开业|存续)"
re_capital = r"注册资本[：:]?([\d,]+万\(元\))"
re_person = r"法定代表人[：:]?(\S+)"
re_date = r"成立时间[：:]?([\d-]+)"
re_tel = r"电话[：:]?([\d-]+)\s"
re_email = r"邮箱[：:]?([\w.@]+)"
re_address = r"地址[：:]?([^\n]+)"
```

### 14.5 🔴 实战核心发现（某客户案例）

**某客户供应链 = 某客户中国全国物流网！**
- 搜"某客户供应链"一次发现 **10家** 公司（小蓝本只显示4家）
- 法人全部是 **黄多多**（某客户中国首席供应链官）
- 邮箱全部是 **@<目标域名>** 后缀 → 某客户直接管理
- 注册资本合计约 **12.5亿+**，覆盖 **8城**

**启发：搜品牌名/产品名比搜公司全名更快找出关联公司**
```
搜"某客户" 比搜"某客户供应链管理（上海）有限公司" 好10倍
搜"黄记煌" 直接出所有黄记煌系公司
搜"小肥羊" 出小肥羊全部关联公司
```

### 14.6 🎯 主要应用场景

| 场景 | 搜索词 | 预期结果 |
|------|--------|---------|
| 供应链体系 | `某客户供应链` | 全部某客户区域公司 |
| 品牌矩阵 | `黄记煌` / `小肥羊` / `肯德基` | 全部品牌关联公司 |
| 集团体系 | `某客户中国` | 超大型集团所有子/分公司 |
| 高管关联 | `黄多多` | 高管担任法人的所有公司 |
| 供应商体系 | `供应商名` | 供应商是否在目标体系内 |

---

## Mode 15: 网络测绘工具组合拳 — 某客户实战经验（2026-07-18）⭐

> 某客户/某客户中国实战中同时使用了 Quake + FOFA + Hunter + DNSDumpster + Subfinder + crt.sh 六款工具，
> 以下对比每款工具的实际产出、查询语法、坑点，用于指导未来目标快速选型。

### 15.1 某客户实战数据参照表（同一目标对比）

| 工具 | <目标域名> | <目标域名> | <目标域名> | cert反查"某客户咨询" | 使用方式 |
|------|-----------|-------------|-----------------|-------------------|---------|
| **Quake** | 811条/17子域名 | 0条(domain) / 2706条(cert) | 33条 | 2706条 ⭐ | Chrome MCP导航+JS fetch API |
| **FOFA** | 559条/26新子域名 | 481条/50+内部系统 ⭐ | 9条 | 未查 | Python API(200次/日) |
| **Hunter** | 276条/3新子域名 | 237条/5新子域名 | 未查 | 未查 | Chrome MCP导航 |
| **DNSDumpster** | 18条(含IP映射) | 未查 | 未查 | 未查 | HackerTarget curl API |
| **Subfinder** | 25子域名 | 未查 | 未查 | 未查 | 本地exe(已有结果) |
| **crt.sh** | 12子域名(全被覆盖) | 未查 | 未查 | 未查 | bash curl(被墙502) |

**结论：**
- 三款测绘工具（Quake/FOFA/Hunter）**各有独家发现**，互补使用效果最佳
- DNSDumpster/crt.sh对大型企业已被测绘工具覆盖
- Subfinder作为本地补充仍有独家贡献（7个）

### 15.2 FOFA API 操作手册（配合 fofa-api skill）

**前置：** fofa-api skill 从环境变量 FOFA_API_KEY 读取密钥（未配置则跳过该情报源），200次/日配额有限。

```powershell
# 设置环境变量（一次会话一次）
# 密钥从环境变量读取（FOFA_API_KEY）；未配置则跳过该情报源
$env:FOFA_ROUTE = "3"

# 验证剩余配额
python "<技能目录>\fofa-api\fofa.py" validate

# 核心搜索：domain搜子域名（推荐size=50，兼顾覆盖和配额）
python "<技能目录>/fofa-api/fofa.py" search 'domain="<目标域名>"' ip,port,host,title,server,icp --size 50

# 过滤有意义的title（排除状态码页面）
python "<技能目录>/fofa-api/fofa.py" search 'domain="<目标域名>" && title!="-" && title!="301" && title!="403" && title!="404" && title!="502"' ip,port,host,title --size 50
```

**某客户实战三个最佳查询：**
```
domain="<目标域名>"                        → 子域名 559条（基础）
domain="<目标域名>" && title!=...         → 内部系统 481条（过滤无用标题）
cert="某客户咨询（上海）有限公司"               → 证书关联 2706条（Quake做的）
```

**🔴 FOFA经验教训：**
```
1. 配额省着用！200次/日，每查询大概消耗5-10次配额
2. 先domain搜 → 再title过滤 → 再cert反查（优先级排序）
3. 不要用body搜！容易误报且耗配额
4. title!="-" 过滤能筛掉大量无标题记录
```

### 15.3 Hunter 操作手册（Chrome MCP导航）

**前置：** Edge浏览器打开 `https://hunter.qianxin.com/` 并登录

**语法与导航：**
```python
# 搜索语法：domain.suffix="目标.com"
chrome_navigate(url="https://hunter.qianxin.com/home/list?search=ZG9tYWluLnN1ZmZpeD0i....&conditions=")
# search参数 = base64("domain.suffix=\"<目标域名>\"")
# 更简单：手动在搜索框输入 domain.suffix="<目标域名>" 然后点搜索
# → chrome_get_web_content 读结果
```

**核心语法对照表：**
| 查询目标 | FOFA语法 | Hunter语法 |
|---------|---------|-----------|
| 主域名 | `domain="xxx.com"` | `domain.suffix="xxx.com"` |
| 证书组织 | `cert="xxx"` | `cert.subject.org="xxx"` |
| 标题 | `title="xxx"` | `title="xxx"` |
| IP | `ip="1.2.3.4"` | `ip="1.2.3.4"` |

**某客户实战结果：**
```
domain.suffix="<目标域名>"    → 276条（ICP主体：某客户）
domain.suffix="<目标域名>"  → 237条（发现smtps/syslog/ldaps/netease-dlp等邮件系统）
```

**🔴 Hunter经验教训：**
```
1. URL中search参数是base64编码的查询语法，不是明文
2. 导航后如果404，回到首页再搜
3. 读结果用 get_web_content，read_page会太稀疏
4. 500积分/天，不限次查询（积分用于导出）
```

### 15.4 DNSDumpster → HackerTarget API（Web被墙时用）

**原理：** DNSDumpster的作者也维护HackerTarget，后者有直接curl API。

```bash
# HackerTarget hostsearch API（free，无需key）
curl -s "https://api.hackertarget.com/hostsearch/?q=<目标域名>"

# 输出格式：
# <目标域名>,203.0.113.13
# <目标域名>,203.0.113.14
# ...
```

**某客户实战产出：** 18个子域名+IP映射，发现新IP段 `203.0.113.15/16`、`203.0.113.16/16`

**🔴 什么时候用DNSDumpster/HackerTarget：**
```
Quake/FOFA都查不到的中小企业 → 用这个补充
需要IP映射（子域名→IP对照表）→ 这个直接带IP
DNS历史记录 → HackerTarget的dnslookup接口
```

### 15.5 Subfinder 操作手册（本地工具，零成本）

**路径：** `<本地路径>\<本地路径>SubDomain\Subfinder\subfinder.exe`

```powershell
# 单域名扫描
.\subfinder.exe -d <目标域名> -o output.txt

# 批量扫描
.\subfinder.exe -dL domain.txt -o subfinder_res.txt
```

**某客户实战：** `output_某客户.txt`已有25个子域名，其中7个是Quake/HackerTarget没发现的

**🔴 Subfinder经验：**
```
1. 优先检查已有output_某客户.txt ! 可能已经跑过
2. 结果需要DNS验证（部分域名可能已失效）
3. Subfinder发现的域名需要跟Quake/FOFA交叉对比
4. 免费且快（5-15分钟），作为测绘工具的前置补充
```

### 15.6 crt.sh bash curl（WebFetch被墙时的备选）

**问题：** `crt.sh` 在国内被墙，WebFetch无法访问。但bash curl有时能过。

```bash
# crt.sh JSON接口（bash curl，加超时）
curl -s --connect-timeout 10 "https://crt.sh/?q=%<目标域名>%25&output=json" | python3 -c "
import json,sys
data = json.load(sys.stdin)
names = set()
for item in data:
    for n in item.get('name_value','').split('\n'):
        n = n.strip().lower()
        if n: names.add(n)
for n in sorted(names): print(n)
print(f'\n--- Total: {len(names)} ---')
"
```

**坑点：** 返回502是常态，多试几次或换时间段。某客户实战crt.sh只返回12条且全被覆盖，价值有限。

### 15.7 六款工具选择决策树

```python
目标域名
│
├─ 大企业/上市公司（一定有测绘数据）
│   ├─ ⭐ Quake MCP导航 → domain搜（主）
│   ├─ ⭐ FOFA API → title过滤搜（补充）
│   ├─ ⭐ Hunter MCP导航 → domain搜（交叉验证）
│   ├─ Subfinder（本地补充，免费）
│   └─ DNSDumpster（需要IP映射时）
│
├─ 中小企业/独立站点
│   ├─ Subfinder（免费，本地跑）
│   ├─ DNSDumpster/HackerTarget（免费API）
│   └─ 以上无结果 → 再上Quake/FOFA（避免浪费配额）
│
├─ 需要内部系统发现（cert反查）
│   ├─ Quake cert反查（最稳定）
│   └─ FOFA cert反查（补充）
│
└─ 需要ICP备案号/IP段/组织信息
    ├─ FOFA icp字段
    └─ Hunter ICP主体信息
```

### 15.8 某客户实战效率总结（可复用模板）

**最佳执行顺序（省配额+省时间）：**
```
Step 1: Subfinder（检查是否有历史结果，免费的先跑）
Step 2: DNSDumpster HackerTarget API（免费，批量获取子域名+IP映射）
Step 3: Quake 导航（无配额限制，domain+cert双查）
Step 4: FOFA API（有配额限制，先domain搜再title过滤）
Step 5: Hunter MCP导航（交叉验证，获取ICP主体信息）
```

**某客户实战消耗：**
```
Subfinder: 已有结果0消耗
DNSDumpster: 1次curl（免费）
Quake: 3次导航查询（免费无限制）
FOFA: 6次查询（消耗31次配额/剩169）
Hunter: 2次导航查询（积分不限）
总计: ~10次操作，覆盖6源，发现66+子域名
```

### 15.9 🔴 实战最大教训总结

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| 只用小蓝本查子公司 | 只看到4家供应链公司 | 爱企查搜品牌名→发现10家 |
| 只用Quake一个测绘 | 漏掉<目标域名> 481条内部系统 | FOFA+Hunter交叉验证 |
| 不知道Subfinder已有结果 | 重复做DNSDumpster查询 | 先检查本地历史文件 |
| crt.sh苦等WebFetch | 502被墙浪费5+轮 | 换bash curl或跳过 |
| FOFA不设title过滤 | 551条混满无用记录 | `title!="-"` 缩小到302条有用数据 |
| 测绘完不做股权穿透 | 只看到IP不知道归属 | 先爱企查/小蓝本画组织树 |
| FOFAA配额一次用完 | 后需无配额可用 | 省着用，每次size=50，不够再加 |

---

## ⚠️ 注意事项

1. **Bing 搜国内资产有限** — 出不来结果不是你的问题，测绘工具优先（Quake/FOFA/Hunter）
2. **WebSearch 有频次限制** — 分批搜索，每次等结果回来再发下一批
3. **crt.sh 国内被墙** — 不要死磕，用bash curl尝试，不行就跳过。测绘工具的cert反查能覆盖大部分
4. **子公司递归必须做** — 往往子公司的防护比母公司弱。用 Mode 2 完整流程（备案号反查→联系人反查→地址反查→招标提取→递归）
5. **Body 关键字是边缘资产神器** — 搜到的非目标域名可能正好是供应链/仿冒资产
6. **被搜索公司名太长时** — 用 `"核心词" OR "简称"` 模式
7. **遇到蜜罐** — 如果 IP 所有端口都开放，基本是蜜罐
8. **🔴 输出必须用表格** — 禁止列表/要点格式
9. **搜完后调用 xlsx 脚本输出到桌面** — 方便用户批量验证
10. **🔴 xlsx 写入铁律** — JSON 字段名必须严格匹配脚本预期（`equity`/`domains`/`ips`/`urls`/`systems`/`social`/`todos`），**`equity` 必须包含 `level` 字段体现层级树**
11. **每个下级单位单独做一套完整的 Phase 1-8** — 不要以为母公司没有的资产子公司也没有
12. **域名有A记录不等于属于目标** — DNS 爆破出的域名需要通过 IP 段归属、备案信息、页面内容三重确认
13. **WebFetch被墙的备用方案** — crt.sh/site.ip138.com等被墙时，用bash curl + 超时尝试，仍不行则跳过
14. **先输出表格报告再生成 xlsx** — 所有搜索结果先整理为 Markdown 表格输出给用户确认，再生成 xlsx 落地
15. **爱企查优先于小蓝本** — 搜子公司/供应链/品牌矩阵时，爱企查数据更全、渲染更稳、导航不丢
16. **搜品牌名优于搜公司全名** — 搜"某客户"一次出10条 vs 搜全称出1条
17. **测绘工具组合拳** — 单工具必有遗漏，Quake+FOFA+Hunter三源互补最佳。Subfinder/DNSDumpster免费工具先跑
18. **FOFA配额省着用** — 200次/日，先title过滤再搜，每次size=50够用
19. **先检测本地历史结果** — Subfinder的output_某客户.txt可能已有成果，先检查再重复跑
20. **Hunter的search参数是base64编码的** — 不是明文，直接页面搜索更方便

---

## Mode 16: 域名ICP备案批量扫描（2026-07-30 全局精简版新增，已并入）⭐

> 三级兜底体系：L1 爬首页 footer → L2 搜索引擎 → L3 工信部官网

### 16.1 快速使用

```powershell
# 内置默认域名（某客户系）
pwsh -File <技能目录>/infogather/domain-icp-scan.ps1

# 指定域名（逗号分隔）
pwsh -File <技能目录>/infogather/domain-icp-scan.ps1 -Domains "<目标域名>,<目标域名>"

# 从文件读域名（每行一个）
pwsh -File <技能目录>/infogather/domain-icp-scan.ps1 -DomainFile <输入文件>
```

> ⚠️ Windows 无 pwsh 时用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...`

### 16.2 三级方案

| 层级 | 方法 | 覆盖 | 说明 |
|------|------|:----:|------|
| **L1** | 爬首页 footer | ~60% | 最快，`Invoke-WebRequest` grep ICP备案号 |
| **L2** | 搜索引擎快照 | ~30% | 搜"域名 ICP备案号" |
| **L3** | 工信部官网 | ~10% | 浏览器打开 beian.miit.gov.cn |

### 16.3 区分状态码

| 状态 | 含义 | 下一步 |
|------|------|-------|
| 200 | 有响应但 footer 无备案号 | L2 |
| 3xx | 跳转 | 追跳转后域名 |
| 无响应 | 域名过期/停用 | L3 |
| 403/503 | WAF拦截 | L2 |

### 16.4 输出

结果导出到桌面 `域名ICP备案结果.csv`。

### 16.5 ⚠️ 排障经验（2026-08-05 实测）

| 坑点 | 原因 | 修复 |
|------|------|------|
| 中文乱码/解析失败 | PowerShell 5.1 按 ANSI 读 UTF-8 无 BOM 脚本 | 脚本必须存 **UTF-8 带 BOM** |
| 只循环一次域名 | `param([string]$Domains)` 与脚本内 `$domains` 变量**大小写不敏感同名**，数组被强转 String | 脚本内数组变量改名 `$targetDomains` |
| 全目标"无响应" | 本机需代理访问目标域名，脚本未带代理 | 直连测试验证；必要时给 Invoke-WebRequest 加代理 |
| 备案号只匹配沪/京/粤 | 正则省份字串写死 | 扩展为全省份字串 |

---

## Mode 17: 供应链信息收集（六维度全流程）⭐ 2026-08-05

> 供应链收集不是单一手段，而是 **FOFA 资产测绘 + WebSearch 企业关系** 双路并行的六维度收集。
> FOFA 铺资产面（域名/IP/证书），WebSearch 补企业关系（人员/供应商/招投标），互相不可替代。

### 17.1 双路核心

| 路 | 手段 | 能挖到 | 挖不到 |
|:--|:----|:-------|:-------|
| **A 路 FOFA** | `cert=`/`domain=`/`ip=` 反查 | 域名/IP/证书/系统/端口 | 企业组织关系、供应商、人员 |
| **B 路 WebSearch** | 搜索引擎/招标/企业库 | 供应商/招投标/人员/公众号/小程序 | 资产 IP、开放端口 |

> **教训（某客户实战）**：只走 FOFA 会漏掉「某供应商 SCM 供应商」「某客户 SCM 历史入口」
> 「某供应商收银系统」等企业关系；只走 WebSearch 拿不到 121 条资产明细。**必须双路并行。**

### 17.2 六维度清单

```
① 域名资产    → FOFA cert/domain + crt.sh + DNSDumpster
② Web系统矩阵 → FOFA domain="主域" 翻页拉全（admin/spscm/kibana/MinIO 等）
③ 人员信息    → WebSearch 公司名+邮箱/联系人/招聘 + 爱企查联系方式反查
④ 供应链供应商 → WebSearch 公司名+收银/ERP/SCM/信息化 + FOFA cert=供应商域名
⑤ 招投标线索   → WebSearch 公司名+招标/采购/中标 → 提取系统名/厂商/地址/联系人
⑥ 高价值资产   → FOFA ip="关键IP" 全端口 → VPN/供应商门户/管理面板
```

**WebSearch 搜索模板（B 路）：**
```
"<公司名>" 供应链 OR 采购 OR SCM OR 供应商平台
"<公司名>" 信息化 OR 系统 建设 OR 招标 OR 采购 2024 OR 2025
"<公司名>" 收银 OR POS OR ERP OR 会员
"<公司名>" 邮箱 OR 联系人 OR IT OR 招聘
"<公司名>" 公众号 OR 小程序 OR APP
```

### 17.3 FOFA 脚本（A 路自动化）

`supply_chain_collect.py`（本 skill 目录）

```powershell
python "<技能目录>\infogather\supply_chain_collect.py" --target 某客户
```

| 参数 | 说明 |
|------|------|
| `--target` | 目标关键字（公司英文名/品牌名/中文名） |
| `--key` | FOFA API Key（或 `FOFA_API_KEY` 环境变量） |
| `--cert-exact` | 证书精确匹配 `cert.subject.cn=`（减少误报） |

脚本流程（内置 15s 间隔铁律）：
```
Step1: cert="<target>"         证书反查 → 发现供应链域名/IP（核心，一步出全貌）
Step2: domain="<域名>"          对发现的每个主域名查子域名资产（限前8个防配额）
Step3: ip="<关键IP>"            对高价值 IP 查全端口（VPN/供应商门户/管理面板）
Step4: 去重 + 导出 xlsx + 域名清单 txt（桌面 supply_chain/）
```

### 17.4 🔴 FOFA 证书搜索正确语法（血泪教训）

**证书字段是点号语法，不是下划线！**
```
❌ cert.subject_cn="<目标域名>"    ← 下划线，FOFA 不认
✅ cert.subject.cn="<目标域名>"    ← 点号，官方语法
```

| 字段 | 含义 | 用途 |
|------|------|------|
| `cert` | 证书全文 | 模糊匹配，关键字必须足够特定 |
| `cert.subject.cn` | 持有者通用名称 | ⭐ 按域名/主机名反查（最准） |
| `cert.subject.org` | 持有者组织 | ⭐ 按公司全称反查所有证书 |
| `cert.issuer.org` / `cert.issuer.cn` | 颁发者 | 同 CA 资产 |
| `cert.domain` | 证书根域名 | 按根域聚合 |

**关键词选择：**
| 目标类型 | 推荐 cert 关键字 |
|---------|----------------|
| 外企/跨国 | 英文品牌名（某客户/某客户/某客户）|
| 国内企业 | 拼音缩写（hhsd）/ 英文域名主体（heatingpay）|
| 集团 | 母公司英文名（命中所有子/分公司证书）|

### 17.5 ⛔ 查询铁律（不可违背）

| # | 铁律 | 原因 |
|:-:|:----|:----|
| 1 | **≥15s 查询间隔** | 3.5s 触发 429 + 风控 |
| 2 | **关键字必须足够特定** | `cert="efuture"` → 483条90%误报；品牌名/域名才安全 |
| 3 | **结果逐个筛查归属** | cert 反查要人工确认是否真属于目标 |
| 4 | **省着用** | Key 有风控风险，一次查最精准 q，不翻页试探 |
| 5 | **domain 查询翻页拉全** | 某客户 121 条要 `--page 2` 才拿全，别只看第一页 |

### 17.6 实战成果（某客户 某客户 验证）

- FOFA 证书+域名+IP 反查 → **121 条资产**、24 个 web 系统
- WebSearch → 挖出 **某供应商 SCM**、**某供应商收银**、**某供应商 POS** 等供应商 + 某客户 SCM 历史入口
- 高价值信号：`<目标域名>` SCM 系统、`admin` 权限管理、`kibana` 日志、MinIO 对象存储、SoftEther VPN
- **挂马信号**：`<目标域名>` 的 www 子域被博彩 SEO 劫持 = 弱管理 → 深挖线索

### 17.7 为什么证书反查有效

```
域名可以乱申请（子域名爆破靠猜）
但 HTTPS 证书必须真实签发 → 证书字段(cert/org/CN)是目标"主动声明"的资产
→ 用它反查 = 找到目标自己承认的资产，命中率高且含边缘资产
```

### 17.8 ⚠️ 坑点

| 坑点 | 说明 |
|------|------|
| 误报多 | 证书关键字太短误伤同名公司（某客户 命中台湾精密机械）→ `--cert-exact` 或人工筛 |
| 配额消耗 | 每个域名/IP 查询消耗次数 → 脚本限域名8个/IP6个 |
| 海外资产 | .my/.tw 海外域是真实分支，别当误报删掉 |
| 时间过滤 | 默认 `--months 12`，老资产去 `--months 36` |
| 浏览器登录 | 爱企查/小蓝本需浏览器登录态（edge-profile），未登录时用 WebSearch 替代 |
| 结果落地 | 完整总表生成见 `AIENV/tmp_js/build_supply_report_full.py`（7 sheet 六维度） |
