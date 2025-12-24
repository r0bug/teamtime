#!/bin/bash
# Import today's sales data from NRS to TeamTime
# Runs hourly during business hours to capture latest sales

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEAMTIME_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/sales_import.log"

# Load TeamTime env for CRON_SECRET and DATABASE_URL
source "$TEAMTIME_DIR/.env"

# Today's date in MM/DD/YYYY format for the scraper (use Pacific time for business day)
TODAY=$(TZ='America/Los_Angeles' date +"%m/%d/%Y")
TODAY_DISPLAY=$(TZ='America/Los_Angeles' date +"%Y-%m-%d %H:%M")

API_URL="http://localhost:3000/api/sales/import"

# Log function
log() {
    echo "[$TODAY_DISPLAY] $1" >> "$LOG_FILE"
}

# Check credentials
if [ ! -f "$SCRIPT_DIR/nrscreds.secret" ]; then
    log "ERROR: nrscreds.secret not found"
    exit 1
fi

# Check CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
    log "ERROR: CRON_SECRET not set"
    exit 1
fi

cd "$SCRIPT_DIR"

# Run scraper for today
OUTPUT=$(python3 nrs_daily_vendor_sales.py --date "$TODAY" --format json 2>&1)
SCRAPE_EXIT=$?

# Check if scraper succeeded
if [ $SCRAPE_EXIT -ne 0 ]; then
    log "SCRAPER EXIT CODE: $SCRAPE_EXIT - $OUTPUT"
    exit 1
fi

# Check if it's valid JSON
if echo "$OUTPUT" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
    # POST to TeamTime
    RESPONSE=$(echo "$OUTPUT" | curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CRON_SECRET" \
        -d @-)

    # Check response
    if echo "$RESPONSE" | grep -q '"success":true'; then
        RETAINED=$(echo "$OUTPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(f\"\${d['totals']['total_retained']:.2f}\")")
        SALES=$(echo "$OUTPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(f\"\${d['totals']['total_sales']:.2f}\")")
        VENDORS=$(echo "$OUTPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['totals']['vendor_count'])")
        if [ "$VENDORS" = "0" ]; then
            log "NO DATA - NRS returned 0 vendors for today (sales may not be entered yet)"
        else
            log "OK - Sales: $SALES, Retained: $RETAINED, Vendors: $VENDORS"
        fi
    else
        log "IMPORT FAILED: $RESPONSE"
    fi
else
    # Check for no data vs error
    if echo "$OUTPUT" | grep -qi "no data\|no sales\|empty"; then
        log "No sales data yet for today"
    else
        log "SCRAPE ERROR: $OUTPUT"
    fi
fi
