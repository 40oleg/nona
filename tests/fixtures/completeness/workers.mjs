import workerpool from "workerpool";
const pool = workerpool.pool({ maxWorkers: 1, workerType: "thread" });
try {
    console.log(
        "workers",
        await pool.exec(
            function add(a, b) {
                return a + b;
            },
            [2, 3],
        ),
    );
} finally {
    await pool.terminate();
}
