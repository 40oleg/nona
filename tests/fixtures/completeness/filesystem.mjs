import fs from "fs-extra";
await fs.ensureDir("nested/data");
await fs.outputJson("nested/data/input.json", { items: [2, 3] });
await fs.copy("nested", "copied");
const data = await fs.readJson("copied/data/input.json");
console.log(
    "filesystem",
    data.items.reduce((a, b) => a + b, 0),
);
await fs.remove("nested");
await fs.remove("copied");
