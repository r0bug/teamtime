#!/bin/bash
# Daily import of Yakima Networking (NRS store 1) sales into sales_transactions.
# Separate from the store-20 daily import (import_daily_sales.sh). YN is
# low-volume direct sales (vendorId 0). Scheduled once daily via crontab.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$(dirname "$SCRIPT_DIR")/.env"
D=$(TZ="America/Los_Angeles" date +"%Y-%m-%d")
[ -z "$CRON_SECRET" ] && { echo "[$(date)] YN import: no CRON_SECRET" >> "$SCRIPT_DIR/sales_import.log"; exit 1; }
R=$(curl -s -X POST "http://localhost:3000/api/sales/import-nrs?date=$D&storeId=1" -H "Authorization: Bearer $CRON_SECRET" --max-time 60)
echo "[$(TZ=America/Los_Angeles date +%Y-%m-%d\ %H:%M)] YN(store1) $D: $R" >> "$SCRIPT_DIR/sales_import.log"
