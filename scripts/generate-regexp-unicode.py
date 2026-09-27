"""Generate the RegExp VM's Unicode 17 property tables from the official UCD.

Usage: python scripts/generate-regexp-unicode.py work/unicode17
The input files are published at https://www.unicode.org/Public/17.0.0/ucd/.
Unicode data license: https://www.unicode.org/license.txt
Required files: UnicodeData.txt, CaseFolding.txt, Scripts.txt, ScriptExtensions.txt,
PropertyAliases.txt, PropertyValueAliases.txt, PropList.txt,
DerivedCoreProperties.txt, emoji-emoji-data.txt, DerivedNormalizationProps.txt.
"""
from pathlib import Path
import sys

source = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / 'src/runtime/regexp-unicode-data.ts'
ranges = {}
aliases = {}
script_aliases = {}
for alias_row in (source / 'PropertyValueAliases.txt').read_text(encoding='utf-8').splitlines():
    alias_row = alias_row.split('#', 1)[0].strip()
    if not alias_row:
        continue
    alias_fields = [part.strip() for part in alias_row.split(';')]
    if alias_fields[0] == 'sc':
        for alias in alias_fields[1:]:
            script_aliases[alias] = alias_fields[2]

def add(name, first, last):
    ranges.setdefault(name, []).append((first, last))

first_range = None
for row in (source / 'UnicodeData.txt').read_text(encoding='utf-8').splitlines():
    fields = row.split(';')
    cp, label, category = int(fields[0], 16), fields[1], fields[2]
    if label.endswith(', First>'):
        first_range = cp
        continue
    first = first_range if label.endswith(', Last>') and first_range is not None else cp
    first_range = None
    add('gc=' + category, first, cp)
    add('gc=' + category[0], first, cp)
    if category != 'Cn':
        add('Assigned', first, cp)
    if fields[9] == 'Y':
        add('Bidi_Mirrored', first, cp)

def read_ranges(filename, prefix, allowed=None):
    for line in (source / filename).read_text(encoding='utf-8').splitlines():
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        span, prop = (part.strip() for part in line.split(';', 1))
        if allowed is not None and prop not in allowed:
            continue
        points = span.split('..')
        for name in (prop.split() if prefix == 'scx=' else [prop]):
            add(prefix + script_aliases.get(name, name), int(points[0], 16), int(points[-1], 16))

read_ranges('Scripts.txt', 'sc=')
read_ranges('ScriptExtensions.txt', 'scx=')
def complement(items):
    merged = []
    for first, last in sorted(items):
        if merged and first <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(last, merged[-1][1]))
        else:
            merged.append((first, last))
    result = []
    cursor = 0
    for first, last in merged:
        if cursor < first:
            result.append((cursor, first - 1))
        cursor = last + 1
    if cursor <= 0x10ffff:
        result.append((cursor, 0x10ffff))
    return result

unassigned = complement(ranges['Assigned'])
ranges['gc=Cn'] = unassigned
ranges['gc=C'].extend(unassigned)
ranges['gc=LC'] = ranges['gc=Lu'] + ranges['gc=Ll'] + ranges['gc=Lt']
ranges['sc=Unknown'] = complement([span for key, spans in ranges.items() if key.startswith('sc=') for span in spans])
binary = '''ASCII_Hex_Digit Alphabetic Bidi_Control Case_Ignorable Cased Changes_When_Casefolded Changes_When_Casemapped Changes_When_Lowercased Changes_When_NFKC_Casefolded Changes_When_Titlecased Changes_When_Uppercased Dash Default_Ignorable_Code_Point Deprecated Diacritic Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extended_Pictographic Extender Grapheme_Base Grapheme_Extend Hex_Digit IDS_Binary_Operator IDS_Trinary_Operator ID_Continue ID_Start Ideographic Join_Control Logical_Order_Exception Lowercase Math Noncharacter_Code_Point Pattern_Syntax Pattern_White_Space Quotation_Mark Radical Regional_Indicator Sentence_Terminal Soft_Dotted Terminal_Punctuation Unified_Ideograph Uppercase Variation_Selector White_Space XID_Continue XID_Start'''.split()
for filename in ('PropList.txt', 'DerivedCoreProperties.txt', 'emoji-emoji-data.txt', 'DerivedNormalizationProps.txt'):
    read_ranges(filename, '', set(binary))
