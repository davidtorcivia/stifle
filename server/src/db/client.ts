import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const db = new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Helper for typed queries
export async function query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
): Promise<pg.QueryResult<T>> {
    return db.query<T>(text, params);
}
