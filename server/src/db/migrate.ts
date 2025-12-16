import { db } from './client.js';

const migrations = [
    {
        name: '001_initial_schema',
        sql: `
      -- Users
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username        VARCHAR(30) UNIQUE NOT NULL,
        email           VARCHAR(255) UNIQUE NOT NULL,
        password_hash   VARCHAR(255) NOT NULL,
        timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
        platform        VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
        tracking_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (tracking_status IN ('pending', 'verified', 'broken')),
        device_id       VARCHAR(255),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        settings        JSONB NOT NULL DEFAULT '{}'
      );

      -- Events (append-only log)
      CREATE TABLE IF NOT EXISTS events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id       UUID NOT NULL,
        event_type      VARCHAR(10) NOT NULL CHECK (event_type IN ('lock', 'unlock')),
        timestamp       TIMESTAMPTZ NOT NULL,
        source          VARCHAR(20) NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, client_id)
      );

      -- Weekly scores (materialized)
      CREATE TABLE IF NOT EXISTS weekly_scores (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start      DATE NOT NULL,
        total_points    DECIMAL(12, 2) NOT NULL DEFAULT 0,
        streak_count    INTEGER NOT NULL DEFAULT 0,
        longest_streak  INTEGER NOT NULL DEFAULT 0,
        calculated_at   TIMESTAMPTZ NOT NULL,
        UNIQUE (user_id, week_start)
      );

      -- Groups
      CREATE TABLE IF NOT EXISTS groups (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(100) NOT NULL,
        description     TEXT,
        creator_id      UUID NOT NULL REFERENCES users(id),
        is_private      BOOLEAN NOT NULL DEFAULT FALSE,
        invite_code     VARCHAR(20) UNIQUE,
        max_members     INTEGER NOT NULL DEFAULT 50,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Group members
      CREATE TABLE IF NOT EXISTS group_members (
        group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role            VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      );

      -- Invite codes (for app access)
      CREATE TABLE IF NOT EXISTS invite_codes (
        code            VARCHAR(20) PRIMARY KEY,
        creator_id      UUID NOT NULL REFERENCES users(id),
        used_by         UUID REFERENCES users(id),
        expires_at      TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Refresh tokens
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash      VARCHAR(255) NOT NULL UNIQUE,
        expires_at      TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Push tokens for notifications
      CREATE TABLE IF NOT EXISTS push_tokens (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token           TEXT NOT NULL,
        platform        VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, token)
      );

      -- Temptation notification settings
      CREATE TABLE IF NOT EXISTS temptation_settings (
        user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled         BOOLEAN NOT NULL DEFAULT TRUE,
        intensity       VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (intensity IN ('low', 'medium', 'high')),
        quiet_start     TIME,
        quiet_end       TIME,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_events_user_timestamp ON events(user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_weekly_scores_user_week ON weekly_scores(user_id, week_start DESC);
      CREATE INDEX IF NOT EXISTS idx_weekly_scores_week_points ON weekly_scores(week_start, total_points DESC);
      CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_users_tracking_status ON users(tracking_status);
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_invite_codes_unused ON invite_codes(code) WHERE used_by IS NULL;

      -- Migrations table
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
    },
];

async function migrate() {
    console.log('🔄 Running migrations...');

    // Ensure migrations table exists
    await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

    for (const migration of migrations) {
        const result = await db.query(
            'SELECT name FROM migrations WHERE name = $1',
            [migration.name]
        );

        if (result.rows.length === 0) {
            console.log(`  Running: ${migration.name}`);
            await db.query(migration.sql);
            await db.query('INSERT INTO migrations (name) VALUES ($1)', [
                migration.name,
            ]);
            console.log(`  ✅ ${migration.name} complete`);
        } else {
            console.log(`  ⏭️  ${migration.name} (already applied)`);
        }
    }

    console.log('✅ Migrations complete');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
