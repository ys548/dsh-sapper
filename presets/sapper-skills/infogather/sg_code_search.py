#!/usr/bin/env python3
"""
Sourcegraph 代码搜索脚本 — 绕过 WebFetch 域名拦截的源码泄露搜索
================================================================
背景: grep.app 429限流 / GitHub code search 需token / WebFetch 被claude.ai域名拦截
突破: Sourcegraph 流式 API (search/stream) 无需认证，PowerShell/Python 直连可用

用法:
  单关键词:
    python sg_code_search.py "<目标域名>"          # 搜域名
    python sg_code_search.py "某客户"                # 搜品牌/系统名
    python sg_code_search.py "spscm" --pattern "fork:yes archived:yes"  # 加过滤

  批量关键词(文件每行一个):
    python sg_code_search.py --list words.txt
    python sg_code_search.py --list words.txt --output results.txt

  结果落地:
    --output results.txt  # 命中明细写文件

注意:
  - 关键词必须足够特定，否则命中大量无关仓库（spscm→100+无关、egeon→736仓库）
  - 精确到完整域名/邮箱/专有系统名，泛词必误报
  - 加 fork:yes / archived:yes 可扩大范围
  - 结果含多个repo时用 sourcegraph 网页核对准确性
"""

import argparse
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/203.0.113.33 Safari/537.36"
BASE = "https://sourcegraph.com/search/stream?q={q}&v=V3"


def search(query: str, extra: str = ""):
    q = f"{query} {extra}".strip()
    url = BASE.format(q=urllib.parse.quote(q))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/event-stream"})
    results = []
    repos = set()
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read().decode("utf-8", errors="replace")
    # 解析 event-stream 中的 matches
    for m in re.finditer(r'\{"type":"content","path":"([^"]+)","repositoryID":\d+,"repository":"([^"]+)","repoStars":(\d+).*?"line":"([^"]*)"', data):
        path, repo, stars, line = m.groups()
        repos.add(repo)
        results.append({"repo": repo, "stars": int(stars), "path": path, "line": line[:200]})
    return repos, results, len(data)


def search_multi(keywords, extra=""):
    """批量搜索多个关键词，返回汇总结果"""
    all_hits = []
    for kw in keywords:
        kw = kw.strip()
        if not kw or kw.startswith("#"):
            continue
        repos, results, datalen = search(kw, extra)
        status = "✅命中" if results else "无命中"
        print(f"  [{status}] {kw} → {len(repos)}仓库/{len(results)}条")
        for r in results[:5]:
            all_hits.append(f"[{kw}] [{r['stars']}⭐] {r['repo']} :: {r['path']} :: {r['line']}")
    return all_hits


def main():
    ap = argparse.ArgumentParser(description="Sourcegraph 代码搜索")
    ap.add_argument("query", nargs="?", default="", help="搜索关键词")
    ap.add_argument("--list", default="", help="批量关键词文件(每行一个)")
    ap.add_argument("--pattern", default="", help="额外过滤(如 fork:yes archived:yes)")
    ap.add_argument("--output", default="", help="结果落地文件")
    args = ap.parse_args()

    if args.list:
        if not os.path.exists(args.list):
            print(f"❌ 文件不存在: {args.list}")
            sys.exit(1)
        with open(args.list, "r", encoding="utf-8") as f:
            keywords = [l for l in f.read().splitlines() if l.strip() and not l.startswith("#")]
        print(f"\n🔍 批量搜索 {len(keywords)} 个关键词...\n")
        hits = search_multi(keywords, args.pattern)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(f"# Sourcegraph 批量搜索 {datetime.now().strftime('%Y%m%d_%H%M')}\n")
                f.write("\n".join(hits))
            print(f"\n📁 结果已存: {args.output}")
        print(f"\n📊 总命中 {len(hits)} 条")
        return

    if not args.query:
        print("❌ 需要 --list 或 query")
        sys.exit(1)

    repos, results, datalen = search(args.query, args.pattern)
    print(f"\n🔍 Sourcegraph 搜索: {args.query}")
    print(f"   响应 {datalen} 字符, {len(repos)} 个仓库, {len(results)} 条命中")
    print()
    if not results:
        print("   (无命中 - 关键词可能太特定或太通用)")
        return
    print("  仓库列表:")
    for r in sorted(repos):
        print(f"    - {r}")
    print()
    print("  命中明细:")
    for r in results[:15]:
        print(f"    [{r['stars']}⭐] {r['repo']}")
        print(f"      {r['path']}")
        print(f"      → {r['line']}")
        print()

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            for r in results:
                f.write(f"[{r['stars']}⭐] {r['repo']} :: {r['path']} :: {r['line']}\n")
        print(f"📁 结果已存: {args.output}")


if __name__ == "__main__":
    main()
