import { db } from './client.js';
import crypto from 'crypto';

/**
 * Seed script to set up initial data for development/testing
 * Creates: admin user, initial invite codes
 */

// Simple password hashing (same as auth.ts)
function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function generateInviteCode(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function seed() {
    console.log('🌱 Seeding database...\n');

    // Check if already seeded
    const existingUser = await db.query(
        "SELECT id FROM users WHERE username = 'admin'"
    );

    if (existingUser.rows.length > 0) {
        console.log('⏭️  Database already seeded (admin user exists)');
        console.log('   To re-seed, delete the admin user first.\n');

        // Still print invite codes
        const codes = await db.query(
            "SELECT code FROM invite_codes WHERE used_by IS NULL AND expires_at > NOW()"
        );

        if (codes.rows.length > 0) {
            console.log('📧 Available invite codes:');
            codes.rows.forEach((row: { code: string }) => console.log(`   ${row.code}`));
        }

        process.exit(0);
    }

    // Create admin user
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = hashPassword(adminPassword);

    const adminResult = await db.query(
        `INSERT INTO users (username, email, password_hash, platform, timezone, tracking_status)
     VALUES ('admin', 'admin@stifle.app', $1, 'android', 'UTC', 'verified')
     RETURNING id`,
        [passwordHash]
    );

    const adminId = adminResult.rows[0].id;
    console.log('✅ Created admin user');
    console.log(`   Email: admin@stifle.app`);
    console.log(`   Password: ${adminPassword}`);
    console.log('');

    // Create default temptation settings for admin
    await db.query(
        'INSERT INTO temptation_settings (user_id) VALUES ($1)',
        [adminId]
    );

    // Create initial invite codes
    const inviteCodes: string[] = [];
    for (let i = 0; i < 5; i++) {
        const code = generateInviteCode();
        await db.query(
            `INSERT INTO invite_codes (code, creator_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
            [code, adminId]
        );
        inviteCodes.push(code);
    }

    console.log('📧 Created invite codes (valid for 90 days):');
    inviteCodes.forEach(code => console.log(`   ${code}`));
    console.log('');

    // Create a sample group
    const groupCode = generateInviteCode().substring(0, 8);
    const groupResult = await db.query(
        `INSERT INTO groups (name, description, creator_id, is_private, invite_code)
     VALUES ('Friends', 'Default group for friends', $1, true, $2)
     RETURNING id`,
        [adminId, groupCode]
    );

    // Add admin to the group as owner
    await db.query(
        `INSERT INTO group_members (group_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
        [groupResult.rows[0].id, adminId]
    );

    console.log('👥 Created sample group "Friends"');
    console.log(`   Group invite code: ${groupCode}`);
    console.log('');

    console.log('✅ Seeding complete!\n');
    console.log('Next steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Use one of the invite codes above to register a new user');
    console.log('3. Or login as admin with the credentials shown above\n');

    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
