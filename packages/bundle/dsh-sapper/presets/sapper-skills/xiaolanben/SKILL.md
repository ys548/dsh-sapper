---
name: xiaolanben
description: >-
  小蓝本(sou.xiaolanben.com) 股权穿透+域名提取时用。err002签名预热铁律、Vue store 域名采集、businessinfo 免签 API 批量。
---

# xiaolanben — 小蓝本 股权穿透 + 域名提取 Skill

> 从目标公司出发，递归遍历对外投资（≥51%控股），提取每层公司的网站域名、邮箱、资产，输出 xlsx 报告。
> 站点：https://sou.xiaolanben.com/ （Vue SPA）

---

## 🔴 签名 err002 铁律（2026-08-05 实战验证，先做）

**症状**：搜索页 `queryByKeyword` 全部 403 `验签错误`（h_sign 带 `err002` 后缀），而详情页接口正常。

**根因**：搜索页路由签名 SDK 未初始化（err002=降级标记）；详情页路由加载 chunk 3/12 触发签名 SDK 初始化。修复是文档级的。

**Fix v2**（必须先预热再搜索）：
```
① navigate_page(https://sou.xiaolanben.com/company/qb9d94a767be70c45d056ad999fc550ca, initScript)  ← 预热，返回即可
② navigate_page(https://sou.xiaolanben.com/search?key={URL编码关键词}&page=1, initScript)          ← 整页加载
③ 同一标签页内后续所有搜索/翻页正常
```

**避坑清单**：
- ❌ 首页 fill+Enter 触发搜索 → err002
- ❌ 新标签页直接导航搜索URL → err002
- ❌ JS 动态加载 chunk 3/12 → 只注册不执行，无效
- ✅ 预热必须在【同一标签页】内
- ✅ initScript（每次导航带）：`Object.defineProperty(navigator, 'webdriver', {get: () => undefined});`

**Helper 脚本**：`python AIENV\toolkit\xiaolanben_search_helper.py "关键词"` → 输出预热/搜索URL+步骤。

---

## 搜索公司（Phase 1）

**仅两种可靠方式（都是整页加载）：**
```python
# 方式A（推荐）：helper 生成 URL → 直接导航
navigate_page("https://sou.xiaolanben.com/search?key={quote(关键词)}&page=1", initScript=掩盖webdriver)

# 方式B：首页填搜索框 + Enter（需先预热详情页）
navigate_page("https://sou.xiaolanben.com/", initScript)
fill(搜索框, "公司名")
press_key("Enter")
```
- 搜索参数是 `key=`（不是 keyword=）
- 搜索后 URL 变为 `/search?key=公司名&page=1`
- 验证：title 应含目标公司名

## 提取公司ID（搜索结果页）
```javascript
// 提取所有公司链接的 companyId
var links = document.querySelectorAll('a[href*="/company/"]');
for(var i=0; i<links.length; i++) {
  console.log(i, links[i].getAttribute('href'));
}
// 目标公司 → cid 形如 q0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c
```

## 进入公司详情页
```python
navigate_page("https://sou.xiaolanben.com/company/{companyId}", initScript=掩盖webdriver)
# 等 3s SPA 渲染 → 读基本信息（官网/邮箱/资产规模/股东/对外投资·N/集团成员·N）
```

## SPA 渲染触发（Phase 3）
```javascript
// 详情页必须 scroll 触发懒加载，否则 tab 不出现
for(let i=0; i<8; i++){ window.scrollBy(0,600); await sleep(350); }
// 此时可见 tab: 网站·N / 对外投资·N / 集团成员·N
```

## 提取对外投资子公司（Phase 4）
```javascript
// 点"对外投资·N"tab → 列表每页6条 → 底部"查看更多"展开全部
// 全文档抓取含"持股"的链接：
document.querySelectorAll('a[href*="/company/"]') → text 含"持股"
// 解析: name / ratio(text.match(/持股\s*([\d.]+)%/)) / cid(href.match(/\/company\/([a-z0-9]+)/))
// 规则: ratio ≥ 51 进入递归, < 51 跳过
```

