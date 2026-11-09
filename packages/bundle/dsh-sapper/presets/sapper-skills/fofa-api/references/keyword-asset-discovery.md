# 边缘资产关键字匹配收集实战(2026-08-22)

> 触发: 已按域名/单位清单收过一轮主资产后, 用户要求"结合关键字匹配(title/body/证书/搜索引擎)继续收集边缘资产"。
> 边缘资产定义: 非主域但属于目标体系的站点 — 子单位自有域名/第三方SaaS/外包开发站/未备案站/海外IP/泛解析域名。
> 本实战 53 个 FOFA 查询 + 搜索引擎, 净增约 160 条资产, 含 Jenkins/Nexus/理赔系统 dev 等高价值面,
> 同时识别 3 个仿冒 IP 段 + 1 组品牌钓鱼站群。

---

## 一、查询矩阵(按维度全覆盖)

按以下 6 个维度轮询, 每个维度内按"泛词→细分词→组合词"收敛:

| # | 维度 | 典型 q | 命中价值 | 误报风险 |
|---|------|--------|---------|---------|
| 1 | title 品牌简称 | `title="XX电投" && status_code="200"` | 子单位站/新域名 | 低(品牌词足够特定) |
| 2 | title 品牌全称 | `title="XX电力投资"` | 新独立域名 | 低 |
| 3 | title 单位全称+业务词 | `title="XX集团" && (title="热力"‖title="供热"‖title="新能源"‖title="铝"‖title="碳"‖title="融资")` | 业务板块细分站 | 中(泛业务词会混入) |
| 4 | title 历史品牌 | `title="中XX投"` | 老子公司/历史站 | 中 |
| 5 | body 关键字 | `body="品牌名" && title!="品牌名" && status_code="200"` | 登录页/JS引用/合作站 | **极高**(博彩/站群/新闻转载) |
| 6 | body 海外 | `body="品牌名" && country!="CN"` | 海外边缘 | **极高**(基本全垃圾) |
| 7 | 证书反查 | `cert.subject.org="公司全称"` / `cert="品牌词"` | 有证书的站最准 | 低(cert 泛词易 0 条) |
| 8 | domain 反查 | `domain="已发现子单位域名" --all` | **子域全量=大货** | 低 |
| 9 | 引用反查 | `body="主域" && domain!="主域"` | 第三方开发/集成商站 | 高 |
| 10 | 招标/采购平台全量 | `domain="招标平台域" --all` | **几十~几百个子单位子域** | 低(需按 title 筛归属) |

**实战结论**:
- **最大产出在 #8/#10(domain 全量)**。招标采购平台一个域名就能覆盖几十家子单位(1884/2400/2043 条,
  筛出本体系 94 个真实子域)。凡发现"一群子单位共用一个平台域名", 立即 `--all` 翻全量再按 title 过滤。
- title 简称为王: 一次查询同时命中官网/子公司/第三方域名, 误报可控。
- **body 关键字是大坑**: 品牌名 body 泛查 44.9 万条 99% 是博彩/SEO 站群/新闻转载, 头部无价值, 直接弃。
  要查 body 只用于 #9(引用主域找第三方开发者), 且必须 `&& domain!="主域"` 限定。
- cert 模糊词(`cert="品牌"`)常 0 条, 用 `cert.subject.org="公司全称"` 才有量。

---

## 二、执行纪律(风控 + 效率)

1. **一次一条 q, 间隔 ≥16s**(实测 12s 连查 3 次即触发 [-700] 风控)。
   - 单条命令内 `Start-Sleep -Seconds 16` 后再跑 fofa.py, 保证硬间隔。
   - 两条查询之间用"分析上一批结果/落库/搜索引擎"填充, 不空等。
2. **`--all` 翻全量只用于 domain 查询**(domain 结果量大且必须全量), title/body 查询用 `--size 200` 拉头部即可。
3. **每批结果立即落库**, 别攒到结尾: 落库动作本身就是下一批查询的间隔。
4. 结果落盘到带日期目录(如 `xxx-fofa-keyword-YYYYMMDD/`), 文件名 `q<N>_<维度>.txt` 便于回溯。
5. 查询队列写进 fact 落库, 防中断后重跑(记录"已查过哪些 q"避免重复烧配额)。

---

## 三、结果清洗三步法

### Step 1 按 title 归属筛(平台类结果必需)
招标平台/聚合平台混多家集团, 用 title 正则筛归属:
```powershell
$target = $rows | Where-Object { $_ -match '国家XX投|中XX投|国XX投|XX投' }  # 用目标品牌词族
```
实战: dlzbxx 1884 条 → 49 条归属; dlzb 2400 条 → 44 条; dljczb 2043 条 → 仅 1 条(平台主业非本体系)。

