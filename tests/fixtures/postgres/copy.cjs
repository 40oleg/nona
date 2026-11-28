const { Client } = require("pg");
const { from } = require("pg-copy-streams");
const { config, fail } = require("./config.cjs");
const client = new Client(config());
(async function () {
    try {
        await client.connect();
        await client.query(
            "CREATE TEMP TABLE nona_copy (id integer, label text, data bytea)",
        );
        const bytes = [
            [],
            [0],
            [92, 92, 0, 128, 255],
            [255, 254, 127, 1, 0, 92],
        ];
        const labels = ["пусто", "нуль", "слеш\\таб\tстрока\n", "ёжик"];
        let text = "";
        for (let i = 0; i < bytes.length; i++) {
            const escaped = labels[i]
                .replace(/\\/g, "\\\\")
                .replace(/\t/g, "\\t")
                .replace(/\n/g, "\\n");
            // COPY text unescapes one backslash layer before bytea parses \x.
            text +=
                i +
                "\t" +
                escaped +
                "\t\\\\x" +
                Buffer.from(bytes[i]).toString("hex") +
                "\n";
        }
        const payload = Buffer.from(text, "utf8");
        const stream = client.query(
            from("COPY nona_copy FROM STDIN", { highWaterMark: 1 }),
        );
        let streamError = null;
        const completed = new Promise((resolve, reject) => {
            stream.once("error", (error) => {
                streamError = error;
                reject(error);
            });
            stream.once("finish", resolve);
        });
        // Observe errors even while the producer is waiting for drain.
        completed.catch(() => {});
        let writes = 0;
        let drains = 0;
        // Two-byte chunks split UTF-8 sequences, COPY escapes and hex fields.
        for (let at = 0; at < payload.length; at += 2) {
            if (streamError) throw streamError;
            writes++;
            if (!stream.write(payload.subarray(at, at + 2))) {
                await new Promise((resolve, reject) => {
                    const onError = (error) => {
                        stream.removeListener("drain", onDrain);
                        reject(error);
                    };
                    const onDrain = () => {
                        stream.removeListener("error", onError);
                        resolve();
                    };
                    stream.once("error", onError);
                    stream.once("drain", onDrain);
                });
                drains++;
            }
        }
        stream.end();
        await completed;
        if (writes < 2 || drains < 1)
            throw new Error("COPY backpressure was not exercised");
        if (stream.rowCount !== bytes.length)
            throw new Error("COPY command row count mismatch");
        console.log("PASS copy multi-chunk drain finish");
        const stored = await client.query(
            "SELECT id, label, data FROM nona_copy ORDER BY id",
        );
        if (stored.rows.length !== bytes.length)
            throw new Error("stored row count mismatch");
        for (let i = 0; i < bytes.length; i++) {
            const row = stored.rows[i];
            if (
                row.id !== i ||
                row.label !== labels[i] ||
                !Buffer.isBuffer(row.data) ||
                row.data.length !== bytes[i].length
            )
                throw new Error("COPY row mismatch at " + i);
            for (let j = 0; j < bytes[i].length; j++)
                if (row.data[j] !== bytes[i][j])
                    throw new Error("COPY byte mismatch at " + i + ":" + j);
        }
        console.log("PASS copy bytea exact 4 rows");
        const after = await client.query("SELECT $1::text AS value", [
            "после COPY",
        ]);
        if (after.rows[0].value !== "после COPY")
            throw new Error("connection unusable after COPY");
        console.log("PASS connection after copy");
    } finally {
        await client.end();
    }
})().catch(fail);