## 提取网站域名（Phase 3）
```javascript
// 点"网站·N"tab
var pane = document.getElementById('pane-website');
var links = pane.querySelectorAll('a');  // {text, href}
// 邮箱: text.match(/[\w.-]+@[\w.-]+\.\w+/g) 排除 .png/.jpg/.51nb
```

## 递归遍历 ≥51% 子公司（Phase 5）
```
for each 子公司 where ratio >= 51:
  navigate_page(company_url)
  读基本信息+邮箱+对外投资（孙公司）
  检查孙公司是否 ≥51%（递归）
  ⚠️ 每查完一家写一次 JSON，防断连丢数据！
```

## 数据持久化铁律
```
每完成一个 Phase，立即用 Write 写 JSON → Des_workflow/xiaolanben_data_{project}.json
永远别指望 Chrome 会话不会断！
```

## 落库衔接（2026-08-13 某客户实战升级: 穿透即入库流水线, 禁止最后统一落）

**核心原则：每确认一家公司/一条持股边 → 立即落库，绝不等穿透结束批量写**（防上下文压缩/断连丢链）。

### 单公司落库模板（确认即执行）
```
1. fact_add(company/<拼音slug>, category=company,
   body={name, cid, ratio, status(在业/注销), shareholder, website, emails, icp})
2. 若该公司有官网/邮箱域名 → asset_add + fact_add(target/<域名>)
3. 持股边 → fact_edge(company/<母> → company/<子>, edge_type=holds) 或 contains
4. 每 5 家 → 持久化一次 JSON 到会话工作目录（防断连）
```

### 攻击路径元素（每收集完一层必做）
- 每个确认的域名/IP → fact_add(target/<域名或ip-xxx>, category=target, body={source,evidence})
- 供应链/攻击面汇总 → fact_add(finding/supply-chain-attack-surface, category=finding, body={source,evidence,reason})
- 关联边 → fact_edge(finding/... → target/<资产>, edge_type=related)
- ⚠️ 事实图 edge_type 白名单: related/parent/child/uses/contains(平台侧才是 leads_to/exploits)
- ⚠️ 递归顺序：先落母公司 → 子 → 孙逐层落，每层落完再进下一层，边写边走

### 递归判断补充规则（2026-08-13 实战验证）
- 持股比例从 **DOM 文本** 抓（`text.match(/持股\s*([\d.]+)%/)`），store 缓存常缺比例
- **已注销公司也要落库**（如哈尔滨/石家庄/郴州某客户——历史节点是穿透链组成部分）
- ratio ≥51 递归；但 **100% 优先**（全资子必查）；<51 记录但不递归
- 上层控股平台（如金狮某客户投资/益盛普利/昆明云顺和）通常有 5-11 家投资，是穿透主战场，优先遍历

## 生成 xlsx 报告（Phase 6）
```
python Des_workflow/_xiaolanben_report.py --input xiaolanben_data_{project}.json
→ 输出 Des_workflow/results/xiaolanben_report_YYYYMMDD_HHMMSS.xlsx
（3 sheets: 股权树🟣 / 域名明细🔵 / 汇总统计🟢）
```

**JSON 格式**（喂给 _xiaolanben_report.py）：
```json
{
  "report_name": "...",
  "root": "母公司名",
  "date": "2026-08-05",
  "source": "小蓝本 sou.xiaolanben.com",
  "root_info": {"group": "所属集团", "shareholder": "股东"},
  "levels": [
    {"level": 0, "companies": [{"name", "cid", "ratio", "domains":[{"url","source"}], "emails":[], "asset_scale", "children":[]}]},
    {"level": 1, "companies": [...]},
    {"level": 2, "companies": [{"name", "parent": "由XX全资", ...}]}
  ]
}
```