### Step 2 泛解析识别(防把占位当资产)
泛解析特征: **大量随机子域(数字串/乱码前缀) + 全部同 IP + 全部同 title**。
- 识别: 对 domain 全量结果统计, 若绝大多数行 host 是 `xxx随机串.主域` 且 IP/title 完全一致 → 泛解析。
- 处理: 泛解析域名只落库主域 + 业务关键词子域(dev/login/api/es/news 等), 不逐条落随机子域。
- 反例警惕: 泛解析站可能只有极少数真实业务子域, 别全盘放弃, 手动试常见业务前缀。

### Step 3 仿冒/钓鱼识别(单独标记, 不混入资产)
| 特征 | 判定 |
|------|------|
| 随机字母域名(afsomwv/nnpumxd/du61r 类) + 品牌 title + 香港/海外 IP | 仿冒冒用, 标记"疑似仿冒" |
| **同一 IP 段连续多域名冒用**(如 156.225.24.x 连出 16+ 个) | 仿冒段, 按段聚类一次标记 |
| 品牌 App"内部版官网" + `.cc/.top` 域名 + AmazonS3/AliyunOSS 托管 | 钓鱼下载站(收集员工凭据/诱导装马) |
| title=品牌但 Server=IIS 默认页/随机模板 | 挂马/劫持(如 title=NBA直播) |

落库时 service 字段前缀 `疑似仿冒:` / `疑似钓鱼:`, 与真实资产区分, 报告可单独章节。

---

## 四、搜索引擎配合(补 FOFA 盲区)

FOFA 索引不到/已下线的官网, 用 web_search 反查:
1. 搜 `"公司全称" 官网 域名` → 拿到官网域名(实战: 某保险经纪公司官网靠搜索拿到, FOFA title 搜不到)。
2. 拿到新域名后**立即回 FOFA `domain=新域名 --all`** 反查全子域 → 常挖出 dev/uat/内部系统
   (实战: 某客户域名 6 条含理赔系统 dev 环境; 另一域名 60+ 条含 Jenkins/Nexus)。
3. 上市公司官网域名可从公告标题搜(`"关于启用公司官网的公告"`), 注意公告里域名可能已下线。
4. 同名公司排除: 国际域名常撞名(同一缩写在日本/印度/法国都有公司), 先看公司主体再落库。

**套路**: 搜索引擎拿新域名 → FOFA domain 反查子域 → 子域里找 dev/test/ci/mvn 高价值面。

---

## 五、存活验证(FOFA 快照≠现状)

FOFA 大量历史快照, 落库前/后必须批量探活:
```powershell
$targets = @('https://...','http://...'); foreach ($t in $targets) {
  try { $r = Invoke-WebRequest -Uri $t -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 3 -Headers @{'User-Agent'='Mozilla/5.0'};
        "STATUS=$($r.StatusCode) SERVER=$($r.Headers['Server']) TITLE=..." }
  catch { "ERROR: $($_.Exception.Message)" } }
```
- 实战 20 个高价值目标: 4 个 200 存活, 其余 503/超时/DNS 不解析 = 已下线或内网-only。
- 判定规则: DNS 解析失败 = 域名已失效; TCP 通但 HTTP 超时 = 防火墙过滤/仅内网; 503 = 后端维护。
- 状态写进资产 service 或 fact, 避免后续重复探测; 高价值但暂不可达的目标记入"待复核"清单。

---

## 六、优先级排序(边缘资产打点顺序)

1. **开发链**: Jenkins(ci.)/Nexus(mvn.)/代码仓库/制品库 — 未授权或弱口令 = 供应链级沦陷
2. **老版本 OA/网关**: 致远 OA A8 老版本/禅道/aTrust 2.0/Citrix — 已知漏洞多
3. **登录面**: 保险理赔 dev/财务系统/风险平台 — 弱口令/未授权
4. **存储**: MinIO/OSS 桶 — 未授权列举
5. **VPN/零信任**: aTrust/Sangine/Citrix/H3C — 边界
6. **业务系统**: 供热/智慧工地/招标子域 — 按需

---

## 七、查询示例(可直接复用, 替换品牌词)

```powershell
# title 简称(最优先)
python fofa.py search 'title="XX电投" && status_code="200"' --size 200
# title 全称
python fofa.py search 'title="XX电力投资" && status_code="200"' --size 200
# 历史品牌(改名前的子公司名)
python fofa.py search 'title="中XX投" && status_code="200"' --size 200
# 业务板块细分
python fofa.py search 'title="XX集团" && (title="热力"||title="供热"||title="新能源"||title="铝"||title="煤") && status_code="200"' --size 200
# 证书组织反查
python fofa.py search 'cert.subject.org="XX集团有限公司"' --size 200
# 引用反查(找第三方开发者)
python fofa.py search 'body="主域.com.cn" && domain!="主域.com.cn" && status_code="200"' --size 200
# 平台域名全量子域(大货)
python fofa.py domain '招标平台域名.com' --all --size 200
# 已发现子单位域名反查
python fofa.py domain '子公司域名.cn' --all --size 200
```

