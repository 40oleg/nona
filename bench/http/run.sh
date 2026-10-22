#!/bin/bash
# Throughput, latency and RSS of the HTTP benchmark server (server.mjs) under
# Nona and Node.js, for every case of #403: hello, json, headers, close,
# upload16k and big64k, at several connection counts, several runs each,
# with the server pinned to one CPU and the load generator to another.
#
#   bench/http/run.sh                 # needs gcc, node and a built dist/
#   RUNS=5 SECS=3 WARM=2 CONNS="1 32 256" GEN=load bench/http/run.sh
#
# GEN selects the load generator: load (load.c, no dependencies; the
# default), wrk (wrk on PATH or WRK=/path/to/wrk) or autocannon (on PATH).
# Each generator drives the same requests (autocannon runs in Node.js itself
# and saturates a CPU at a few tens of thousands of requests per second, so
# it measures its own limit on small machines). Every cell starts with a
# warm-up run of WARM seconds that is not counted. The script prints the machine,
# then one Markdown table per connection count: median req/s of the runs
# with their min–max spread, median p99 latency, Nona / Node ratio, and the
# server's RSS after the last run.
set -e
cd "$(dirname "$0")"
S=${SECS:-3}
RUNS=${RUNS:-5}
WARM=${WARM:-2}
CONNS=${CONNS:-"1 32 256"}
GEN=${GEN:-load}
SERVER_CPU=${SERVER_CPU:-0}
CLIENT_CPU=${CLIENT_CPU:-1}
WRK=${WRK:-wrk}
gcc -O2 -o /tmp/nona-http-load load.c
node ../../dist/cli.js build server.mjs -o /tmp/nona-http-server --target linux-x64 --module
echo "machine: $(uname -srm), $(nproc) CPUs, $(grep -m1 'model name' /proc/cpuinfo | sed 's/.*: //'), governor $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo n/a)"
echo "node: $(node --version); nona: $(git -c safe.directory='*' -C ../.. rev-parse --short HEAD 2>/dev/null || echo ?); generator: $GEN; server on CPU $SERVER_CPU, client on CPU $CLIENT_CPU; $RUNS runs of $S s per cell"
# case name -> path mode body headers
declare -A CASE_PATH=([hello]=/ [json]=/json [headers]=/headers [close]=/ [upload16k]=/upload [big64k]=/big)
declare -A CASE_MODE=([hello]=keep [json]=keep [headers]=keep [close]=close [upload16k]=keep [big64k]=keep)
declare -A CASE_BODY=([hello]=0 [json]=0 [headers]=0 [close]=0 [upload16k]=16384 [big64k]=0)
HDRS=(-H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      -H "Accept-Language: en-US,en;q=0.5" -H "Accept-Encoding: gzip, deflate, br"
      -H "X-Request-Id: 7f3c2a1e-9b4d-4c8e-a1f2-3d5e6f708192" -H "X-Forwarded-For: 203.0.113.42, 198.51.100.17"
      -H "X-Trace: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" -H "Referer: https://example.com/products/42?ref=home"
      -H "Cache-Control: max-age=0" -H 'If-None-Match: "5d8c72a5edda8d6a:0"')
# measure PORT CASE CONNS -> "req/s p99ms"
measure() {
  local port=$1 name=$2 conns=$3 path=${CASE_PATH[$2]} mode=${CASE_MODE[$2]} body=${CASE_BODY[$2]}
  case $GEN in
    load)
      local extra=""; [ $name = headers ] && extra=headers
      /tmp/nona-http-load $port $conns $S $path $mode $body $extra | awk '{print $2, $7}' ;;
    wrk)
      local args=(-t1 -c$conns -d${S}s --latency); [ $name = headers ] && args+=("${HDRS[@]}")
      [ $mode = close ] && args+=(-H "Connection: close")
      [ $body -gt 0 ] && args+=(-s upload.lua)
      "$WRK" "${args[@]}" http://127.0.0.1:$port$path | awk '/Requests\/sec/ {r=$2} /^ *99%/ {p=$2; if (p ~ /ms$/) p=substr(p,1,length(p)-2); else if (p ~ /us$/) p=substr(p,1,length(p)-2)/1000; else if (p ~ /s$/) p=substr(p,1,length(p)-1)*1000} END {print r, p}' ;;
    autocannon)
      local args=(-c $conns -d $S -j); [ $name = headers ] && for h in "${HDRS[@]}"; do [ "$h" != -H ] && args+=(-H "$h"); done
      [ $mode = close ] && args+=(-H "Connection: close")
      [ $body -gt 0 ] && args+=(-m POST -b "$(head -c $body /dev/zero | tr '\0' x)")
      autocannon "${args[@]}" http://127.0.0.1:$port$path 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.requests.average, j.latency.p99)})' ;;
  esac
}
median() { sort -g | awk '{a[NR]=$1} END {print (NR%2 ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2)}'; }
spread() { sort -g | awk 'NR==1 {min=$1} {max=$1} END {printf "%s–%s", min, max}'; }
k() { awk -v v="$1" 'BEGIN {printf "%.1fk", v/1000}'; }
for conns in $CONNS; do
  echo
  echo "### $conns connection$([ $conns = 1 ] || echo s)"
  echo
  echo "| Case | Node.js req/s (median, min–max) | Nona req/s (median, min–max) | Nona / Node | p99 Node / Nona, ms | RSS Node / Nona, MB |"
  echo "| --- | --- | --- | --- | --- | --- |"
  for name in hello json headers close upload16k big64k; do
    declare -A R P RSS
    for target in node nona; do
      if [ $target = nona ]; then cmd=(/tmp/nona-http-server); else cmd=(node server.mjs); fi
      local_port=$((20000 + RANDOM % 12000))
      taskset -c $SERVER_CPU "${cmd[@]}" $local_port >/dev/null 2>&1 & pid=$!
      sleep 0.5
      # A warm-up run that is not counted: Node.js compiles its hot code
      # during the first seconds (load.c also warms up for 0.5 s per run).
      taskset -c $CLIENT_CPU bash -c "$(declare -f measure); $(declare -p CASE_PATH CASE_MODE CASE_BODY HDRS); GEN=$GEN S=$WARM WRK=$WRK; measure $local_port $name $conns" >/dev/null
      rates=""; p99s=""
      for ((i = 0; i < RUNS; i++)); do
        read rate p99 < <(taskset -c $CLIENT_CPU bash -c "$(declare -f measure); $(declare -p CASE_PATH CASE_MODE CASE_BODY HDRS); GEN=$GEN S=$S WRK=$WRK; measure $local_port $name $conns")
        rates="$rates$rate"$'\n'; p99s="$p99s$p99"$'\n'
      done
      RSS[$target]=$(ps -o rss= -p $pid | awk '{printf "%.0f", $1/1024}')
      kill $pid; wait $pid 2>/dev/null || true
      R[$target]="$(k "$(printf %s "$rates" | median)") ($(printf %s "$rates" | awk '{printf "%.1fk\n", $1/1000}' | spread))"
      R[$target.med]=$(printf %s "$rates" | median)
      P[$target]=$(printf %s "$p99s" | median)
    done
    ratio=$(awk -v a="${R[nona.med]}" -v b="${R[node.med]}" 'BEGIN {printf "×%.2f", a/b}')
    echo "| $name | ${R[node]} | ${R[nona]} | $ratio | ${P[node]} / ${P[nona]} | ${RSS[node]} / ${RSS[nona]} |"
  done
done
