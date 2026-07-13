#!/bin/bash
# Backfill Yakima Networking (NRS store 1) sales into sales_transactions, one day
# at a time, from a start date to today (Pacific). Idempotent — re-running
# re-imports each date (the import route deletes+reinserts store-1 rows per date).
#
#   ./backfill_yn_sales.sh [START_YYYY-MM-DD]   (default 2025-12-08, start of timecard data)
#
# Runs against the local app; needs CRON_SECRET from the app .env.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEAMTIME_DIR="$(dirname "$SCRIPT_DIR")"
source "$TEAMTIME_DIR/.env"
STORE_ID=1
START="${1:-2025-12-08}"
END=$(TZ='America/Los_Angeles' date +"%Y-%m-%d")

if [ -z "${CRON_SECRET:-}" ]; then echo "ERROR: CRON_SECRET not set"; exit 1; fi

echo "Backfilling YN (store $STORE_ID) from $START to $END..."
d="$START"
days=0; withsales=0
while [ "$d" != "$(date -I -d "$END + 1 day")" ]; do
    RESP=$(curl -s -X POST "http://localhost:3000/api/sales/import-nrs?date=$d&storeId=$STORE_ID" \
        -H "Authorization: Bearer $CRON_SECRET")
    TXN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('snapshot',{}).get('transactionCount',0))" 2>/dev/null || echo 0)
    [ "${TXN:-0}" != "0" ] && { echo "  $d: $TXN txns"; withsales=$((withsales+1)); }
    days=$((days+1))
    d=$(date -I -d "$d + 1 day")
done
echo "Done. $days days scanned, $withsales with sales."
