# Stifle

> **"Stifle your phone. Unleash yourself."**

Stifle is a privacy-first mobile app that gamifies digital wellbeing through social competition and personal growth. Earn points for keeping your phone locked, compete with friends, and beat your own "ghost" from last week.

## 🚀 Alpha Release

The Alpha release focuses on the core "Loop" of the application:
1.  **Lock & Earn**: Accumulate points for every minute your phone is locked (min. 10 mins).
2.  **Weekly Turnovers**: Every Monday at 9 AM, your score resets.
3.  **Ghost Mode**: Compete against your previous week's performance.
4.  **Social Leaderboards**: See how you stack up against friends and groups.

## ✨ Key Features

-   **Privacy First**: We only track *lock events*. We never monitor which apps you use or what you do on your phone.
-   **Robust Tracking**: Uses a custom Accessibility Service to ensure sessions are tracked accurately even on aggressive battery-saving devices.
-   **Premium Onboarding**: A smooth, animated introduction to the Stifle philosophy.
-   **Weekly Notifications**: Smart local-timezone notifications to deliver your weekly summary and rank.
-   **Group & Friend Leaderboards**: Create invite-only groups for close-knit competition.

## 🛠 Project Structure

```
stifle/
├── server/          # Node.js (Fastify/TypeScript) backend
├── android/         # Native Android (Kotlin/Jetpack Compose)
├── admin/           # React Admin Panel (Vite)
├── docker-compose.yml
└── README.md
```

## ⚙️ Tech Stack

### Backend
-   **Runtime**: Node.js 20+
-   **Framework**: Fastify
-   **Database**: PostgreSQL (Data), Redis (Queue/Cache)
-   **Queue System**: BullMQ (for weekly summaries & notifications)
-   **Push Notifications**: Firebase Cloud Messaging (FCM)

### Android
-   **UI**: Jetpack Compose
-   **Architecture**: MVVM
-   **Local Storage**: DataStore (Preferences), Room (Events)
-   **Background Work**: WorkManager (Sync), AccessibilityService (Tracking)

## 🏃‍♂️ Quick Start

### 1. Backend Setup

```bash
# Start Infrastructure (Postgres + Redis)
docker-compose up -d

# Install & Setup Server
cd server
npm install
npm run setup    # Runs migrations + seeds DB + creates admin user
npm run dev      # Starts server on port 3000
```

### 2. Android Setup

1.  Open `android/` in Android Studio.
2.  Sync Gradle.
3.  **Important**: Ensure your emulator/device can reach the server.
    -   Emulator: auto-configured for `10.0.2.2:3000`.
    -   Physical Device: Update `API_BASE_URL` in `app/build.gradle.kts`.
4.  Run `gradlew installDebug`.

### 3. Verification

-   **Onboarding**: Launch the app. You should see the "Stifle your phone" welcome sequence.
-   **Permissions**: Accept Accessibility (for tracking) and Notifications (for weekly summaries).
-   **Ghost Mode**: Complete one week of tracking to see your Ghost stats!

## 🔒 Security

-   **JWT Auth**: Secure access with refresh token rotation.
-   **Encrypted Storage**: Sensitive tokens stored via Android Keystore.
-   **Invite-Only**: Registration protected by invite codes to maintain community quality during Alpha.

## License

Polyform Noncommercial
