#!/bin/bash
# Import today's sales data from NRS API to TeamTime
# Runs hourly during business hours to capture latest sales
# Uses the NRS REST API directly (no Python scraper needed)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEAMTIME_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/sales_import.log"

# Load TeamTime env for CRON_SECRET
source "$TEAMTIME_DIR/.env"

TODAY_ISO=$(TZ='America/Los_Angeles' date +"%Y-%m-%d")
TODAY_DISPLAY=$(TZ='America/Los_Angeles' date +"%Y-%m-%d %H:%M")

API_URL="http://localhost:3000/api/sales/import-nrs?date=$TODAY_ISO"

# Log function
log() {
    echo "[$TODAY_DISPLAY] $1" >> "$LOG_FILE"
}

# Check CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
    log "ERROR: CRON_SECRET not set"
    exit 1
fi

# Call the NRS API import endpoint
RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --max-time 60)

CURL_EXIT=$?
if [ $CURL_EXIT -ne 0 ]; then
    log "CURL ERROR: exit code $CURL_EXIT"
    exit 1
fi

# Parse response
SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true')
if [ -n "$SUCCESS" ]; then
    VENDOR_COUNT=$(echo "$RESPONSE" | grep -o '"vendorCount":[0-9]*' | head -1 | cut -d: -f2)
    TOTAL_SALES=$(echo "$RESPONSE" | grep -o '"totalSales":[0-9.]*' | head -1 | cut -d: -f2)
    TOTAL_RETAINED=$(echo "$RESPONSE" | grep -o '"totalRetained":[0-9.]*' | head -1 | cut -d: -f2)
    TX_COUNT=$(echo "$RESPONSE" | grep -o '"transactionCount":[0-9]*' | head -1 | cut -d: -f2)

    if [ "$VENDOR_COUNT" = "0" ] || [ -z "$VENDOR_COUNT" ]; then
        log "NO DATA - NRS returned 0 vendors for today (sales may not be entered yet)"
    else
        log "OK - Sales: \$$TOTAL_SALES, Retained: \$$TOTAL_RETAINED, Vendors: $VENDOR_COUNT, Transactions: $TX_COUNT"
    fi
else
    ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4)
    log "IMPORT FAILED: ${ERROR:-$RESPONSE}"
fi
