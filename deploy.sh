#!/bin/bash

################################################################################
# Production Deployment Script
# Email Marketing Platform
#
# This script handles:
# - Initial deployment
# - Updates/upgrades
# - Zero-downtime deployment (using Docker)
# - Pre-deployment checks
# - Post-deployment verification
# - Automatic rollback on failure
#
# Usage:
#   ./deploy.sh [initial|update|rollback]
#
# Examples:
#   ./deploy.sh initial    # First-time deployment
#   ./deploy.sh update     # Update existing deployment
#   ./deploy.sh rollback   # Rollback to previous version
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="email-marketing"
DOCKER_COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="$SCRIPT_DIR/backups"
LOG_FILE="$SCRIPT_DIR/deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠${NC} $1" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error_exit "Docker is not installed"
    fi
    log_success "Docker is installed"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error_exit "Docker Compose is not installed"
    fi
    log_success "Docker Compose is installed"

    # Check .env file
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        error_exit ".env file not found. Copy .env.example to .env and configure it."
    fi
    log_success ".env file exists"

    # Check required environment variables
    source "$SCRIPT_DIR/.env"
    required_vars=("JWT_SECRET" "ADMIN_PASSWORD" "SMTP_HOST" "SMTP_FROM_EMAIL" "APP_URL")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            error_exit "Required environment variable $var is not set in .env"
        fi
    done
    log_success "All required environment variables are set"

    # Check disk space (at least 2GB free)
    FREE_SPACE=$(df "$SCRIPT_DIR" | tail -1 | awk '{print $4}')
    if [ "$FREE_SPACE" -lt 2097152 ]; then  # 2GB in KB
        log_warning "Low disk space: $(($FREE_SPACE / 1024))MB available"
    else
        log_success "Sufficient disk space available"
    fi
}

# Backup current deployment
backup_deployment() {
    log "Creating backup of current deployment..."

    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

    mkdir -p "$BACKUP_PATH"

    # Backup database
    if [ -f "$SCRIPT_DIR/backend/data/email-marketing.db" ]; then
        log "Backing up database..."
        cp "$SCRIPT_DIR/backend/data/email-marketing.db" "$BACKUP_PATH/email-marketing.db"
        log_success "Database backed up"
    fi

    # Backup .env file
    if [ -f "$SCRIPT_DIR/.env" ]; then
        cp "$SCRIPT_DIR/.env" "$BACKUP_PATH/.env"
        log_success ".env file backed up"
    fi

    # Backup DKIM keys
    if [ -d "$SCRIPT_DIR/backend/config/dkim" ]; then
        cp -r "$SCRIPT_DIR/backend/config/dkim" "$BACKUP_PATH/dkim"
        log_success "DKIM keys backed up"
    fi

    # Compress backup
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
    rm -rf "$BACKUP_NAME"

    log_success "Backup created: ${BACKUP_NAME}.tar.gz"

    # Keep only last 5 backups
    cd "$BACKUP_DIR"
    ls -t backup_*.tar.gz | tail -n +6 | xargs -r rm --
    log_success "Old backups cleaned up"

    # Store backup path for potential rollback
    echo "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" > "$SCRIPT_DIR/.last_backup"
}

# Initial deployment
deploy_initial() {
    log "Starting initial deployment..."

    # Check prerequisites
    check_prerequisites

    # Generate DKIM keys if they don't exist
    if [ ! -d "$SCRIPT_DIR/backend/config/dkim" ]; then
        log "Generating DKIM keys..."
        docker-compose run --rm backend node src/scripts/generate-dkim.js
        log_success "DKIM keys generated"
    fi

    # Build and start containers
    log "Building Docker images..."
    docker-compose build --no-cache || error_exit "Docker build failed"
    log_success "Docker images built"

    log "Starting containers..."
    docker-compose up -d || error_exit "Failed to start containers"
    log_success "Containers started"

    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 10

    # Check health
    check_health

    log_success "Initial deployment completed successfully!"
    log ""
    log "Access the application at: $APP_URL"
    log "Default credentials: admin / $ADMIN_PASSWORD"
    log ""
    log "IMPORTANT: Add the following DNS record:"
    if [ -f "$SCRIPT_DIR/backend/config/dkim/dns-record.txt" ]; then
        cat "$SCRIPT_DIR/backend/config/dkim/dns-record.txt"
    fi
}

