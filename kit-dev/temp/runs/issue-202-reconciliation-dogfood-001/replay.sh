#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
usage: replay.sh <baseline-worktree> <treatment-worktree>

Both worktrees must contain frontend-workflow-kit with dependencies installed.
The script runs the same frozen before/after corpus against the baseline and
treatment validators and writes fresh JSON to a temporary directory.
USAGE
}

[[ $# -eq 2 ]] || { usage >&2; exit 2; }
BASELINE=$(cd "$1" && pwd)
TREATMENT=$(cd "$2" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

run_validate() {
  local worktree=$1 corpus=$2 output=$3
  shift 3
  (
    cd "$worktree/frontend-workflow-kit"
    node scripts/validate.mjs \
      --docs "$HERE/$corpus/docs/frontend-workflow" \
      --src "$HERE/$corpus/src" \
      --json "$@"
  ) > "$OUT/$output"
}

mkdir -p "$HERE/corpus-before/src" "$HERE/corpus-after/src"
run_validate "$BASELINE" corpus-before baseline-before.json
run_validate "$TREATMENT" corpus-before treatment-before.json
run_validate "$TREATMENT" corpus-before treatment-before-enforce.json --enforce
run_validate "$BASELINE" corpus-after baseline-after.json
run_validate "$TREATMENT" corpus-after treatment-after.json

for name in \
  baseline-before.json treatment-before.json treatment-before-enforce.json \
  baseline-after.json treatment-after.json; do
  printf '\n===== %s =====\n' "$name"
  cat "$OUT/$name"
done
