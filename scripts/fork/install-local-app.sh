#!/bin/bash
# One-shot installer: swap a freshly built Helmor.app into /Applications.
#
# Usage (from any worktree, after `bun run tauri build`):
#   scripts/fork/install-local-app.sh --detach
# Then tell Daniel to quit Helmor (Cmd+Q). The script waits for that, swaps the
# app, reopens it ONCE, and exits. See docs/fork-local-updates.md.
#
# Hard rules this script encodes (each one was learned the hard way):
#   - NEVER launch it via `launchctl submit`: launchd treats that as a KeepAlive
#     job and re-runs it forever -> quit/reopen/backup loop (Opus 5.5 install,
#     ~20-30 backup copies of a 1.2 GB app).
#   - `--detach` double-forks + setsid so the script is an orphan owned by
#     launchd (survives Helmor quitting) but is NOT a launchd job.
#   - It never quits Helmor itself: the agent driving it lives inside Helmor.
#   - Process detection must NOT use `grep -q` under `set -o pipefail`: grep -q
#     exits on first match, `ps` gets SIGPIPE, the pipeline "fails", and the
#     script wrongly concludes Helmor already quit (GPT-6 install swapped the
#     app 2s in, while Helmor was still open). `pgrep -f` also cannot see the
#     app from inside agent sandboxes.
#   - Exactly one backup with a fixed name; lock dir + done marker make any
#     second run a no-op.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${HELMOR_INSTALL_SRC:-$REPO_ROOT/src-tauri/target/release/bundle/macos/Helmor.app}"
DEST="/Applications/Helmor.app"
BACKUP="$HOME/helmor/Helmor-backup-previous.app"
STATE="$REPO_ROOT/.agent-contexts/install-local-app"
LOG="$STATE/install.log"
LOCK="$STATE/install.lock"
DONE="$STATE/install.done"
PROC="$DEST/Contents/MacOS/helmor"
WAIT_SECONDS=3600

if [ "${1:-}" = "--detach" ]; then
	mkdir -p "$STATE"
	rm -f "$DONE"
	python3 - "$0" <<'EOF'
import os, sys
if os.fork() == 0:
    os.setsid()
    if os.fork() == 0:
        fd = os.open("/dev/null", os.O_RDWR)
        for i in (0, 1, 2):
            os.dup2(fd, i)
        os.execv("/bin/bash", ["/bin/bash", sys.argv[1]])
    os._exit(0)
EOF
	echo "installer detached; log: $LOG"
	exit 0
fi

# Exact match on the full binary path; no -q (see header).
running() {
	local procs
	procs="$(ps -Ao comm= 2>/dev/null || true)"
	printf '%s\n' "$procs" | grep -xF "$PROC" >/dev/null
}

mkdir -p "$STATE"
exec >>"$LOG" 2>&1
echo "=== install started $(date) pid=$$ ==="

[ -e "$DONE" ] && { echo "already done; exiting"; exit 0; }
mkdir "$LOCK" 2>/dev/null || { echo "another installer holds the lock; exiting"; exit 0; }
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

[ -d "$SRC" ] || { echo "FATAL: new build missing at $SRC"; exit 1; }
running || { echo "FATAL: Helmor is not running at start; refusing (detection may be broken)"; exit 1; }
echo "Helmor running; waiting for Daniel to quit it"

for _ in $(seq 1 "$WAIT_SECONDS"); do
	running || break
	sleep 1
done
if running; then
	echo "Helmor still running after ${WAIT_SECONDS}s; giving up, nothing changed"
	exit 0
fi
sleep 2
echo "Helmor quit detected $(date)"

rm -rf "$BACKUP"
mv "$DEST" "$BACKUP" || { echo "FATAL: backup move failed"; exit 1; }
if ! ditto "$SRC" "$DEST"; then
	echo "ditto failed; restoring backup"
	rm -rf "$DEST"
	mv "$BACKUP" "$DEST"
	touch "$DONE"
	open "$DEST"
	exit 1
fi

touch "$DONE"
echo "installed; opening once $(date)"
open "$DEST"
echo "=== install finished $(date) ==="
exit 0
