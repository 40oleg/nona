import { RuntimeBuilder, slot } from "./abi.js";
import { rootedFn } from "./root-scope.js";

// ES date-time string format subset with UTC as the host local-time policy.
// Other strings fall back to the legacy implementation-defined forms.
export function emitDateParse(b: RuntimeBuilder): void {
    b.fn("rt.parseIsoDate", 312, (a) => {
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.load("rax", { base: "rdx" });
        a.store(slot(64), "rax");
        a.mov("rax", 0);
        a.store(slot(56), "rax");
        a.store(slot(72), "rax");
        const invalid = a.unique("invalid"),
            finish = a.unique("finish");
        a.load("rax", slot(64));
        a.test("rax", "rax");
        a.jcc("e", invalid);
        const peek = () => {
            a.load("r10", slot(56));
            a.load("r11", slot(64));
            a.cmp("r10", "r11");
            a.jcc("ae", invalid);
            a.shl("r10", 1);
            a.load("r11", slot(48));
            a.add("r11", "r10");
            a.load("r11", { base: "r11", disp: 8 }, 16);
        };
        const consume = (code: number) => {
            peek();
            a.cmp("r11", code);
            a.jcc("ne", invalid);
            a.load("r10", slot(56));
            a.add("r10", 1);
            a.store(slot(56), "r10");
        };
        const digits = (count: number, offset: number) => {
            a.load("r10", slot(56));
            a.add("r10", count);
            a.load("r11", slot(64));
            a.cmp("r10", "r11");
            a.jcc("a", invalid);
            a.mov("rax", 0);
            for (let i = 0; i < count; i++) {
                a.load("r10", slot(56));
                a.shl("r10", 1);
                a.load("r11", slot(48));
                a.add("r11", "r10");
                a.load("r11", { base: "r11", disp: 8 }, 16);
                a.cmp("r11", 48);
                a.jcc("b", invalid);
                a.cmp("r11", 57);
                a.jcc("a", invalid);
                a.mov("r10", 10);
                a.imul("rax", "r10");
                a.sub("r11", 48);
                a.add("rax", "r11");
                a.load("r10", slot(56));
                a.add("r10", 1);
                a.store(slot(56), "r10");
            }
            a.store(slot(offset), "rax");
        };
        const maybeEnd = (label: string) => {
            a.load("r10", slot(56));
            a.load("r11", slot(64));
            a.cmp("r10", "r11");
            a.jcc("e", label);
        };
        // Integer fields before the final MakeDate call.
        a.mov("rax", 0);
        a.store(slot(88), "rax");
        a.mov("rax", 1);
        a.store(slot(96), "rax");
        for (const offset of [104, 112, 120, 128, 136, 144, 152, 160, 168]) {
            a.mov("rax", 0);
            a.store(slot(offset), "rax");
        }
        peek();
        const unsigned = a.unique("unsigned"),
            signedDone = a.unique("signedDone");
        a.cmp("r11", 43);
        a.jcc("e", signedDone);
        a.cmp("r11", 45);
        a.jcc("ne", unsigned);
        a.mov("rax", 1);
        a.store(slot(72), "rax");
        a.label(signedDone);
        a.load("r10", slot(56));
        a.add("r10", 1);
        a.store(slot(56), "r10");
        digits(6, 80);
        a.jmp("rt.parseIsoDate.afterYear");
        a.label(unsigned);
        digits(4, 80);
        a.label("rt.parseIsoDate.afterYear");
        a.load("rax", slot(72));
        a.test("rax", "rax");
        const yearSignDone = a.unique("yearSignDone");
        a.jcc("e", yearSignDone);
        a.load("rax", slot(80));
        a.test("rax", "rax");
        a.jcc("e", invalid);
        a.neg("rax");
        a.store(slot(80), "rax");
        a.label(yearSignDone);
        maybeEnd(finish);
        consume(45);
        digits(2, 88);
        a.load("rax", slot(88));
        a.cmp("rax", 1);
        a.jcc("b", invalid);
        a.cmp("rax", 12);
        a.jcc("a", invalid);
        a.sub("rax", 1);
        a.store(slot(88), "rax");
        maybeEnd(finish);
        consume(45);
        digits(2, 96);
        a.load("rax", slot(96));
        a.cmp("rax", 1);
        a.jcc("b", invalid);
        a.cmp("rax", 31);
        a.jcc("a", invalid);
        maybeEnd(finish);
        // The date and time are separated by "T" or a space.
        const timeSeparated = a.unique("timeSeparated");
        peek();
        a.cmp("r11", 32);
        a.jcc("e", timeSeparated);
        a.cmp("r11", 84);
        a.jcc("ne", invalid);
        a.label(timeSeparated);
        a.load("r10", slot(56));
        a.add("r10", 1);
        a.store(slot(56), "r10");
        digits(2, 104);
        consume(58);
        digits(2, 112);
        a.load("rax", slot(104));
        a.cmp("rax", 24);
        a.jcc("a", invalid);
        a.load("rax", slot(112));
        a.cmp("rax", 59);
        a.jcc("a", invalid);
        maybeEnd(finish);
        peek();
        const afterSeconds = a.unique("afterSeconds");
        a.cmp("r11", 58);
        a.jcc("ne", afterSeconds);
        consume(58);
        digits(2, 120);
        a.load("rax", slot(120));
        a.cmp("rax", 59);
        a.jcc("a", invalid);
        maybeEnd(finish);
        peek();
        a.cmp("r11", 46);
        a.jcc("ne", afterSeconds);
        consume(46);
        // Fractional seconds: 1..3 digits are scaled to milliseconds.
        digits(1, 128);
        a.load("rax", slot(128));
        a.mov("r10", 100);
        a.imul("rax", "r10");
        a.store(slot(128), "rax");
        maybeEnd(finish);
        peek();
        a.cmp("r11", 48);
        const fractionDone = a.unique("fractionDone");
        a.jcc("b", fractionDone);
        a.cmp("r11", 57);
        a.jcc("a", fractionDone);
        digits(1, 136);
        a.load("rax", slot(136));
        a.mov("r10", 10);
        a.imul("rax", "r10");
        a.load("r11", slot(128));
        a.add("rax", "r11");
        a.store(slot(128), "rax");
        maybeEnd(finish);
        peek();
        a.cmp("r11", 48);
        a.jcc("b", fractionDone);
        a.cmp("r11", 57);
        a.jcc("a", fractionDone);
        digits(1, 136);
        a.load("rax", slot(136));
        a.load("r11", slot(128));
        a.add("rax", "r11");
        a.store(slot(128), "rax");
        // Digits beyond milliseconds are truncated.
        const extraDigit = a.unique("extraDigit");
        a.label(extraDigit);
        maybeEnd(finish);
        peek();
        a.cmp("r11", 48);
        a.jcc("b", fractionDone);
        a.cmp("r11", 57);
        a.jcc("a", fractionDone);
        a.load("r10", slot(56));
        a.add("r10", 1);
        a.store(slot(56), "r10");
        a.jmp(extraDigit);
        a.label(fractionDone);
        a.label(afterSeconds);
        // A UTC marker or a signed HH:mm offset may follow the time.
        maybeEnd(finish);
        peek();
        const zoneDone = a.unique("zoneDone"),
            signedZone = a.unique("signedZone");
        a.cmp("r11", 90);
        a.jcc("ne", signedZone);
        consume(90);
        a.jmp(zoneDone);
        a.label(signedZone);
        a.cmp("r11", 43);
        const negativeZone = a.unique("negativeZone");
        a.jcc("ne", negativeZone);
        a.mov("rax", 1);
        a.store(slot(152), "rax");
        a.jmp("rt.parseIsoDate.zoneDigits");
        a.label(negativeZone);
        a.cmp("r11", 45);
        a.jcc("ne", invalid);
        a.mov("rax", -1);
        a.store(slot(152), "rax");
        a.label("rt.parseIsoDate.zoneDigits");
        a.load("r10", slot(56));
        a.add("r10", 1);
        a.store(slot(56), "r10");
        digits(2, 160);
        // The colon between the offset hours and minutes is optional.
        const zoneMinutes = a.unique("zoneMinutes");
        peek();
        a.cmp("r11", 58);
        a.jcc("ne", zoneMinutes);
        consume(58);
        a.label(zoneMinutes);
        digits(2, 168);
        a.load("rax", slot(160));
        a.cmp("rax", 23);
        a.jcc("a", invalid);
        a.load("rax", slot(168));
        a.cmp("rax", 59);
        a.jcc("a", invalid);
        a.label(zoneDone);
        a.label(finish);
        a.load("r10", slot(56));
        a.load("r11", slot(64));
        a.cmp("r10", "r11");
        a.jcc("ne", invalid);
        a.load("rax", slot(104));
        a.cmp("rax", 24);
        const hourReady = a.unique("hourReady");
        a.jcc("ne", hourReady);
        for (const offset of [112, 120, 128]) {
            a.load("rax", slot(offset));
            a.test("rax", "rax");
            a.jcc("ne", invalid);
        }
        a.label(hourReady);
        // Convert seven integer components to Number Values for MakeDate.
        for (let i = 0; i < 7; i++) {
            a.load("rax", slot(80 + 8 * i));
            a.cvtsi2sd("xmm0", "rax");
            a.mov("rax", 3);
            a.store(slot(192 + 16 * i), "rax");
            a.storesd(slot(200 + 16 * i), "xmm0");
        }
        a.load("rcx", slot(40));
        a.lea("rdx", slot(192));
        a.mov("r8", 2);
        a.call("rt.dateMakeTime");
        a.load("rax", slot(152));
        a.test("rax", "rax");
        const noOffset = a.unique("noOffset");
        a.jcc("e", noOffset);
        a.load("r10", slot(160));
        a.mov("r11", 60);
        a.imul("r10", "r11");
        a.load("r11", slot(168));
        a.add("r10", "r11");
        a.mov("r11", 60000);
        a.imul("r10", "r11");
        a.imul("r10", "rax");
        a.load("rcx", slot(40));
        a.movsd("xmm0", { base: "rcx", disp: 8 });
        a.cvtsi2sd("xmm1", "r10");
        a.subsd("xmm0", "xmm1");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.label(noOffset);
        a.load("rcx", slot(40));
        a.movsd("xmm0", { base: "rcx", disp: 8 });
        a.ucomisd("xmm0", "xmm0");
        a.jcc("p", invalid);
        a.mov("rax", 8640000000000000n);
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("a", invalid);
        a.mov("rax", -8640000000000000n);
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("b", invalid);
        a.cvttsd2si("rax", "xmm0");
        a.cvtsi2sd("xmm0", "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.jmp("rt.parseIsoDate.done");
        // Strings outside the ISO format go to the legacy parser.
        a.label(invalid);
        a.load("rcx", slot(40));
        a.load("rdx", slot(48));
        a.call("rt.parseDateString");
        a.label("rt.parseIsoDate.done");
    });
    // Legacy implementation-defined forms, read token by token as V8 does:
    // month and weekday names (any case, 3-letter prefix), bare day and year
    // numbers in any order, slash dates, H:MM[:SS[.fff]] with AM/PM,
    // GMT/UTC/UT/Z and signed offsets, and parenthesized comments.
    b.fn("rt.parseDateString", 376, (a) => {
        // 40 output, 48 string, 56 length, 64 position, 72 zone name read,
        // 80..128 year month day hour minute second ms (month -1, day 0 and
        // hour -1 when missing), 136 offset sign, 144/152 offset hh/mm,
        // 160 year read, 168/176 number and its digit count, 184 scratch,
        // 312 word length, 320 AM/PM, 328/336 second number and digit count.
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.load("rax", { base: "rdx" });
        a.store(slot(56), "rax");
        for (const offset of [
            64, 72, 80, 96, 112, 120, 128, 136, 144, 152, 160, 320,
        ]) {
            a.mov("rax", 0);
            a.store(slot(offset), "rax");
        }
        a.mov("rax", -1);
        a.store(slot(88), "rax");
        a.store(slot(104), "rax");
        const invalid = a.unique("invalid"),
            loop = a.unique("loop"),
            end = a.unique("end");
        // r11 = code unit at the position; jumps to atEnd past the end.
        const peek = (atEnd: string) => {
            a.load("r10", slot(64));
            a.load("r11", slot(56));
            a.cmp("r10", "r11");
            a.jcc("ae", atEnd);
            a.shl("r10", 1);
            a.load("r11", slot(48));
            a.add("r11", "r10");
            a.load("r11", { base: "r11", disp: 8 }, 16);
        };
        const advance = () => {
            a.load("r10", slot(64));
            a.add("r10", 1);
            a.store(slot(64), "r10");
        };
        const store = (offset: number, value: number) => {
            a.mov("rax", value);
            a.store(slot(offset), "rax");
        };
        // Reads a run of up to nine digits into the value and count slots.
        const number = (value: number, count: number) => {
            const digit = a.unique("digit"),
                done = a.unique("numberDone");
            store(value, 0);
            store(count, 0);
            a.label(digit);
            peek(done);
            a.cmp("r11", 48);
            a.jcc("b", done);
            a.cmp("r11", 57);
            a.jcc("a", done);
            a.load("rax", slot(count));
            a.add("rax", 1);
            a.cmp("rax", 9);
            a.jcc("a", invalid);
            a.store(slot(count), "rax");
            a.load("rax", slot(value));
            a.mov("r10", 10);
            a.imul("rax", "r10");
            a.sub("r11", 48);
            a.add("rax", "r11");
            a.store(slot(value), "rax");
            advance();
            a.jmp(digit);
            a.label(done);
        };
        const requireDigits = (count: number) => {
            a.load("rax", slot(count));
            a.test("rax", "rax");
            a.jcc("e", invalid);
        };
        const range = (offset: number, low: number, high: number) => {
            a.load("rax", slot(offset));
            a.cmp("rax", low);
            a.jcc("l", invalid);
            a.cmp("rax", high);
            a.jcc("g", invalid);
        };
        // Stores the year; 1-2 digit years mean 2000-2049 and 1950-1999.
        const year = (value: number, count: number) => {
            const ready = a.unique("yearReady");
            a.load("rax", slot(160));
            a.test("rax", "rax");
            a.jcc("ne", invalid);
            store(160, 1);
            a.load("rax", slot(value));
            a.load("r10", slot(count));
            a.cmp("r10", 2);
            a.jcc("a", ready);
            a.add("rax", 1900);
            a.cmp("rax", 1950);
            a.jcc("ge", ready);
            a.add("rax", 100);
            a.label(ready);
            a.store(slot(80), "rax");
        };
        const notZone = () => store(72, 0);
        a.label(loop);
        peek(end);
        const digitToken = a.unique("digitToken"),
            signToken = a.unique("signToken"),
            wordToken = a.unique("wordToken"),
            comment = a.unique("comment"),
            skip = a.unique("skip");
        for (const code of [32, 9, 44]) {
            a.cmp("r11", code);
            a.jcc("e", skip);
        }
        a.cmp("r11", 40);
        a.jcc("e", comment);
        a.cmp("r11", 43);
        a.jcc("e", signToken);
        a.cmp("r11", 45);
        a.jcc("e", signToken);
        a.cmp("r11", 48);
        a.jcc("b", invalid);
        a.cmp("r11", 57);
        a.jcc("be", digitToken);
        a.or("r11", 32);
        a.cmp("r11", 97);
        a.jcc("b", invalid);
        a.cmp("r11", 122);
        a.jcc("be", wordToken);
        a.jmp(invalid);
        a.label(skip);
        advance();
        a.jmp(loop);

        // A comment runs to the matching ')'.
        a.label(comment);
        notZone();
        store(184, 0);
        const commentLoop = a.unique("commentLoop"),
            commentClose = a.unique("commentClose");
        a.label(commentLoop);
        peek(end);
        advance();
        a.cmp("r11", 40);
        a.jcc("ne", commentClose);
        a.load("rax", slot(184));
        a.add("rax", 1);
        a.store(slot(184), "rax");
        a.jmp(commentLoop);
        a.label(commentClose);
        a.cmp("r11", 41);
        a.jcc("ne", commentLoop);
        a.load("rax", slot(184));
        a.sub("rax", 1);
        a.store(slot(184), "rax");
        a.test("rax", "rax");
        a.jcc("e", loop);
        a.jmp(commentLoop);

        // Numbers: a time, a slash date, a day or a year.
        a.label(digitToken);
        notZone();
        number(168, 176);
        const time = a.unique("time"),
            slash = a.unique("slash"),
            bare = a.unique("bare"),
            isYear = a.unique("isYear");
        peek(bare);
        a.cmp("r11", 58);
        a.jcc("e", time);
        a.cmp("r11", 47);
        a.jcc("e", slash);
        a.label(bare);
        a.load("rax", slot(96));
        a.test("rax", "rax");
        a.jcc("ne", isYear);
        a.load("rax", slot(168));
        a.cmp("rax", 31);
        a.jcc("a", isYear);
        a.test("rax", "rax");
        a.jcc("e", invalid);
        a.store(slot(96), "rax");
        a.jmp(loop);
        a.label(isYear);
        year(168, 176);
        a.jmp(loop);

        a.label(time);
        a.load("rax", slot(104));
        a.cmp("rax", -1);
        a.jcc("ne", invalid);
        a.load("rax", slot(168));
        a.store(slot(104), "rax");
        advance();
        number(328, 336);
        requireDigits(336);
        a.load("rax", slot(328));
        a.store(slot(112), "rax");
        const timeDone = a.unique("timeDone");
        peek(timeDone);
        a.cmp("r11", 58);
        a.jcc("ne", timeDone);
        advance();
        number(328, 336);
        requireDigits(336);
        a.load("rax", slot(328));
        a.store(slot(120), "rax");
        peek(timeDone);
        a.cmp("r11", 46);
        a.jcc("ne", timeDone);
        advance();
        // Fractional seconds: the first three digits are milliseconds.
        store(336, 0);
        const fraction = a.unique("fraction"),
            fractionDone = a.unique("fractionDone");
        a.label(fraction);
        peek(fractionDone);
        a.cmp("r11", 48);
        a.jcc("b", fractionDone);
        a.cmp("r11", 57);
        a.jcc("a", fractionDone);
        advance();
        a.sub("r11", 48);
        a.load("rax", slot(336));
        a.add("rax", 1);
        a.store(slot(336), "rax");
        for (const [place, scale] of [
            [1, 100],
            [2, 10],
            [3, 1],
        ] as const) {
            const other = a.unique("place");
            a.cmp("rax", place);
            a.jcc("ne", other);
            a.mov("r10", scale);
            a.imul("r11", "r10");
            a.load("r10", slot(128));
            a.add("r10", "r11");
            a.store(slot(128), "r10");
            a.label(other);
        }
        a.jmp(fraction);
        a.label(fractionDone);
        requireDigits(336);
        a.label(timeDone);
        range(112, 0, 59);
        range(120, 0, 59);
        a.jmp(loop);

        // YYYY/MM/DD when the first number has three or more digits,
        // MM/DD/YYYY otherwise.
        a.label(slash);
        for (const offset of [96, 160]) {
            a.load("rax", slot(offset));
            a.test("rax", "rax");
            a.jcc("ne", invalid);
        }
        a.load("rax", slot(88));
        a.cmp("rax", -1);
        a.jcc("ne", invalid);
        advance();
        number(328, 336);
        requireDigits(336);
        a.load("rax", slot(328));
        a.store(slot(184), "rax");
        peek(invalid);
        a.cmp("r11", 47);
        a.jcc("ne", invalid);
        advance();
        number(328, 336);
        requireDigits(336);
        const monthFirst = a.unique("monthFirst"),
            slashDone = a.unique("slashDone");
        a.load("rax", slot(176));
        a.cmp("rax", 3);
        a.jcc("b", monthFirst);
        a.load("rax", slot(168));
        a.store(slot(80), "rax");
        store(160, 1);
        a.load("rax", slot(184));
        a.store(slot(88), "rax");
        a.load("rax", slot(328));
        a.store(slot(96), "rax");
        a.jmp(slashDone);
        a.label(monthFirst);
        a.load("rax", slot(168));
        a.store(slot(88), "rax");
        a.load("rax", slot(184));
        a.store(slot(96), "rax");
        year(328, 336);
        a.label(slashDone);
        range(88, 1, 12);
        a.load("rax", slot(88));
        a.sub("rax", 1);
        a.store(slot(88), "rax");
        range(96, 1, 31);
        a.jmp(loop);

        // '+' or '-' starts a zone offset after a zone name or a time;
        // otherwise '-' starts a negative year.
        a.label(signToken);
        const offset = a.unique("offset"),
            negativeYear = a.unique("negativeYear"),
            signReady = a.unique("signReady");
        a.mov("rax", 1);
        a.cmp("r11", 43);
        a.jcc("e", signReady);
        a.mov("rax", -1);
        a.label(signReady);
        a.store(slot(184), "rax");
        advance();
        a.load("rax", slot(72));
        a.test("rax", "rax");
        a.jcc("ne", offset);
        a.load("rax", slot(104));
        a.cmp("rax", -1);
        a.jcc("e", negativeYear);
        a.load("rax", slot(136));
        a.test("rax", "rax");
        a.jcc("e", offset);
        a.label(negativeYear);
        a.load("rax", slot(184));
        a.cmp("rax", -1);
        a.jcc("ne", invalid);
        number(168, 176);
        requireDigits(176);
        a.load("rax", slot(160));
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        store(160, 1);
        a.load("rax", slot(168));
        a.neg("rax");
        a.store(slot(80), "rax");
        a.jmp(loop);
        a.label(offset);
        notZone();
        a.load("rax", slot(136));
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        a.load("rax", slot(184));
        a.store(slot(136), "rax");
        number(168, 176);
        requireDigits(176);
        const packedOffset = a.unique("packedOffset"),
            offsetDone = a.unique("offsetDone");
        a.load("rax", slot(176));
        a.cmp("rax", 2);
        a.jcc("a", packedOffset);
        // h, hh or hh:mm
        a.load("rax", slot(168));
        a.store(slot(144), "rax");
        peek(offsetDone);
        a.cmp("r11", 58);
        a.jcc("ne", offsetDone);
        advance();
        number(328, 336);
        a.load("rax", slot(336));
        a.cmp("rax", 2);
        a.jcc("ne", invalid);
        a.load("rax", slot(328));
        a.store(slot(152), "rax");
        a.jmp(offsetDone);
        // hmm or hhmm
        a.label(packedOffset);
        a.cmp("rax", 4);
        a.jcc("a", invalid);
        a.load("rax", slot(168));
        a.mov("rdx", 0);
        a.mov("r10", 100);
        a.div("r10");
        a.store(slot(144), "rax");
        a.store(slot(152), "rdx");
        a.label(offsetDone);
        range(144, 0, 23);
        range(152, 0, 59);
        a.jmp(loop);

        // Words: month and weekday names, zone names and AM/PM. The first
        // three letters are folded to lower case and packed like the name
        // tables.
        a.label(wordToken);
        notZone();
        store(184, 0);
        store(312, 0);
        const letter = a.unique("letter"),
            counted = a.unique("counted"),
            wordDone = a.unique("wordDone");
        a.label(letter);
        peek(wordDone);
        a.or("r11", 32);
        a.cmp("r11", 97);
        a.jcc("b", wordDone);
        a.cmp("r11", 122);
        a.jcc("a", wordDone);
        advance();
        a.load("rcx", slot(312));
        a.cmp("rcx", 3);
        a.jcc("ae", counted);
        a.shl("rcx", 4);
        a.shl("r11", "cl");
        a.load("rax", slot(184));
        a.or("rax", "r11");
        a.store(slot(184), "rax");
        a.load("rcx", slot(312));
        a.label(counted);
        a.add("rcx", 1);
        a.store(slot(312), "rcx");
        a.jmp(letter);
        a.label(wordDone);
        const pack = (word: string) =>
            word.charCodeAt(0) +
            (word.length > 1 ? word.charCodeAt(1) * 0x10000 : 0) +
            (word.length > 2 ? word.charCodeAt(2) * 0x100000000 : 0);
        const shortWord = a.unique("shortWord"),
            zone = a.unique("zone"),
            month = a.unique("month");
        a.load("rax", slot(312));
        a.cmp("rax", 3);
        a.jcc("b", shortWord);
        // Any word that starts with a month or weekday name; the table
        // names are capitalized, so fold them to lower case too.
        a.mov("r9", pack("   "));
        for (const [table, count, matched] of [
            ["rt.date.months", 12, month],
            ["rt.date.weekdays", 7, loop],
        ] as const) {
            const next = a.unique("nameLoop"),
                none = a.unique("noName");
            a.lea("r10", { rip: table });
            a.mov("r8", 0);
            a.label(next);
            a.cmp("r8", count);
            a.jcc("ae", none);
            a.load("r11", { base: "r10" });
            a.or("r11", "r9");
            a.load("rax", slot(184));
            a.cmp("rax", "r11");
            a.jcc("e", matched);
            a.add("r10", 8);
            a.add("r8", 1);
            a.jmp(next);
            a.label(none);
        }
        a.load("rax", slot(312));
        a.cmp("rax", 3);
        a.jcc("ne", invalid);
        a.load("rax", slot(184));
        for (const name of ["gmt", "utc"]) {
            a.mov("r10", pack(name));
            a.cmp("rax", "r10");
            a.jcc("e", zone);
        }
        a.jmp(invalid);
        a.label(month);
        a.load("rax", slot(88));
        a.cmp("rax", -1);
        a.jcc("ne", invalid);
        a.store(slot(88), "r8");
        a.jmp(loop);
        a.label(shortWord);
        a.load("rax", slot(184));
        for (const [name, meridiem] of [
            ["ut", 0],
            ["z", 0],
            ["am", 1],
            ["pm", 2],
        ] as const) {
            const other = a.unique("word");
            a.mov("r10", pack(name));
            a.cmp("rax", "r10");
            a.jcc("ne", other);
            if (meridiem === 0) a.jmp(zone);
            else {
                a.load("rax", slot(320));
                a.test("rax", "rax");
                a.jcc("ne", invalid);
                store(320, meridiem);
                a.jmp(loop);
            }
            a.label(other);
        }
        a.jmp(invalid);
        a.label(zone);
        store(72, 1);
        a.jmp(loop);

        // The year, month and day are required; the time defaults to 0.
        a.label(end);
        a.load("rax", slot(160));
        a.test("rax", "rax");
        a.jcc("e", invalid);
        a.load("rax", slot(88));
        a.cmp("rax", -1);
        a.jcc("e", invalid);
        a.load("rax", slot(96));
        a.test("rax", "rax");
        a.jcc("e", invalid);
        const hasTime = a.unique("hasTime"),
            clock24 = a.unique("clock24"),
            notTwelve = a.unique("notTwelve"),
            morning = a.unique("morning"),
            hourReady = a.unique("hourReady");
        a.load("rax", slot(104));
        a.cmp("rax", -1);
        a.jcc("ne", hasTime);
        a.load("rax", slot(320));
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        store(104, 0);
        a.jmp(hourReady);
        a.label(hasTime);
        a.load("r10", slot(320));
        a.test("r10", "r10");
        a.jcc("e", clock24);
        // 12-hour clock: 12 AM is 0, 12 PM is 12.
        range(104, 0, 12);
        a.cmp("rax", 12);
        a.jcc("ne", notTwelve);
        a.mov("rax", 0);
        a.label(notTwelve);
        a.cmp("r10", 2);
        a.jcc("ne", morning);
        a.add("rax", 12);
        a.label(morning);
        a.store(slot(104), "rax");
        a.jmp(hourReady);
        a.label(clock24);
        range(104, 0, 24);
        a.cmp("rax", 24);
        a.jcc("ne", hourReady);
        for (const offset of [112, 120, 128]) {
            a.load("rax", slot(offset));
            a.test("rax", "rax");
            a.jcc("ne", invalid);
        }
        a.label(hourReady);
        for (let i = 0; i < 7; i++) {
            a.load("rax", slot(80 + 8 * i));
            a.cvtsi2sd("xmm0", "rax");
            a.mov("rax", 3);
            a.store(slot(192 + 16 * i), "rax");
            a.storesd(slot(200 + 16 * i), "xmm0");
        }
        a.load("rcx", slot(40));
        a.lea("rdx", slot(192));
        a.mov("r8", 2);
        a.call("rt.dateMakeTime");
        a.load("rax", slot(136));
        a.test("rax", "rax");
        const noOffset = a.unique("noOffset");
        a.jcc("e", noOffset);
        a.load("r10", slot(144));
        a.mov("r11", 60);
        a.imul("r10", "r11");
        a.load("r11", slot(152));
        a.add("r10", "r11");
        a.mov("r11", 60000);
        a.imul("r10", "r11");
        a.imul("r10", "rax");
        a.load("rcx", slot(40));
        a.movsd("xmm0", { base: "rcx", disp: 8 });
        a.cvtsi2sd("xmm1", "r10");
        a.subsd("xmm0", "xmm1");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.label(noOffset);
        a.load("rcx", slot(40));
        a.movsd("xmm0", { base: "rcx", disp: 8 });
        a.ucomisd("xmm0", "xmm0");
        a.jcc("p", invalid);
        a.mov("rax", 8640000000000000n);
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("a", invalid);
        a.mov("rax", -8640000000000000n);
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("b", invalid);
        a.cvttsd2si("rax", "xmm0");
        a.cvtsi2sd("xmm0", "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.jmp("rt.parseDateString.done");
        a.label(invalid);
        a.load("rcx", slot(40));
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.mov("rax", 0x7ff8000000000000n);
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.label("rt.parseDateString.done");
    });
    rootedFn(
        b,
        "rt.Date.parse.fn.code",
        120,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "r8", count: "rdx" },
            { kind: "locals", offset: 64, count: 1 },
        ],
        (a) => {
            a.store(slot(40), "rcx");
            a.test("rdx", "rdx");
            const missing = a.unique("missing"),
                done = a.unique("done");
            a.jcc("e", missing);
            a.lea("rcx", slot(64));
            a.mov("rdx", "r8");
            a.call("rt.toString");
            a.load("rcx", slot(40));
            a.load("rdx", slot(72));
            a.call("rt.parseIsoDate");
            a.jmp(done);
            a.label(missing);
            a.load("rcx", slot(40));
            a.mov("rax", 3);
            a.store({ base: "rcx" }, "rax");
            a.mov("rax", 0x7ff8000000000000n);
            a.store({ base: "rcx", disp: 8 }, "rax");
            a.label(done);
        },
    );
}
