import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: ['src/db/migrate.ts', 'src/db/seed.ts'],
        },
        setupFiles: ['./src/tests/setup.ts'],
    },
});
