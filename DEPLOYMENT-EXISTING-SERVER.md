# Deployment Guide - Existing Ubuntu Server with GitHub Auto-Deploy

This guide is for deploying to an **existing Ubuntu server** that already has other applications running, using your GitHub repository: `https://github.com/amitbhalla/gagan`

## Prerequisites

- Run the server info gathering script first (see below)
- GitHub repository: https://github.com/amitbhalla/gagan
- SSH access to your Ubuntu server
- Sudo privileges

---

## Step 1: Gather Server Information

**On your Ubuntu server, run:**

```bash
# Download and run the info script
curl -o server-info.sh https://raw.githubusercontent.com/amitbhalla/gagan/main/SERVER-INFO-COMMANDS.sh
chmod +x server-info.sh
sudo ./server-info.sh > server-info.txt

# View the output
cat server-info.txt
```

**OR manually run these key commands:**

```bash
# Check what's already running
sudo netstat -tulpn | grep LISTEN
pm2 list
ls -la /var/www/

# Check Nginx configuration
ls -la /etc/nginx/sites-enabled/
cat /etc/nginx/sites-enabled/*

# Check Node.js version
node --version

# Check available ports
sudo netstat -tulpn | grep -E "3000|3001|3002|3003|3004|3005"

# Check disk space
df -h
```

**Share this information to determine:**
- Which port to use for backend (avoid conflicts)
- Existing Nginx setup
- Available resources

---

## Step 2: Choose a Port for Backend

Based on your server info, choose an available port. Common choices:
- **3001** (if available) - Default in our config
- **3002** or **3003** - If 3001 is taken
- **5001** - Alternative

**Check if port is available:**
```bash
sudo netstat -tulpn | grep :3001
# If nothing returned, port 3001 is available
```

---

## Step 3: Setup GitHub Repository

### On Your Local Machine:

First, let's prepare your code for GitHub:

```bash
cd /Users/amitbhalla/Downloads/gagan

# Initialize git if not already done
git init

# Add GitHub remote
git remote add origin https://github.com/amitbhalla/gagan.git

# Check what will be committed
git status

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - Email Marketing Platform"

# Push to GitHub
git push -u origin main
# OR if main branch doesn't exist:
git push -u origin master
```

**Important Files to Add:**

Create `.gitignore` if it doesn't exist:
```bash
cat > .gitignore << 'EOF'
# Node modules
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.production

# Database
*.db
*.sqlite
*.sqlite3
data/

# Build outputs
dist/
build/
.next/
out/

# Logs
logs/
*.log

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/
*.tmp

# PM2
.pm2/

# SSL certificates (if any)
*.pem
*.key
*.crt
config/dkim/

# Backups
*.backup
*.bak
EOF

git add .gitignore
git commit -m "Add .gitignore"
git push
```

---

## Step 4: Setup Deployment on Server

### SSH into Your Server:

```bash
ssh your-user@your-server-ip
```

### Create Application Directory:

```bash
# Create directory for the app
sudo mkdir -p /var/www/email-marketing
sudo chown -R $USER:$USER /var/www/email-marketing
cd /var/www/email-marketing
```

### Clone Repository:

```bash
# Clone from GitHub
git clone https://github.com/amitbhalla/gagan.git .

# Verify files
ls -la
```

### Setup Backend:

```bash
cd /var/www/email-marketing/backend

# Install dependencies
npm install --production

# Create .env file
cp .env.example .env
nano .env
```

**Update .env with production values:**
```env
NODE_ENV=production
PORT=3001  # Or the port you chose
HOST=0.0.0.0

DATABASE_PATH=./data/email-marketing.db

# Generate these securely!
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Your SMTP settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

FROM_EMAIL=noreply@myndsolution.com
FROM_NAME=Mynd Solution Marketing

FRONTEND_URL=https://marketing.myndsolution.com
API_URL=https://marketing.myndsolution.com/api
CORS_ORIGIN=https://marketing.myndsolution.com
```