add('ASCII', 0, 127)
add('Any', 0, 0x10ffff)

for row in (source / 'PropertyValueAliases.txt').read_text(encoding='utf-8').splitlines():
    row = row.split('#', 1)[0].strip()
    if not row:
        continue
    fields = [field.strip() for field in row.split(';')]
    kind = fields[0]
    if kind not in ('gc', 'sc'):
        continue
    canonical = fields[1] if kind == 'gc' else fields[2]
    for value in fields[1:]:
        aliases[kind + '=' + value] = kind + '=' + canonical
        if kind == 'gc':
            aliases[value] = kind + '=' + canonical

for row in (source / 'PropertyAliases.txt').read_text(encoding='utf-8').splitlines():
    row = row.split('#', 1)[0].strip()
    if not row:
        continue
    fields = [field.strip() for field in row.split(';')]
    canonical = fields[1]
    if canonical in ('General_Category', 'Script', 'Script_Extensions'):
        prefix = {'General_Category': 'gc', 'Script': 'sc', 'Script_Extensions': 'scx'}[canonical]
        for value in fields:
            aliases[value + '='] = prefix + '='
    if canonical in binary:
        for value in fields:
            aliases[value] = canonical

extension_overrides = [span for key, spans in ranges.items() if key.startswith('scx=') for span in spans]
extension_overrides.sort()
for key in list(ranges):
    if key.startswith('sc='):
        defaults = []
        for first, last in ranges[key]:
            cursor = first
            for override_first, override_last in extension_overrides:
                if override_last < cursor:
                    continue
                if override_first > last:
                    break
                if override_first > cursor:
                    defaults.append((cursor, override_first - 1))
                cursor = max(cursor, override_last + 1)
                if cursor > last:
                    break
            if cursor <= last:
                defaults.append((cursor, last))
        ranges['scx=' + key[3:]] = ranges.get('scx=' + key[3:], []) + defaults

def encode(items):
    merged = []
    for first, last in sorted(items):
        if merged and first <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(last, merged[-1][1]))
        else:
            merged.append((first, last))
    return ''.join(f'{first:06x}{last:06x}' for first, last in merged)

data = {key: encode(value) for key, value in ranges.items()}
for key, value in list(data.items()):
    if key.startswith('gc='):
        data[key[3:]] = value
for alias, target in aliases.items():
    if alias.endswith('=') and target in ('gc=', 'sc=', 'scx='):
        for key, value in list(data.items()):
            if key.startswith(target):
                data[alias + key[len(target):]] = value
        continue
    if alias.startswith('sc='):
        for prefix in ('sc=', 'scx='):
            key = prefix + alias[3:]
            resolved = prefix + target[3:]
            if resolved in data:
                data[key] = data[resolved]
    elif target in data:
        data[alias] = data[target]

import json
values = list(dict.fromkeys(data.values()))
index = {value: i for i, value in enumerate(values)}
packed = {'names': {name: index[value] for name, value in data.items()}, 'values': values}
folds = {}
for row in (source / 'CaseFolding.txt').read_text(encoding='utf-8').splitlines():
    row = row.split('#', 1)[0].strip()
    if not row:
        continue
    point, status, mapping = (part.strip() for part in row.split(';')[:3])
    if status in ('C', 'S'):
        folds[int(point, 16)] = int(mapping, 16)
packed['folds'] = ''.join(f'{point:06x}{target:06x}' for point, target in sorted(folds.items()))
out.write_text('// Generated from Unicode 17.0.0 UCD; see scripts/generate-regexp-unicode.py.\n'
               + '// Unicode data license: https://www.unicode.org/license.txt\n'
               + 'export const regexpUnicodeData = ' + json.dumps(json.dumps(packed, separators=(',', ':'))) + ';\n', encoding='utf-8')
print(f'{len(data)} names, {out.stat().st_size} bytes')
