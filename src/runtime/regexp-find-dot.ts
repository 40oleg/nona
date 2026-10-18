import { RuntimeBuilder, slot } from "./abi.js";

export function emitRegExpFindUnicodeDot(b: RuntimeBuilder): void {
    b.fn("rt.regexpFindUnicodeDot", 104, (a) => {
        a.load("rax", { base: "rcx" });
        const unsupported = a.unique("unsupported"),
            no = a.unique("no"),
            done = a.unique("done");
        a.cmp("rax", 1);
        a.jcc("ne", unsupported);
        a.load("rax", { base: "rcx", disp: 8 }, 16);
        a.cmp("rax", 46);
        a.jcc("ne", unsupported);
        a.mov("rax", "r9");
        a.and("rax", 2);
        a.test("rax", "rax");
        a.jcc("e", unsupported);
        a.store(slot(40), "rdx");
        a.store(slot(48), "r9");
        a.store(slot(56), "r8");
        a.load("r10", { base: "rdx" });
        a.store(slot(64), "r10");
        const outer = a.unique("outer"),
            read = a.unique("read"),
            single = a.unique("single"),
            found = a.unique("found"),
            advance = a.unique("advance");
        a.label(outer);
        a.load("r8", slot(56));
        a.load("r10", slot(64));
        a.cmp("r8", "r10");
        a.jcc("ae", no);
        a.test("r8", "r8");
        a.jcc("e", read);
        a.load("rdx", slot(40));
        a.lea("rdx", { base: "rdx", disp: 8 });
        a.mov("rax", "r8");
        a.shl("rax", 1);
        a.add("rdx", "rax");
        a.load("rax", { base: "rdx" }, 16);
        a.cmp("rax", 0xdc00);
        a.jcc("b", read);
        a.cmp("rax", 0xdfff);
        a.jcc("a", read);
        a.load("rax", { base: "rdx", disp: -2 }, 16);
        a.cmp("rax", 0xd800);
        a.jcc("b", read);
        a.cmp("rax", 0xdbff);
        a.jcc("a", read);
        a.sub("r8", 1);
        a.store(slot(56), "r8");
        a.label(read);
        a.load("rdx", slot(40));
        a.lea("rdx", { base: "rdx", disp: 8 });
        a.mov("rax", "r8");
        a.shl("rax", 1);
        a.add("rdx", "rax");
        a.load("rax", { base: "rdx" }, 16);
        a.load("r9", slot(48));
        a.and("r9", 1);
        a.test("r9", "r9");
        a.jcc("ne", single);
        for (const code of [10, 13, 0x2028, 0x2029]) {
            a.cmp("rax", code);
            a.jcc("e", advance);
        }
        a.label(single);
        a.mov("rdx", 1);
        a.cmp("rax", 0xd800);
        a.jcc("b", found);
        a.cmp("rax", 0xdbff);
        a.jcc("a", found);
        a.load("r10", slot(64));
        a.mov("r9", "r8");
        a.add("r9", 1);
        a.cmp("r9", "r10");
        a.jcc("ae", found);
        a.load("r10", slot(40));
        a.lea("r10", { base: "r10", disp: 8 });
        a.shl("r9", 1);
        a.add("r10", "r9");
        a.load("r10", { base: "r10" }, 16);
        a.cmp("r10", 0xdc00);
        a.jcc("b", found);
        a.cmp("r10", 0xdfff);
        a.jcc("a", found);
        a.mov("rdx", 2);
        a.label(found);
        a.mov("rax", "r8");
        a.jmp(done);
        a.label(advance);
        a.load("r9", slot(48));
        a.and("r9", 32);
        a.test("r9", "r9");
        a.jcc("ne", no);
        a.load("r8", slot(56));
        a.add("r8", 1);
        a.store(slot(56), "r8");
        a.jmp(outer);
        a.label(no);
        a.mov("rax", -1);
        a.mov("rdx", 0);
        a.jmp(done);
        a.label(unsupported);
        a.mov("rax", -2);
        a.mov("rdx", 0);
        a.label(done);
    });
}
