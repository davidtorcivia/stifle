// Test setup file
// Runs before all tests

import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters';
});

afterAll(() => {
    // Cleanup if needed
});
