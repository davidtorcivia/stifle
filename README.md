# Stifle

> **"Stifle your phone. Unleash yourself."**

Stifle is a privacy-first mobile app that gamifies digital wellbeing through social competition and personal growth. Earn points for keeping your phone locked, compete with friends, and beat your own "ghost" from last week.

## Alpha Release

The Alpha release focuses on the core "Loop" of the application. Users accumulate points for every minute their phone is locked (minimum 10 minutes to count). Every Monday at 9 AM in your local timezone, scores reset for a fresh weekly competition. Ghost Mode lets you compete against your own previous week's performance, providing personal motivation even without an active social circle. Social leaderboards round out the experience, letting you see how you stack up against friends and groups.

## Key Features

Stifle is built with privacy as the foundation. We only track lock events - never which apps you use or what you do on your phone. The tracking system uses a custom Accessibility Service to ensure sessions are tracked accurately, even on devices with aggressive battery-saving modes that typically kill background apps. A premium onboarding experience introduces users to the Stifle philosophy through smooth, animated screens. Weekly notifications, delivered in your local timezone, provide summaries of your performance and rank. Group and friend leaderboards enable invite-only competitions for close-knit social circles.

## Project Structure

```
stifle/
├── server/          # Node.js (Fastify/TypeScript) backend
├── android/         # Native Android (Kotlin/Jetpack Compose)
├── admin/           # React Admin Panel (Vite) - in server/admin
├── docker-compose.yml
└── README.md
```

## Tech Stack

### Backend

The backend runs on Node.js 20+ using the Fastify framework. PostgreSQL handles persistent data storage while Redis manages queues and caching. BullMQ powers the background job system for weekly summaries and notifications. Push notifications are delivered via Firebase Cloud Messaging (FCM).

### Android

The Android app uses Jetpack Compose for the UI with MVVM architecture. Local storage combines DataStore for preferences and Room for event data. Background work is handled by WorkManager for syncing and a custom AccessibilityService for reliable lock/unlock tracking.

---

## Quick Start (Development)

### 1. Backend Setup

```bash
# Start Infrastructure (Postgres + Redis)
docker-compose up -d postgres redis

# Install & Setup Server
cd server
npm install
cp .env.example .env   # Edit with your settings
npm run migrate        # Run database migrations
npm run seed           # Seed initial data (creates admin user)
npm run dev            # Starts server on port 3000
```

### 2. Android Setup

Open `android/` in Android Studio and sync Gradle. Ensure your emulator or device can reach the server. The emulator is auto-configured for `10.0.2.2:3000`. For physical devices, update `API_BASE_URL` in `app/build.gradle.kts`. Run `gradlew installDebug` to install.

### 3. Verification

Launch the app to see the onboarding sequence. Accept Accessibility permissions for tracking and Notification permissions for weekly summaries. Complete one week of tracking to see Ghost stats.

---

## Production Deployment

### Prerequisites

You need a domain with SSL capability (e.g., `api.stifle.app`, `admin.stifle.app`), Docker and Docker Compose installed, a Firebase project for FCM push notifications, and either managed PostgreSQL/Redis or Docker containers.

### Step 1: Environment Configuration

Copy environment templates:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Edit root `.env`:

```bash
NODE_ENV=production
POSTGRES_USER=stifle
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=stifle
SERVER_PORT=3000
ADMIN_PORT=5173
```

Edit `server/.env`:

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# API Domain (used for CORS and invite links)
API_DOMAIN=api.stifle.app

# Database (uses Docker internal network)
DATABASE_URL=postgresql://stifle:<password>@stifle-postgres:5432/stifle
REDIS_URL=redis://stifle-redis:6379

# JWT - Generate a strong 64+ character secret
JWT_SECRET=<generate-with: openssl rand -hex 64>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Step 2: Firebase Setup

Create a Firebase project at https://console.firebase.google.com. Add an Android app with package name `app.stifle` and download `google-services.json` to `android/app/`. In Project Settings > Service Accounts, generate a private key JSON file. Mount the key file in Docker by adding to the server service in docker-compose.yml:

