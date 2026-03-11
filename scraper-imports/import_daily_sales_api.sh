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

API_URL="http://localhost:3000/api/sales/import-nrs?date=$TODAY_DATE"

log() {
    echo "[$TODAY_DISPLAY] [api] $1" >> "$LOG_FILE"
}

if [ -z "$CRON_SECRET" ]; then
    log "ERROR: CRON_SECRET not set"
    exit 1
fi

RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $CRON_SECRET")

if echo "$RESPONSE" | grep -q '"success":true'; then
    RETAINED=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); s=d.get('snapshot',{}); print(f\"\${s.get('totalRetained',0):.2f}\")" 2>/dev/null || echo "?")
    SALES=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); s=d.get('snapshot',{}); print(f\"\${s.get('totalSales',0):.2f}\")" 2>/dev/null || echo "?")
    VENDORS=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); s=d.get('snapshot',{}); print(s.get('vendorCount',0))" 2>/dev/null || echo "?")
    if [ "$VENDORS" = "0" ]; then
        log "NO DATA - NRS API returned 0 vendors for today"
    else
        log "OK - Sales: $SALES, Retained: $RETAINED, Vendors: $VENDORS"
    fi
else
    log "IMPORT FAILED: $RESPONSE"
fi
