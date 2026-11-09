---
name: hunter-qianxin
description: >-
  奇安信鹰图平台(Hunter) 资产测绘 — 浏览器导航/JS fetch API 查资产、证书/ICP/组件指纹、
  数据导出、精度分级。Use when 需要用 Hunter 测绘目标资产、查企业暴露面。
---

# hunter-qianxin — 奇安信鹰图平台(Hunter) 资产测绘技能

> Hunter (https://hunter.qianxin.com/) — 奇安信网络空间测绘
> 前置条件：Edge浏览器已登录Hunter（账号由人工在 Edge 登录维护）
> 某客户实战验证：2026-07-18

---

## 一、界面三种检索模式

Hunter首页顶部有三种检索模式切换按钮：

```
┌──────────┬──────────┬──────────┐
│ 语法检索  │ 图标检索  │ 批量检索  │
├──────────┴──────────┴──────────┤
│ [Search...]                    │
└────────────────────────────────┘
```

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **语法检索** | 默认模式，使用查询语法搜索 | 域名/IP/证书/端口/组件搜索 |
| **图标检索** | 输入URL，自动计算favicon hash并搜索同类站点 | 发现同技术栈站点 |
| **批量检索** | 批量输入IP/域名列表 | 大范围资产梳理 |

---

## 二、三种操作方式

### 方式A：Chrome MCP 导航到搜索结果页（推荐）

```python
# 直接导航到搜索结果（需要手动构造base64编码的search参数）
# search参数 = base64("domain.suffix=\"<目标域名>\"")
# base64编码是Hunter自动生成的，所以更简单的方式是：
# 1. chrome_navigate("https://hunter.qianxin.com/")
# 2. 在页面搜索框输入查询语法 → 点搜索按钮
# 3. chrome_get_web_content 读结果
```

**流程：**
```
Step 1: chrome_navigate("https://hunter.qianxin.com/")
Step 2: chrome_read_page → 找到搜索框ref_54
Step 3: chrome_fill_or_select(ref_54, 'domain.suffix="xxx.com"')
Step 4: chrome_click_element(ref_58) → 点搜索按钮
Step 5: chrome_get_web_content → 读结果
```

### 方式B：图标检索（favicon hash）

```python
# 1. 在首页点"图标检索"按钮（ref_23）
# 2. 输入目标URL（如 https://<目标域名>）
# 3. Hunter自动计算favicon hash并搜索同类站点
# 4. 结果从 get_web_content 读取
```

### 方式C：语法检索模式下的查询语法

在搜索框直接输入：

```python
# ── 基础查询 ──
domain.suffix="xxx.com"              # 主域名搜索
ip="1.2.3.4"                         # IP搜索
ip="203.0.113.9/24"                # C段搜索
port=443                              # 端口搜索

# ── 资产信息 ──
title="后台管理"                       # 标题搜索
title!="-"                             # 排除无标题（某客户实战有效）
protocol="https"                       # 协议过滤
status_code="200"                      # 状态码过滤
web.body="网络空间测绘"               # body内容搜索
web.tag="登录页面"                    # 资产标签（枚举值）
is_web=true                            # 只搜web资产

# ── 证书搜索（7个语法·4个实测可用/3个踩坑）─ ⭐
cert="<目标域名>"                        # ✅ 全文模糊匹配 → 某客户实测148条
cert.subject="<目标域名>"                # ✅ 证书使用者包含 → 某客户实测149条（最稳）
cert.is_trust=true                        # ✅ 证书可信过滤
cert.is_expired=true                      # ✅ 证书已过期
cert.subject_org="奇安信科技"             # ⚠️ 语法存在，但实测"某客户主体"不命中
cert.subject_suffix="qianxin.com"         # ❌ 实测"字段不支持查询"
cert.issuer="Let's Encrypt"              # ⚠️ 语法存在，未实测
cert.issuer_org="Let's Encrypt"          # ⚠️ 语法存在，未实测
cert.sha-256="4e529a65..."              # ⚠️ 语法存在，未实测
cert.serial_number="353512425..."       # ⚠️ 语法存在，未实测

# ── 图标搜索（2种语法）─ ⭐
web.icon="22eeab765346f14faf564a4709f98548"          # 同icon（精确匹配）
web.similar_icon=="17262739310191283300"              # 相似icon（模糊匹配）

# ── 相似网站搜索（2种语法）─
web.similar="baidu.com:443"                           # 网站特征相似
web.similar_id="3322dfb483ea6fd250b29de488969b35"    # 网页相似

# ── ICP备案搜索 ──
icp.name="某客户主体"               # ICP备案企业名
icp.number="京ICP备16020626号-8"      # ICP备案号
icp.web_name="奇安信"                  # ICP备案网站名
icp.type="企业"                         # ICP主体类型
icp.province="江苏"                     # ICP注册省份
icp.city="上海"                         # ICP注册城市
icp.district="杨浦"                     # ICP注册区县
icp.industry="软件和信息技术服务业"    # ICP行业
icp.is_exception=true                   # ICP备案异常

# ── 组件搜索 ──
app="Hikvision 海康威视"               # 组件名
app.name="小米 Router"                  # 组件名（精确）
app.type="开发与运维"                   # 组件分类
app.vendor="PHP"                        # 组件厂商
app.version="1.8.1"                     # 组件版本

# ── 域名WHOIS搜索 ──
domain.registrant_email=="admin@domains.microsoft"  # 域名注册人邮箱
domain.status="clientDeleteProhibited"              # 域名状态
domain.whois_server="whois.markmonitor.com"         # WHOIS服务器
domain.name_server="ns1.qq.com"                     # 名称服务器
domain.creation_date="2022-06-01"                   # 创建时间
domain.expiry_date="2022-06-01"                     # 过期时间
domain.updated_date="2022-06-01"                    # 更新时间
domain.cname="a6c56dbcc1f22283.qaxanyu.com"        # CNAME记录
is_domain.cname=true                                 # 有CNAME解析

# ── IP/AS搜索 ──
ip.tag="CDN"                             # IP标签（枚举值）
ip.port_count>"2"                       # 开放端口数
ip.country="中国"                        # 国家
ip.province="江苏"                       # 省份
ip.city="北京"                           # 城市
ip.isp="电信"                            # 运营商
ip.os="Windows"                          # 操作系统
as.number="136800"                      # ASN
as.name="CLOUDFLARENET"                 # AS名称
as.org="PDR"                             # AS注册机构

# ── 漏洞搜索 ──
vul.cve="CVE-2021-2194"                 # CVE编号
vul.gev="GEV-2021-1075"                # GEV编号
web.is_vul=true                          # 存在历史漏洞

# ── TLS/JARM搜索 ──
tls-jarm.hash="21d19d00021d..."         # JARM哈希

# ── 组合查询（AND） ──
domain.suffix="xxx.com" && title!="-" && status_code="200"

# ── 组合查询（OR） ──
domain.suffix="xxx.com" || domain.suffix="yyy.com"

# ── 排除 ──
domain.suffix="xxx.com" && title!="测试"

# ── 时间范围 ──
after="2021-01-01" && before="2021-12-31"
```

---

## 三、某客户实战流程（可复用模板）

### Step 1: 打开Hunter并确认登录

```python
# Edge已登录，账号由人工在 Edge 登录维护
chrome_navigate("https://hunter.qianxin.com/")
chrome_read_page → 确认搜索框可见
```

### Step 2: domain搜索（<目标域名>）

```python
# 输入搜索词
chrome_fill_or_select(ref_54, 'domain.suffix="<目标域名>"')
# 点搜索按钮
chrome_click_element(ref_58)
# 等5秒渲染
await new Promise(r => setTimeout(r, 5000))
# 读结果
chrome_get_web_content
```

**预期产出：** 276条资产，含10+子域名，ICP主体：某客户主体

### Step 3: domain搜索（<目标域名>）

```python
chrome_fill_or_select(ref_54, 'domain.suffix="<目标域名>"')
chrome_click_element(ref_58)
await new Promise(r => setTimeout(r, 5000))
chrome_get_web_content
```

**预期产出：** 237条资产，邮件系统（Outlook/网易邮件安全）、OA、API集群等

### Step 4: 结果提取模板

从 `get_web_content` 的 textContent 中解析每条资产：

```
字段顺序（从页面文本解析）:
  IP / 云厂商 / 域名 / 端口 / 协议 / 站点标题 / 状态码 / ICP备案企业 / 组件 / 资产标签 / 地理位置 / 更新时间
```

**提取正则：**
```javascript
// 每条资产记录格式（换行分隔）
// 203.0.113.10 云厂商 <目标域名> 443 https - 200 某客户主体...
function parseHunterResults(text) {
    let lines = text.split('\n');
    let assets = [];
    let current = {};
    for (let line of lines) {
        let trimmed = line.trim();
        // 匹配IP开头的新记录
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) {
            if (current.ip) assets.push(current);
            current = {ip: trimmed.split(' ')[0]};
        }
        // 匹配域名
        if (trimmed.includes('.com') || trimmed.includes('.cn')) {
            // 从行中提取域名
            let m = trimmed.match(/[a-zA-Z0-9][-a-zA-Z0-9]*\.[-a-zA-Z0-9.]+\.(com|cn|net|org)/);
            if (m) current.domain = m[0];
        }
        // 匹配状态码
        if (/^[0-9]{3}$/.test(trimmed)) current.status = trimmed;
    }
    return assets;
}
```

---

## 四、重要发现（某客户实战）

### ICP备案主体

| 域名 | ICP备案企业 | 说明 |
|------|------------|------|
| <目标域名> | **某客户主体** | 肯德基/某客户核心资产 |
| <目标域名> | **某客户主体** | 某客户中国体系 |
| <目标域名> | **北京黄记煌餐饮管理有限责任公司** | ICP:京ICP备14003068号 |

> 注意：<目标域名> 的ICP主体不是"某客户咨询"，而是 "某客户主体"
> 这个主体可以用来做更多资产反查！

### 页面解析注意事项

```
1. 搜索后页面渲染需要3-5秒（SPA渲染慢）
2. 搜索结果左栏有聚合面板：资产总数/国家/端口排行/组件排行/域名排行/icon排行
3. 网站标题有图片标识的 → 说明有favicon，可进一步做图标检索
4. 每条资产有"资产详情"按钮，可以点进去查看更多HTTP头/证书信息
5. 顶栏有"API"按钮和"数据导出"按钮（Excel/CSV）
6. 状态码/协议等过滤可以通过顶部下拉菜单直接选
```

---

## 五、搜索结果界面构成

```
┌──────────────────────────────────────────────────────────┐
│ [最近一个月 ▼] [全部资产 ▼] [+标签]    [表头设置] [API] [数据导出] │
├──────────┬───────────────────────────────────────────────┤
│ 左栏聚合  │ IP / 域名 / 端口/服务 / 站点标题 / 状态码    │
│          │ ICP备案企业 / 应用+组件 / 资产标签 / 地理位置   │
│ 资产总数  │ 更新时间                                     │
│ 国家      │ ── 每条记录列 ──                             │
│ 端口排行  │   IP  域名  端口  协议  标题  状态码  ICP    │
│ 组件排行  │   组件1  组件2  标签  位置  时间             │
│ 域名排行  │                                               │
│ icon排行  │                                               │
└──────────┴───────────────────────────────────────────────┘
```

---

## 六、常见查询组合

| 目标 | 语法 | 某客户实战结果 |
|------|------|------------|
| 主域名字资产 | `domain.suffix="<目标域名>"` | 276条 |
| 内部系统发现 | `domain.suffix="<目标域名>" && title!="-"` | 237条 |
| ICP反查 | `icp.name="某客户主体"` | 更多同主体资产 |
| 证书使用者组织 | `cert.subject_org="某客户主体"` | 证书关联资产 ⭐ |
| 证书全文模糊 | `cert="<目标域名>"` | 全部关联证书 |
| 证书SHA-256反查 | `cert.sha-256="4e529a..."` | Censys同款 |
| 同icon站点 | `web.icon="22eeab765346f14faf564a4709f98548"` | 相同favicon站点 |
| 相似icon站点 | `web.similar_icon=="17262739310191283300"` | 相似favicon站点 ⭐ |
| 邮件系统发现 | `component="Outlook Web App"` | 邮件服务器 |
| favicon同款 | 点"图标检索"模式 → 输入URL | 自动算hash搜

---

## 七、🔴 实战经验教训（2026-07-18实测）

### 证书搜索实测结果（关键）

| 语法 | 某客户测试 | 结果 | 说明 |
|------|---------|:----:|------|
| `cert="<目标域名>"` | `cert="<目标域名>"` | ✅ **148条** | 全文模糊匹配，最稳 |
| `cert.subject="<目标域名>"` | `cert.subject="<目标域名>"` | ✅ **149条** | 使用者匹配，推荐 ⭐ |
| `cert.subject_org="某客户主体"` | `cert.subject_org="某客户主体"` | ❌ **0条** | 语法存在，但ORG值不匹配 |
| `cert.subject_suffix="<目标域名>"` | `cert.subject_suffix="<目标域名>"` | ❌ **字段不支持** | 已确认不支持 |
| `cert.subject.org=...` | `cert.subject.org="xxx"` | ❌ **字段不支持** | 不支持该语法 |
| `cert="某客户主体"` | `cert="某客户主体"` | ❌ **0条** | 中文不命中证书字段 |

**→ 证书搜索推荐：`cert=` 全文匹配 或 `cert.subject=` 使用者匹配**
**→ 如果要按组织搜，先用 `cert="<目标域名>"` 找出结果 → 看ICP备案企业列**

### 全部坑点清单

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| `cert.subject_org=` 以为像FOFA一样好用 | 返回0条 | 实测中文ORG值不命中，改用`cert=`全文匹配 |
| `cert="某客户主体"` 搜中文 | 返回0条 | 证书字段是英文域名，用域名搜 |
| URL参数用明文 | 404找不到页面 | search参数是base64编码，直接在搜索框输入更简单 |
| search参数写死 | 导航后404 | 回到首页再搜 |
| read_page读数据 | 结果太稀疏 | 用 get_web_content 读完整文本 |
| 不等待渲染 | 拿不到结果 | 搜完后等3-5秒再读 |
| 忽略左栏聚合信息 | 错过全局数据 | 左栏有端口/组件/国家/icon排行 |
| 不关注ICP主体 | 遗漏同主体资产 | 每一行都有ICP备案企业列 |

---

## 八、三款测绘工具语法对照

| 目标 | FOFA语法 | Hunter语法（实测） | Quake语法 |
|------|---------|-------------------|-----------|
| 主域名 | `domain="xxx.com"` | `domain.suffix="xxx.com"` | `domain:"xxx.com"` |
| 证书全文 | `cert="xxx"` | `cert="xxx"` ✅ 推荐 | `cert:"xxx"` |
| 证书使用者 | `cert.subject="xxx"` | `cert.subject="xxx"` ✅ 推荐 | — |
| 证书组织 | `cert="xxx"`(直接用全文) | `cert.subject_org="xxx"` ⚠️ 实测可能不命中 | `cert:"xxx"`(也推荐用全文) |
| 标题 | `title="xxx"` | `title="xxx"` | `title:"xxx"` |
| IP | `ip="1.2.3.4"` | `ip="1.2.3.4"` | `ip:"1.2.3.4"` |
| body | `body="xxx"` | `body="xxx"` | `body:"xxx"` |
| ICP | `icp="xxx"` | `icp.name="xxx"` | — |
| 端口 | `port=443` | `port=443` | 在URL参数中 |
| favicon | `icon_hash="xxx"` | `web.icon="MD5hash"` | — |

---

## 九、数据导出

结果页面右上角有 **"数据导出"** 按钮（ref_136），支持导出为Excel/CSV格式。
点击后可选择导出当前页或全部结果。

---

## 十、注意事项

1. **Hunter 500积分/天** — 搜索不限次，导出消耗积分
2. **SPA渲染慢** — 搜完一定等3-5秒再读结果
3. **ICP备案信息是Hunter特色** — FOFA/Quake都没有这个字段
4. **favicon排行** — 左栏icon排行可以看到目标资产中使用的所有favicon及其频次
5. **三种检索模式互斥** — 点语法检索/图标检索/批量检索会切换搜索框形态
6. **搜索框的placeholder文字不变** — 永远是"Search..."，不看按钮不知道当前模式
7. **URL编码** — SPAR页面URL中的search参数是base64编码的查询语句
