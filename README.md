# Stifle

A mobile app that gamifies reduced screen time through social competition. Earn points for keeping your phone locked, compete with friends on weekly leaderboards.

## Project Structure

```
stifle/
├── server/          # Node.js/Fastify backend
├── android/         # Kotlin/Compose app
├── docker-compose.yml
└── README.md
```

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Android Studio (for Android development)

### 1. Start Backend

```bash
# Start Postgres + Redis
docker-compose up -d

# Install dependencies & setup database
cd server
npm install
npm run setup    # Runs migrations + creates admin user + invite codes

# Start dev server
npm run dev
```

The setup command will output:
- Admin credentials (default: `admin@stifle.app` / `admin123`)
- 5 invite codes you can use to register new users
- A sample group invite code

### 2. Run Tests

```bash
cd server
npm run test        # Run all tests
npm run test:watch  # Watch mode
npm run typecheck   # TypeScript check
```

### 3. Android App

Open the `android/` folder in Android Studio and run on emulator/device.

**For emulator**: The app is pre-configured to connect to `http://10.0.2.2:3000` (Android emulator's localhost).

**For physical device**: Update `API_BASE_URL` in `app/build.gradle.kts` to your dev machine's IP.

## API Endpoints

```
POST /auth/register     - Register with invite code
POST /auth/login        - Login
POST /auth/refresh      - Refresh tokens
POST /auth/logout       - Logout

POST /events/sync       - Sync lock/unlock events
GET  /events/current    - Get current streak info

GET  /users/me          - Get profile + weekly score
PUT  /users/me          - Update profile
PUT  /users/me/tracking-status - Update tracking status
POST /users/me/invites  - Create invite codes
GET  /users/me/invites  - List invite codes

POST /groups            - Create group
GET  /groups            - List your groups
GET  /groups/:id        - Get group details
POST /groups/join       - Join by invite code
DELETE /groups/:id/leave - Leave group
GET  /groups/:id/leaderboard - Weekly leaderboard

GET  /health            - Health check
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run setup` | Run migrations + seed database |
| `npm run migrate` | Run database migrations only |
| `npm run seed` | Seed database only |
| `npm run test` | Run tests |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Build for production |

## Tech Stack

**Backend:** Node.js, Fastify, TypeScript, PostgreSQL, Redis, BullMQ  
**Android:** Kotlin, Jetpack Compose, Room, WorkManager

## Security Features

- JWT with refresh token rotation
- Encrypted token storage on Android (AES-GCM)
- HTTPS enforcement with certificate pinning ready
- Invite-only registration
- Single device per user

## License

MIT
