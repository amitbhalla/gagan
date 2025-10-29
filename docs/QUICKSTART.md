# Quick Start Guide

## Option 1: Local Development (Recommended for Development)

### Step 1: Run Setup Script

```bash
./setup.sh
```

### Step 2: Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in new terminal)
cd frontend
npm install
```

### Step 3: Start Services

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Server runs on http://localhost:3001

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
UI runs on http://localhost:5173

### Step 4: Login

Open http://localhost:5173

```
Username: admin
Password: changeme123
```

**⚠️ Change password after first login!**

---

## Option 2: Docker (Recommended for Production)

### Step 1: Run Setup Script

```bash
./setup.sh
```

### Step 2: Start with Docker

```bash
docker-compose up -d
```

### Step 3: Check Status

```bash
docker-compose ps
docker-compose logs -f
```

### Step 4: Access Application

Open https://marketing.myndsolution.com

```
Username: admin
Password: changeme123
```

---

## Common Commands

### Development

```bash
# Start backend dev server
cd backend && npm run dev

# Start frontend dev server
cd frontend && npm run dev

# View backend logs
tail -f backend/logs/combined.log

# Reset database (⚠️ deletes all data)
rm backend/data/email-marketing.db
cd backend && npm run dev  # Will recreate tables
```

### Docker

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose stop

# View logs
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart service
docker-compose restart backend

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

# Remove everything
docker-compose down -v
```

### Database

```bash
# Backup database
cp backend/data/email-marketing.db backup-$(date +%Y%m%d).db

# Restore database
cp backup.db backend/data/email-marketing.db

# Access database (requires sqlite3)
sqlite3 backend/data/email-marketing.db
```

---

## What's Available in Phase 1

### ✅ Completed Features

1. **Templates**
   - Create HTML templates with WYSIWYG editor
   - Create plain text templates
   - Edit and preview templates
   - Delete templates

2. **Lists**
   - Create email lists
   - Add custom fields to lists (flexible schema)
   - Manage list subscribers
   - View subscriber counts

3. **Contacts**
   - Add contacts manually
   - Import contacts from CSV
   - Export contacts to CSV
   - Manage contact status (active/bounced/unsubscribed)
   - Search and filter contacts

4. **Dashboard**
   - Overview statistics
   - Quick access to all features

5. **Security**
   - JWT authentication
   - Password hashing with bcrypt
   - Protected API endpoints

### 🚧 Coming in Phase 2

- Campaign creation and sending
- Email personalization with merge fields
- Campaign scheduling
- SMTP integration
- Test email sending

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in backend/.env
PORT=3002
```

### Cannot Connect to Backend

```bash
# Check if backend is running
curl http://localhost:3001/api/health

# Should return: {"status":"ok","timestamp":"..."}
```

### Forgot Password

```bash
cd backend
node -e "
const bcrypt = require('bcrypt');
const { db } = require('./src/config/database');
require('./src/config/database').initializeDatabase();
bcrypt.hash('newpassword', 10).then(hash => {
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
  console.log('Password reset to: newpassword');
});
"
```

### Docker Containers Won't Start

```bash
# Check container status
docker-compose ps

# View error logs
docker-compose logs backend
docker-compose logs frontend

# Remove and recreate
docker-compose down
docker-compose up -d --force-recreate
```

---

## Next Steps

1. ✅ Change default admin password
2. ✅ Create your first email template
3. ✅ Create an email list with custom fields
4. ✅ Import your contacts
5. ✅ Add contacts to your list
6. ⏳ Wait for Phase 2 to send campaigns!

---

## Getting Help

1. Check logs: `docker-compose logs -f` or `backend/logs/`
2. Review README.md for detailed documentation
3. Check common issues above
4. Verify all prerequisites are installed

---

**Ready to start? Run `./setup.sh` and follow the prompts!**
