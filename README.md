# Email Marketing Tool

A full-featured email marketing platform built with React, Node.js, and SQLite. Send campaigns, track engagement, and manage your email lists with ease.

## Features (Phase 1)

- **Email Templates**: Create and manage HTML or plain text email templates with WYSIWYG editor
- **Contact Lists**: Build custom lists with flexible custom fields per list
- **Contact Management**: Import/export contacts via CSV, manage contact status
- **User Authentication**: Secure JWT-based single admin authentication
- **Modern UI**: Responsive React dashboard with Ant Design components

## Features Coming in Future Phases

- **Phase 2**: Campaign sending with SMTP, email personalization, scheduling
- **Phase 3**: Open tracking, click tracking, unsubscribe management (RFC 8058)
- **Phase 4**: Analytics dashboard with charts and reports
- **Phase 5**: Bounce handling, SMTP configuration UI, list segmentation
- **Phase 6**: Production deployment optimization
- **Phase 7**: Gmail compliance, DKIM/SPF/DMARC, spam monitoring

## Tech Stack

- **Frontend**: React 18, Vite, Ant Design, React-Quill
- **Backend**: Node.js, Express, SQLite (better-sqlite3)
- **Authentication**: JWT, bcrypt
- **Email**: Nodemailer (ready for Phase 2)
- **Deployment**: Docker, Docker Compose, Nginx

## Prerequisites

- Node.js 18+ (for local development)
- Docker & Docker Compose (for production deployment)
- SMTP server access (currently configured for smtp-relay.gmail.com)

## Local Development Setup

### 1. Clone and Install

```bash
cd /Users/amitbhalla/Downloads/gagan

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Backend configuration:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# Generate a secure JWT secret (32+ characters)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Set admin password (change after first login!)
ADMIN_PASSWORD=changeme123

# Other settings (defaults are fine for development)
PORT=3001
NODE_ENV=development
```

### 3. Start Development Servers

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

Backend will run on http://localhost:3001

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

Frontend will run on http://localhost:5173

### 4. Access the Application

Open your browser to http://localhost:5173

**Default credentials:**
- Username: `admin`
- Password: `changeme123` (or whatever you set in .env)

## Production Deployment (Docker)

### 1. Prepare Environment

```bash
# Copy environment template
cp .env.example .env

# Edit and set secure values
nano .env
```

Set a strong JWT secret:

```env
JWT_SECRET=$(openssl rand -base64 32)
ADMIN_PASSWORD=your-secure-password
```

### 2. Create SSL Certificate Directory

```bash
mkdir -p nginx/ssl
```

**Option A: Self-signed certificate (testing)**

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem \
  -subj "/CN=marketing.myndsolution.com"
```

**Option B: Let's Encrypt (production)**

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d marketing.myndsolution.com

# Copy certificates
sudo cp /etc/letsencrypt/live/marketing.myndsolution.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/marketing.myndsolution.com/privkey.pem nginx/ssl/
```

### 3. Build and Start Containers

```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Verify Deployment

Check service status:

```bash
docker-compose ps
```

Test endpoints:

```bash
# Backend health check
curl http://localhost:3001/api/health

# Frontend (via Nginx)
curl https://marketing.myndsolution.com
```

### 5. Manage Services

```bash
# Stop services
docker-compose stop

# Restart services
docker-compose restart

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Remove containers
docker-compose down
```

## DNS Configuration

For production deployment, configure these DNS records:

### A Record
```
marketing.myndsolution.com  →  YOUR_SERVER_IP
```

### SPF Record (Phase 7)
```
TXT  @  "v=spf1 include:_spf.google.com ~all"
```

### DKIM Record (Phase 7)
After generating DKIM keys in Phase 2:
```
TXT  default._domainkey  "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"
```

### DMARC Record (Phase 7)
```
TXT  _dmarc  "v=DMARC1; p=none; rua=mailto:dmarc@myndsolution.com"
```

## SMTP Configuration

Current configuration uses Gmail SMTP Relay with IP-based authentication:

```
Host: smtp-relay.gmail.com
Port: 587
TLS: Required
Authentication: IP-based (no credentials)
From: info@myndsol.com
```

**Setup on Gmail Admin:**
1. Go to Google Workspace Admin Console
2. Apps → Google Workspace → Gmail → Routing
3. Add your server's IP to SMTP relay service
4. Configure allowed senders

## Database Management

### Backup Database

```bash
# Docker deployment
docker exec email-marketing-backend cp /app/data/email-marketing.db /app/data/backup-$(date +%Y%m%d).db

# Local development
cp backend/data/email-marketing.db backend/data/backup-$(date +%Y%m%d).db
```

### Restore Database

```bash
# Docker deployment
docker cp backup.db email-marketing-backend:/app/data/email-marketing.db
docker-compose restart backend

