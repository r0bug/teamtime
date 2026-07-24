#!/usr/bin/env bash
# Apply drizzle/NNNN_*.sql migrations, in order, tracked per-database in a
# _migrations table. This replaces `drizzle-kit migrate` (which doesn't exist
# in the pinned drizzle-kit 0.20) with the workflow this repo actually uses:
# schema.ts is the source of truth, `npm run db:generate` emits SQL deltas,
# and this script applies the ones a given database hasn't seen.
#
# Usage:
#   npm run db:migrate               # apply pending migrations
#   npm run db:migrate -- --baseline # record all current files as applied
#                                    # WITHOUT running them (for databases
#                                    # that already match schema.ts — e.g.
#                                    # after the 2026-07-24 re-baseline)
#
# DATABASE_URL is read from the environment, falling back to .env.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
	DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
fi
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL not set" >&2; exit 1; }

BASELINE=false
[[ "${1:-}" == "--baseline" ]] && BASELINE=true

psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c \
	"CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

applied=0
for file in drizzle/[0-9]*.sql; do
	[[ -e "$file" ]] || continue
	name=$(basename "$file")
	seen=$(psql "$DATABASE_URL" -tA -c "SELECT 1 FROM _migrations WHERE name = '$name'")
	if [[ "$seen" == "1" ]]; then
		continue
	fi
	if $BASELINE; then
		echo "baseline: recording $name as applied (not running it)"
	else
		echo "applying $name"
		psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$file"
	fi
	psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "INSERT INTO _migrations (name) VALUES ('$name');"
	applied=$((applied + 1))
done

if [[ $applied -eq 0 ]]; then
	echo "No pending migrations."
else
	$BASELINE && echo "Baselined $applied file(s)." || echo "Applied $applied migration(s)."
fi
