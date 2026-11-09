#!/usr/bin/env python3
"""
FOFA 官方 API 工具
==================
官方接口: https://fofa.info/api/v1

三种查询模式:
  1. 基于证书  — cert="xxx" / cert.subject_cn="xxx"
  2. 基于ICP备案 — icp="沪ICP备xxxx号" / icp=备案号
  3. 基于域名   — domain="xxx" / host="xxx"

依赖: pip install openpyxl prettytable (可选）
"""

import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime

try:
    from prettytable import PrettyTable
except ImportError:
    PrettyTable = None

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
except ImportError:
    Workbook = None


# ============================================================
# 配置
# ============================================================

FOFA_API_BASE = "https://fofa.info"
SEARCH_PATH = "/api/v1/search/all"     # 分页搜索
SEARCH_NEXT_PATH = "/api/v1/search/next" # 翻页搜索
MY_INFO_PATH = "/api/v1/info/my"

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/203.0.113.5 Safari/537.36"

EXPORT_DIR = Path.home() / "Desktop" / "fofa_export"

# 默认字段（同 fofa_viewer）
SEARCH_FIELDS = ["host", "title", "domain", "ip", "port", "protocol", "server", "link"]
EXTRA_FIELDS = ["os", "icp", "product", "fid", "certs_subject_cn", "certs_subject_org", "lastupdatetime"]

FIELD_ALIASES_CN = {
    "host": "HOST", "title": "标题", "domain": "域名", "ip": "IP",
    "port": "端口", "protocol": "协议", "server": "指纹", "link": "URL",
    "os": "操作系统", "icp": "ICP备案", "product": "产品指纹",
    "fid": "fid", "certs_subject_cn": "证书域名",
    "certs_subject_org": "证书持有者", "lastupdatetime": "最近更新",
}


# ============================================================
# 官方 API 客户端
# ============================================================

class FofaAPI:
    """FOFA 官方 API 客户端"""

    def __init__(self, key: str = None):
        self.key = key or os.environ.get("FOFA_API_KEY", "")
        if not self.key:
            raise ValueError("请设置 FOFA_API_KEY 环境变量或 --key 参数")
        self.additional_fields = []  # 默认不加扩展字段，避免超出权限

    @property
    def all_fields(self):
        return list(SEARCH_FIELDS) + self.additional_fields

    def _request(self, url: str) -> dict:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", BROWSER_UA)
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

    def info(self) -> dict:
        """查询账号信息 /api/v1/info/my"""
        return self._request(f"{FOFA_API_BASE}{MY_INFO_PATH}?key={self.key}")

    def search(self, query: str, fields: list = None,
               size: int = 100, full: bool = False, months: int = 0) -> dict:
        """资产搜索 /api/v1/search/all（分页）
        Args:
            months: 只查最近N个月的数据，0=不限（默认1年）
        """
        fields = fields or self.all_fields
        if months:
            from datetime import datetime, timedelta
            dt = (datetime.now() - timedelta(days=months*30)).strftime("%Y-%m-%d")
            query = f'{query} && after="{dt}"'
        qb64 = base64.b64encode(query.encode("utf-8")).decode()
        url = (f"{FOFA_API_BASE}{SEARCH_PATH}?key={self.key}"
               f"&qbase64={qb64}"
               f"&size={size}&fields={','.join(fields)}")
        if full:
            url += "&full=true"
        return self._request(url)

    def search_all(self, query: str, fields: list = None,
                   max_size: int = 10000, months: int = 0) -> list:
        """自动翻页全量搜索（使用 search/next 连续翻页）
        Args:
            months: 只查最近N个月的数据
        """
        fields = fields or self.all_fields
        if months:
            from datetime import datetime, timedelta
            dt = (datetime.now() - timedelta(days=months*30)).strftime("%Y-%m-%d")
            query = f'{query} && after="{dt}"'
        all_results = []
        next_token = None
        page = 1
        while True:
            qb64 = base64.b64encode(query.encode("utf-8")).decode()
            url = (f"{FOFA_API_BASE}{SEARCH_NEXT_PATH}?key={self.key}"
                   f"&qbase64={qb64}"
                   f"&size=10000&fields={','.join(fields)}")
            if next_token:
                url += f"&next={urllib.parse.quote(next_token)}"
            print(f"  → 翻页 #{page} ...", file=sys.stderr)
            result = self._request(url)
            if result.get("error"):
                print(f"  ⚠ {result.get('errmsg','')}", file=sys.stderr)
                break
            results = result.get("results", [])
            all_results.extend(results)
            print(f"    本页 {len(results)} 条, 累计 {len(all_results)} 条", file=sys.stderr)
            next_token = result.get("next")
            if not next_token or len(all_results) >= max_size:
                break
            page += 1
            time.sleep(0.5)
        return all_results


