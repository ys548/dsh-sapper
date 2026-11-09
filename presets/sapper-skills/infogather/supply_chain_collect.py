#!/usr/bin/env python3
"""
供应链信息收集脚本 — FOFA 证书/域名反查 + 报告导出
====================================================
基于被动信息收集课件 + fofa v2.0 官方 API 封装的供应链测绘工具。
配套六维度总表脚本: build_supply_report_full.py（7 sheet 完整总表）

用法:
  python supply_chain_collect.py --target 某客户 --key <FOFA_KEY>
  python supply_chain_collect.py --target 某客户 --key <FOFA_KEY> --cert-exact

完整六维度流程（FOFA A路 + WebSearch B路）见 SKILL.md Mode 17。
本脚本只做 A 路（FOFA 资产测绘），B 路（企业关系）需配合 WebSearch。

流程:
  Step1: cert="<target>"        证书反查 → 发现供应链域名/IP
  Step2: domain="<主域名>"      对发现的每个主域名查子域名资产
  Step3: ip="<关键IP>"          对高价值 IP 查全端口
  Step4: 导出 xlsx + 去重汇总

依赖: pip install prettytable openpyxl

═══════════════════════════════════════════════════════════════
🔑 WebSearch 辅助方法论（2026-08-05 实战验证：能挖到 FOFA 看不到的）
═══════════════════════════════════════════════════════════════
FOFA 证书反查只能看到"目标自己签发的证书"，但供应链关系常靠公开信息暴露：

1. 供应商/服务商关系：
   搜 "<公司名> 供应链 OR 采购 OR SCM OR 供应商平台"
   → 某客户实战挖到: 某供应商(efuture.cn) 建 SCM、群脉SCRM(maiscrm.com)、有赞
   → 这些服务商 = 目标的技术供应商，拿下它们 = 一锅端所有客户

2. 平台登录入口（可能 FOFA 未收录/已停用）:
   搜 "<公司名> 供应商平台 登录 网址"
   → 某客户实战挖到: <目标域名> (efuture ONE SCM V3 入口, FOFA 0条)
   → 历史域名可查 ip138 历史解析找真实 IP

3. 地方分支/关联实体:
   搜 "<公司名> 子公司 OR 分公司 OR 中标"
   → 某客户实战挖到: 绵阳富临某客户广场、六盘水某客户、临夏某客户商贸

4. 公众号/小程序（业务 API 入口）:
   搜 "<公司名> 公众号 OR 小程序 OR APP"
   → 小程序抓包能发现独立 API 域名

⚠️ 反例教训: cert="efuture" 返回 483 条但 90% 是无关同名公司(韩国梨花/欧洲)
   → 通用英文名证书搜索必须 --cert-exact 或人工筛，别把误报当资产
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

try:
    from prettytable import PrettyTable
except ImportError:
    PrettyTable = None

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
except ImportError:
    Workbook = None

FOFA_API_BASE = "https://fofa.info"
SEARCH_PATH = "/api/v1/search/all"
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/203.0.113.33 Safari/537.36"

# 输出目录
OUT_DIR = Path.home() / "Desktop" / "supply_chain"
EXPORT_DIR = Path.home() / "Desktop" / "fofa_export"

FIELDS = ["host", "title", "domain", "ip", "port", "protocol", "server"]


class FofaClient:
    def __init__(self, key):
        self.key = key
        self.cache = {}
        self._last_req_time = 0.0

    def _request(self, url):
        # 🔴 FOFA 查询铁律：≥15s 间隔（2026-08-05，防 429 + 风控）
        import time as _t
        since = _t.time() - self._last_req_time
        if since < 15:
            _t.sleep(15 - since)
        req = urllib.request.Request(url)
        req.add_header("User-Agent", BROWSER_UA)
        self._last_req_time = _t.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read().decode())
            except Exception:
                return {"error": True, "errmsg": f"HTTP {e.code}"}
        except urllib.error.URLError as e:
            return {"error": True, "errmsg": f"网络错误: {e.reason}"}
        except Exception as e:
            return {"error": True, "errmsg": str(e)}

    def search(self, query, size=50, months=12, fields=None):
        """搜索（自动加时间过滤省配额）"""
        fields = fields or FIELDS
        if months:
            dt = (datetime.now() - __import__("datetime").timedelta(days=months*30)).strftime("%Y-%m-%d")
            query = f'{query} && after="{dt}"'
        cache_key = query[:60]
        if cache_key in self.cache:
            return self.cache[cache_key]
        qb64 = base64.b64encode(query.encode("utf-8")).decode()
        url = (f"{FOFA_API_BASE}{SEARCH_PATH}?key={self.key}"
               f"&qbase64={qb64}&size={size}&fields={','.join(fields)}")
        r = self._request(url)
        if r.get("error"):
            print(f"  ⚠ {r.get('errmsg','')}")
            return {"results": [], "size": 0}
        self.cache[cache_key] = r
        return r


def print_table(results, fields=None):
    if not results or PrettyTable is None:
        return
    fields = fields or FIELDS
    t = PrettyTable()
    t.field_names = fields
    t.alignment = "l"
    t.max_width = 50
    for row in results:
        t.add_row([str(v)[:55] if v else "" for v in row])
    print(t)


def export_xlsx(rows, filename, sheet_name="供应链资产"):
    """导出 xlsx（host,title,domain,ip,port,protocol,server）"""
    if Workbook is None:
        print("⚠ 未安装 openpyxl，跳过 Excel 导出")
        return None
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fp = str(OUT_DIR / filename)
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    headers = ["HOST", "标题", "域名", "IP", "端口", "协议", "指纹"]
    hf = Font(bold=True, color="FFFFFF")
    hfill = PatternFill(start_color="C00000", end_color="C00000", fill_type="solid")
    border = Border(left=Side("thin"), right=Side("thin"), top=Side("thin"), bottom=Side("thin"))

    for ci, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=ci, value=h)
        c.font = hf; c.fill = hfill; c.border = border
        ws.column_dimensions[chr(64+ci)].width = [30, 40, 20, 16, 8, 8, 25][ci-1]

    for ri, row in enumerate(rows, 2):
        for ci, v in enumerate(row, 1):
            cell = ws.cell(row=ri, column=ci, value=str(v) if v else "")
            cell.border = border
    wb.save(fp)
    return fp


def collect(client, target, cert_exact=False):
    """主收集流程"""
    print(f"\n{'='*60}\n🔍 供应链信息收集: {target}\n{'='*60}")

    # Step1: 证书反查（FOFA 官方点号语法，见 fofa-api SKILL.md 字段参考）
    cert_q = f'cert="{target}"'
    if cert_exact:
        cert_q = f'cert.subject.cn="{target}"'
    print(f"\n📌 Step1 证书反查: {cert_q}")
    r1 = client.search(cert_q, size=100)
    res1 = r1.get("results", [])
    print(f"  命中 {len(res1)} 条")
    print_table(res1)

    # 从证书反查结果提取主域名
    domains = OrderedDict()
    for row in res1:
        domain = row[2] if len(row) > 2 else ""
        if domain and "." in domain:
            domains[domain] = True

    # Step2: 对发现的每个主域名查子域名资产
    all_domain_rows = []
    if domains:
        print(f"\n📌 Step2 对 {len(domains)} 个主域名查子域名资产")
        for dom in list(domains.keys())[:8]:  # 限制数量防配额超限
            q = f'domain="{dom}"'
            print(f"  → {dom}")
            r = client.search(q, size=50)
            rows = r.get("results", [])
            all_domain_rows.extend(rows)
            time.sleep(15)  # 🔴 15s 间隔铁律
        # 去重
        seen = set()
        dedup = []
        for row in all_domain_rows:
            key = (row[0], row[3], row[4])
            if key not in seen:
                seen.add(key)
                dedup.append(row)
        all_domain_rows = dedup
        print(f"  合并去重后 {len(all_domain_rows)} 条")
        print_table(all_domain_rows)

    # Step3: 高价值 IP 全端口
    ip_interest = []
    for row in res1:
        ip = row[3] if len(row) > 3 else ""
        if ip:
            ip_interest.append(ip)
    for row in all_domain_rows:
        ip = row[3] if len(row) > 3 else ""
        if ip:
            ip_interest.append(ip)
    ip_uniq = list(OrderedDict.fromkeys(ip_interest))[:6]

    all_ip_rows = []
    if ip_uniq:
        print(f"\n📌 Step3 对 {len(ip_uniq)} 个关键 IP 查全端口")
        for ip in ip_uniq:
            q = f'ip="{ip}"'
            print(f"  → {ip}")
            r = client.search(q, size=50)
            all_ip_rows.extend(r.get("results", []))
            time.sleep(0.5)

    # 合并汇总
    combined = []
    seen = set()
    for row in (res1 + all_domain_rows + all_ip_rows):
        key = (row[0], row[3], row[4])
        if key not in seen:
            seen.add(key)
            combined.append(row)

    print(f"\n{'='*60}\n📊 汇总: 证书{len(res1)} + 域名{len(all_domain_rows)} + IP{len(all_ip_rows)} = {len(combined)} 条去重资产\n{'='*60}")

    # 导出
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    fp = export_xlsx(combined, f"supply_chain_{target}_{ts}.xlsx")
    if fp:
        print(f"\n📁 Excel 导出: {fp}")

    # 输出域名清单
    dom_list = list(domains.keys())
    if dom_list:
        print("\n📌 发现的供应链主域名:")
        for d in dom_list:
            print(f"  - {d}")
        txt = OUT_DIR / f"domains_{target}_{ts}.txt"
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        txt.write_text("\n".join(dom_list) + "\n", encoding="utf-8")
        print(f"  已存 {txt}")

    return combined, domains


def main():
    parser = argparse.ArgumentParser(description="供应链信息收集 (FOFA)")
    parser.add_argument("--target", required=True, help="目标关键字，如 某客户 / 某客户")
    parser.add_argument("--key", default=os.environ.get("FOFA_API_KEY", ""), help="FOFA API Key")
    parser.add_argument("--cert-exact", action="store_true", help="证书精确匹配 subject_cn")
    args = parser.parse_args()

    if not args.key:
        print("❌ 需要 FOFA Key (--key 或 FOFA_API_KEY 环境变量)")
        sys.exit(1)

    client = FofaClient(args.key)
    collect(client, args.target, args.cert_exact)


if __name__ == "__main__":
    main()
