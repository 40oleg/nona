#!/usr/bin/env bash
# Full pinned-Test262 audit on Linux x64 (native ELF executables).
#
#   scripts/test262-audit.sh [out-dir] [dir ...]
#
# Without directories every Test262 directory under language/, annexB/ and
# built-ins/ is run (post-ES2020 features excluded), one report per directory
# so an interrupted run resumes. Environment: JOBS (default 2), TAG (write into
# <out-dir>/<TAG>, which test262-summary.mjs treats as a rerun overriding the
# full run). Summarize with:  node scripts/test262-summary.mjs <out-dir>
set -u
cd "$(dirname "$0")/.."
base=${1:-work/test262-audit}; shift || true
out=$base${TAG:+/$TAG}
mkdir -p "$out"
status=$out/status.txt
echo "node $(node --version); $(git log --oneline -1 2>/dev/null)" > "$status"
npm run build > "$out/build.txt" 2>&1 || { echo "BUILD FAILED" >> "$status"; exit 1; }
if [ $# -eq 0 ]; then
  set --
  for group in language annexB built-ins; do
    for d in work/test262/test/$group/*/; do d=${d%/}; set -- "$@" "${d#work/test262/test/}"; done
  done
fi
for d in "$@"; do
  name=${d//\//_}
  report=$out/t262-$name.json
  [ -f "$report" ] && continue
  TEST262_EXCLUDE_FEATURES=post-es2020 TEST262_RUN_ASYNC=1 TEST262_DELETE_BINARIES=1 \
  TEST262_JOBS=${JOBS:-2} TEST262_RUNTIME_TIMEOUT_MS=60000 TEST262_REPORT=$report \
  TEST262_PROGRESS_LOG=$out/t262-$name.progress node scripts/test262-smoke.mjs "$d" > "$out/t262-$name.txt" 2>&1
  echo "$(date -Is) $d $(head -1 "$out/t262-$name.txt")" >> "$status"
done
echo "$(date -Is) ALL DONE" >> "$status"
