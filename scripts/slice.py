#!/usr/bin/env python3
"""Slice an element subtree out of a saved page and pretty-print it.
usage: slice.py <file> <needle> [--depth N] [--text]"""
import re, sys

VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

def slice_at(s, i):
    start = s.rfind('<', 0, i)
    depth, pos = 0, start
    tag_re = re.compile(r'<(/?)([a-zA-Z][-\w]*)([^>]*?)(/?)>')
    while pos < len(s):
        m = tag_re.search(s, pos)
        if not m: break
        closing, name, attrs, selfclose = m.groups()
        if name.lower() not in VOID and not selfclose:
            depth += -1 if closing else 1
        pos = m.end()
        if depth == 0:
            return s[start:pos]
    return s[start:start+20000]

def pretty(html, max_depth=None, show_text=True):
    out, indent = [], 0
    for tok in re.split(r'(<[^>]+>)', html):
        if not tok.strip(): continue
        if tok.startswith('<'):
            m = re.match(r'</?([a-zA-Z][-\w]*)', tok)
            name = m.group(1).lower() if m else ''
            if tok.startswith('</'):
                indent -= 1
                if max_depth is None or indent < max_depth:
                    out.append('  '*indent + tok)
            else:
                if max_depth is None or indent < max_depth:
                    out.append('  '*indent + tok)
                if name not in VOID and not tok.endswith('/>'):
                    indent += 1
        elif show_text:
            t = tok.strip()
            if t and (max_depth is None or indent <= max_depth):
                out.append('  '*indent + '· ' + t[:200])
    return '\n'.join(out)

f, needle = sys.argv[1], sys.argv[2]
depth = None
if '--depth' in sys.argv: depth = int(sys.argv[sys.argv.index('--depth')+1])
nth = int(sys.argv[sys.argv.index('--nth')+1]) if '--nth' in sys.argv else 0
s = open(f, encoding='utf-8', errors='replace').read()
i = -1
for _ in range(nth+1):
    i = s.find(needle, i+1)
    if i < 0: sys.exit('not found')
print(pretty(slice_at(s, i), depth))
