// JSON.parse and JSON.stringify of a large document: a generated 20 MB (at
// SCALE 1) file of records with nested objects, arrays, strings with escapes
// and numbers, written to and read back from the build directory, as a tool
// that loads a package-lock or a data export would do.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const SCALE = Number(process.env.SCALE) || 1;
const S = (n) => Math.max(1, Math.round(n * SCALE));

const records = [];
let seed = 3;
const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
for (let i = 0; i < S(100000); i++)
    records.push({
        id: i,
        uuid: `${next().toString(16)}-${next().toString(16)}-${i}`,
        name: 'record "' + i + '" with \\ and é unicode',
        price: next() / 1000,
        active: i % 3 === 0,
        tags: ["alpha", "beta", "gamma", "delta"].slice(0, 1 + (i % 4)),
        address: {
            street: `${i} Main St`,
            city: "City" + (i % 100),
            zip: 10000 + (i % 90000),
        },
        history: [
            { at: 1700000000 + i, delta: next() % 1000 },
            { at: 1700000001 + i, delta: -(next() % 1000) },
        ],
    });

mkdirSync("../build", { recursive: true });
const file = "../build/json-big.json";
let t = performance.now();
const text = JSON.stringify(records);
const tStringify = performance.now() - t;
writeFileSync(file, text);

t = performance.now();
const read = readFileSync(file, "utf8");
const tRead = performance.now() - t;

t = performance.now();
const parsed = JSON.parse(read);
const tParse = performance.now() - t;

t = performance.now();
const pretty = JSON.stringify(parsed, null, 2);
const tPretty = performance.now() - t;

let check = parsed.length + text.length + pretty.length;
for (let i = 0; i < parsed.length; i += 1000)
    check += parsed[i].history[1].delta;
console.log(
    JSON.stringify({
        stringify: tStringify,
        read: tRead,
        parse: tParse,
        pretty: tPretty,
        bytes: text.length,
        check,
    }),
);