# ============================================================
# 三种查询模式
# ============================================================

def search_by_cert(api: FofaAPI, cert_value: str, **kwargs) -> dict:
    """
    基于证书查询
    示例:
      search_by_cert("*.baidu.com")          → cert="*.baidu.com"
      search_by_cert("baidu.com", exact=1)    → cert.subject_cn="baidu.com"
    """
    if kwargs.get("exact"):
        query = f'cert.subject.cn="{cert_value}"'
    else:
        query = f'cert="{cert_value}"'
    return api.search(query, **kwargs)


def search_by_icp(api: FofaAPI, icp_value: str, **kwargs) -> dict:
    """
    基于ICP备案号查询
    示例:
      search_by_icp("沪ICP备17028264号") → icp="沪ICP备17028264号"
      search_by_icp("17028264")          → icp="17028264"（模糊匹配）
    """
    query = f'icp="{icp_value}"'
    return api.search(query, **kwargs)


def search_by_domain(api: FofaAPI, domain_value: str,
                     domain_only: bool = False, **kwargs) -> dict:
    """
    基于域名查询
    示例:
      search_by_domain("baidu.com")            → domain="baidu.com"
      search_by_domain("baidu.com", host=1)    → host="baidu.com"
      search_by_domain(".baidu.com", sub=1)    → domain=".baidu.com"（所有子域名）
    """
    if kwargs.get("host"):
        query = f'host="{domain_value}"'
    elif domain_only:
        query = f'domain="{domain_value}"'
    else:
        query = f'domain="{domain_value}" || host="{domain_value}"'
    return api.search(query, **kwargs)


# ============================================================
# 输出
# ============================================================

def print_table(results: list, fields: list = None) -> str:
    if not results or PrettyTable is None:
        return ""
    fields = fields or (SEARCH_FIELDS + EXTRA_FIELDS)
    display = [FIELD_ALIASES_CN.get(f, f) for f in fields]
    t = PrettyTable()
    t.field_names = display
    t.alignment = "l"
    t.max_width = 60
    for row in results:
        r = []
        for i, f in enumerate(fields):
            v = str(row[i]) if i < len(row) and row[i] else ""
            r.append(v[:57] + "..." if len(v) > 60 else v)
        t.add_row(r)
    return str(t)


def export_to_excel(results: list, query: str, fields: list = None,
                    filename: str = None) -> str:
    if Workbook is None:
        raise ImportError("pip install openpyxl")
    fields = fields or (SEARCH_FIELDS + EXTRA_FIELDS)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    if not filename:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in query[:20])
        filename = f"fofa_{safe}_{ts}.xlsx"
    fp = str(EXPORT_DIR / filename)

    wb = Workbook()
    ws = wb.active
    ws.title = "查询结果"

    hf = Font(bold=True, size=14, color="FFFFFF")
    hfill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    border = Border(left=Side("thin"), right=Side("thin"),
                    top=Side("thin"), bottom=Side("thin"))

    display = [FIELD_ALIASES_CN.get(f, f) for f in fields]
    col_w = {"HOST": 30, "标题": 38, "域名": 20, "IP": 15, "端口": 10,
             "协议": 10, "指纹": 20, "URL": 40, "ICP备案": 25}

    for ci, h in enumerate(display, 1):
        c = ws.cell(row=1, column=ci, value=h)
        c.font = hf
        c.fill = hfill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        ws.column_dimensions[chr(64 + ci) if ci < 27 else "A"].width = col_w.get(h, 15)

    for ri, row in enumerate(results, 2):
        for ci, v in enumerate(row, 1):
            cell = ws.cell(row=ri, column=ci, value=str(v) if v else "")
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            cell.border = border

    wb.save(fp)
    return fp


# ============================================================
# CLI
# ============================================================

