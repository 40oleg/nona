export function selectedExactlyOnce(tap, testName) {
    const lines = tap.split(/\r?\n/);
    return [
        "# tests 1",
        "# pass 1",
        "# fail 0",
        "# cancelled 0",
        "# skipped 0",
        "# todo 0",
        "ok 1 - " + testName,
    ].every((line) => lines.includes(line));
}
