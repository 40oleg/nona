function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }
let checksum = 0;
outer: for (let i = 0; i < 8; i++) {
  let n = i;
  do {
    n--;
    switch (n) {
      case 2: continue outer;
      case 0: checksum ^= i << 2; break;
      default: checksum += n & 3;
    }
  } while (n > 0);
}
let бит = 0b1010 | 0o7;
бит <<= 2; бит ^= 3; бит &= 63; бит >>= 1; бит >>>= 1;
console.log("bits", бит, ~бит, -1 >>> 0, checksum);
let x = 9;
{ const x = 2; console.log("scope", x, factorial(6)); }
let calls = 0;
function fallback() { calls++; return "fallback"; }
console.log("nullish", 0 ?? fallback(), null ?? fallback(), calls);
console.log("values", x, void (x += 1), x, (x = 4, x + 1), "\u{1F600}");
debugger;
