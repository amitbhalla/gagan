#!/bin/bash

# Server Information Gathering Script
# Run this on your Ubuntu server and share the output

echo "=================================================="
echo "SERVER INFORMATION REPORT"
echo "=================================================="
echo ""

echo "=== 1. SYSTEM INFORMATION ==="
echo "OS Version:"
cat /etc/os-release | grep -E "PRETTY_NAME|VERSION_ID"
echo ""
echo "Kernel:"
uname -r
echo ""
echo "Hostname:"
hostname
echo ""

echo "=== 2. RESOURCE USAGE ==="
echo "CPU Info:"
lscpu | grep -E "Model name|CPU\(s\)|Thread"
echo ""
echo "Memory:"
free -h
echo ""
echo "Disk Usage:"
df -h | grep -E "Filesystem|/$|/var|/home"
echo ""

echo "=== 3. NETWORK & PORTS ==="
echo "IP Address:"
ip addr show | grep -E "inet.*global"
echo ""
echo "Open Ports:"
sudo netstat -tulpn | grep LISTEN
echo ""

echo "=== 4. NGINX CONFIGURATION ==="
echo "Nginx Version:"
nginx -v 2>&1
echo ""
echo "Nginx Status:"
sudo systemctl status nginx --no-pager | grep -E "Active|Loaded"
echo ""
echo "Nginx Sites Enabled:"
ls -la /etc/nginx/sites-enabled/
echo ""
echo "Nginx Config Files:"
ls -la /etc/nginx/sites-available/
echo ""

echo "=== 5. EXISTING APPLICATIONS ==="
echo "Running Node.js Processes:"
ps aux | grep -E "node|nodejs" | grep -v grep
echo ""
echo "PM2 Processes (if installed):"
pm2 list 2>/dev/null || echo "PM2 not installed or no processes"
echo ""
echo "Application Directories:"
ls -la /var/www/ 2>/dev/null || echo "/var/www/ not found"
echo ""

echo "=== 6. NODE.JS & NPM ==="
echo "Node.js Version:"
node --version 2>/dev/null || echo "Node.js not installed"
echo ""
echo "NPM Version:"
npm --version 2>/dev/null || echo "NPM not installed"
echo ""
echo "NVM Installation:"
[ -d "$HOME/.nvm" ] && echo "NVM installed at $HOME/.nvm" || echo "NVM not found"
echo ""

echo "=== 7. DATABASE ==="
echo "SQLite:"
sqlite3 --version 2>/dev/null || echo "SQLite not installed"
echo ""
echo "MySQL/MariaDB:"
mysql --version 2>/dev/null || echo "MySQL not installed"
echo ""
echo "PostgreSQL:"
psql --version 2>/dev/null || echo "PostgreSQL not installed"
echo ""

echo "=== 8. SSL CERTIFICATES ==="
echo "Certbot Version:"
certbot --version 2>/dev/null || echo "Certbot not installed"
echo ""
echo "Existing Certificates:"
sudo certbot certificates 2>/dev/null || echo "No certificates found"
echo ""

echo "=== 9. FIREWALL STATUS ==="
echo "UFW Status:"
sudo ufw status verbose 2>/dev/null || echo "UFW not active or not installed"
echo ""

echo "=== 10. GIT CONFIGURATION ==="
echo "Git Version:"
git --version 2>/dev/null || echo "Git not installed"
echo ""
echo "Git Config:"
git config --global --list 2>/dev/null || echo "No global git config"
echo ""

echo "=== 11. AVAILABLE DISK SPACE ==="
echo "Disk Space:"
df -h /var/www 2>/dev/null || df -h /
echo ""

echo "=== 12. CURRENT USER & PERMISSIONS ==="
echo "Current User:"
whoami
echo ""
echo "Groups:"
groups
echo ""
echo "Sudo Access:"
sudo -l -U $(whoami) 2>/dev/null | grep -E "may run|NOPASSWD" || echo "Check sudo access manually"
echo ""

echo "=================================================="
echo "END OF REPORT"
echo "=================================================="
echo ""
echo "Please share this output for deployment planning."
