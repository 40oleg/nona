#!/usr/bin/env bash
# Run only on a hosted Ubuntu runner. Both compiler trees stay in this checkout.
set -euo pipefail
base_ref=${1:?merge-base commit required}
receipt=work/gui-evidence/dependencies
mkdir -p "$receipt" work/gui-base
git archive "$base_ref" | tar -x -C work/gui-base
git rev-parse "$base_ref" > "$receipt/base.commit.txt"
git rev-parse HEAD > "$receipt/candidate.commit.txt"
source_file=$(realpath tests/fixtures/gui/console.js)
output_directory=$(realpath "$receipt")
sha256sum "$source_file" > "$receipt/source.sha256.txt"
printf '%s\n' 'build IDENTICAL_SOURCE --target linux-x64 -o OUTPUT (no extra flags)' > "$receipt/flags.txt"
(
    cd work/gui-base
    npm ci
    npm run build
    node dist/cli.js build "$source_file" --target linux-x64 -o "$output_directory/base.elf"
) > "$receipt/base-build.txt" 2>&1
node dist/cli.js build "$source_file" --target linux-x64 -o "$receipt/candidate.elf" > "$receipt/candidate-build.txt" 2>&1
for name in base candidate; do
    readelf -h "$receipt/$name.elf" > "$receipt/$name.header.txt"
    readelf -d "$receipt/$name.elf" > "$receipt/$name.dynamic.txt"
    LC_ALL=C sed -n 's/.*(NEEDED).*\[\([^]]*\)\].*/\1/p' "$receipt/$name.dynamic.txt" |
        LC_ALL=C sort -u > "$receipt/$name.needed.txt"
    set +e
    env -u DISPLAY -u WAYLAND_DISPLAY -u GDK_BACKEND -u GDK_SCALE \
        timeout 10s "$receipt/$name.elf" > "$receipt/$name.stdout.txt" 2> "$receipt/$name.stderr.txt"
    status=$?
    set -e
    printf '%s\n' "$status" > "$receipt/$name.status.txt"
    test "$status" -eq 0
done
diff -u "$receipt/base.needed.txt" "$receipt/candidate.needed.txt" > "$receipt/dependencies.diff.txt"
diff -u "$receipt/base.stdout.txt" "$receipt/candidate.stdout.txt" > "$receipt/stdout.diff.txt"
test ! -s "$receipt/candidate.needed.txt"
printf 'headless console\nheadless progress\n' > "$receipt/expected.stdout.txt"
diff -u "$receipt/expected.stdout.txt" "$receipt/candidate.stdout.txt"
