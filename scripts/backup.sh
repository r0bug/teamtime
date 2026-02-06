#!/bin/bash
# TeamTime Automated Backup Script
# Performs: pg_dump → tar uploads → rsync to remote → local cleanup
# Cron: 0 10 * * * /home/robug/teamtime/scripts/backup.sh
# (10:00 UTC = 2:00 AM Pacific)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load configuration
CONFIG_FILE="$SCRIPT_DIR/backup-config.sh"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Configuration file not found: $CONFIG_FILE"
    echo "Copy backup-config.example.sh to backup-config.sh and configure it."
    exit 1
fi
source "$CONFIG_FILE"

# Load DATABASE_URL from .env if not set in config
if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
    if [ -f "$PROJECT_DIR/.env" ]; then
        BACKUP_DATABASE_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    fi
fi

if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL not configured"
    exit 1
fi

# Setup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-$PROJECT_DIR/backups}"
LOG_FILE="${BACKUP_LOG_FILE:-$PROJECT_DIR/logs/backup.log}"
mkdir -p "$BACKUP_LOCAL_DIR" "$(dirname "$LOG_FILE")"

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting backup ($TIMESTAMP) ==="

EXIT_CODE=0

# Step 1: Database dump
DB_DUMP="$BACKUP_LOCAL_DIR/teamtime_db_${TIMESTAMP}.dump"
log "Dumping database..."
if pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=6 --file="$DB_DUMP" 2>>"$LOG_FILE"; then
    DB_SIZE=$(du -h "$DB_DUMP" | cut -f1)
    log "Database dump complete: $DB_DUMP ($DB_SIZE)"
else
    log "ERROR: Database dump failed"
    EXIT_CODE=1
fi

# Step 2: Tar uploads directory
UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-$PROJECT_DIR/uploads}"
if [ -d "$UPLOADS_DIR" ] && [ "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
    UPLOADS_TAR="$BACKUP_LOCAL_DIR/teamtime_uploads_${TIMESTAMP}.tar.gz"
    log "Compressing uploads directory..."
    if tar -czf "$UPLOADS_TAR" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>>"$LOG_FILE"; then
        UPLOADS_SIZE=$(du -h "$UPLOADS_TAR" | cut -f1)
        log "Uploads compressed: $UPLOADS_TAR ($UPLOADS_SIZE)"
    else
        log "WARNING: Uploads compression failed"
    fi
else
    log "Skipping uploads (directory empty or not found)"
fi

# Step 3: Rsync to remote server
if [ -n "${BACKUP_REMOTE_HOST:-}" ] && [ -n "${BACKUP_REMOTE_PATH:-}" ]; then
    REMOTE_USER="${BACKUP_REMOTE_USER:-backups}"
    SSH_KEY="${BACKUP_SSH_KEY:-$HOME/.ssh/id_ed25519}"

    log "Syncing to remote: ${REMOTE_USER}@${BACKUP_REMOTE_HOST}:${BACKUP_REMOTE_PATH}"

    RSYNC_OPTS="-avz --progress"
    if [ -f "$SSH_KEY" ]; then
        RSYNC_OPTS="$RSYNC_OPTS -e 'ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new'"
    fi

    if eval rsync $RSYNC_OPTS "$BACKUP_LOCAL_DIR/teamtime_*_${TIMESTAMP}*" \
        "${REMOTE_USER}@${BACKUP_REMOTE_HOST}:${BACKUP_REMOTE_PATH}/" 2>>"$LOG_FILE"; then
        log "Remote sync complete"
    else
        log "ERROR: Remote sync failed"
        EXIT_CODE=1
    fi

    # Remote cleanup - remove files older than retention period
    REMOTE_RETENTION="${BACKUP_REMOTE_RETENTION_DAYS:-30}"
    log "Cleaning remote backups older than ${REMOTE_RETENTION} days..."
    ssh -i "$SSH_KEY" "${REMOTE_USER}@${BACKUP_REMOTE_HOST}" \
        "find ${BACKUP_REMOTE_PATH} -name 'teamtime_*' -mtime +${REMOTE_RETENTION} -delete" 2>>"$LOG_FILE" || true
else
    log "Skipping remote sync (not configured)"
fi

# Step 4: Local cleanup - remove old backups
LOCAL_RETENTION="${BACKUP_LOCAL_RETENTION_DAYS:-7}"
log "Cleaning local backups older than ${LOCAL_RETENTION} days..."
find "$BACKUP_LOCAL_DIR" -name "teamtime_*" -mtime +"$LOCAL_RETENTION" -delete 2>>"$LOG_FILE" || true

# Step 5: Log rotation (keep last 1000 lines)
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt 2000 ]; then
    tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

if [ $EXIT_CODE -eq 0 ]; then
    log "=== Backup completed successfully ==="
else
    log "=== Backup completed with errors ==="
fi

exit $EXIT_CODE
