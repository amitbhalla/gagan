# Deployment Checklist - Quick Reference

Use this checklist while following the main DEPLOYMENT.md guide.

## Pre-Deployment

- [ ] Ubuntu server ready (20.04+ LTS)
- [ ] Root/sudo access confirmed
- [ ] Domain DNS A record pointing to server IP
- [ ] Server has at least 1GB RAM, 10GB storage

## Server Setup

- [ ] System packages updated (`apt update && apt upgrade`)
- [ ] Application user created (optional)
- [ ] Node.js 18 LTS installed via NVM
- [ ] PM2 installed globally
- [ ] Nginx installed and running
- [ ] Certbot installed

## Application Deployment

- [ ] Application directory created at `/var/www/email-marketing`
- [ ] Code uploaded via git/scp/rsync
- [ ] Backend dependencies installed (`npm install --production`)
- [ ] Frontend dependencies installed and built (`npm install && npm run build`)

## Configuration

- [ ] Backend `.env` file created and configured
- [ ] JWT_SECRET generated (32 bytes)
- [ ] ENCRYPTION_KEY generated (32 bytes)
- [ ] SMTP settings configured
- [ ] FRONTEND_URL set to `https://marketing.myndsolution.com`
- [ ] API_URL set to `https://marketing.myndsolution.com/api`
- [ ] CORS_ORIGIN set to `https://marketing.myndsolution.com`

## Process Management

- [ ] PM2 ecosystem.config.js created
- [ ] Backend started with PM2
- [ ] PM2 process list saved
- [ ] PM2 startup script configured
- [ ] Backend accessible at `http://localhost:3001/api/health`

## Nginx Configuration

- [ ] Nginx config created at `/etc/nginx/sites-available/marketing.myndsolution.com`
- [ ] Symbolic link created in sites-enabled
- [ ] Nginx configuration tested (`nginx -t`)
- [ ] Nginx reloaded
- [ ] Site accessible via HTTP

## SSL Certificate

- [ ] SSL certificate obtained via Certbot
- [ ] HTTPS redirect enabled
- [ ] Auto-renewal tested (`certbot renew --dry-run`)
- [ ] Site accessible via HTTPS

## Security

- [ ] UFW firewall configured (ports 22, 80, 443)
- [ ] Default admin password changed
- [ ] Unattended upgrades configured
- [ ] Database backup script created and scheduled

## Testing

- [ ] Backend health endpoint responds: `curl https://marketing.myndsolution.com/api/health`
- [ ] Frontend loads in browser: `https://marketing.myndsolution.com`
- [ ] Login works with admin/admin123
- [ ] Admin password changed immediately
- [ ] All main features tested (Templates, Lists, Contacts, Campaigns)

## Monitoring Setup

- [ ] PM2 logs accessible (`pm2 logs`)
- [ ] Nginx logs accessible (`tail -f /var/log/nginx/...`)
- [ ] Database backups scheduled (cron job)
- [ ] Monitoring script/alerts configured (optional)

## Post-Deployment

- [ ] Documentation updated with server details
- [ ] Credentials securely stored
- [ ] Team notified of deployment
- [ ] Monitoring dashboard configured (optional)
- [ ] Email sending tested with real SMTP

---

## Quick Commands Reference

```bash
# Check status
pm2 status
sudo systemctl status nginx
sudo ufw status

# View logs
pm2 logs email-marketing-backend
sudo tail -f /var/log/nginx/marketing.myndsolution.com.error.log

# Restart services
pm2 restart email-marketing-backend
sudo systemctl restart nginx

# Update application
cd /var/www/email-marketing
git pull
cd backend && npm install --production
pm2 restart email-marketing-backend
cd ../frontend && npm install && npm run build
sudo systemctl reload nginx

# Backup database
cp /var/www/email-marketing/backend/data/email-marketing.db \
   ~/email-marketing-backup-$(date +%Y%m%d).db
```

---

## Troubleshooting Checklist

If something doesn't work:

- [ ] Check PM2 status and logs
- [ ] Check Nginx status and error logs
- [ ] Verify backend is running on port 3001
- [ ] Check firewall rules (`sudo ufw status`)
- [ ] Verify DNS propagation (`dig marketing.myndsolution.com`)
- [ ] Check SSL certificate status (`sudo certbot certificates`)
- [ ] Verify file permissions on database directory
- [ ] Check disk space (`df -h`)
- [ ] Check memory usage (`free -m`)
- [ ] Restart all services

---

## Emergency Rollback

If deployment fails:

1. **Stop current deployment:**
   ```bash
   pm2 stop email-marketing-backend
   ```

2. **Restore from backup:**
   ```bash
   cp ~/email-marketing-backup-YYYYMMDD.db \
      /var/www/email-marketing/backend/data/email-marketing.db
   ```

3. **Revert code (if using git):**
   ```bash
   cd /var/www/email-marketing
   git checkout <previous-commit-hash>
   ```

4. **Restart:**
   ```bash
   pm2 restart email-marketing-backend
   ```

---

**For detailed instructions, refer to DEPLOYMENT.md**
