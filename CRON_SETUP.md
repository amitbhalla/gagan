# Cron Job Setup Guide
# Email Marketing Platform - Phase 6 Production Optimization

This document explains how to set up automated maintenance tasks using cron jobs for the Email Marketing Platform.

## Overview

The following cron jobs are recommended for production deployments:
1. **Daily Database Backup** (2 AM)
2. **Weekly Database Optimization** (Sunday 3 AM)
3. **Monthly SSL Certificate Renewal** (1st of month)
4. **Weekly Log Cleanup** (Sunday midnight)
5. **Hourly Health Check** (Every hour)
6. **Daily Disk Space Check** (6 AM)

---

## Installation

### 1. Edit Crontab

```bash
# Open crontab editor
crontab -e
```

### 2. Add the following cron jobs

```cron
# Email Marketing Platform - Automated Maintenance Tasks
# ========================================================

# Daily Database Backup (2 AM)
0 2 * * * /usr/bin/bash /path/to/gagan/backend/scripts/backup-db.sh >> /path/to/gagan/backend/logs/backup-cron.log 2>&1

# Weekly Database Optimization (Sunday 3 AM)
0 3 * * 0 /usr/bin/sqlite3 /path/to/gagan/backend/data/email-marketing.db "VACUUM; ANALYZE;" >> /path/to/gagan/backend/logs/db-optimize-cron.log 2>&1

# Monthly SSL Certificate Renewal Check (1st of month, midnight)
0 0 1 * * /usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx" >> /var/log/certbot-renew.log 2>&1

# Weekly Log Cleanup (Sunday midnight) - Delete logs older than 30 days
0 0 * * 0 /usr/bin/find /path/to/gagan/backend/logs -name "*.log" -type f -mtime +30 -delete 2>&1

# Hourly Health Check - Alert if services are down
0 * * * * /usr/bin/curl -f -s http://localhost:3001/api/health > /dev/null || echo "Backend health check failed at $(date)" | mail -s "Email Marketing Platform Alert" admin@example.com

# Daily Disk Space Check (6 AM) - Alert if >90% full
0 6 * * * df -h | awk '$5 > 90 {print "WARNING: Disk usage on "$1" is "$5}' | grep -q WARNING && echo "$(df -h)" | mail -s "Disk Space Alert - Email Marketing Platform" admin@example.com

# Monthly Database Size Report (1st of month, 8 AM)
0 8 1 * * du -sh /path/to/gagan/backend/data/email-marketing.db | mail -s "Database Size Report" admin@example.com
```

### 3. Save and exit

Press `ESC`, then type `:wq` to save and exit (if using vim).

---

## Detailed Cron Job Explanations

### 1. Daily Database Backup

**Schedule:** Every day at 2 AM

**Command:**
```bash
/usr/bin/bash /path/to/gagan/backend/scripts/backup-db.sh
```

**Purpose:**
- Creates a timestamped backup of the SQLite database
- Compresses the backup with gzip
- Uploads to cloud storage (if configured)
- Deletes backups older than 30 days (default retention period)

**Configuration:**
Edit `backend/scripts/backup-db.sh` to customize:
- `RETENTION_DAYS` - How long to keep backups (default: 30 days)
- `ENABLE_CLOUD_BACKUP` - Enable/disable cloud uploads
- `S3_BUCKET` - AWS S3 bucket name for cloud backups

**Verify:**
```bash
# Check backup directory
ls -lh /path/to/gagan/backups/

# Manually run backup script
/path/to/gagan/backend/scripts/backup-db.sh

# View backup logs
tail -f /path/to/gagan/backend/logs/backup.log
```

---

### 2. Weekly Database Optimization

**Schedule:** Every Sunday at 3 AM

**Command:**
```bash
/usr/bin/sqlite3 /path/to/gagan/backend/data/email-marketing.db "VACUUM; ANALYZE;"
```

**Purpose:**
- **VACUUM**: Rebuilds database file, reclaiming unused space (defragmentation)
- **ANALYZE**: Updates query optimizer statistics for better performance

**Warning:**
- VACUUM locks the database during execution
- May take several minutes for large databases
- Scheduled at 3 AM to minimize user impact

**Alternative API-based approach:**
```bash
# Using the API endpoint (requires authentication)
curl -X POST http://localhost:3001/api/database/maintenance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Verify:**
```bash
# Check database size before and after
du -sh /path/to/gagan/backend/data/email-marketing.db

