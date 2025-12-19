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
  {
    name: '002_admin_functionality',
    sql: `
      -- Add role column to users (admin vs regular user)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) 
        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

      -- Update existing admin user to have admin role
      UPDATE users SET role = 'admin' WHERE username = 'admin';

      -- App settings table (key-value store for configuration)
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Audit log for admin actions
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID NOT NULL REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id UUID,
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Database backups tracking
      CREATE TABLE IF NOT EXISTS backups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        size_bytes BIGINT NOT NULL DEFAULT 0,
        type VARCHAR(20) NOT NULL CHECK (type IN ('manual', 'scheduled')),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      -- Indexes for admin tables
      CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      -- Insert default app settings
      INSERT INTO app_settings (key, value) VALUES
        ('smtp', '{"host": "", "port": 587, "user": "", "pass": "", "from": "noreply@stifleapp.com", "enabled": false}'::jsonb),
        ('backup', '{"autoEnabled": false, "keepLast": 10, "scheduleHour": 3}'::jsonb),
        ('app', '{"registrationOpen": false, "maintenanceMode": false}'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    name: '003_friendships',
    sql: `
      -- Friendships table for friend connections
      -- status: pending = request sent, accepted = mutual friends, declined = request rejected
      CREATE TABLE IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (requester_id, addressee_id),
        CHECK (requester_id != addressee_id)
      );

      -- Indexes for friendship queries
      CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
      CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
      
      -- Index for finding accepted friendships for leaderboard
      CREATE INDEX IF NOT EXISTS idx_friendships_accepted ON friendships(status) WHERE status = 'accepted';
    `,
  },
  {
    name: '002_user_timezone',
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS timezone_changed_at TIMESTAMPTZ;
    `,
  },
  {
    name: '004_privacy_settings',
    sql: `
        -- Privacy settings
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT TRUE;
      `,
  },
  {
    name: '005_fix_temptation_columns',
    sql: `
        -- Fix temptation_settings column names to match code expectations
        -- Rename quiet_start -> quiet_hours_start, quiet_end -> quiet_hours_end
        DO $$ 
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'temptation_settings' AND column_name = 'quiet_start') THEN
                ALTER TABLE temptation_settings RENAME COLUMN quiet_start TO quiet_hours_start;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'temptation_settings' AND column_name = 'quiet_end') THEN
                ALTER TABLE temptation_settings RENAME COLUMN quiet_end TO quiet_hours_end;
            END IF;
        END $$;
        
        -- Add quiet_hours columns if they don't exist (for fresh installs after this fix)
        ALTER TABLE temptation_settings ADD COLUMN IF NOT EXISTS quiet_hours_start TIME DEFAULT '22:00';
        ALTER TABLE temptation_settings ADD COLUMN IF NOT EXISTS quiet_hours_end TIME DEFAULT '08:00';
        
        -- Add frequency_minutes column if it doesn't exist
        ALTER TABLE temptation_settings ADD COLUMN IF NOT EXISTS frequency_minutes INTEGER NOT NULL DEFAULT 120;
      `,
  },
  {
    name: '006_fix_push_tokens_constraint',
    sql: `
        -- Fix push_tokens unique constraint to match code expectations
        -- Code uses ON CONFLICT (user_id, platform) but table had UNIQUE (user_id, token)
        
        -- Drop the old constraint if it exists
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'push_tokens_user_id_token_key'
            ) THEN
                ALTER TABLE push_tokens DROP CONSTRAINT push_tokens_user_id_token_key;
            END IF;
        END $$;
        
        -- Add the correct constraint (one token per user per platform)
        -- First, clean up any duplicate platform entries per user (keep newest)
        DELETE FROM push_tokens a USING push_tokens b
        WHERE a.user_id = b.user_id 
          AND a.platform = b.platform 
          AND a.updated_at < b.updated_at;
        
        -- Now add the unique constraint
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'push_tokens_user_id_platform_key'
            ) THEN
                ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_user_id_platform_key UNIQUE (user_id, platform);
            END IF;
        END $$;
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
