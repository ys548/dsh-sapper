---
name: fofa-api
description: 🔍 FOFA 官方 API 调用 — 资产搜索/证书查询/ICP备案查询/域名查询/图标检索/时间筛选/Excel导出
metadata:
  type: skill
---

# FOFA 官方 API 查询 Skill



> **⚠️ 风控实测教训(2026-08-09)**: 连续查询会触发 `[-700] 账号无效` 临时风控!
> - 间隔 ≥15s(skill 铁律), 一次只查最精准的 q, 不翻页试探
> - 单次 size ≤200 条(用户要求), 导出 ≤200 条
> - 触发风控后等 1-2 分钟再试, 用 `info` 接口确认恢复
> - 完整教训链(2026-08-09 实战): 12s 间隔连查 3 次即触发 [-700]; 触发后 info/my 也可能 200 正常但 search 全 700;
>   实际恢复时间 >5 分钟。正确姿势: fofa.py 一条命令只查一个 q, 间隔 16s, 别在一个脚本里 for 循环连查!
> - **Nacos 未授权快速检测**(同批实战): GET /nacos/v1/auth/users?pageNo=1&pageSize=9&search=accurate
>   未授权返回用户列表+bcrypt hash = CVE-2021-29441; 然后 POST /nacos/v1/auth/login {nacos,nacos}
>   默认口令登录 → 控制台全权限 → /nacos/v1/cs/configs 拉配置挖凭据(DB/Redis/MQ)

---

## 快速使用

```powershell
# 密钥从环境变量读取（FOFA_API_KEY）；未配置则跳过该情报源；fofa.py 内置读取，无需传 --key
# 直接运行即可，密钥由环境变量注入
```

## 本机运行姿势(Git Bash 缺失时, 2026-08-15 实测)

> 旧平台的 terminal/read_file/execute_code 通道在 DSH 不存在；统一用 pwsh 起 python/node 子进程。
> fofa.py 绝对路径: `<技能目录>/fofa-api/fofa.py`

```python
import os, subprocess
key = os.environ.get("FOFA_API_KEY")
if not key:
    raise SystemExit("FOFA_API_KEY 未配置，跳过该情报源")
r = subprocess.run(['python', r'<技能目录>/fofa-api/fofa.py',
    'domain', '<目标域名>.example.com', '--size', '200'],
    capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=120)
print(r.stdout)
```

- 输出表格解析正则 + 列语义 + 校验基准 → `references/output-parsing.md`
- `--size 200` 实测有效(用户要求单次 ≤200);头部会打印 `总计 X 条 | 本次返回 N 条` 确认页大小
- 200 条 stdout 约 48KB;输出较大时先落盘（重定向到文件）再统计，避免 pwsh 截断

## 省配技巧

```powershell
# ✅ 推荐：加 --months 2 只查近2个月，省90%+数据配额
python fofa-api/fofa.py domain 'xxx.com' --months 2

# ❌ 不加 --months = 全量
python fofa-api/fofa.py domain 'xxx.com'
```

---

## 所有查询模式

### 1️⃣ 查信息
```powershell
python fofa-api/fofa.py info
```

### 2️⃣ ICP备案查询
```powershell
python fofa-api/fofa.py icp "沪ICP备17028264号"
python fofa-api/fofa.py icp "沪ICP备17028264号" --months 2
python fofa-api/fofa.py icp "17028264" --all --export
```

### 3️⃣ 证书查询
```powershell
python fofa-api/fofa.py cert "*.<目标域名>"          # 通配（同证书）
python fofa-api/fofa.py cert "<目标域名>" exact      # 精确CN匹配
python fofa-api/fofa.py cert "<目标域名>" --months 2 # 近2个月
```

### 4️⃣ 域名查询
```powershell
python fofa-api/fofa.py domain "<目标域名>"
python fofa-api/fofa.py domain "<目标域名>" host     # 精确主机名
python fofa-api/fofa.py domain "<目标域名>" --months 2 --export
```

### 5️⃣ 图标指纹搜索
```powershell
python fofa-api/fofa.py search 'icon_hash="-247388890"'
python fofa-api/fofa.py search 'icon_hash="-247388890"' --months 2
```

### 6️⃣ 自定义 FOFA 语法
```powershell
python fofa-api/fofa.py search 'port=443 && country=CN'
python fofa-api/fofa.py search 'body="暖气" && country="CN"' --months 2
python fofa-api/fofa.py search 'product="Apache"'
```

## 通用选项

| 选项 | 说明 |
|------|------|
| `--months N` | 只查最近N个月的数据（**省配额关键**） |
| `--size N` | 每页条数 |
| `--full` | 全量不限时间范围 |
| `--all` | 自动翻页获取全部数据 |
| `--export` | 导出 Excel（桌面 fofa_export/） |
| `--fields` | 自定义字段 |

## 导出

```powershell
# 导出近2个月数据（省配额）
python fofa-api/fofa.py domain '<目标域名>' --months 2 --export

# 全量导出
python fofa-api/fofa.py domain '<目标域名>' --all --export
```

