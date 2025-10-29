#!/bin/bash

################################################################################
# Database Restore Script for Email Marketing Platform
#
# This script restores a SQLite database backup with:
# - Automatic backup of current database before restore
# - Support for compressed (.gz) and uncompressed backups
# - Database integrity verification after restore
# - Rollback capability
# - Dry-run mode for testing
#
# Usage: ./restore-db.sh <backup_file> [--dry-run] [--no-backup]
# Example: ./restore-db.sh /backups/db_backup_20241029_020000.db.gz
# Example: ./restore-db.sh /backups/db_backup_20241029_020000.db.gz --dry-run
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
DB_PATH="${DB_PATH:-$PROJECT_ROOT/backend/data/email-marketing.db}"
LOG_FILE="${LOG_FILE:-$PROJECT_ROOT/backend/logs/restore.log}"

# Parse arguments
BACKUP_FILE=""
DRY_RUN=false
SKIP_CURRENT_BACKUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-backup)
            SKIP_CURRENT_BACKUP=true
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Usage: $0 <backup_file> [--dry-run] [--no-backup]"
            exit 1
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# Validate backup file argument
if [ -z "$BACKUP_FILE" ]; then
    echo "Error: Backup file not specified"
    echo "Usage: $0 <backup_file> [--dry-run] [--no-backup]"
    echo ""
    echo "Options:"
    echo "  --dry-run      Test the restore without actually restoring"
    echo "  --no-backup    Skip backing up current database"
    echo ""
    echo "Example: $0 /backups/db_backup_20241029_020000.db.gz"
    exit 1
fi

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

log "=========================================="
log "Database Restore Process Started"
log "=========================================="
log "Backup file: $BACKUP_FILE"
log "Target database: $DB_PATH"
log "Dry run: $DRY_RUN"
log "Skip current backup: $SKIP_CURRENT_BACKUP"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    error_exit "Backup file not found: $BACKUP_FILE"
fi

# Check if SQLite3 is available
if ! command -v sqlite3 &> /dev/null; then
    error_exit "sqlite3 command not found. Please install SQLite3."
fi

# Determine if backup file is compressed
IS_COMPRESSED=false
if [[ "$BACKUP_FILE" == *.gz ]]; then
    IS_COMPRESSED=true
    log "Backup file is compressed"
fi

# Create temporary directory for restore operation
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log "Temporary directory: $TEMP_DIR"

# Decompress backup if needed
if [ "$IS_COMPRESSED" = true ]; then
    log "Decompressing backup file..."
    DECOMPRESSED_FILE="$TEMP_DIR/restore.db"
    gunzip -c "$BACKUP_FILE" > "$DECOMPRESSED_FILE" || error_exit "Decompression failed"
    RESTORE_SOURCE="$DECOMPRESSED_FILE"
    log "Decompression complete"
else
    RESTORE_SOURCE="$BACKUP_FILE"
fi

# Verify backup file integrity
log "Verifying backup file integrity..."
INTEGRITY_CHECK=$(sqlite3 "$RESTORE_SOURCE" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY_CHECK" != "ok" ]; then
    error_exit "Backup file integrity check failed: $INTEGRITY_CHECK"
fi
log "Backup file integrity check passed"

# Get backup file statistics
BACKUP_SIZE=$(du -h "$RESTORE_SOURCE" | cut -f1)
TABLE_COUNT=$(sqlite3 "$RESTORE_SOURCE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")
log "Backup file size: $BACKUP_SIZE"
log "Number of tables: $TABLE_COUNT"

# Dry run mode
if [ "$DRY_RUN" = true ]; then
    log "DRY RUN MODE: Restore would be successful"
    log "The following would happen:"
    log "  1. Current database would be backed up to: ${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    log "  2. Database would be restored from: $BACKUP_FILE"
    log "  3. Integrity check would be performed"
    log "  4. Application would need to be restarted"
    log "=========================================="
    log "Dry run completed successfully"
    exit 0
fi

# Backup current database before restore (unless skipped)
if [ "$SKIP_CURRENT_BACKUP" = false ]; then
    if [ -f "$DB_PATH" ]; then
        CURRENT_BACKUP="${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
        log "Backing up current database to: $CURRENT_BACKUP"
        cp "$DB_PATH" "$CURRENT_BACKUP" || error_exit "Failed to backup current database"
        log "Current database backed up successfully"
    else
        log "No existing database found, skipping current backup"
    fi
else
    log "Skipping current database backup (--no-backup specified)"
fi

# Stop application if running (optional)
log "WARNING: Make sure the application is stopped before restoring!"
log "Press Ctrl+C within 5 seconds to cancel..."
sleep 5

# Restore database
log "Restoring database..."
mkdir -p "$(dirname "$DB_PATH")"
cp "$RESTORE_SOURCE" "$DB_PATH" || error_exit "Failed to restore database"
log "Database file restored successfully"

# Verify restored database
log "Verifying restored database..."
RESTORED_INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1)
if [ "$RESTORED_INTEGRITY" != "ok" ]; then
    error_exit "Restored database integrity check failed: $RESTORED_INTEGRITY"
fi
log "Restored database integrity check passed"

# Get restored database statistics
RESTORED_SIZE=$(du -h "$DB_PATH" | cut -f1)
RESTORED_TABLES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")
log "Restored database size: $RESTORED_SIZE"
log "Number of tables: $RESTORED_TABLES"

# Show table row counts
log "Table row counts:"
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" | while read -r table; do
    count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null || echo "error")
    log "  $table: $count rows"
done

# Optimize database
log "Optimizing database..."
sqlite3 "$DB_PATH" "VACUUM;" || log "WARNING: VACUUM failed (not critical)"
sqlite3 "$DB_PATH" "ANALYZE;" || log "WARNING: ANALYZE failed (not critical)"
log "Database optimization complete"

log "=========================================="
log "Database Restore Completed Successfully!"
log "=========================================="
log "IMPORTANT: Please restart the application to use the restored database"
log ""
log "To rollback if needed, use:"
log "  cp $CURRENT_BACKUP $DB_PATH"

exit 0
