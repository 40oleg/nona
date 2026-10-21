import pLimit from "p-limit";
const limit = pLimit(2);
let active = 0,
    maximum = 0;
const results = await Promise.all(
    [1, 2, 3, 4].map((value) =>
        limit(async () => {
            active++;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active--;
            return value * 2;
        }),
    ),
);
console.log(
    "concurrency",
    results.join(","),
    maximum,
    limit.activeCount,
    limit.pendingCount,
);
