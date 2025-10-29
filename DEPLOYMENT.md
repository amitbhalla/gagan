# Deployment Guide - Ubuntu Server

This guide will help you deploy the Email Marketing application to an Ubuntu server with the domain `marketing.myndsolution.com`.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Install Dependencies](#install-dependencies)
4. [Deploy Application](#deploy-application)
5. [Configure Environment](#configure-environment)
6. [Build Frontend](#build-frontend)
7. [Setup Process Manager (PM2)](#setup-process-manager-pm2)
8. [Setup Nginx Reverse Proxy](#setup-nginx-reverse-proxy)
9. [Setup SSL Certificate](#setup-ssl-certificate)
10. [Domain Configuration](#domain-configuration)
11. [Final Testing](#final-testing)
12. [Maintenance & Troubleshooting](#maintenance--troubleshooting)

---

## Prerequisites

- Ubuntu Server (20.04 LTS or higher recommended)
- Root or sudo access
- Domain `marketing.myndsolution.com` pointing to your server's IP address
- At least 1GB RAM and 10GB storage

---

## 1. Server Setup

### Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### Create Application User (Optional but Recommended)

```bash
sudo adduser emailapp
sudo usermod -aG sudo emailapp
su - emailapp
```

---

## 2. Install Dependencies

### Install Node.js 18 LTS

```bash
# Install NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 18 LTS
nvm install 18
nvm use 18
nvm alias default 18

# Verify installation
node --version  # Should show v18.x.x
npm --version
```

### Install PM2 (Process Manager)

```bash
npm install -g pm2
```

### Install Nginx

```bash
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Install Certbot (for SSL)

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Install SQLite3 (Optional - for database management)

```bash
sudo apt install sqlite3 -y
```

---

## 3. Deploy Application

### Create Application Directory

```bash
sudo mkdir -p /var/www/email-marketing
sudo chown -R $USER:$USER /var/www/email-marketing
cd /var/www/email-marketing
```

### Upload Your Application

**Option A: Using Git (Recommended)**

```bash
# If your code is in a git repository
git clone <your-repository-url> .

# Or if you need to initialize
git init
```

**Option B: Using SCP from your local machine**

```bash
# Run this from your LOCAL machine (Mac), not the server
scp -r /Users/amitbhalla/Downloads/gagan/* user@your-server-ip:/var/www/email-marketing/
```

**Option C: Using rsync from your local machine**

```bash
# Run this from your LOCAL machine (Mac)
rsync -avz --exclude 'node_modules' --exclude '.git' \
  /Users/amitbhalla/Downloads/gagan/ \
  user@your-server-ip:/var/www/email-marketing/
```

---

## 4. Configure Environment

### Backend Configuration

```bash
cd /var/www/email-marketing/backend

# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

**Update the `.env` file with production values:**

```env
# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_PATH=./data/email-marketing.db

# JWT Configuration (Generate new secure keys!)
JWT_SECRET=<generate-secure-random-string-here>
JWT_EXPIRES_IN=7d

# Encryption (Generate new secure key!)
ENCRYPTION_KEY=<generate-secure-random-string-here>

# Email Configuration (Update with your SMTP details)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email Settings
FROM_EMAIL=noreply@myndsolution.com
FROM_NAME=Mynd Solution Marketing

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Frontend URL
FRONTEND_URL=https://marketing.myndsolution.com

# API URL (for emails and tracking)
API_URL=https://marketing.myndsolution.com/api

# CORS Origins
CORS_ORIGIN=https://marketing.myndsolution.com
```

**Generate Secure Keys:**

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste into your `.env` file.

### Install Backend Dependencies

```bash
cd /var/www/email-marketing/backend
npm install --production
```

### Initialize Database

```bash
# The database will be created automatically on first run
# But you can verify the data directory exists
mkdir -p data
```

---

## 5. Build Frontend

### Install Frontend Dependencies and Build

```bash
cd /var/www/email-marketing/frontend

# Install dependencies
npm install

# Build for production
npm run build
```

This will create a `dist` folder with optimized production files.

### Update Frontend API Configuration

Before building, ensure the API baseURL is correct:

```bash
nano src/utils/api.js
```

Verify it looks like this:

```javascript
const api = axios.create({
  baseURL: '/api',  // This is correct - Nginx will proxy /api to backend
  timeout: 30000,
})
```

If you made changes, rebuild:

```bash
npm run build
```

---

## 6. Setup Process Manager (PM2)

### Create PM2 Ecosystem File

```bash
cd /var/www/email-marketing
nano ecosystem.config.js
```

**Add the following configuration:**

```javascript
module.exports = {
  apps: [
    {
      name: 'email-marketing-backend',
      script: './backend/src/server.js',
      cwd: '/var/www/email-marketing/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    }
  ]
};
```

### Start Application with PM2

```bash
# Create logs directory
mkdir -p backend/logs

# Start the application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions shown (copy and run the command it gives you)

# Check status
pm2 status
pm2 logs email-marketing-backend
```

**Useful PM2 Commands:**

```bash
pm2 status                          # Check status
pm2 logs email-marketing-backend    # View logs
pm2 restart email-marketing-backend # Restart app
pm2 stop email-marketing-backend    # Stop app
pm2 delete email-marketing-backend  # Remove app
pm2 monit                           # Monitor in real-time
```

---

## 7. Setup Nginx Reverse Proxy

### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/marketing.myndsolution.com
```

**Add the following configuration:**

```nginx
server {
    listen 80;
    server_name marketing.myndsolution.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root directory for frontend
    root /var/www/email-marketing/frontend/dist;
    index index.html;

    # Client body size (for file uploads)
    client_max_body_size 10M;

    # Logging
    access_log /var/log/nginx/marketing.myndsolution.com.access.log;
    error_log /var/log/nginx/marketing.myndsolution.com.error.log;

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Frontend - React Router (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
}
```

### Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/marketing.myndsolution.com /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

---

## 8. Setup SSL Certificate

### Obtain SSL Certificate with Let's Encrypt

```bash
sudo certbot --nginx -d marketing.myndsolution.com
```

**Follow the prompts:**
- Enter your email address
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (recommended: Yes, option 2)

Certbot will automatically:
- Obtain the SSL certificate
- Configure Nginx to use it
- Set up automatic renewal

### Verify SSL Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Check renewal timer
sudo systemctl status certbot.timer
```

### Verify Updated Nginx Config

```bash
sudo nano /etc/nginx/sites-available/marketing.myndsolution.com
```

Certbot should have added SSL configuration. It should now look like:

```nginx
server {
    server_name marketing.myndsolution.com;

    # ... (previous configuration)

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/marketing.myndsolution.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/marketing.myndsolution.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = marketing.myndsolution.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name marketing.myndsolution.com;
    return 404; # managed by Certbot
}
```

---

## 9. Domain Configuration

### DNS Settings

Make sure your domain DNS is configured:

**Add an A record:**
```
Type: A
Name: marketing (or @ if it's the root domain)
Value: <your-server-ip-address>
TTL: 3600
```

**Verify DNS propagation:**
```bash
# Check if domain points to your server
dig marketing.myndsolution.com

# Or
nslookup marketing.myndsolution.com
```

---

## 10. Final Testing

### Test Backend API

```bash
# Check if backend is running
curl http://localhost:3001/api/health

# Should return: {"status":"healthy",...}
```

### Test Nginx Proxy

```bash
# Test through Nginx
curl https://marketing.myndsolution.com/api/health
```

### Test Frontend

Open your browser and visit:
```
https://marketing.myndsolution.com
```

You should see the login page.

### Default Login Credentials

```
Username: admin
Password: admin123
```

**⚠️ IMPORTANT: Change the default password immediately after first login!**

---

## 11. Maintenance & Troubleshooting

### Check Application Status

```bash
# PM2 status
pm2 status
pm2 logs email-marketing-backend

# Nginx status
sudo systemctl status nginx
sudo tail -f /var/log/nginx/marketing.myndsolution.com.error.log

# Check disk space
df -h

# Check memory
free -m
```

### Common Issues

**Issue 1: Backend not starting**
```bash
# Check PM2 logs
pm2 logs email-marketing-backend --lines 100

# Check if port 3001 is in use
sudo netstat -tulpn | grep 3001

# Restart backend
pm2 restart email-marketing-backend
```

**Issue 2: 502 Bad Gateway**
```bash
# Check if backend is running
pm2 status

# Check Nginx error logs
sudo tail -f /var/log/nginx/marketing.myndsolution.com.error.log

# Restart services
pm2 restart email-marketing-backend
sudo systemctl restart nginx
```

**Issue 3: Database errors**
```bash
# Check database file permissions
ls -la /var/www/email-marketing/backend/data/

# Ensure write permissions
chmod 755 /var/www/email-marketing/backend/data/
chmod 644 /var/www/email-marketing/backend/data/email-marketing.db
```

**Issue 4: Frontend not loading**
```bash
# Check if dist folder exists
ls -la /var/www/email-marketing/frontend/dist/

# Rebuild frontend if needed
cd /var/www/email-marketing/frontend
npm run build

# Check Nginx configuration
sudo nginx -t
```

### Update Application

```bash
cd /var/www/email-marketing

# Pull latest changes (if using git)
git pull

# Update backend
cd backend
npm install --production
pm2 restart email-marketing-backend

# Update frontend
cd ../frontend
npm install
npm run build

# Reload Nginx
sudo systemctl reload nginx
```

### Backup Database

```bash
# Create backup script
nano ~/backup-database.sh
```

Add:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/email-marketing"
mkdir -p $BACKUP_DIR

# Backup database
cp /var/www/email-marketing/backend/data/email-marketing.db \
   $BACKUP_DIR/email-marketing_$DATE.db

# Keep only last 7 days of backups
find $BACKUP_DIR -name "email-marketing_*.db" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/email-marketing_$DATE.db"
```

Make executable and schedule:
```bash
chmod +x ~/backup-database.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add this line:
0 2 * * * /home/emailapp/backup-database.sh >> /var/log/email-marketing-backup.log 2>&1
```

### Monitor Logs

```bash
# Real-time PM2 logs
pm2 logs email-marketing-backend

# Real-time Nginx logs
sudo tail -f /var/log/nginx/marketing.myndsolution.com.access.log
sudo tail -f /var/log/nginx/marketing.myndsolution.com.error.log

# Application logs
tail -f /var/www/email-marketing/backend/logs/combined.log
```

### Security Checklist

- [ ] Changed default admin password
- [ ] Generated new JWT_SECRET and ENCRYPTION_KEY
- [ ] Configured firewall (UFW)
  ```bash
  sudo ufw allow 22/tcp    # SSH
  sudo ufw allow 80/tcp    # HTTP
  sudo ufw allow 443/tcp   # HTTPS
  sudo ufw enable
  ```
- [ ] Set up automatic security updates
  ```bash
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure --priority=low unattended-upgrades
  ```
- [ ] Regular database backups configured
- [ ] SSL certificate auto-renewal working
- [ ] Monitoring PM2 logs regularly

---

## Additional Configuration

### Configure Firewall (UFW)

```bash
# Enable firewall
sudo ufw status
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable

# Check status
sudo ufw status verbose
```

### Setup Email (SMTP)

For production email sending, you'll need:

**Option 1: Gmail (for testing/small scale)**
- Use Gmail SMTP with an App Password
- Update `backend/.env` with your Gmail credentials

**Option 2: Dedicated Email Service (recommended for production)**
- Use services like SendGrid, AWS SES, Mailgun, etc.
- Update `backend/.env` with service credentials
- Much higher sending limits and better deliverability

---

## Performance Optimization

### Enable PM2 Cluster Mode (Optional)

For better performance with multiple CPU cores:

```bash
nano /var/www/email-marketing/ecosystem.config.js
```

Change:
```javascript
instances: 'max',  // Use all CPU cores
exec_mode: 'cluster',
```

Then:
```bash
pm2 reload ecosystem.config.js
```

### Enable Redis for Session Storage (Optional)

For better scalability:

```bash
# Install Redis
sudo apt install redis-server -y
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install Redis client in backend
cd /var/www/email-marketing/backend
npm install redis connect-redis express-session
```

---

## Support

If you encounter issues:
1. Check the logs (PM2 and Nginx)
2. Verify all services are running
3. Check firewall rules
4. Verify DNS configuration
5. Check SSL certificate status

---

**Congratulations! Your Email Marketing application should now be live at https://marketing.myndsolution.com** 🎉