# Update deployment
deploy_update() {
    log "Starting deployment update..."

    # Check prerequisites
    check_prerequisites

    # Backup current deployment
    backup_deployment

    # Pull latest changes (if using git)
    if [ -d "$SCRIPT_DIR/.git" ]; then
        log "Pulling latest changes from git..."
        git pull || log_warning "Git pull failed (continuing anyway)"
    fi

    # Rebuild images
    log "Rebuilding Docker images..."
    docker-compose build || error_exit "Docker build failed"
    log_success "Docker images rebuilt"

    # Create temporary marker file for rollback
    touch "$SCRIPT_DIR/.deploying"

    # Rolling update (zero-downtime)
    log "Performing rolling update..."

    # Scale up new containers
    docker-compose up -d --scale backend=2 --no-recreate backend || error_exit "Failed to scale up"
    sleep 5

    # Stop old containers
    docker-compose up -d --scale backend=1 --remove-orphans || error_exit "Failed to scale down"

    # Update frontend
    docker-compose up -d --force-recreate frontend || error_exit "Failed to update frontend"

    # Wait for services to be ready
    log "Waiting for services to stabilize..."
    sleep 10

    # Check health
    if check_health; then
        log_success "Health check passed"
        rm -f "$SCRIPT_DIR/.deploying"
    else
        log_error "Health check failed, initiating rollback..."
        deploy_rollback
        error_exit "Deployment failed and rolled back"
    fi

    log_success "Deployment update completed successfully!"
}

# Rollback deployment
deploy_rollback() {
    log_warning "Starting rollback..."

    if [ ! -f "$SCRIPT_DIR/.last_backup" ]; then
        error_exit "No backup found for rollback"
    fi

    BACKUP_FILE=$(cat "$SCRIPT_DIR/.last_backup")

    if [ ! -f "$BACKUP_FILE" ]; then
        error_exit "Backup file not found: $BACKUP_FILE"
    fi

    log "Restoring from backup: $BACKUP_FILE"

    # Stop containers
    docker-compose down

    # Extract backup
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
    BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)

    # Restore database
    if [ -f "$TEMP_DIR/$BACKUP_NAME/email-marketing.db" ]; then
        log "Restoring database..."
        cp "$TEMP_DIR/$BACKUP_NAME/email-marketing.db" "$SCRIPT_DIR/backend/data/email-marketing.db"
        log_success "Database restored"
    fi

    # Restore .env
    if [ -f "$TEMP_DIR/$BACKUP_NAME/.env" ]; then
        cp "$TEMP_DIR/$BACKUP_NAME/.env" "$SCRIPT_DIR/.env"
        log_success ".env restored"
    fi

    # Restore DKIM keys
    if [ -d "$TEMP_DIR/$BACKUP_NAME/dkim" ]; then
        cp -r "$TEMP_DIR/$BACKUP_NAME/dkim" "$SCRIPT_DIR/backend/config/dkim"
        log_success "DKIM keys restored"
    fi

    # Clean up
    rm -rf "$TEMP_DIR"

    # Restart containers with previous version
    log "Restarting containers..."
    docker-compose up -d || error_exit "Failed to restart containers"

    sleep 10

    # Check health
    check_health

    rm -f "$SCRIPT_DIR/.deploying"

    log_success "Rollback completed successfully!"
}

# Check application health
check_health() {
    log "Checking application health..."

    MAX_RETRIES=10
    RETRY_DELAY=3

    for i in $(seq 1 $MAX_RETRIES); do
        if curl -f -s http://localhost:3001/api/health > /dev/null 2>&1; then
            log_success "Backend is healthy"
            return 0
        else
            log "Backend not ready yet (attempt $i/$MAX_RETRIES)..."
            sleep $RETRY_DELAY
        fi
    done

    log_error "Backend health check failed after $MAX_RETRIES attempts"
    return 1
}

# Show status
show_status() {
    log "Current deployment status:"
    echo ""
    docker-compose ps
    echo ""
    log "Recent logs:"
    docker-compose logs --tail=20
}

# Main script
main() {
    echo ""
    log "=========================================="
    log "  Email Marketing Platform Deployment"
    log "=========================================="
    echo ""

    case "${1:-}" in
        initial)
            deploy_initial
            ;;
        update)
            deploy_update
            ;;
        rollback)
            deploy_rollback
            ;;
        status)
            show_status
            ;;
        *)
            echo "Usage: $0 {initial|update|rollback|status}"
            echo ""
            echo "Commands:"
            echo "  initial   - Initial deployment (first time)"
            echo "  update    - Update existing deployment"
            echo "  rollback  - Rollback to previous version"
            echo "  status    - Show current deployment status"
            exit 1
            ;;
    esac

    echo ""
    log "=========================================="
    log "  Deployment Complete"
    log "=========================================="
    echo ""
}

# Run main function
main "$@"