```yaml
environment:
  - GOOGLE_APPLICATION_CREDENTIALS=/app/firebase-key.json
volumes:
  - ./firebase-key.json:/app/firebase-key.json:ro
```

### Step 3: Deploy with Docker

```bash
# Build all services
docker-compose build

# Run migrations FIRST (before starting the server)
docker-compose run --rm server npm run migrate

# Create initial admin user
docker-compose run --rm server npm run seed

# Now start all services
docker-compose up -d

# Check logs
docker-compose logs -f server
```

### Step 4: Expose to Internet

Choose one of the following options to expose your services to the internet.

#### Option A: Cloudflare Tunnels (Recommended)

Cloudflare Tunnels provide secure access without opening ports or configuring SSL certificates manually. Install cloudflared on your server:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate with Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create stifle

# Configure the tunnel (create ~/.cloudflared/config.yml)
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.stifle.app
    service: http://localhost:3000
  - hostname: admin.stifle.app
    service: http://localhost:5173
  - service: http_status:404
```

Add DNS records in Cloudflare dashboard pointing your subdomains to the tunnel, then run:

```bash
# Run tunnel (or install as a service)
cloudflared tunnel run stifle

# Install as systemd service for auto-start
cloudflared service install
```

#### Option B: Nginx with Let's Encrypt

For traditional reverse proxy setup with nginx:

```nginx
# API Server
server {
    listen 443 ssl http2;
    server_name api.stifle.app;
    
    ssl_certificate /etc/letsencrypt/live/stifle.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stifle.app/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Admin Panel
server {
    listen 443 ssl http2;
    server_name admin.stifle.app;
    
    ssl_certificate /etc/letsencrypt/live/stifle.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stifle.app/privkey.pem;
    
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name api.stifle.app admin.stifle.app;
    return 301 https://$host$request_uri;
}
```

### Step 5: Android Release Build

The app is configured with separate debug and release builds:

| Build Type | API URL | Application ID | Command |
|------------|---------|----------------|---------|
| Debug | `http://10.0.2.2:3000` | `app.stifle.debug` | `./gradlew assembleDebug` |
| Release | `https://api.stifleapp.com` | `app.stifle` | `./gradlew assembleRelease` |

**Debug builds** can be installed alongside release builds since they have different application IDs.

#### First Time: Create Release Keystore

```bash
cd android
keytool -genkey -v -keystore stifle-release.jks \
  -alias stifle -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/keystore.properties` (add to .gitignore):

```properties
storePassword=<your-store-password>
keyPassword=<your-key-password>
keyAlias=stifle
storeFile=../stifle-release.jks
```

#### Building

```bash
cd android

# Development build (connects to local server)
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Production build (connects to api.stifleapp.com)
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

### Step 6: Create Admin User

The seed command creates an admin user with username `admin`, email `admin@stifle.app`, and password `AdminPass123!`. To create additional admins:

```bash
# Generate an invite code
docker exec -it stifle-postgres psql -U stifle -c \
  "INSERT INTO invite_codes (code, creator_id, expires_at) 
   SELECT 'ADMIN001', id, NOW() + INTERVAL '1 day' FROM users LIMIT 1"

# Register with the invite code, then grant admin role
docker exec -it stifle-postgres psql -U stifle -c \
  "UPDATE users SET role='admin' WHERE username='newadmin'"
```

### Step 7: Health Checks

```bash
# API health endpoint
curl https://api.stifle.app/health

# Database connectivity
docker exec stifle-postgres pg_isready -U stifle

# Redis connectivity
docker exec stifle-redis redis-cli ping

# View server logs
docker-compose logs -f server
```

---

## Security

Stifle implements multiple layers of security. JWT authentication uses refresh token rotation with hashed tokens stored in the database. On Android, sensitive tokens are encrypted using AES-GCM before storage. Registration requires invite codes, maintaining community quality during the Alpha period. Rate limiting applies globally at 100 requests per minute, with stricter 5 requests per minute limits on authentication endpoints. CORS restricts cross-origin requests to stifle domains in production. All admin actions are logged with IP addresses for audit purposes.

---

## Testing

```bash
cd server

# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# TypeScript type checking
npm run typecheck

# Linting
npm run lint
```

---

## License

Polyform Noncommercial