## API 直采通道（2026-08-13 某客户实战，免导航批量）

**核心突破：不需要逐家导航详情页，可批量拉取子公司联系方式/工商信息。**

### 通道1: Vue store 域名采集（详情页内）
```javascript
// 详情页加载后 store 自动填充，含官网历史(ICP备案域名)!
// 从 Vue 根实例/组件实例访问 store.state.companyDetail.basicInfo
// 字段: website(官网) / phones / emailAgg / webSites(ICP备案域名历史数组)
// webSites 例: ["www.hhsd.com.cn", "www.hhsd.com", "203.0.113.47", ...]
```
- **域名采集最可靠通道**——无需调 API，导航详情页即可
- 电站项目公司 webSites 常为空（无独立官网，供应链公司常态）

### 通道1b: Vue2 store 直读（2026-08-13 某客户实战核心突破）
```javascript
// 站点是 Vue2！读 store 一次拿全量，比 DOM 点击快 10 倍：
// 找 Vue 根实例（两种挂载方式都要试）：
document.querySelector('#app').__vue__          // Vue2
document.querySelector('#app').__vue_app__       // Vue3
// Vue2: 从根实例向下找 $store：
app.__vue__.$store.state
// state 关键字段（实测某客户）:
//   state.companyDetail.xxx      详情页数据
//   stateKeys 列出所有可读 key（调试用）
// 实测: stateKeys 含 companyDetail / groupCompanies(集团成员缓存) / searchResult
// companyDetail 内: basicInfo(website/phones/emailAgg) / investments(对外投资数组)
//   / shareholders(股东) / webSites(ICP历史)
// ⚠️ investments 缓存常缺比例和最后几家（如 invCnt=10 只缓存 8 条）
//   → 比例和缺失条目必须从 DOM 文本抓（见递归补充规则）
```
- **DOM 渲染 > store 缓存**：点"查看更多"后 DOM 显示 10 家、store 可能仍 8 家——以 DOM 为准，store 只作快速通道
- 读 store 的 JS 片段：
```javascript
var app = document.querySelector('#app');
var keys = Object.keys(app.__vue__.$store.state);
console.log(JSON.stringify(keys));
console.log(JSON.stringify(app.__vue__.$store.state.companyDetail));
// 若 __vue__ 为空 → 换 __vue_app__ 或从组件树遍历
```

### 通道2: businessinfo API（联系方式，⚠️ 2026-08-13 某客户实测已验签）
```
GET https://api.xiaolanben.com/nodejs-bluebook-graphql-gateway/open/businessinfo?eid={cid}
Header: authorization: encrypt ***   ← 必须带
```
- **⚠️ 已过时**：2026-08-13 实测该接口现在也校验 h_sign（返回"验签错误"），不再是免签
- 原免签批量模式失效 → 改用通道1b(Vue store) 或页面自然请求 Network 面板读
- 403 风控处理: 换页面导航详情页自然加载（reqid 正常 200），从 store 或 Network 面板读

### 通道3: aggregation API（含 website，需 h_sign 无法程序化）
```
GET https://api.xiaolanben.com/bluebook-gateway/api/xlb-gateway/aggregation?eid={cid}...
```
- 含 basicInfo.website + webSites(ICP 历史)，但 **h_sign 绑定 eid/时间窗，复用 403**
- 页面 XHR hook 补的签名验不过(xlb-gateway 严格验签) → 放弃程序化，走通道1
- 只能从 Network 面板读页面自然请求的响应

### 批量递归采集器模式（实测 234 节点全采）
```
① 页面内 hook: 读 Network 面板 investments API 的签名 URL 回放 → 需要 authorization 头(encrypt+token)
② 或直接 XHR 自动签名 + authorization 头 → 任意 eid investments 可拉
③ 或 businessinfo 免签批量拉 tel/email/creditCode（无域名）
④ 域名只从通道1(Vue store) 或通道3(Network 面板 aggregation)
```

