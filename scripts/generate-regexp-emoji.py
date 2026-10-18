"""Generate the RegExp VM's Unicode Emoji 17 properties of strings.

Usage: python scripts/generate-regexp-emoji.py work/emoji17
The input files are published at https://www.unicode.org/Public/17.0.0/emoji/.
Unicode data license: https://www.unicode.org/license.txt
Required files: emoji-sequences.txt, emoji-zwj-sequences.txt.

Each property is stored as {"r": ranges, "s": strings}: ranges holds the
single code points as 12 hex digits per range (as in regexp-unicode-data.ts),
strings the sequences themselves, separated by commas. The six properties are
disjoint; RGI_Emoji, their union, is computed by the engine.
"""
from pathlib import Path
import json
import sys

source = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / 'src/runtime/data/regexp-emoji-data.ts'
names = ['Basic_Emoji', 'Emoji_Keycap_Sequence', 'RGI_Emoji_Modifier_Sequence', 'RGI_Emoji_Flag_Sequence',
         'RGI_Emoji_Tag_Sequence', 'RGI_Emoji_ZWJ_Sequence']
points = {name: [] for name in names}
sequences = {name: [] for name in names}
for filename in ('emoji-sequences.txt', 'emoji-zwj-sequences.txt'):
    for row in (source / filename).read_text(encoding='utf-8').splitlines():
        row = row.split('#', 1)[0].strip()
        if not row:
            continue
        span, prop = (part.strip() for part in row.split(';')[:2])
        if prop not in points:
            raise SystemExit(f'unknown property {prop}')
        if '..' in span:
            first, last = (int(part, 16) for part in span.split('..'))
            points[prop].append((first, last))
        elif ' ' not in span:
            points[prop].append((int(span, 16), int(span, 16)))
        else:
            sequences[prop].append(''.join(chr(int(part, 16)) for part in span.split()))

def encode(items):
    merged = []
    for first, last in sorted(items):
        if merged and first <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(last, merged[-1][1]))
        else:
            merged.append((first, last))
    return ''.join(f'{first:06x}{last:06x}' for first, last in merged)

seen = set()
for name in names:
    for sequence in sequences[name]:
        if sequence in seen or ',' in sequence:
            raise SystemExit(f'{name}: unexpected sequence {sequence!r}')
        seen.add(sequence)
packed = {name: {'r': encode(points[name]), 's': ','.join(sequences[name])} for name in names}
out.write_text('// Generated from Unicode Emoji 17.0.0; see scripts/generate-regexp-emoji.py.\n'
               + '// Unicode data license: https://www.unicode.org/license.txt\n'
               + 'export const regexpEmojiData = ' + json.dumps(json.dumps(packed, separators=(',', ':'))) + ';\n',
               encoding='utf-8')
print(', '.join(f'{name}: {len(sequences[name])} strings' for name in names) + f'; {out.stat().st_size} bytes')
