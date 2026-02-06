#!/bin/bash
# TeamTime Backup Configuration Template
# Copy this file to backup-config.sh and fill in your values
# chmod 600 backup-config.sh (restrict permissions)

# Remote server settings
BACKUP_REMOTE_HOST="backup.example.com"
BACKUP_REMOTE_USER="backups"
BACKUP_REMOTE_PATH="/backups/teamtime"
BACKUP_SSH_KEY="$HOME/.ssh/id_ed25519"

# Local paths
BACKUP_LOCAL_DIR="/home/robug/teamtime/backups"
BACKUP_UPLOADS_DIR="/home/robug/teamtime/uploads"
BACKUP_LOG_FILE="/home/robug/teamtime/logs/backup.log"

# Retention settings
BACKUP_LOCAL_RETENTION_DAYS=7
BACKUP_REMOTE_RETENTION_DAYS=30

# Database connection (uses DATABASE_URL from .env if not set)
# BACKUP_DATABASE_URL="postgresql://user:pass@localhost:5432/teamtime"

# Alert settings (optional - uses existing SMTP/Twilio config)
BACKUP_ALERT_EMAIL=""
BACKUP_ALERT_ON_FAILURE="true"