def main():
    if sys.platform == "win32":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    key = None
    filtered = []
    size = 100
    full = False
    do_export = False
    custom_fields = None
    all_mode = False
    months = 0

    i = 1
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == "--key" and i + 1 < len(sys.argv):
            key = sys.argv[i + 1]; i += 2
        elif a == "--size" and i + 1 < len(sys.argv):
            size = int(sys.argv[i + 1]); i += 2
        elif a == "--full":
            full = True; i += 1
        elif a == "--export":
            do_export = True; i += 1
        elif a == "--all":
            all_mode = True; i += 1
        elif a == "--months" and i + 1 < len(sys.argv):
            months = int(sys.argv[i + 1]); i += 2
        elif a == "--fields" and i + 1 < len(sys.argv):
            custom_fields = [x.strip() for x in sys.argv[i + 1].split(",")]; i += 2
        else:
            filtered.append(a); i += 1

    if len(filtered) < 1:
        print(__doc__); sys.exit(1)

    cmd = filtered[0]
    final_key = key or os.environ.get("FOFA_API_KEY", "")
    if not final_key:
        print("❌ 请提供 --key 或设置 FOFA_API_KEY 环境变量"); sys.exit(1)

    api = FofaAPI(key=final_key)
    fields = custom_fields or api.all_fields

    try:
        # ---- info ----
        if cmd == "info":
            r = api.info()
            if r.get("error"):
                print(f"❌ {r.get('errmsg','')}")
            else:
                print(f"邮箱:     {r.get('email','-')}")
                print(f"用户名:   {r.get('username','-')}")
                print(f"会员:     {'是' if r.get('isvip') else '否'}")
                print(f"FCoin:    {r.get('fcoin',0)}")
                print(f"查询余额: {r.get('remain_api_query',0)} 次")
                print(f"数据余额: {r.get('remain_api_data',0)} 条")

        # ---- search ----
        elif cmd in ("search", "cert", "icp", "domain"):
            if len(filtered) < 2:
                print("❌ 请提供查询值"); sys.exit(1)
            value = filtered[1]
            mode = filtered[2] if len(filtered) > 2 else None

            if cmd == "cert":
                query = f'cert="{value}"'
                if mode == "exact":
                    query = f'cert.subject.cn="{value}"'
                elif mode and mode.startswith("*.heating") or mode == "wildcard":
                    pass  # value already has wildcard syntax
                print(f"\n🔐 证书查询: {query}")
            elif cmd == "icp":
                query = f'icp="{value}"'
                print(f"\n📋 ICP查询: {query}")
            elif cmd == "domain":
                if mode == "host":
                    query = f'host="{value}"'
                else:
                    query = f'domain="{value}"'
                print(f"\n🌐 域名查询: {query}")
            else:
                query = value

            if all_mode:
                results = api.search_all(query, fields=fields, months=months) if query else []
            else:
                r = api.search(query, fields=fields, size=size, full=full, months=months) if query else {}
                results = r.get("results", [])
                print(f"\n📊 总计 {r.get('size',0)} 条  |  本次返回 {len(results)} 条")
                print_summary(r)

            if results:
                print(f"\n{print_table(results, fields)}")
                if do_export:
                    fp = export_to_excel(results, query, fields)
                    print(f"\n📁 {fp}")

        # ---- 兼容旧用法 search <query> ----
        elif cmd == "raw":
            if len(filtered) < 2:
                print("❌ 请提供查询语句"); sys.exit(1)
            query = filtered[1]
            if all_mode:
                results = api.search_all(query, fields=fields, months=months)
            else:
                r = api.search(query, fields=fields, size=size, full=full, months=months)
                results = r.get("results", [])
                print(f"\n📊 总计 {r.get('size',0)} 条  |  本次返回 {len(results)} 条")
                print_summary(r)
            if results:
                print(f"\n{print_table(results, fields)}")
                if do_export:
                    fp = export_to_excel(results, query, fields)
                    print(f"\n📁 {fp}")

        else:
            print(f"❌ 未知命令: {cmd}")
            print_usage()

    except KeyboardInterrupt:
        print("\n已取消")
        sys.exit(0)
    except Exception as e:
        import traceback
        print(f"❌ {e}")
        traceback.print_exc()
        sys.exit(1)


def print_summary(r: dict):
    size = r.get("size", 0)
    next_t = r.get("next")
    print(f"   剩余查询: {r.get('remain_api_query','?')}  |  剩余数据: {r.get('remain_api_data','?')}")
    if next_t:
        print(f"   有下一页数据 (next={next_t[:20]}...)  — 加 --all 自动翻页")


def print_usage():
    print("FOFA 官方 API 查询")
    print()
    print("  fofa.py info [--key XXX]                          # 查询配额")
    print("  fofa.py cert <证书值> [exact] [options]            # 证书查询")
    print("  fofa.py icp <备案号> [options]                      # ICP备案查询")
    print("  fofa.py domain <域名> [host] [options]              # 域名查询")
    print()
    print("选项:")
    print("  --key KEY        API Key")
    print("  --size N         每页条数（默认100）")
    print("  --full           全量数据")
    print("  --all            自动翻页")
    print("  --export         导出Excel")
    print()
    print("示例:")
    print("  fofa.py cert '*.baidu.com' --export")
    print("  fofa.py cert 'baidu.com' exact")
    print("  fofa.py icp '沪ICP备17028264号' --all --export")
    print("  fofa.py domain 'baidu.com' --all --export")
    print("  fofa.py domain 'baidu.com' host")


if __name__ == "__main__":
    main()