## 接口

| 接口 | 地址 |
|------|------|
| 账号信息 | `/api/v1/info/my?key=KEY` |
| 分页搜索 | `/api/v1/search/all?key=KEY&qbase64=xxx&size=N&fields=F` |
| 连续翻页 | `/api/v1/search/next?key=KEY&qbase64=xxx&size=N&fields=F` |
| 统计聚合 | `/api/v1/search/stats?key=KEY&qbase64=xxx&fields=F` |

## 🔑 证书字段参考（FOFA 官方语法，点号分隔！）

> ⚠️ **证书字段是点号语法 `cert.subject.cn`，不是下划线 `cert.subject_cn`！**
> `fofa.py` 的 `exact` 模式已正确实现为 `cert.subject.cn=`（2026-08-05 修正）。

| 字段 | 含义 | 用途 |
|------|------|------|
| `cert` | 证书全文 | 模糊匹配，关键字必须足够特定 |
| `cert.subject.cn` | 持有者通用名称 | ⭐ 按域名/主机名反查证书（最准） |
| `cert.subject.org` | 持有者组织 | ⭐ 按公司全称反查该司所有证书 |
| `cert.issuer.org` | 颁发者组织 | 查同一 CA 签发的资产 |
| `cert.issuer.cn` | 颁发者通用名称 | 同上 |
| `cert.domain` | 证书中的根域名 | 按根域聚合 |
| `cert.sn` | 证书序列号 | 精确匹配单张证书 |
| `cert.not_before` / `cert.not_after` | 生效/到期时间 | 查过期证书 |
| `tls.ja3s` / `tls.version` | TLS 指纹/版本 | 指纹识别 |

**用法示例：**
```powershell
# 按持有者 CN 精确反查（推荐）
python fofa.py search 'cert.subject.cn="<目标域名>"'

# 按持有者组织反查（公司全称）
python fofa.py search 'cert.subject.org="某客户主体"'

# 证书全文模糊（仅限特定关键字，通用词必误报）
python fofa.py cert "某客户"          # ✅ 品牌名 OK
# ❌ 不要 cert="efuture" / cert="power" 等通用词 → 90%误报
```

## 按前端框架特征查站 → 各架构 JS URL 样本集 (2026-08-16 实测)

**触发**: 需要不同前端架构的真实存活 JS URL(喂 JS 分析工具/测试不同框架提取能力), 每种架构 N 个。

**框架特征 FOFA q 表 (一次一个 q, 间隔 ≥15s)**:
| 架构 | FOFA q | 备注 |
|---|---|---|
| Next.js | `body="_next/static" && status_code="200"` | 命中率高, 也出 grafana.com 这类大站 |
| Nuxt.js | `body="_nuxt/" && status_code="200"` | 迅雷网盘 pan.xunlei.com 也命中 |
| Vue | `body="id=\"app\"" && body="vue" && status_code="200"` | 误报多, 需回抓页面确认 |
| Angular | `body="ng-version" && status_code="200"` | 最准, 官方站 angular.io/material.angular.io 兜底 |
| React | `body="data-reactroot" && status_code="200"` | 命中率低, 用 react.dev 等官方站兜底 |

