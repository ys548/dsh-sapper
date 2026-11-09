# -*- coding: utf-8 -*-
"""
小蓝本搜索 fix v2 helper — 避免签名 err002 导致的 403 验签错误
================================================================
问题: 小蓝本搜索页路由签名SDK未初始化, 所有请求 h_sign 降级为 err002 -> 403 验签错误
根因: 详情页路由加载的 chunk 3/12 模块副作用才会初始化签名SDK (文档级)
fix : 先整页导航到任意公司详情页(预热), 再整页加载搜索URL, 签名即恢复纯hex

用法:
    python xiaolanben_search_helper.py "关键词"
    python xiaolanben_search_helper.py "某客户商业" --company-id q016ada1947a31dbaafd8c467f43d7954

输出:
    预热URL + 搜索URL(已URL编码) + initScript + Chrome DevTools MCP 完整导航步骤
"""
import sys
import urllib.parse

# 固定预热公司ID (已验证可初始化签名SDK) — 某客户(中国)投资有限公司
DEFAULT_WARMUP_CID = "qb9d94a767be70c45d056ad999fc550ca"
# webdriver 掩盖 initScript (配合 MCP 拉起的自动化 Edge)
INIT_SCRIPT = "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"


def build(keyword, warmup_cid):
    warmup = f"https://sou.xiaolanben.com/company/{warmup_cid}"
    search = f"https://sou.xiaolanben.com/search?key={urllib.parse.quote(keyword)}&page=1"
    return warmup, search


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    keyword = args[0]
    warmup_cid = DEFAULT_WARMUP_CID
    if "--company-id" in args:
        i = args.index("--company-id")
        if i + 1 < len(args):
            warmup_cid = args[i + 1]

    warmup, search = build(keyword, warmup_cid)

    lines = [
        "=" * 62,
        "小蓝本搜索 fix v2 标准流程 (Chrome DevTools MCP)",
        "=" * 62,
        "",
        f"[Step 1] 预热详情页  (返回即可, 无需等待渲染/scroll)",
        f"  导航: {warmup}",
        "",
        f"[Step 2] 直接整页加载搜索页 (不要用 fill+Enter, 不要新标签直接搜)",
        f"  导航: {search}",
        "",
        "  initScript (每次导航都带):",
        f"    {INIT_SCRIPT}",
        "",
        "[避坑清单]",
        "  - 禁止: 首页 fill+Enter 触发搜索 -> 签名err002 403",
        "  - 禁止: 新标签页直接导航搜索URL -> 签名err002 403",
        "  - 禁止: JS 动态加载 chunk 3/12 -> 只注册不执行, 无效",
        "  - 预热必须在【同一标签页】内, 修复是文档级的",
        "  - 预热一次后, 该标签页内后续所有搜索/翻页都正常",
        "",
        "[URL 速查]",
        f"  WARMUP: {warmup}",
        f"  SEARCH: {search}",
        f"  KEYWORD: {keyword}",
        "",
    ]
    print("\n".join(lines))


if __name__ == "__main__":
    main()
