#!/bin/bash
# Restore .env loading for the teamtime systemd service and restart it.
# Requires sudo.

set -e

ENV_FILE=/home/robug/teamtime/.env
OVERRIDE_DIR=/etc/systemd/system/teamtime.service.d
OVERRIDE_FILE="$OVERRIDE_DIR/env.conf"

if [ ! -r "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not readable" >&2
    exit 1
fi

echo "==> Current systemd unit:"
sudo systemctl cat teamtime | sed -n '/^\[Service\]/,/^\[/p'

echo
echo "==> Writing drop-in override: $OVERRIDE_FILE"
sudo mkdir -p "$OVERRIDE_DIR"
sudo tee "$OVERRIDE_FILE" >/dev/null <<EOF
[Service]
EnvironmentFile=$ENV_FILE
EOF

echo
echo "==> daemon-reload + restart"
sudo systemctl daemon-reload
sudo systemctl restart teamtime

echo
echo "==> Service status:"
sudo systemctl status teamtime --no-pager | head -10

echo
echo "==> Waiting 5s for app to come up..."
sleep 5

echo
echo "==> Testing NRS import endpoint:"
# Pull CRON_SECRET from .env without exposing it
CRON_SECRET=$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
TODAY=$(TZ=America/Los_Angeles date +%F)
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/sales/import-nrs?date=$TODAY" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --max-time 60)

echo "Response: $RESPONSE" | head -c 500
echo

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo
    echo "✓ Import endpoint is working again"
    exit 0
else
    echo
    echo "✗ Import endpoint still failing — check 'journalctl -u teamtime -n 50'"
    exit 1
fi
