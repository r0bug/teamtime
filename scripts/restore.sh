#!/bin/bash
# TeamTime Restore Script
# Usage: ./restore.sh <dump_file> [--uploads <uploads_tar>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load configuration
CONFIG_FILE="$SCRIPT_DIR/backup-config.sh"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Load DATABASE_URL from .env if not set
if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
    if [ -f "$PROJECT_DIR/.env" ]; then
        BACKUP_DATABASE_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    fi
fi

if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL not configured"
    exit 1
fi

# Parse arguments
DUMP_FILE=""
UPLOADS_TAR=""

while [ $# -gt 0 ]; do
    case "$1" in
        --uploads)
            UPLOADS_TAR="$2"
            shift 2
            ;;
        *)
            DUMP_FILE="$1"
            shift
            ;;
    esac
done

if [ -z "$DUMP_FILE" ]; then
    echo "Usage: $0 <dump_file> [--uploads <uploads_tar>]"
    echo ""
    echo "Available backups:"
    ls -lh "${BACKUP_LOCAL_DIR:-$PROJECT_DIR/backups}"/teamtime_db_*.dump 2>/dev/null || echo "  No backups found"
    exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
    echo "ERROR: Dump file not found: $DUMP_FILE"
    exit 1
fi

echo "=== TeamTime Database Restore ==="
echo "Dump file: $DUMP_FILE"
echo "Database: $BACKUP_DATABASE_URL"
echo ""
echo "WARNING: This will overwrite the current database!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "Restoring database..."
pg_restore "$BACKUP_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$DUMP_FILE"
echo "Database restored successfully."

# Restore uploads if provided
if [ -n "$UPLOADS_TAR" ] && [ -f "$UPLOADS_TAR" ]; then
    UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-$PROJECT_DIR/uploads}"
    echo "Restoring uploads to $UPLOADS_DIR..."
    tar -xzf "$UPLOADS_TAR" -C "$(dirname "$UPLOADS_DIR")"
    echo "Uploads restored."
fi

echo "=== Restore complete ==="