**Generate secure keys:**
```bash
echo "JWT_SECRET:"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
echo "ENCRYPTION_KEY:"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Setup Frontend:

```bash
cd /var/www/email-marketing/frontend

# Install dependencies
npm install

# Build for production
npm run build

# Verify build
ls -la dist/
```

---

## Step 5: Setup PM2 (Process Manager)

### Install PM2 (if not already installed):

```bash
npm install -g pm2
```

### Create PM2 Configuration:

```bash
cd /var/www/email-marketing
nano ecosystem.config.js
```

**Add configuration:**
```javascript
module.exports = {
  apps: [
    {
      name: 'email-marketing',
      script: './backend/src/server.js',
      cwd: '/var/www/email-marketing/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001  // Use your chosen port
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    }
  ]
};
```

### Start Application:

```bash
# Create logs directory
mkdir -p backend/logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot (if not already done)
pm2 startup
# Run the command it outputs

# Check status
pm2 status
pm2 logs email-marketing
```

---

## Step 6: Configure Nginx (Add New Site)

### Create Nginx Configuration:

```bash
sudo nano /etc/nginx/sites-available/marketing.myndsolution.com
```

**Add configuration:**
```nginx
server {
    listen 80;
    server_name marketing.myndsolution.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root directory
    root /var/www/email-marketing/frontend/dist;
    index index.html;

    # Logging
    access_log /var/log/nginx/marketing.access.log;
    error_log /var/log/nginx/marketing.error.log;

    # Client body size
    client_max_body_size 10M;

    # API proxy
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

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Frontend SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
}
```

### Enable Site:

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/marketing.myndsolution.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 7: Setup SSL Certificate

```bash
# Obtain certificate
sudo certbot --nginx -d marketing.myndsolution.com

# Follow prompts and choose to redirect HTTP to HTTPS

# Verify auto-renewal
sudo certbot renew --dry-run
```

---

## Step 8: Setup Auto-Deployment with Git Hooks

Now for the automatic deployment when you push to GitHub!

### Option A: Git Post-Receive Hook (Recommended for Simple Setup)

**On Server:**

```bash
cd /var/www/email-marketing

# Create deployment script
nano deploy.sh
```

**Add to deploy.sh:**
```bash
#!/bin/bash

echo "=========================================="
echo "Starting Deployment - $(date)"
echo "=========================================="

cd /var/www/email-marketing

# Pull latest code
echo "Pulling latest code from GitHub..."
git pull origin main

# Backend update
echo "Updating backend..."
cd backend
npm install --production

# Frontend update
echo "Updating and building frontend..."
cd ../frontend
npm install
npm run build

# Restart backend
echo "Restarting backend..."
pm2 restart email-marketing

# Reload Nginx
echo "Reloading Nginx..."
sudo systemctl reload nginx

echo "=========================================="
echo "Deployment Complete - $(date)"
echo "=========================================="
```

**Make executable:**
```bash
chmod +x deploy.sh
```

**Setup Git to auto-pull on push:**

Create a webhook endpoint using a simple script:

```bash
# Create webhook directory
mkdir -p /var/www/email-marketing/webhook
cd /var/www/email-marketing/webhook

nano webhook.js
```

**Add webhook.js:**
```javascript
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');