**注意**: `||` 与 `&&` 混用需括号分组(FOFA 语法), title 多词组合用 `(a||b) && status_code="200"`。

---

## 八、全量资产归属验证引擎(URL 清单自动判定, 2026-08-22 实战)

> **触发**: 关键字/domain 收集落库完成后, 用户要求"基于 URL 输出一版资产清单, 并逐条验证哪些是目标集团(gdt)资产"。
> **成果**: 台账 758 条 → 自动判定: **gdt 确认 672(88.7%) + 疑似IP段 17 + 待验证 24 + 第三方 19 + 仿冒排除 26**;
> 待验证从初版 220 条经 4 轮规则迭代收窄到 24 条。产出 url 资产清单(三表分类) + `.csv`(全量+依据)。

### 判定规则优先级(每行资产顺序执行, 命中即返回)
```
1. 仿冒/钓鱼排除   service含[仿冒/钓鱼/劫持/挂马/SEO站] 或 仿冒IP段 或 随机域名 或 .cc钓鱼群
2. 主域            domain == 主域 或 host 以 .主域 结尾
3. 直属系          domain ∈ GDT_DIRECT(客户域名清单)
4. 父域继承        domain 以 GDT_DIRECT|GDT_SUB 中某域结尾(如 git.renewable-jx.org.cn)
                   — 注意 domain 字段常存完整子域而非父域! 必须做 endswith('.'+父域) 匹配
5. 控股子公司      domain ∈ GDT_SUB(已确认非客户后缀的控股/全资域)
6. 第三方承载      domain ∈ GDT_HOSTED(域名是第三方的, 但业务属目标集团 — 单独分类不混入)
7. 明确第三方      domain ∈ THIRD_PARTY
8. 招标平台租户    toobiao 类多租户平台按 host 前缀判归属
9. service 证据    service 含 [集团名/历史名/客户关键词] 关键词 → gdt-证据
10. IP→域名映射    IP 直连资产用已知 gdt 域名的解析 IP 反查归属(见下)
11. IP 段佐证      目标集团常用 C 段 → 疑似
12. 泛解析         泛解析段 IP → 疑似
13. 兜底            待验证(不猜)
```

### 关键技巧
- **service 字段本身就是证据库**: FOFA service 常带"客户集团财务有限公司(IP直连)"/"上海电力官网源站"等
  字样, 一条规则 `any(k in service for k in [集团名, 历史名, 客户关键词])` 直接批量归位, 别只看域名。
- **IP→域名映射收窄 IP 直连资产**: 无 domain 的裸 IP(源站/测试机), 用库内已知 gdt 域名解析过的 IP 建映射表
  (如 203.0.113.6=renewable-jx GitLab、203.0.113.7=上海电力源站、203.0.113.8=XXL-JOB), 直连 IP 命中即归属。
- **host 无 domain 字段时从 host 提取父域**: 注意 com.cn 是多段后缀(取后3段), 普通 com/net 取后2段。
- **白名单必须分层**: GDT_DIRECT(直属后缀) / GDT_SUB(控股子公司) / GDT_HOSTED(第三方承载) / THIRD_PARTY,
  不要混成一个 set — 承载类和第三方类会污染"gdt 确认数"统计。
- **每轮重跑输出统计对比**: 待验证数量从 220→87→62→51→24, 每轮收窄多少一目了然, 剩余的都是低价值单条
  (SpringBoot 空标题/到期域名/VPN 设备), 可接受。

### 撞名排除教训(2026-08-22)
- **bpeg.cn "北京电力设备总厂" = 中国能建 CEEC 系, 不是目标客户!** 同名前缀必须查控股主体再落库。
- ldngzz.com "辽宁能港铸造" = 辽宁发电厂关联的第三方供应商(供应商域名挂客户名, 别误判为资产)。
- 某并购来的域名 — 这种"并购来的"域名要查最新股权, 不能凭直觉。
- 判定证据(web_search 查企业全称+控股股东)写进"依据"列, 复核时可直接溯源。

### 产出格式(可直接复用)
- MD 分三表: ✅ gdt确认(URL/Domain/IP/Port/Service/验证/依据) / ⚠️ 疑似 / ❌ 第三方+排除
- CSV: URL/Domain/IP/Port/Service/归属验证/置信度/依据/Source, utf-8-sig(Excel 不乱码)
- 归属结论落库 fact(如 `recon/<目标>-url-assets-verify-YYYYMMDD`), 附分类统计+新确认域名清单