# Local development
cp backup.db backend/data/email-marketing.db
```

### Database Location

- **Local**: `backend/data/email-marketing.db`
- **Docker**: Mounted volume at `./backend/data`

## API Documentation

### Authentication

**POST** `/api/auth/login`
```json
{
  "username": "admin",
  "password": "changeme123"
}
```

Returns JWT token for subsequent requests.

**POST** `/api/auth/change-password` (authenticated)
```json
{
  "currentPassword": "old",
  "newPassword": "new"
}
```

### Templates

- **GET** `/api/templates` - List all templates
- **GET** `/api/templates/:id` - Get template by ID
- **POST** `/api/templates` - Create template
- **PUT** `/api/templates/:id` - Update template
- **DELETE** `/api/templates/:id` - Delete template

### Lists

- **GET** `/api/lists` - List all lists
- **GET** `/api/lists/:id` - Get list by ID
- **GET** `/api/lists/:id/subscribers` - Get list subscribers
- **POST** `/api/lists` - Create list
- **POST** `/api/lists/:id/subscribers` - Add subscriber to list
- **PUT** `/api/lists/:id` - Update list
- **DELETE** `/api/lists/:id` - Delete list

### Contacts

- **GET** `/api/contacts` - List all contacts
- **GET** `/api/contacts/stats` - Get contact statistics
- **GET** `/api/contacts/:id` - Get contact by ID
- **POST** `/api/contacts` - Create contact
- **POST** `/api/contacts/bulk-import` - Import multiple contacts
- **PUT** `/api/contacts/:id` - Update contact
- **DELETE** `/api/contacts/:id` - Delete contact

All authenticated endpoints require `Authorization: Bearer <token>` header.

## Project Structure

```
email-marketing-tool/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js       # SQLite setup & schema
│   │   │   └── logger.js         # Winston logger
│   │   ├── controllers/          # Request handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── template.controller.js
│   │   │   ├── list.controller.js
│   │   │   └── contact.controller.js
│   │   ├── models/               # Database models
│   │   │   ├── template.model.js
│   │   │   ├── list.model.js
│   │   │   └── contact.model.js
│   │   ├── middleware/           # Express middleware
│   │   │   ├── auth.js
│   │   │   └── validation.js
│   │   ├── routes/
│   │   │   └── api.routes.js     # API endpoints
│   │   └── server.js             # Express app entry
│   ├── data/                     # SQLite database (gitignored)
│   ├── logs/                     # Application logs (gitignored)
│   ├── package.json
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout/
│   │   │       └── AppLayout.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Templates.jsx
│   │   │   ├── Lists.jsx
│   │   │   ├── Contacts.jsx
│   │   │   ├── Campaigns.jsx    # Placeholder for Phase 2
│   │   │   └── Settings.jsx
│   │   ├── utils/
│   │   │   ├── api.js           # Axios instance
│   │   │   └── auth.js          # Auth helpers
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── Dockerfile
│   └── vite.config.js
├── nginx/
│   └── nginx.conf               # Nginx reverse proxy config
├── docker-compose.yml
├── .env.example
└── README.md
```

## Troubleshooting

### Backend won't start

```bash
# Check logs
cd backend
npm run dev

# Common issues:
# - Port 3001 already in use: Change PORT in .env
# - Database locked: Stop any other instances
# - Missing dependencies: Run npm install
```

### Frontend build errors

```bash
# Clear cache and rebuild
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Docker issues

```bash
# View container logs
docker-compose logs backend
docker-compose logs frontend

# Restart specific service
docker-compose restart backend

# Rebuild images
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Can't login

```bash
# Reset admin password
cd backend
node -e "
const bcrypt = require('bcrypt');
const { db } = require('./src/config/database');
bcrypt.hash('newpassword', 10).then(hash => {
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
  console.log('Password reset to: newpassword');
});
"
```

### SMTP not working (Phase 2)

- Verify IP is whitelisted in Google Workspace Admin
- Check SMTP_HOST and SMTP_PORT in .env
- Test connection: `telnet smtp-relay.gmail.com 587`
- Review logs: `docker-compose logs backend | grep SMTP`

## Security Best Practices

1. **Change default password immediately after first login**
2. **Use strong JWT_SECRET** (32+ random characters)
3. **Keep SSL certificates updated** (Let's Encrypt auto-renewal)
4. **Regular database backups** (daily recommended)
5. **Monitor logs** for suspicious activity
6. **Restrict Nginx access** with firewall rules if needed
7. **Update dependencies** regularly: `npm audit fix`

## Development Workflow

### Making Changes

```bash
# Backend changes
cd backend
# Edit files, server auto-restarts with nodemon
npm run dev

# Frontend changes
cd frontend
# Edit files, Vite HMR updates instantly
npm run dev
```

### Testing

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm run lint
```

### Production Build

```bash
# Frontend production build
cd frontend
npm run build
# Output in dist/

# Test production build locally
npm run preview
```

## Monitoring & Logs

### Application Logs

```bash
# Docker
docker-compose logs -f backend
docker-compose logs -f frontend

# Local
tail -f backend/logs/combined.log
tail -f backend/logs/error.log
```

### Nginx Logs

```bash
docker-compose logs -f nginx
```

### Database Queries (Development)

Set `NODE_ENV=development` in backend/.env to see SQL queries in console.

## Performance Tips

1. **Database indexes** are already configured for common queries
2. **Nginx caching** for static assets
3. **Rate limiting** protects against abuse
4. **Connection pooling** for SMTP (Phase 2)
5. **CDN** recommended for large scale (future enhancement)

## Support & Contribution

### Getting Help

- Check logs first: `docker-compose logs -f`
- Review this README thoroughly
- Check GitHub Issues (if applicable)

### Reporting Issues

Include:
- Error messages from logs
- Environment (local/Docker, OS, Node version)
- Steps to reproduce
- Expected vs actual behavior

## License

MIT License - Free to use for personal and commercial projects.

## Roadmap

- ✅ **Phase 1**: CRUD for templates, lists, contacts (COMPLETE)
- 🚧 **Phase 2**: Campaign sending & scheduling (NEXT)
- 📋 **Phase 3**: Email tracking (opens, clicks, unsubscribe)
- 📋 **Phase 4**: Analytics dashboard
- 📋 **Phase 5**: Advanced features (bounces, segmentation)
- 📋 **Phase 6**: Production optimization
- 📋 **Phase 7**: Gmail compliance & authentication

---

**Built with ❤️ for effective email marketing**