# Check fragmentation
sqlite3 /path/to/gagan/backend/data/email-marketing.db "PRAGMA freelist_count; PRAGMA page_count;"
```

---

### 3. SSL Certificate Renewal

**Schedule:** Monthly on the 1st at midnight

**Command:**
```bash
/usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"
```

**Purpose:**
- Automatically renew Let's Encrypt SSL certificates before expiration
- Reload nginx to use new certificates

**Prerequisites:**
- Certbot must be installed: `sudo apt install certbot python3-certbot-nginx`
- Initial certificate must be generated: `sudo certbot --nginx -d marketing.myndsolution.com`

**Verify:**
```bash
# Check certificate expiration
sudo certbot certificates

# Test renewal (dry run)
sudo certbot renew --dry-run

# Check SSL configuration
sudo nginx -t

# View certbot logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

**Manual renewal:**
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

---

### 4. Weekly Log Cleanup

**Schedule:** Every Sunday at midnight

**Command:**
```bash
/usr/bin/find /path/to/gagan/backend/logs -name "*.log" -type f -mtime +30 -delete
```

**Purpose:**
- Deletes log files older than 30 days to free disk space
- Prevents logs from consuming excessive storage

**Customize retention period:**
- Change `-mtime +30` to desired number of days
- `-mtime +7` = 7 days, `-mtime +90` = 90 days

**Verify:**
```bash
# List old log files (without deleting)
find /path/to/gagan/backend/logs -name "*.log" -type f -mtime +30

# Check log directory size
du -sh /path/to/gagan/backend/logs/
```

**Alternative with log rotation:**
Create `/etc/logrotate.d/email-marketing`:
```conf
/path/to/gagan/backend/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

Then enable logrotate:
```bash
sudo logrotate -f /etc/logrotate.d/email-marketing
```

---

### 5. Hourly Health Check

**Schedule:** Every hour

**Command:**
```bash
/usr/bin/curl -f -s http://localhost:3001/api/health > /dev/null || \
  echo "Backend health check failed at $(date)" | mail -s "Alert" admin@example.com
```

**Purpose:**
- Monitors backend API health every hour
- Sends email alert if health check fails

**Prerequisites:**
- Install `mailutils`: `sudo apt install mailutils`
- Configure SMTP for sending emails

**Alternative with alert service:**
```bash
# Use the built-in alert service instead
# Already running with alertService.startMonitoring() in server.js
# Monitors every 5 minutes automatically

# Enable alerts in .env:
ALERTS_ENABLED=true
ADMIN_EMAIL=admin@example.com
ALERT_COOLDOWN_MINUTES=60
```

**Verify:**
```bash
# Test health check manually
curl http://localhost:3001/api/health

# Check detailed health
curl http://localhost:3001/api/health/detailed

# Test email sending
echo "Test email" | mail -s "Test Subject" admin@example.com
```

---

### 6. Daily Disk Space Check

**Schedule:** Every day at 6 AM

**Command:**
```bash
df -h | awk '$5 > 90 {print "WARNING: Disk usage on "$1" is "$5}' | grep -q WARNING && \
  echo "$(df -h)" | mail -s "Disk Space Alert" admin@example.com
```

**Purpose:**
- Checks disk usage for all partitions
- Sends email alert if any partition exceeds 90% usage

**Customize threshold:**
- Change `$5 > 90` to desired percentage (e.g., `$5 > 80` for 80%)

**Verify:**
```bash
# Check current disk usage
df -h

# Test alert condition manually
df -h | awk '$5 > 90 {print "WARNING: Disk usage on "$1" is "$5}'
```

---

## Additional Recommended Cron Jobs

### Database Performance Report (Weekly)

```cron
# Weekly database performance report (Monday 8 AM)
0 8 * * 1 curl -s http://localhost:3001/api/database/stats | mail -s "Weekly DB Report" admin@example.com
```

### Failed Email Report (Daily)

```cron
# Daily failed email report (7 AM)
0 7 * * * sqlite3 /path/to/gagan/backend/data/email-marketing.db "SELECT COUNT(*) FROM messages WHERE status='failed' AND created_at > datetime('now', '-1 day');" | mail -s "Daily Failed Emails" admin@example.com
```

### Campaign Summary Report (Daily)

```cron
# Daily campaign summary (9 AM)
0 9 * * * curl -s http://localhost:3001/api/analytics/overview | mail -s "Daily Campaign Summary" admin@example.com
```

### Docker Container Health Check (Every 30 minutes)

```cron
# Docker container health check (every 30 minutes)
*/30 * * * * docker ps --filter "status=exited" --format "{{.Names}}" | grep -q . && echo "$(docker ps -a)" | mail -s "Container Down Alert" admin@example.com
```

### SSL Certificate Expiration Warning (Weekly)

```cron
# SSL certificate expiration check (Monday 10 AM)
0 10 * * 1 /usr/bin/bash /path/to/gagan/check-ssl-expiry.sh
```

---

## Cron Job Best Practices

### 1. Use Absolute Paths

Always use absolute paths for:
- Scripts: `/usr/bin/bash /path/to/script.sh`
- Commands: `/usr/bin/curl`, `/usr/bin/sqlite3`
- Files: `/path/to/file`

**Why:** Cron has a limited PATH environment variable.

### 2. Redirect Output

Redirect both stdout and stderr to log files:
```bash
command >> /path/to/logfile.log 2>&1
```

### 3. Set Environment Variables

If needed, source environment variables:
```bash
# At the top of crontab
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
MAILTO=admin@example.com

