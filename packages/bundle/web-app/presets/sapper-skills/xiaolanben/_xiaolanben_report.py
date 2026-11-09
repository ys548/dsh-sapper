# -*- coding: utf-8 -*-
"""小蓝本股权穿透 xlsx 报告生成器
用法: python _xiaolanben_report.py --input xiaolanben_data_baisheng.json
输出: results/xiaolanben_report_YYYYMMDD_HHMMSS.xlsx (3 sheets: 股权树/域名明细/汇总统计)
"""
import argparse, json, re, sys, datetime, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

THIN = Side(style='thin', color='CCCCCC')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal='center', vertical='center')
LEFT = Alignment(horizontal='left', vertical='center')

PURPLE = PatternFill('solid', fgColor='7B68EE')
BLUE = PatternFill('solid', fgColor='4472C4')
GREEN = PatternFill('solid', fgColor='548235')
YELLOW = PatternFill('solid', fgColor='FFF2CC')
GRAY = PatternFill('solid', fgColor='F2F2F2')
WHITE_FONT = Font(color='FFFFFF', bold=True, size=11)

def parse_arg():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    return p.parse_args()

def load_data(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def sheet_title(ws, title, fill, subtitle=None):
    ws.merge_cells('A1:F1')
    c = ws['A1']; c.value = title; c.font = Font(size=14, bold=True, color='FFFFFF')
    c.fill = fill; c.alignment = CENTER
    ws.row_dimensions[1].height = 28
    if subtitle:
        ws.merge_cells('A2:F2')
        ws['A2'] = subtitle; ws['A2'].font = Font(size=10, color='666666'); ws['A2'].alignment = LEFT

def header_row(ws, row, headers):
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = WHITE_FONT; c.fill = PURPLE; c.alignment = CENTER; c.border = BORDER
    ws.row_dimensions[row].height = 20

def equity_tree(ws, data):
    ws.sheet_properties.tabColor = '7B68EE'
    sheet_title(ws, f"股权树 — {data['root']}", PURPLE, f"数据来源: {data['source']}  |  采集日期: {data['date']}")
    headers = ['层级', '公司名称', '持股比例', '资产规模', '官网/域名', '邮箱']
    header_row(ws, 4, headers)
    r = 5
    for lv in data.get('levels', []):
        for comp in lv.get('companies', []):
            domain_txt = '; '.join([d['url'] for d in comp.get('domains', [])]) if comp.get('domains') else '—'
            email_txt = '; '.join(comp.get('emails', [])) if comp.get('emails') else '—'
            ratio_txt = f"{comp.get('ratio')}%" if comp.get('ratio') else '—'
            vals = [lv['level'], comp['name'], ratio_txt, comp.get('asset_scale', '—'), domain_txt, email_txt]
            for i, v in enumerate(vals, 1):
                c = ws.cell(row=r, column=i, value=v)
                c.border = BORDER
                c.alignment = LEFT if i in (2, 5, 6) else CENTER
            fill = YELLOW if lv['level'] == 0 else (GRAY if lv['level'] == 1 else None)
            if fill:
                for i in range(1, 7):
                    ws.cell(row=r, column=i).fill = fill
            # 孙公司缩进标记
            if comp.get('parent'):
                c = ws.cell(row=r, column=2)
                c.value = f"  └─ {comp['name']} (由{comp['parent']}全资)"
                c.font = Font(color='666666', size=10)
            r += 1
    widths = [8, 40, 12, 12, 32, 34]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

def domain_sheet(ws, data):
    ws.sheet_properties.tabColor = '4472C4'
    sheet_title(ws, "域名明细", BLUE)
    headers = ['公司名称', '层级', '域名', '产品/说明', '来源']
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=4, column=i, value=h)
        c.font = WHITE_FONT; c.fill = BLUE; c.alignment = CENTER; c.border = BORDER
    r = 5
    for lv in data.get('levels', []):
        for comp in lv.get('companies', []):
            for d in comp.get('domains', []):
                ws.cell(row=r, column=1, value=comp['name']).border = BORDER
                ws.cell(row=r, column=2, value=lv['level']).border = BORDER
                c3 = ws.cell(row=r, column=3, value=d['url'])
                c3.hyperlink = 'http://' + d['url'] if not d['url'].startswith('http') else d['url']
                c3.font = Font(color='0563C1', underline='single')
                c3.border = BORDER
                ws.cell(row=r, column=4, value=d.get('product', '')).border = BORDER
                ws.cell(row=r, column=5, value=d.get('source', '')).border = BORDER
                r += 1
    for i, w in enumerate([40, 8, 34, 24, 16], 1):
        ws.column_dimensions[get_column_letter(i)].width = w

def summary_sheet(ws, data):
    ws.sheet_properties.tabColor = '548235'
    sheet_title(ws, "汇总统计", GREEN)
    comps = [c for lv in data.get('levels', []) for c in lv.get('companies', [])]
    domains = [d['url'] for c in comps for d in c.get('domains', [])]
    emails = [e for c in comps for e in c.get('emails', [])]
    total = sum(c.get('ratio') is not None for c in comps)

    rows = [
        ('总览', ''),
        ('根公司', data.get('root', '')),
        ('集团/母公司', data.get('root_info', {}).get('group', '—')),
        ('股东', data.get('root_info', {}).get('shareholder', '—')),
        ('公司总数(含根)', len(comps)),
        ('子公司数(直接控股≥51%)', total),
        ('独立域名数', len(domains)),
        ('邮箱数', len(emails)),
        ('', ''),
        ('域名清单', '; '.join(domains) if domains else '无'),
        ('邮箱清单', '; '.join(emails) if emails else '无'),
    ]
    r = 4
    for k, v in rows:
        ck = ws.cell(row=r, column=1, value=k); ck.font = Font(bold=True); ck.fill = GREEN; ck.font = Font(bold=True, color='FFFFFF'); ck.alignment = CENTER; ck.border = BORDER
        cv = ws.cell(row=r, column=2, value=v); cv.border = BORDER; cv.alignment = LEFT
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)
        r += 1
    ws.column_dimensions['A'].width = 22
    for col in 'BCDEF':
        ws.column_dimensions[col].width = 30

def main():
    args = parse_arg()
    data = load_data(args.input)
    outdir = os.path.join(os.path.dirname(os.path.abspath(args.input)), 'results')
    os.makedirs(outdir, exist_ok=True)
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    out = os.path.join(outdir, f"xiaolanben_report_{ts}.xlsx")
    wb = Workbook()
    ws1 = wb.active; ws1.title = '股权树'
    equity_tree(ws1, data)
    ws2 = wb.create_sheet('域名明细')
    domain_sheet(ws2, data)
    ws3 = wb.create_sheet('汇总统计')
    summary_sheet(ws3, data)
    wb.save(out)
    print(f"OK → {out}")

if __name__ == '__main__':
    main()
