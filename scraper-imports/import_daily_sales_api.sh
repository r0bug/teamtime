#!/bin/bash
# Import today's sales data from NRS via REST API (replaces Python scraper)
# Runs at :15 past the hour during business hours (parallel validation with scraper)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEAMTIME_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/sales_import.log"

# Load TeamTime env for CRON_SECRET
source "$TEAMTIME_DIR/.env"

TODAY_DISPLAY=$(TZ='America/Los_Angeles' date +"%Y-%m-%d %H:%M")
TODAY_DATE=$(TZ='America/Los_Angeles' date +"%Y-%m-%d")

log() {
    echo "[$TODAY_DISPLAY] [api] $1" >> "$LOG_FILE"
}

if [ -z "$CRON_SECRET" ]; then
    log "ERROR: CRON_SECRET not set"
    exit 1
fi

# Import each NRS store. Store 20 = Yakima Finds (primary, writes the snapshot);
# store 1 = Yakima Networking (transactions only). Add more ids here as needed.
for STORE_ID in 20 1; do
    API_URL="http://localhost:3000/api/sales/import-nrs?date=$TODAY_DATE&storeId=$STORE_ID"
    RESPONSE=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CRON_SECRET")

    if echo "$RESPONSE" | grep -q '"success":true'; then
        SALES=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); s=d.get('snapshot',{}); print(f\"\${s.get('totalSales',0):.2f}\")" 2>/dev/null || echo "?")
        TXN=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); s=d.get('snapshot',{}); print(s.get('transactionCount',0))" 2>/dev/null || echo "?")
        log "store $STORE_ID OK - Sales: $SALES, Txns: $TXN"
    else
        log "store $STORE_ID IMPORT FAILED: $RESPONSE"
    fi
done