const SECRET = 'YOUR_WEBHOOK_SECRET'; // Change this!
const PORT = 9000; // Choose an available port

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // Verify GitHub signature
      const signature = req.headers['x-hub-signature-256'];
      const hmac = crypto.createHmac('sha256', SECRET);
      const digest = 'sha256=' + hmac.update(body).digest('hex');

      if (signature === digest) {
        console.log('Valid webhook received, deploying...');

        try {
          // Run deployment script
          const output = execSync('cd /var/www/email-marketing && ./deploy.sh', {
            encoding: 'utf-8'
          });
          console.log(output);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', message: 'Deployment triggered' }));
        } catch (error) {
          console.error('Deployment failed:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: error.message }));
        }
      } else {
        console.log('Invalid signature');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid signature' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
```

**Start webhook service:**
```bash
# Add to PM2
pm2 start webhook.js --name webhook-email-marketing
pm2 save
```

### Configure GitHub Webhook:

1. Go to https://github.com/amitbhalla/gagan/settings/hooks
2. Click "Add webhook"
3. **Payload URL**: `http://your-server-ip:9000/webhook`
4. **Content type**: `application/json`
5. **Secret**: Same secret you used in webhook.js
6. **Events**: Just the push event
7. Click "Add webhook"

### Option B: GitHub Actions (More Professional)

**On your local machine:**

```bash
cd /Users/amitbhalla/Downloads/gagan

# Create GitHub Actions workflow
mkdir -p .github/workflows
nano .github/workflows/deploy.yml
```

**Add deploy.yml:**
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Deploy to Server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USER }}
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /var/www/email-marketing
          git pull origin main
          cd backend
          npm install --production
          cd ../frontend
          npm install
          npm run build
          pm2 restart email-marketing
          sudo systemctl reload nginx
```

**Setup GitHub Secrets:**

1. Go to https://github.com/amitbhalla/gagan/settings/secrets/actions
2. Add these secrets:
   - `SERVER_HOST`: Your server IP
   - `SERVER_USER`: Your SSH username
   - `SSH_PRIVATE_KEY`: Your private SSH key

**Generate SSH key (if needed):**
```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-deploy"
# Save as: ~/.ssh/github_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/github_deploy.pub user@your-server-ip

# Copy private key content for GitHub secret
cat ~/.ssh/github_deploy
```

---

## Step 9: Testing Auto-Deployment

### Test the workflow:

```bash
# On your local machine
cd /Users/amitbhalla/Downloads/gagan

# Make a small change
echo "# Test deployment" >> README.md

# Commit and push
git add README.md
git commit -m "Test auto-deployment"
git push origin main

# Watch server logs
# On server:
pm2 logs email-marketing
# Or for webhook:
pm2 logs webhook-email-marketing
```

---

## Step 10: Manual Deployment Commands

If you need to deploy manually:

```bash
# SSH into server
ssh user@your-server-ip

# Run deployment script
cd /var/www/email-marketing
./deploy.sh

# Or manually:
git pull origin main
cd backend && npm install --production
cd ../frontend && npm install && npm run build
pm2 restart email-marketing
sudo systemctl reload nginx
```

---

## Troubleshooting

### If deployment fails:

```bash
# Check PM2 logs
pm2 logs email-marketing

# Check Nginx logs
sudo tail -f /var/log/nginx/marketing.error.log

# Check Git status
cd /var/www/email-marketing
git status
git log -1

# Check if backend is running
curl http://localhost:3001/api/health

# Restart everything
pm2 restart email-marketing
sudo systemctl restart nginx
```

### Port conflicts:

```bash
# Find what's using a port
sudo netstat -tulpn | grep :3001

# Kill process if needed
sudo kill -9 <PID>
```

---

## Security Notes

1. **Webhook Secret**: Use a strong random secret
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **File Permissions**: Ensure proper ownership
   ```bash
   sudo chown -R $USER:$USER /var/www/email-marketing
   chmod +x deploy.sh
   ```

3. **Firewall**: Open webhook port if using Option A
   ```bash
   sudo ufw allow 9000/tcp  # Only if using webhook server
   ```

---

## Quick Reference

```bash
# Deploy manually
cd /var/www/email-marketing && ./deploy.sh

# Check status
pm2 status
sudo systemctl status nginx

# View logs
pm2 logs email-marketing
sudo tail -f /var/log/nginx/marketing.error.log

# Restart services
pm2 restart email-marketing
sudo systemctl reload nginx

# Update from GitHub
cd /var/www/email-marketing
git pull origin main
```

---

**Now whenever you push to GitHub, your server will automatically update!** 🚀
