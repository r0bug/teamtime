#!/bin/bash
# Backfill sales data for the last N days
# Usage: ./backfill_sales.sh [days] [start_date]
#   days: Number of days to backfill (default: 14)
#   start_date: Start from this date MM/DD/YYYY (default: yesterday)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEAMTIME_DIR="$(dirname "$SCRIPT_DIR")"

# Load TeamTime env for CRON_SECRET
source "$TEAMTIME_DIR/.env"

DAYS=${1:-14}
API_URL="http://localhost:3000/api/sales/import"

echo "=== Sales Data Backfill ==="
echo "Backfilling $DAYS days of sales data"
echo ""

# Check credentials
if [ ! -f "$SCRIPT_DIR/nrscreds.secret" ]; then
    echo "ERROR: nrscreds.secret not found!"
    echo "Create it with: echo 'email:password' > $SCRIPT_DIR/nrscreds.secret"
    exit 1
fi

# Check CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
    echo "ERROR: CRON_SECRET not set in .env"
    exit 1
fi

cd "$SCRIPT_DIR"

# Loop through days
for i in $(seq 1 $DAYS); do
    # Calculate date (yesterday - i + 1 days ago)
    DATE=$(date -d "$i days ago" +"%m/%d/%Y")
    DATE_DISPLAY=$(date -d "$i days ago" +"%Y-%m-%d")

    echo "[$DATE_DISPLAY] Scraping..."

    # Run scraper and capture output
    OUTPUT=$(python3 nrs_daily_vendor_sales.py --date "$DATE" --format json 2>&1)

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
            VENDORS=$(echo "$OUTPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['totals']['vendor_count'])")
            echo "[$DATE_DISPLAY] OK - Retained: $RETAINED, Vendors: $VENDORS"
        else
            echo "[$DATE_DISPLAY] IMPORT FAILED: $RESPONSE"
        fi
    else
        # Check for no data vs error
        if echo "$OUTPUT" | grep -qi "no data\|no sales\|empty"; then
            echo "[$DATE_DISPLAY] No sales data"
        else
            echo "[$DATE_DISPLAY] SCRAPE ERROR: $OUTPUT"
        fi
    fi

    # Small delay to be nice to NRS
    sleep 2
done

echo ""
echo "=== Backfill Complete ==="

# Show summary
echo ""
echo "Data in database:"
source "$TEAMTIME_DIR/.env"
psql "$DATABASE_URL" -c "SELECT sale_date, total_sales, total_retained, vendor_count FROM sales_snapshots ORDER BY sale_date DESC LIMIT $DAYS;"
