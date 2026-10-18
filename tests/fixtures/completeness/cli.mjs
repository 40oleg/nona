import minimist from "minimist";
import fs from "node:fs";
const options = minimist(["--count", "3", "--no-color", "input.json"], {
    alias: { count: "n" },
});
fs.writeFileSync(options._[0], JSON.stringify({ count: options.n }));
const data = JSON.parse(fs.readFileSync(options._[0], "utf8"));
console.log("cli", data.count, options.color, options._.join(","));
fs.unlinkSync(options._[0]);
