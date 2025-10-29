# GitHub Setup & Push Commands

Quick reference for setting up GitHub repository and pushing code.

## Step 1: Gather Server Information

**Run this on your Ubuntu server:**

```bash
# SSH into your server
ssh your-user@your-server-ip

# Download and run info script
cd ~
curl -o server-info.sh https://raw.githubusercontent.com/amitbhalla/gagan/main/SERVER-INFO-COMMANDS.sh 2>/dev/null || \
wget https://raw.githubusercontent.com/amitbhalla/gagan/main/SERVER-INFO-COMMANDS.sh

chmod +x server-info.sh
sudo ./server-info.sh > server-info.txt

# View the report
cat server-info.txt

# Or run commands manually
echo "=== Key Information ==="
echo "Ports in use:"
sudo netstat -tulpn | grep LISTEN
echo ""
echo "PM2 processes:"
pm2 list
echo ""
echo "Node version:"
node --version
echo ""
echo "Nginx sites:"
ls -la /etc/nginx/sites-enabled/
```

**Copy the output and share it to plan deployment.**

---

## Step 2: Push Code to GitHub

**Run these commands on your LOCAL machine (Mac):**

```bash
cd /Users/amitbhalla/Downloads/gagan

# Check git status
git status

# Initialize git (if not already done)
git init

# Add GitHub remote
git remote add origin https://github.com/amitbhalla/gagan.git

# Or if remote exists, update it
git remote set-url origin https://github.com/amitbhalla/gagan.git

# Check current remotes
git remote -v

# Add all files
git add .

# Check what will be committed
git status

# Commit changes
git commit -m "Add email marketing platform with deployment guides"

# Push to GitHub
git push -u origin main

# If main branch doesn't exist, try master:
git push -u origin master

# Or create main branch:
git branch -M main
git push -u origin main
```

**If you encounter errors:**

```bash
# If push is rejected (repository not empty)
git pull origin main --rebase
# OR
git pull origin main --allow-unrelated-histories
git push origin main

# If authentication fails
# Use Personal Access Token instead of password
# Generate at: https://github.com/settings/tokens
```

---

## Step 3: Verify GitHub Upload

**Check on GitHub:**

1. Go to https://github.com/amitbhalla/gagan
2. Verify files are uploaded:
   - backend/
   - frontend/
   - DEPLOYMENT.md
   - DEPLOYMENT-EXISTING-SERVER.md
   - SERVER-INFO-COMMANDS.sh
   - .gitignore
   - etc.

---

## Step 4: Deploy to Server (After GitHub is Ready)

**On your Ubuntu server:**

```bash
# Navigate to deployment directory
sudo mkdir -p /var/www/email-marketing
sudo chown -R $USER:$USER /var/www/email-marketing
cd /var/www/email-marketing

# Clone from GitHub
git clone https://github.com/amitbhalla/gagan.git .

# Or if directory exists with files
git init
git remote add origin https://github.com/amitbhalla/gagan.git
git fetch
git checkout -t origin/main

# Verify files
ls -la
```

---

## Quick Command Reference

### Check Git Status
```bash
git status
git log --oneline -5
git remote -v
```

### Update from GitHub (on server)
```bash
cd /var/www/email-marketing
git pull origin main
```

### Push to GitHub (from local)
```bash
cd /Users/amitbhalla/Downloads/gagan
git add .
git commit -m "Your commit message"
git push origin main
```

### Fix Common Issues

**Issue: Git not tracking files**
```bash
git add -A
git status
```

**Issue: Large files rejected**
```bash
# Add to .gitignore
echo "large-file.zip" >> .gitignore
git rm --cached large-file.zip
git commit -m "Remove large file"
```

**Issue: Merge conflicts**
```bash
git stash
git pull origin main
git stash pop
# Resolve conflicts manually
git add .
git commit -m "Resolve conflicts"
git push origin main
```

---

## For Auto-Deployment Setup

After code is on GitHub and server, follow **DEPLOYMENT-EXISTING-SERVER.md** section "Setup Auto-Deployment with Git Hooks".

### Quick auto-deploy setup:

**On server:**
```bash
cd /var/www/email-marketing

# Create deploy script
nano deploy.sh
# (Paste content from DEPLOYMENT-EXISTING-SERVER.md)

chmod +x deploy.sh

# Test deploy script
./deploy.sh
```

**For webhook (optional):**
```bash
cd /var/www/email-marketing
mkdir webhook
cd webhook
nano webhook.js
# (Paste content from DEPLOYMENT-EXISTING-SERVER.md)

pm2 start webhook.js --name webhook-email-marketing
pm2 save
```

**Then configure GitHub webhook at:**
https://github.com/amitbhalla/gagan/settings/hooks

---

## Summary Checklist

- [ ] Server information gathered
- [ ] .gitignore configured correctly
- [ ] Local repository initialized
- [ ] Remote origin added: https://github.com/amitbhalla/gagan.git
- [ ] Code committed and pushed to GitHub
- [ ] Repository visible at https://github.com/amitbhalla/gagan
- [ ] Server has cloned the repository
- [ ] Backend configured with .env
- [ ] Frontend built successfully
- [ ] PM2 configured and running
- [ ] Nginx configured
- [ ] SSL certificate obtained
- [ ] Auto-deployment configured (optional)

---

## Next Steps After GitHub Push

1. **Follow DEPLOYMENT-EXISTING-SERVER.md** for full deployment
2. **Or use quick commands:**

```bash
# On server
cd /var/www/email-marketing
cd backend && npm install --production
cd ../frontend && npm install && npm run build
pm2 start ecosystem.config.js
pm2 save
sudo systemctl reload nginx
```

3. **Access your app at**: https://marketing.myndsolution.com

---

## Getting Help

If you encounter issues:
1. Check server-info.txt for conflicts
2. Review deployment logs: `pm2 logs email-marketing`
3. Check Nginx logs: `sudo tail -f /var/log/nginx/marketing.error.log`
4. Verify GitHub repository is accessible
5. Ensure SSH keys are configured if using GitHub Actions

---

**All documentation files:**
- `DEPLOYMENT.md` - Fresh server setup
- `DEPLOYMENT-EXISTING-SERVER.md` - Existing server with auto-deploy
- `DEPLOYMENT-CHECKLIST.md` - Quick checklist
- `SERVER-INFO-COMMANDS.sh` - Server info script
- `GITHUB-SETUP-COMMANDS.md` - This file