# Or in script
source /path/to/gagan/.env
```

### 4. Test Scripts Manually First

Before adding to cron:
```bash
# Run script manually
/path/to/script.sh

# Check exit code
echo $?  # Should be 0 for success
```

### 5. Monitor Cron Execution

Check cron logs:
```bash
# View system cron logs
sudo tail -f /var/log/syslog | grep CRON

# Check cron job execution
sudo journalctl -u cron -f
```

### 6. Use Lockfiles for Long-Running Jobs

Prevent multiple instances:
```bash
#!/bin/bash
LOCKFILE=/tmp/my_script.lock

if [ -f "$LOCKFILE" ]; then
    echo "Script is already running"
    exit 1
fi

touch "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

# Your script logic here
```

---

## Production Deployment Checklist

### Before Going Live

- [ ] Update all `/path/to/gagan` placeholders with actual paths
- [ ] Update `admin@example.com` with real admin email
- [ ] Test each cron job manually
- [ ] Configure email sending (mailutils/sendmail)
- [ ] Set appropriate file permissions (`chmod 700` for scripts)
- [ ] Verify log file rotation
- [ ] Test backup and restore procedures
- [ ] Document all custom cron jobs
- [ ] Set up monitoring alerts (optional: use services like UptimeRobot, Pingdom)

### After Deployment

- [ ] Monitor cron job execution for first week
- [ ] Check log files for errors
- [ ] Verify backups are created successfully
- [ ] Test SSL renewal process
- [ ] Confirm email alerts are working
- [ ] Document any issues and resolutions

---

## Troubleshooting

### Cron job not running

**Check:**
```bash
# Verify cron service is running
sudo systemctl status cron

# Check for syntax errors
crontab -l

# View cron logs
sudo tail -f /var/log/syslog | grep CRON
```

### Script works manually but not in cron

**Common issues:**
1. PATH environment variable not set
2. Working directory is different
3. Missing environment variables
4. Permission issues

**Solution:**
```bash
# Add to script
set -x  # Enable debug mode
export PATH=/usr/local/bin:/usr/bin:/bin
cd /path/to/working/directory
```

### Email notifications not working

**Check:**
```bash
# Test mail command
echo "Test" | mail -s "Test" admin@example.com

# Check mail logs
sudo tail -f /var/log/mail.log

# Install mailutils if missing
sudo apt install mailutils postfix
```

---

## Quick Reference Card

Save this as `/path/to/gagan/CRON_QUICKREF.txt`:

```
Email Marketing Platform - Cron Jobs Quick Reference
===================================================

Daily (2 AM):     Database Backup
Weekly (Sun 3 AM): Database Optimization (VACUUM/ANALYZE)
Monthly (1st):    SSL Certificate Renewal
Weekly (Sun 12 AM): Log Cleanup (delete >30 days)
Hourly:           Health Check + Alert
Daily (6 AM):     Disk Space Check

Emergency Commands:
------------------
Stop all cron jobs:    sudo systemctl stop cron
Start cron:           sudo systemctl start cron
Edit crontab:         crontab -e
List cron jobs:       crontab -l
View cron logs:       sudo tail -f /var/log/syslog | grep CRON
Manual backup:        /path/to/gagan/backend/scripts/backup-db.sh
Manual optimize:      sqlite3 db.db "VACUUM; ANALYZE;"
Check SSL expiry:     sudo certbot certificates
Renew SSL manually:   sudo certbot renew --force-renewal

Support: Check PROJECT.md and README.md for details
```

---

## Summary

This cron job setup ensures:
- ✅ **Daily automated backups** (2 AM)
- ✅ **Weekly database optimization** (Sunday 3 AM)
- ✅ **Automatic SSL renewal** (Monthly)
- ✅ **Log file cleanup** (Weekly)
- ✅ **Health monitoring** (Hourly)
- ✅ **Disk space alerts** (Daily)

**Remember to:**
1. Replace all `/path/to/gagan` with your actual installation path
2. Update `admin@example.com` with your real email address
3. Test each cron job manually before relying on automation
4. Monitor cron execution logs for the first week after setup

For additional help, consult the main project documentation in `PROJECT.md` and `README.md`.
