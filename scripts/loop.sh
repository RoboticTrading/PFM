#!/usr/bin/env bash
# Headless build loop (Ralph-style) for PFM.
# Each iteration: feed PROMPT.md to a fresh Claude Code session (context reset),
# it does ONE task + verify + commit, then we check whether to continue.
# Progress lives in git + specs/TASKS.md, NOT in conversation history.
#
# Usage:  ./scripts/loop.sh [MAX_ITER]
# Interactive alternative: open Claude Code here and say "follow PROMPT.md and run the build loop".
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MAX_ITER="${1:-25}"
TASKS="specs/TASKS.md"
command -v claude >/dev/null 2>&1 || { echo "✗ 'claude' CLI not found."; exit 1; }
[ -f "$TASKS" ] || { echo "✗ $TASKS not found."; exit 1; }

for i in $(seq 1 "$MAX_ITER"); do
  echo "──────── loop iteration $i / $MAX_ITER ────────"
  grep -q '^\s*- \[ \]' "$TASKS" || { echo "✓ No unchecked tasks — build complete."; exit 0; }
  if grep -qi 'BLOCKED' "$TASKS"; then
    echo "■ A task is BLOCKED — stopping for human review:"; grep -i 'BLOCKED' "$TASKS"; exit 2
  fi
  cat PROMPT.md | claude --dangerously-skip-permissions --print
  if [ -n "${LAST_HEAD:-}" ] && [ "$LAST_HEAD" = "$(git rev-parse HEAD)" ]; then
    echo "■ No new commit this iteration (no progress) — stopping."; exit 3
  fi
  LAST_HEAD="$(git rev-parse HEAD)"; sleep 3
done
echo "■ Reached MAX_ITER=$MAX_ITER — re-run to continue."
