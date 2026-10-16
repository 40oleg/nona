import { runtimeIntl } from "../lib/sources.generated.js";
import { regexpUnicodeData } from "./data/regexp-unicode-data.js";
// Intl.Segmenter for grapheme clusters (UAX #29). The prelude classifies code
// points with a table of Grapheme_Cluster_Break ranges built here from the
// Unicode properties of the RegExp engine, so it needs neither the engine nor
// its property tables at run time.

type Range = [number, number];

const hangul = 0xac00;
// Classes in the order the prelude's class letters list them; earlier entries
// below win where sets overlap.
const fixed: Record<string, Range[]> = {
    // Prepend (and the prepended concatenation marks).
    P: [
        [0x0600, 0x0605],
        [0x06dd, 0x06dd],
        [0x070f, 0x070f],
        [0x0890, 0x0891],
        [0x08e2, 0x08e2],
        [0x0d4e, 0x0d4e],
        [0x110bd, 0x110bd],
        [0x110cd, 0x110cd],
        [0x111c2, 0x111c3],
        [0x1193f, 0x1193f],
        [0x11941, 0x11941],
        [0x11a3a, 0x11a3a],
        [0x11a84, 0x11a89],
        [0x11d46, 0x11d46],
        [0x11f02, 0x11f02],
    ],
    // Indic_Conjunct_Break=Linker (the viramas of the scripts GB9c covers).
    N: [
        [0x094d, 0x094d],
        [0x09cd, 0x09cd],
        [0x0acd, 0x0acd],
        [0x0b4d, 0x0b4d],
        [0x0c4d, 0x0c4d],
        [0x0d4d, 0x0d4d],
    ],
    // Indic_Conjunct_Break=Consonant.
    K: [
        [0x0915, 0x0939],
        [0x0958, 0x095f],
        [0x0978, 0x097f],
        [0x0995, 0x09a8],
        [0x09aa, 0x09b0],
        [0x09b2, 0x09b2],
        [0x09b6, 0x09b9],
        [0x09dc, 0x09dd],
        [0x09df, 0x09df],
        [0x09f0, 0x09f1],
        [0x0a95, 0x0aa8],
        [0x0aaa, 0x0ab0],
        [0x0ab2, 0x0ab3],
        [0x0ab5, 0x0ab9],
        [0x0af9, 0x0af9],
        [0x0b15, 0x0b28],
        [0x0b2a, 0x0b30],
        [0x0b32, 0x0b33],
        [0x0b35, 0x0b39],
        [0x0b5c, 0x0b5d],
        [0x0b5f, 0x0b5f],
        [0x0b71, 0x0b71],
        [0x0c15, 0x0c28],
        [0x0c2a, 0x0c39],
        [0x0c58, 0x0c5a],
        [0x0d15, 0x0d3a],
    ],
    // Hangul jamo; the syllables (LV, LVT) are computed by the prelude.
    l: [
        [0x1100, 0x115f],
        [0xa960, 0xa97c],
    ],
    v: [
        [0x1160, 0x11a7],
        [0xd7b0, 0xd7c6],
    ],
    t: [
        [0x11a8, 0x11ff],
        [0xd7cb, 0xd7fb],
    ],
};
// Spacing marks that are not SpacingMark, and the two that are not gc=Mc.
const notSpacingMark: Range[] = [
    [0x102b, 0x102c],
    [0x1038, 0x1038],
    [0x1062, 0x1064],
    [0x1067, 0x106d],
    [0x1083, 0x1083],
    [0x1087, 0x108c],
    [0x108f, 0x108f],
    [0x109a, 0x109c],
    [0x1a61, 0x1a61],
    [0x1a63, 0x1a64],
    [0xaa7b, 0xaa7b],
    [0xaa7d, 0xaa7d],
    [0x11720, 0x11721],
];

function graphemeTable(): string {
    const data = JSON.parse(regexpUnicodeData) as {
        names: Record<string, number>;
        values: string[];
    };
    const property = (name: string): Range[] => {
        const text = data.values[data.names[name]!]!;
        const ranges: Range[] = [];
        for (let i = 0; i < text.length; i += 12)
            ranges.push([
                parseInt(text.slice(i, i + 6), 16),
                parseInt(text.slice(i + 6, i + 12), 16),
            ]);
        return ranges;
    };
    const control = [
        ...property("gc=Cc"),
        ...property("gc=Cf"),
        ...property("gc=Zl"),
        ...property("gc=Zp"),
    ];
    // Highest precedence first. CR, LF and ZWJ, and code points below U+007F,
    // are classified by the prelude itself.
    const sets: [string, Range[]][] = [
        ["N", fixed.N!],
        ["E", [...property("Grapheme_Extend"), ...property("Emoji_Modifier")]],
        ["R", property("Regional_Indicator")],
        ["P", fixed.P!],
        ["X", control],
        ["O", notSpacingMark],
        ["S", [...property("gc=Mc"), [0x0e33, 0x0e33], [0x0eb3, 0x0eb3]]],
        ["G", property("Extended_Pictographic")],
        ["K", fixed.K!],
        ["l", fixed.l!],
        ["v", fixed.v!],
        ["t", fixed.t!],
    ];
    const cuts = new Set<number>([0x200d, 0x200e]);
    for (const [, ranges] of sets)
        for (const [start, end] of ranges) {
            cuts.add(start);
            cuts.add(end + 1);
        }
    const points = [...cuts].sort((a, b) => a - b);
    const inside = (ranges: Range[], cp: number) =>
        ranges.some(([start, end]) => start <= cp && cp <= end);
    const result: [number, number, string][] = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const start = points[i]!,
            end = points[i + 1]! - 1;
        if (end < 0x7f || (start >= hangul && end <= 0xd7a3)) continue;
        if (start === 0x200d && end === 0x200d) continue;
        const found = sets.find(([, ranges]) => inside(ranges, start));
        const letter = found ? found[0] : "O";
        if (letter === "O") continue;
        const last = result[result.length - 1];
        if (last && last[1] === start - 1 && last[2] === letter) last[1] = end;
        else result.push([start, end, letter]);
    }
    const hex = (n: number) => n.toString(16).padStart(6, "0");
    // ZWJ, the only code point of its class.
    result.push([0x200d, 0x200d, "Z"]);
    result.sort((a, b) => a[0] - b[0]);
    return result.map(([s, e, letter]) => hex(s) + hex(e) + letter).join("");
}

let source: string | undefined;
/** The Intl prelude, with its grapheme break table. */
export function intlPreludeSource(): string {
    source ??= runtimeIntl.replace('"@@GRAPHEME_TABLE@@"', () =>
        JSON.stringify(graphemeTable()),
    );
    return source;
}