## 实战成果参考
- 2026-07-18 某客户中国：61家对外投资 → 26家≥51% → 域名 yumiching.com 等
- 2026-08-05 某客户商业：10家对外投资 → 7家≥51% → 域名 <目标域名> / lionmall.com.cn / hogan-<目标域名>
- 2026-08-13 某客户全量穿透：50+公司节点 / 60+持股边 / 8域名 / 25+邮箱
  - 控制链: 金狮集团→Malverest(HK)100%→某客户商业发展→10家直接对外投资
  - 关键平台: 金狮某客户投资(益盛普利70%+新加坡某客户30%, 11家投资)、昆明云顺和(顺和国际100%, 5家投资)、益盛普利(5家投资)
  - 8域名: <目标域名> / <目标域名> / <目标域名> / <目标域名> / lionmall.com.cn / <目标域名> / <目标域名> / 昆山某客户.cn
- 落库: sapper_fact 记录项目"某客户某客户-信息收集"，穿透即入库流水线全程验证
- 2026-08-25 某客户：1根+4子(全≥51%) / 19域名 / 8轮融资 / 18股东 → 项目 0825 落库(台账编号 aefef53db251，双写校验 ALL PASS)
  - 域名密集在**根公司 ICP 历史 webSites**(focii.cn/fofa.info/vulfocus/gobysec.net/foradar.net 全是某客户品牌域), 子公司官网反而少
  - ⚠️ 子公司"对外投资·null" = 真无孙公司, 别当采集失败重试

## CDP 采集方式 (2026-08-25 某客户实战, 无 chrome MCP 工具时替代)
- 浏览器: MCP 调试 Edge(`--browser-url=http://localhost:9222` 外部模式), 通过
  `http://localhost:9222/json/list` + WebSocket CDP(`Page.navigate`/`Runtime.evaluate`) 驱动
- ⚠️ **WebSocket 403 Origin 坑**: 浏览器未加 `--remote-allow-origins` 时, websocket-client
  必须 `suppress_origin=True` 建连, 否则 403 Rejected
- 预热/搜索/导航全部走 `Page.navigate` 同一标签页(保持签名 SDK 会话, 防 err002)
- store 直读: `document.querySelector('#app').__vue__.$store.state.companyDetail`
  (Vue2); `investments` 缓存可能不全(比例/末几家缺失), **比例以 DOM 文本
  `持股 xx%` 为准**, 股东点"查看更多"展开后从 DOM 抓全(store 只缓存前 8/18)

## 已知限制
1. 集团成员不显示持股比例，不作递归依据
2. "网站·null" ≠ 无网站，联系方式区可能有
3. 投资型/SPV 公司基本无独立域名
4. 连续2层无新域名可提前终止

## 行业域名规律（2026-08-13 某客户实战验证，先预判再采集）
- **百货/零售/商超集团**：门店公司（XX某客户/XX购物广场）几乎全部无独立官网——线下运营主体，官网归口集团统一建设（<目标域名> / <目标域名> 单点承载全部门店）
- 因此单查公司节点拿不到几个域名是**正常现象**，别在门店层死磕
- **域名真正密集处**：① 集团核心域（根公司 webSites + ICP 历史）；② 品牌域（lionmall.com.cn 金狮广场）；③ 电商/会员/招商子域；④ 新设公司（2023+ 常配独立域，如 <目标域名> 昆山某客户）
- 全量域名兜底手段：FOFA 证书反查（cert="某客户"）+ ICP 备案主体反查（icp="某客户"），一次拉全名下所有域
- 邮箱域名 = 集团统一邮件域（<目标域名> / <目标域名> / <目标域名> 三域互通），任何子公司邮箱即横向入口

## 关联 Skill
- [[infogather]] — 总信息收集（含 equity 股权结构 sheet）
- [[fofa-api]] — FOFA 官方 API
- [[quake]] — 360Quake 测绘
- [[hunter-qianxin]] — 奇安信 Hunter
