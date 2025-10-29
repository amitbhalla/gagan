#!/bin/bash

################################################################################
# Database Backup Script for Email Marketing Platform
#
# This script creates compressed backups of the SQLite database with:
# - Timestamped filenames
# - Gzip compression
# - Automatic cleanup of old backups (30 days)
# - Optional cloud upload (S3, Dropbox, etc.)
# - Error handling and logging
#
# Usage: ./backup-db.sh [backup_dir] [retention_days]
# Example: ./backup-db.sh /backups 30
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values (can be overridden by arguments or environment variables)
BACKUP_DIR="${1:-${BACKUP_DIR:-$PROJECT_ROOT/backups}}"
RETENTION_DAYS="${2:-${RETENTION_DAYS:-30}}"
DB_PATH="${DB_PATH:-$PROJECT_ROOT/backend/data/email-marketing.db}"
LOG_FILE="${LOG_FILE:-$PROJECT_ROOT/backend/logs/backup.log}"

# Cloud backup configuration (optional)
ENABLE_CLOUD_BACKUP="${ENABLE_CLOUD_BACKUP:-false}"
CLOUD_PROVIDER="${CLOUD_PROVIDER:-s3}"  # s3, dropbox, gcs
S3_BUCKET="${S3_BUCKET:-}"
S3_PATH="${S3_PATH:-backups/}"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="db_backup_${TIMESTAMP}.db"
COMPRESSED_NAME="${BACKUP_NAME}.gz"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR" || error_exit "Failed to create backup directory: $BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")" || error_exit "Failed to create log directory"

log "Starting database backup..."
log "Database path: $DB_PATH"
log "Backup directory: $BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    error_exit "Database file not found: $DB_PATH"
fi

# Check database integrity before backup
log "Checking database integrity..."
if command -v sqlite3 &> /dev/null; then
    if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > /dev/null 2>&1; then
        error_exit "Database integrity check failed"
    fi
    log "Database integrity check passed"
else
    log "WARNING: sqlite3 not found, skipping integrity check"
fi

# Create backup using SQLite backup command
log "Creating backup: $BACKUP_NAME"
if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/$BACKUP_NAME'" || error_exit "Backup failed"
else
    # Fallback to simple copy
    log "WARNING: Using cp instead of SQLite backup command"
    cp "$DB_PATH" "$BACKUP_DIR/$BACKUP_NAME" || error_exit "Backup copy failed"
fi

# Get backup file size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
log "Backup created successfully (size: $BACKUP_SIZE)"

# Compress backup
log "Compressing backup..."
gzip "$BACKUP_DIR/$BACKUP_NAME" || error_exit "Compression failed"

COMPRESSED_SIZE=$(du -h "$BACKUP_DIR/$COMPRESSED_NAME" | cut -f1)
log "Backup compressed successfully (compressed size: $COMPRESSED_SIZE)"

# Upload to cloud storage (optional)
if [ "$ENABLE_CLOUD_BACKUP" = "true" ]; then
    log "Uploading to cloud storage ($CLOUD_PROVIDER)..."

    case "$CLOUD_PROVIDER" in
        s3)
            if [ -z "$S3_BUCKET" ]; then
                log "WARNING: S3_BUCKET not set, skipping cloud upload"
            elif command -v aws &> /dev/null; then
                aws s3 cp "$BACKUP_DIR/$COMPRESSED_NAME" "s3://$S3_BUCKET/$S3_PATH$COMPRESSED_NAME" \
                    && log "Backup uploaded to S3 successfully" \
                    || log "WARNING: S3 upload failed"
            else
                log "WARNING: AWS CLI not found, skipping S3 upload"
            fi
            ;;
        dropbox)
            log "WARNING: Dropbox upload not implemented, skipping"
            ;;
        gcs)
            if command -v gsutil &> /dev/null; then
                gsutil cp "$BACKUP_DIR/$COMPRESSED_NAME" "gs://$S3_BUCKET/$S3_PATH$COMPRESSED_NAME" \
                    && log "Backup uploaded to GCS successfully" \
                    || log "WARNING: GCS upload failed"
            else
                log "WARNING: gsutil not found, skipping GCS upload"
            fi
            ;;
        *)
            log "WARNING: Unknown cloud provider: $CLOUD_PROVIDER"
            ;;
    esac
fi

# Cleanup old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "db_backup_*.db.gz" -type f -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
log "Deleted $DELETED_COUNT old backup(s)"

# List recent backups
log "Recent backups:"
find "$BACKUP_DIR" -name "db_backup_*.db.gz" -type f -mtime -7 -exec ls -lh {} \; | tee -a "$LOG_FILE"

# Summary
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "db_backup_*.db.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Backup completed successfully!"
log "Total backups: $TOTAL_BACKUPS (total size: $TOTAL_SIZE)"

exit 0
