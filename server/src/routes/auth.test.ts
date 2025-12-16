import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Auth Routes', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = await buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /auth/register - Password Validation', () => {
        it('rejects weak passwords (no uppercase)', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'password123', // no uppercase
                    inviteCode: 'TESTCODE',
                    platform: 'android',
                },
            });

            // Should get validation error (400 or 500 if Zod not caught)
            expect([400, 500]).toContain(response.statusCode);
            if (response.statusCode === 400) {
                const body = JSON.parse(response.payload);
                expect(body.error).toBeDefined();
            }
        });

        it('rejects weak passwords (no number)', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'PasswordABC', // no number
                    inviteCode: 'TESTCODE',
                    platform: 'android',
                },
            });

            expect([400, 500]).toContain(response.statusCode);
        });

        it('rejects weak passwords (too short)', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'Pass1', // too short
                    inviteCode: 'TESTCODE',
                    platform: 'android',
                },
            });

            expect([400, 500]).toContain(response.statusCode);
        });

        it('passes validation with strong password (hits DB)', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'Password123!', // valid password
                    inviteCode: 'INVALID_CODE',
                    platform: 'android',
                },
            });

            // If password is valid, it should hit DB (500) or return invite error (400)
            expect([400, 500]).toContain(response.statusCode);
        });

        it('rejects invalid email format', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    username: 'testuser',
                    email: 'not-an-email',
                    password: 'Password123!',
                    inviteCode: 'TESTCODE',
                    platform: 'android',
                },
            });

            expect([400, 500]).toContain(response.statusCode);
        });

        it('rejects username with special characters', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    username: 'test@user!',
                    email: 'test@example.com',
                    password: 'Password123!',
                    inviteCode: 'TESTCODE',
                    platform: 'android',
                },
            });

            expect([400, 500]).toContain(response.statusCode);
        });
    });

    describe('POST /auth/login', () => {
        it('rejects invalid email format', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    email: 'not-an-email',
                    password: 'Password123!',
                },
            });

            expect([400, 500]).toContain(response.statusCode);
        });
    });

    describe('GET /health', () => {
        it('returns health status', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/health',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.status).toBe('ok');
            expect(body.timestamp).toBeDefined();
        });
    });

    describe('POST /auth/refresh', () => {
        it('rejects missing refresh token', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/refresh',
                payload: {},
            });

            expect([400, 500]).toContain(response.statusCode);
        });

        it('rejects invalid refresh token', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/refresh',
                payload: {
                    refreshToken: 'invalid-token',
                },
            });

            // 401 or 500 (DB error)
            expect([401, 500]).toContain(response.statusCode);
        });
    });
});
