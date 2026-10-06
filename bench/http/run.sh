#!/bin/bash
# Throughput, latency and RSS of the HTTP benchmark server (server.mjs) under
# Nona and Node.js. The server runs on CPU 0 and the load generator (load.c,
# 50 keep-alive or one-shot connections with one request in flight each) on
# CPU 1, for SECS seconds per case.
#   bench/http/run.sh            # needs gcc, node and a built dist/
set -e
cd "$(dirname "$0")"
S=${SECS:-4}
gcc -O2 -o /tmp/nona-http-load load.c
node ../../dist/src/cli.js build server.mjs -o /tmp/nona-http-server --target linux-x64 --module
one() { # label case conns path mode body command...
  local label=$1 name=$2 conns=$3 path=$4 mode=$5 body=$6; shift 6
  local port=$((20000 + RANDOM % 12000))
  taskset -c 0 "$@" $port & local pid=$!
  sleep 0.5
  local result=$(taskset -c 1 /tmp/nona-http-load $port $conns $S $path $mode $body)
  local rss=$(ps -o rss= -p $pid | awk '{printf "%.1f", $1/1024}')
  kill $pid; wait $pid 2>/dev/null || true
  printf "%-8s %-10s %s  rss %s MB\n" "$label" "$name" "$result" "$rss"
}
for target in nona node; do
  if [ $target = nona ]; then cmd=(/tmp/nona-http-server); else cmd=(node server.mjs); fi
  one $target hello 50 / keep 0 "${cmd[@]}"
  one $target json 50 /json keep 0 "${cmd[@]}"
  one $target close 50 / close 0 "${cmd[@]}"
  one $target big64k 50 /big keep 0 "${cmd[@]}"
  one $target upload16k 50 /upload keep 16384 "${cmd[@]}"
done