**验证流水线 (提取 → 绝对化 → 并发 200 验证)**:
1. 每站 GET 首页 → 正则 `<script[^>]+src=["']([^"']+)["']` 提取 JS
2. 相对路径补全为绝对 URL (注意 //static-pan.xunlei.com 协议相对, /_next/... 站内相对)
3. ThreadPoolExecutor 并发 HEAD/GET 每个 JS URL → 只收 HTTP 200 + application/javascript
4. 数量凑不够时用官方框架站兜底 (react.dev/vuejs.org/vitejs.dev/element-plus.org/nuxt.com/material.angular.io)
   — 架构确定 + 存活率高; FOFA 池里 IP:端口 站(如 :3000)常 500 或证书错, 淘汰换官方站

**坑**: 首页 200 但无 script src = JS 内联/延迟加载(如 JFrog 类), 该站淘汰; 相对路径 JS 直接访问前必须补全 origin,
否则验证的 URL 不可用。框架指纹别只看 body 含 "vue" 字样 — element-plus/iview 类组件库页面也含, 以 script 文件名/构建产物为准。

## 接口路径→全网扩散（找"谁在用这个接口"）(2026-08-17 实战, 点心书法/GetUserPage)

> **触发**: 拿到一个接口路径(如 user/GetUserPage), 要查全网哪些资产暴露它/找同源系统。
> **实战结论**: body 粗查→完整路径精查→登录页 JS 定位真实路径→品牌/登录接口指纹二次扩散。

```
第 1 步 接口片段粗查: body="GetUserPage"        (46条, 混入站群/文档站误报)
第 2 步 完整路径精查: body="/user/GetUserPage"  (11条, 剩 2 组: 点心书法 + .NET福特站)
第 3 步 定位真实路径: 命中站登录页内联 JS 常是 FOFA body 命中的来源 —
       登录成功跳转 location.href='/User/getUserPage' (真实大小写/前缀以代码为准!)
第 4 步 精准指纹二次扩散(替代泛词):
       ✅ body="/AdminUserRole/validata" — 完整控制器+方法路径 (8条全精准)
       ✅ body="点心书法"               — 品牌名 (10条, 锁 1 台服务器)
       ❌ body="AdminUserRole"          — 泛词! 184条几乎全误报 (通用角色名, AI模板站全含)
第 5 步 数据接口(登录后才见) body 查 = 0 条 → FOFA 只索引到登录页层!
       别当"没这接口", 换浏览器登录验证
第 6 步 同系统多部署识别: 同登录接口 + 同 Tomcat 特征 + 登录标题 = 另一部署
       (203.0.113.3:8083/8084 与 203.0.113.4:8081 同指纹)
```

**踩坑**:
- FOFA body 大小写不敏感匹配(GetUserPage/getUserPage 同命中)
- body 命中来源 90% 是登录页内联 JS 或共享 JS bundle; 登录后页面不在索引内
- 命中站先验证端口可达性(203.0.113.3 端口已关 = FOFA 历史快照, 别浪费爆破)
- 继续深挖同系统 → chrome-hack skill Step 6b 时间盲注 + scripts/blind_sqli_extract.py

## 边缘资产关键字匹配收集(title/body/证书/搜索引擎全覆盖, 2026-08-22 实战)

> **触发**: 已按域名/单位清单收过主资产后, 用户要求"结合关键字匹配(title/body/证书/搜索引擎)继续收集边缘资产"。
> **核心结论**: ①最大产出 = `domain 全量反查`(招标/采购平台一个域 = 几十家子单位, 全量翻页后按 title 筛归属);
> ②title 简称为王、body 泛词是大坑(44.9万条 99% 博彩站群, 弃); ③搜索引擎拿新官网域名 → 回 FOFA domain 反查子域
> → 挖 dev/ci/mvn 高价值面; ④泛解析/仿冒/钓鱼单独标记不混入资产; ⑤FOFA 快照≠现状, 必须批量探活。

完整方法论(查询矩阵/三步清洗/泛解析识别/仿冒段聚类/存活验证/优先级) →
`references/keyword-asset-discovery.md`

速查:
- 查询矩阵 10 维度: title简称 / title全称 / title业务词组合 / title历史品牌 / body泛查(弃) / body海外(弃) /
  cert.subject.org公司全称 / domain全量反查(大货) / body引用主域找第三方 / 招标平台全量
- 风控: 一次一 q, 间隔 ≥16s; `--all` 只用于 domain; 每批立即落库
- 泛解析识别: 随机子域+同IP+同title → 只落库主域+业务前缀子域
- 仿冒标记: 随机字母域名+品牌title+海外IP; 同段连发(如 156.225.24.x 出 16+)按段聚类; App"内部版"官网+OSS托管=钓鱼

## 全量资产归属验证引擎(URL清单自动判定, 2026-08-22 实战)

> **触发**: 收集落库后, 用户要求"基于 URL 输出一版资产清单, 并逐条验证哪些是目标集团资产"。
> **成果**: 758 条 → gdt 确认 672(88.7%) + 疑似 17 + 待验证 24 + 第三方 19 + 仿冒 26; 待验证 220→24。
> **判定链**: 仿冒排除 → 主域 → 直属客户系 → **父域继承**(domain 字段常存完整子域, 需 endswith 父域!) →
> 控股子公司 → 第三方承载(单独分类) → 第三方 → 招标租户 → **service 文本证据**(含集团名/客户关键词批量归位) →
> **IP→已知域名映射**(无域名裸 IP 反查归属) → IP段 → 泛解析 → 待验证兜底。
> **白名单分层**: GDT_DIRECT / GDT_SUB / GDT_HOSTED / THIRD_PARTY 分 4 个 set, 别混。
> **撞名教训**: bpeg.cn 北京电力设备总厂=中国能建(非目标客户); 供应商域名挂客户名(ldngzz 辽宁能港铸造)别误判;
> 并购来的域名(qhinv 青海省投)查最新股权再落库。
> 完整方法论+判定规则优先级 → `references/keyword-asset-discovery.md` 第八节

## ⛔ 查询铁律（2026-08-05 新增）

| # | 铁律 | 说明 |
|:-:|:----|:-----|
| 1 | **≥15s 间隔** | FOFA 限流严格，3.5s 会触发 429 Too Many Requests + 风控 |
| 2 | **关键字必须足够特定** | 品牌名/域名/公司全称，不用通用英文词（误报率 60-90%） |
| 3 | **结果逐个筛查** | cert 反查结果要人工确认归属，别把同名误报当资产 |
| 4 | **省着用** | Key 有风控风险，一次查最精准的 q，不翻页试探 |
| 5 | **边缘资产先 domain 全量** | 已发现子单位域名/招标平台域先 `--all` 翻全量子域再按 title 筛归属(单域可出几十~上百子域); body 泛词查询直接弃(99% 博彩站群) |
