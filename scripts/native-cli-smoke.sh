#!/bin/sh
# Native BSD verification: no Node.js is installed in the guest or on PATH.
set -eu
task_target=$1
case "$task_target" in freebsd-x64|openbsd-x64) ;; *) exit 2 ;; esac
task_compiler="$(pwd)/work/native-cli-$task_target/compiler"
task_directory="$(pwd)/work/native-cli-$task_target/validation"
mkdir "$task_directory"
printf 'console.log(6*7);\n' > "$task_directory/arithmetic.js"
printf "import path from 'node:path';console.log(path.posix.normalize('/a/../b'));\n" > "$task_directory/module.mjs"
printf "console.log(/(?<word>a+)/u.exec('aaa').groups.word);\n" > "$task_directory/regexp.js"
printf '42\n' > "$task_directory/arithmetic.expected"
printf '/b\n' > "$task_directory/module.expected"
printf 'aaa\n' > "$task_directory/regexp.expected"
env -i PATH='' NONA_CACHE=0 "$task_compiler" --version > "$task_directory/version.actual"
cmp "$(pwd)/work/native-cli-$task_target/compiler.version" "$task_directory/version.actual"
env -i PATH='' NONA_CACHE=0 "$task_compiler" --help > "$task_directory/help.actual"
grep 'Usage: nona build' "$task_directory/help.actual"
for task_name in arithmetic module regexp; do
  task_extension=js
  if [ "$task_name" = module ]; then task_extension=mjs; fi
  task_input="$task_directory/$task_name.$task_extension"
  task_image="$task_directory/$task_name.image"
  env -i PATH='' NONA_CACHE=0 "$task_compiler" build "$task_input" -o "$task_image" --target "$task_target"
  env -i PATH='' "$task_image" > "$task_directory/$task_name.actual"
  cmp "$task_directory/$task_name.expected" "$task_directory/$task_name.actual"
done
task_input="$task_directory/arithmetic.js"
cp "$task_input" "$task_directory/input.saved"
ln "$task_input" "$task_directory/hardlink.js"
ln -s "$task_input" "$task_directory/symlink.js"
for task_output in "$task_input" "$task_directory/hardlink.js" "$task_directory/symlink.js"; do
  if env -i PATH='' NONA_CACHE=0 "$task_compiler" build "$task_input" -o "$task_output" --target "$task_target" 2> "$task_directory/refusal.stderr"; then exit 1; else test "$?" = 1; fi
  cmp "$task_input" "$task_directory/input.saved"
done
for task_pass in cold warm; do
  env -i PATH='' NONA_CACHE=1 NONA_CACHE_DIR="$task_directory/cache" "$task_compiler" build "$task_input" -o "$task_directory/$task_pass.image" --target "$task_target"
done
cmp "$task_directory/cold.image" "$task_directory/warm.image"
echo "Native $task_target CLI, module/RegExp execution, atomic output protections and warm cache passed"
