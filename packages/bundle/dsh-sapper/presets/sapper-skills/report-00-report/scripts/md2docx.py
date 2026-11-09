#!/usr/bin/env python3
# md2docx.py — 报告 md → Word(.docx)，自动把 evidence/ 里的截图内嵌进正文
# 用法: py md2docx.py <报告.md> [-o 输出.docx]
# 解析规则针对 report-00-report 模板结构：标题/表格/代码块/📎图片锚点/![]()图片/列表/加粗
import sys, os, re, argparse
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

IMG_ANCHOR = re.compile(r'📎\s*(.+)')          # 📎 evidence/01-首页.png
MD_IMG     = re.compile(r'!\[[^\]]*\]\(([^)]+)\)')
BOLD       = re.compile(r'\*\*(.+?)\*\*')

def add_runs(par, text):
    """处理 **加粗** 行内标记"""
    pos = 0
    for m in BOLD.finditer(text):
        if m.start() > pos: par.add_run(text[pos:m.start()])
        r = par.add_run(m.group(1)); r.bold = True
        pos = m.end()
    if pos < len(text): par.add_run(text[pos:])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('md'); ap.add_argument('-o', '--out')
    a = ap.parse_args()
    md_path = os.path.abspath(a.md)
    base = os.path.dirname(md_path)
    out = a.out or os.path.splitext(md_path)[0] + '.docx'

    doc = Document()
    # 全局中文字体
    style = doc.styles['Normal']
    style.font.name = 'Calibri'; style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
    for h, sz in [('Heading 1', 16), ('Heading 2', 14), ('Heading 3', 12), ('Heading 4', 11)]:
        s = doc.styles[h]; s.font.size = Pt(sz); s.font.color.rgb = RGBColor(0x1F, 0x3B, 0x63)
        s.element.get_or_add_rPr()
        rf = s.element.rPr.get_or_add_rFonts(); rf.set(qn('w:eastAsia'), '微软雅黑')

    lines = open(md_path, encoding='utf-8').read().splitlines()
    i, embedded, missed = 0, 0, []
    while i < len(lines):
        ln = lines[i]

        # 代码块
        if ln.strip().startswith('```'):
            lang = ln.strip()[3:].strip()
            code, i = [], i + 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i]); i += 1
            i += 1
            p = doc.add_paragraph()
            pf = p.paragraph_format; pf.left_indent = Inches(0.1)
            pf.space_before = Pt(4); pf.space_after = Pt(4)
            r = p.add_run('\n'.join(code))
            r.font.name = 'Consolas'; r.font.size = Pt(8.5)
            r.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
            if lang == 'http': p.add_run('')  # keep tight
            continue

        # 表格
        if ln.strip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|[\s:\-|]+\|\s*$', lines[i+1]):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                rows.append(cells); i += 1
            rows.pop(1)  # 分隔行
            ncol = max(len(r) for r in rows)
            t = doc.add_table(rows=len(rows), cols=ncol); t.style = 'Light Grid Accent 1'
            for ri, row in enumerate(rows):
                for ci in range(ncol):
                    cell = t.cell(ri, ci)
                    cell.text = ''
                    add_runs(cell.paragraphs[0], row[ci] if ci < len(row) else '')
                    for p in cell.paragraphs:
                        for r in p.runs: r.font.size = Pt(9)
            doc.add_paragraph()
            continue

        # 📎 图片锚点 / markdown 图片 → 内嵌
        imgs = MD_IMG.findall(ln) or ([IMG_ANCHOR.match(ln.strip()).group(1).strip()] if IMG_ANCHOR.match(ln.strip()) else [])
        if imgs:
            for ref in imgs:
                ref = ref.strip().strip('`')
                path = ref if os.path.isabs(ref) else os.path.join(base, ref)
                if os.path.exists(path):
                    try:
                        doc.add_picture(path, width=Inches(6.0))
                        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                        cap = doc.add_paragraph(); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        cr = cap.add_run(f'图：{os.path.basename(path)}'); cr.font.size = Pt(8); cr.italic = True
                        embedded += 1
                    except Exception as e:
                        missed.append(f'{ref} (嵌入失败: {e})')
                else:
                    missed.append(ref)
            i += 1
            continue

        # 标题
        m = re.match(r'^(#{1,6})\s+(.*)', ln)
        if m:
            lvl = min(len(m.group(1)), 4)
            h = doc.add_heading('', level=lvl); add_runs(h, m.group(2))
            i += 1; continue

        # 分隔线
        if re.match(r'^\s*---+\s*$', ln):
            i += 1; continue

        # 引用块
        if ln.strip().startswith('>'):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            add_runs(p, ln.strip().lstrip('>').strip())
            for r in p.runs: r.font.color.rgb = RGBColor(0x80, 0x40, 0x00); r.font.size = Pt(9.5)
            i += 1; continue

        # 列表
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)', ln)
        if m:
            style_name = 'List Bullet' if m.group(2) in '-*' else 'List Number'
            p = doc.add_paragraph(style=style_name)
            add_runs(p, m.group(3))
            i += 1; continue

        # 复选框
        if re.match(r'^\s*-\s*\[[ x]\]', ln):
            p = doc.add_paragraph(); add_runs(p, ln.strip())
            i += 1; continue

        # 空行
        if not ln.strip():
            i += 1; continue

        # 普通段落
        p = doc.add_paragraph(); add_runs(p, ln.strip())
        i += 1

    doc.save(out)
    print(f'OK: {out}')
    print(f'内嵌图片: {embedded} 张')
    if missed:
        print('未嵌入(路径不存在/失败):')
        for m_ in missed: print(f'  - {m_}')
        sys.exit(2)

if __name__ == '__main__':
    main()
