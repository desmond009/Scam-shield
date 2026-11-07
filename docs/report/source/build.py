"""Assemble the ScamShield report: number chapters/sections/figures/tables, resolve citations,
render body + front matter to PDF with Chromium, find page numbers, fill the TOC, merge."""
import glob, json, re, subprocess, sys, os
from bs4 import BeautifulSoup
from pypdf import PdfReader, PdfWriter
from refs import REFS

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

CSS = open('style.css').read()

def wrap(body, cls):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style>
<script src="node_modules/mermaid/dist/mermaid.min.js"></script></head><body class="{cls}">{body}
<script>
mermaid.initialize({{startOnLoad:false, theme:'base', securityLevel:'loose', fontFamily:'Times New Roman, serif',
 themeVariables:{{fontSize:'17px', primaryColor:'#eef3fb', primaryBorderColor:'#2a5aa8', primaryTextColor:'#111',
 lineColor:'#444', secondaryColor:'#fdf1e8', tertiaryColor:'#f4f4f2'}},
 flowchart:{{htmlLabels:true, curve:'basis', nodeSpacing:22, rankSpacing:32, padding:6}}, state:{{nodeSpacing:22, rankSpacing:30}}, class:{{nodeSpacing:25, rankSpacing:35}}, sequence:{{mirrorActors:false, useMaxWidth:true, wrap:false, width:96, actorMargin:12, diagramMarginX:4, messageFontFamily:'Times New Roman', messageFontSize:'16px', actorFontSize:'15px', boxMargin:6, messageMargin:22, noteFontSize:'14px'}}, er:{{useMaxWidth:true}} }});
mermaid.run({{querySelector:'.mermaid'}}).then(()=>document.body.dataset.done=1).catch(e=>{{document.body.dataset.err=String(e);document.body.dataset.done=1}});
</script></body></html>"""

# ---------- body ----------
files = sorted(glob.glob('ch/[0-9][0-9]_*.html'))
soup = BeautifulSoup('<div id="root"></div>', 'html.parser')
root = soup.find(id='root')
for f in files:
    frag = BeautifulSoup(open(f).read(), 'html.parser')
    for el in list(frag.contents):
        root.append(el)

toc, lof, lot = [], [], []
chap = 0; sec = 0; sub = 0; fig = 0; tab = 0; appx = 0
cite_order = []
for el in root.find_all(['h1', 'h2', 'h3', 'figure', 'table', 'c']):
    if el.name == 'h1':
        title = el.get_text()
        if el.has_attr('data-appendix'):
            appx += 1; letter = chr(64 + appx); chap = letter
            label = f'Appendix {letter}'
        elif el.has_attr('data-nonum'):
            chap = 'R'; label = ''
        else:
            chap = (chap if isinstance(chap, int) else 0) + 1
            label = f'Chapter {chap}'
        sec = sub = fig = tab = 0
        el['class'] = el.get('class', []) + ['chapter']
        el.clear()
        if label:
            k = soup.new_tag('span', attrs={'class': 'chap-label'}); k.string = label; el.append(k)
        t = soup.new_tag('span', attrs={'class': 'chap-title'}); t.string = title; el.append(t)
        toc.append((0, label, title, f'{label}{" " if label else ""}{title}'.strip()))
    elif el.name == 'h2':
        sec += 1; sub = 0
        num = f'{chap}.{sec}'
        title = el.get_text(); el.string = f'{num} {title}'
        toc.append((1, num, title, f'{num} {title}'))
    elif el.name == 'h3':
        sub += 1
        num = f'{chap}.{sec}.{sub}'
        title = el.get_text(); el.string = f'{num} {title}'
    elif el.name == 'figure':
        cap = el.find('figcaption')
        if cap is None: continue
        fig += 1; num = f'{chap}.{fig}'
        text = cap.get_text()
        cap.clear(); b = soup.new_tag('b'); b.string = f'Figure {num}: '; cap.append(b); cap.append(text)
        lof.append((num, text))
        if el.has_attr('id'): el['data-num'] = num
    elif el.name == 'table':
        cap = el.find('caption')
        if cap is None: continue
        tab += 1; num = f'{chap}.{tab}'
        text = cap.get_text()
        cap.clear(); b = soup.new_tag('b'); b.string = f'Table {num}: '; cap.append(b); cap.append(text)
        lot.append((num, text))
    elif el.name == 'c':
        keys = [k.strip() for k in el.get_text().split(',')]
        nums = []
        for k in keys:
            if k not in REFS: sys.exit(f'unknown ref {k}')
            if k not in cite_order: cite_order.append(k)
            nums.append(cite_order.index(k) + 1)
        el.name = 'span'; el['class'] = 'cite'; el.string = '[' + ', '.join(map(str, nums)) + ']'

# references list
reflist = root.find(id='reflist')
for k in cite_order:
    li = soup.new_tag('li'); li.append(BeautifulSoup(REFS[k], 'html.parser')); reflist.append(li)
unused = [k for k in REFS if k not in cite_order]
if unused: print('unused refs:', unused)

body_html = wrap(str(root.decode_contents()), 'main')
open('body.html', 'w').write(body_html)

def render(src, out):
    subprocess.run(['node', 'render.mjs', src, out], check=True)

render('body.html', 'body.pdf')

# ---------- page numbers ----------
def norm(s): return re.sub(r'\s+', ' ', s).strip().lower()
pages = [norm(p.extract_text() or '') for p in PdfReader('body.pdf').pages]
def find(needle, start=0):
    n = norm(needle)
    for i in range(start, len(pages)):
        if n in pages[i]: return i
    for i in range(start, len(pages)):  # fall back to a prefix
        if n[:40] in pages[i]: return i
    print('NOT FOUND:', needle); return start

toc_rows, cur = [], 0
for lvl, num, title, full in toc:
    needle = full if lvl == 1 else (num if num else title)
    if lvl == 0:
        cur = find((num + ' ' + title) if num else title, cur)
    else:
        cur = find(full, cur)
    toc_rows.append((lvl, num, title, cur + 1))
lof_rows = [(n, t, find(f'Figure {n}:') + 1) for n, t in lof]
lot_rows = [(n, t, find(f'Table {n}:') + 1) for n, t in lot]
print(f'body pages: {len(pages)}, figures {len(lof)}, tables {len(lot)}, refs {len(cite_order)}')

# ---------- front matter ----------
front = open('front.html').read()
def row(cls, num, title, pg):
    return f'<div class="toc-row {cls}"><span class="tn">{num}</span><span class="tt">{title}</span><span class="dots"></span><span class="tp">{pg}</span></div>'
toc_html = ''.join(row('l0' if l == 0 else 'l1', n, t, p) for l, n, t, p in toc_rows)
lof_html = ''.join(row('l1', n, t, p) for n, t, p in lof_rows)
lot_html = ''.join(row('l1', n, t, p) for n, t, p in lot_rows)
front = front.replace('{{TOC}}', toc_html).replace('{{LOF}}', lof_html).replace('{{LOT}}', lot_html)
open('front_r.html', 'w').write(wrap(front, 'front'))
render('front_r.html', 'front.pdf')

w = PdfWriter()
for f in ['front.pdf', 'body.pdf']:
    for p in PdfReader(f).pages: w.add_page(p)
w.add_metadata({'/Title': 'ScamShield: Final-Year Project Report', '/Author': 'Ansh, Harshit, Vijender, Sourabh — IIIT Dharwad'})
w.write('ScamShield_Project_Report.pdf')
print('front pages:', len(PdfReader('front.pdf').pages))
