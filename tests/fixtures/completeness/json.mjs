import JSON5 from "json5";
const data = JSON5.parse("{ /* config */ name: 'demo', values: [1, 2, 3,], }");
const roundtrip = JSON5.parse(JSON5.stringify(data));
console.log(
    "json",
    roundtrip.name,
    roundtrip.values.reduce((a, b) => a + b, 0),
);
try {
    JSON5.parse("{ broken: }");
} catch (error) {
    console.log("invalid", error.name);
}
