#!/usr/bin/env bash
# Execute INSIDE the separate actual Ubuntu 20.04 container; no compiler needed.
set -euo pipefail
receipt=/repo/work/gui-evidence/ubuntu20
mkdir -p "$receipt"
cat /etc/os-release > "$receipt/os-release.txt"
uname -m > "$receipt/architecture.txt"
apt-get update -qq > "$receipt/apt-update.txt" 2>&1
apt-cache policy libgtk-4-1 libgtk-3-0 > "$receipt/packages.txt"
set +e
apt-get install -y libgtk-4-1 > "$receipt/gtk-install.txt" 2>&1
install_status=$?
env -u DISPLAY -u WAYLAND_DISPLAY /repo/work/gui-evidence/compat/no-display > "$receipt/gui.stdout.txt" 2> "$receipt/gui.stderr.txt"
gui_status=$?
set -e
printf '%s\n' "$install_status" > "$receipt/install.status.txt"
printf '%s\n' "$gui_status" > "$receipt/gui.status.txt"
test "$install_status" -eq 100
test "$gui_status" -ne 0
grep -q 'libgtk-4.so.1' "$receipt/gui.stderr.txt"
env -u DISPLAY -u WAYLAND_DISPLAY /repo/work/gui-evidence/dependencies/candidate.elf > "$receipt/console.stdout.txt"
diff -u /repo/work/gui-evidence/dependencies/expected.stdout.txt "$receipt/console.stdout.txt"
printf '%s\n' 'UNSUPPORTED: stock Ubuntu 20.04 lacks GTK 4; GUI fails at the ELF loader. Console startup passes.' > "$receipt/outcome.txt"
