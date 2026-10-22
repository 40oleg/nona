#!/bin/bash
# Instructions per request of server.mjs compiled by Nona, counted under QEMU
# with scripts/profile-runtime.mjs: the server is run twice, answering N and
# N+500 requests (two keep-alive connections, or one connection per request
# for the close case), and the difference of the two instruction counts is
# divided by 500, so start-up and the client are not counted. The per-request
# profile (the same difference per runtime routine and compiled function) is
# written to bench/results/http-profile-CASE.txt.
#   bench/http/profile.sh CASE [N]     # CASE: hello json headers close upload16k big64k
set -e
cd "$(dirname "$0")"
case=${1:-hello}; base=${2:-100}; span=500
case $case in
  hello) args=(/ keep 0);; json) args=(/json keep 0);; headers) args=(/headers keep 0 headers);;
  close) args=(/ close 0);; upload16k) args=(/upload keep 16384);; big64k) args=(/big keep 0);;
  *) echo "unknown case $case" >&2; exit 2;;
esac
mkdir -p ../results
run() { # N json
  local n=$1 port=$((20000 + RANDOM % 12000))
  node client.mjs $port 2 $n "${args[@]}" >/dev/null &
  PORT=$port REQUESTS=$n node ../../scripts/profile-runtime.mjs server.mjs --top 1 --group --json $2 >/dev/null
  wait
}
run $base ../results/http-profile-$case-a.json
run $((base + span)) ../results/http-profile-$case-b.json
node -e '
const [a, b] = process.argv.slice(1).map((f) => JSON.parse(require("fs").readFileSync(f, "utf8")));
const span = '$span', per = Math.round((b.total - a.total) / span);
const rows = Object.keys(b.routines).map((k) => [k, (b.routines[k] - (a.routines[k] || 0)) / span, (b.entries[k] - (a.entries[k] || 0)) / span]).sort((x, y) => y[1] - x[1]);
let out = `'$case': ${per} instructions/request\n  instr/req  share   calls/req  routine\n`;
for (const [k, i, c] of rows.slice(0, 60)) if (i > 0) out += `${Math.round(i).toString().padStart(11)} ${(100 * i / per).toFixed(1).padStart(6)}% ${c.toFixed(1).padStart(10)}  ${k}\n`;
out += "-- families\n";
for (const [k, v] of Object.entries(b.families).map(([k, v]) => [k, (v - (a.families[k] || 0)) / span]).sort((x, y) => y[1] - x[1])) out += `${Math.round(v).toString().padStart(11)} ${(100 * v / per).toFixed(1).padStart(6)}%  ${k}\n`;
require("fs").writeFileSync("../results/http-profile-'$case'.txt", out);
console.log(out.split("\n")[0]);
' ../results/http-profile-$case-a.json ../results/http-profile-$case-b.json
