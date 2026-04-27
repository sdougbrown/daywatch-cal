import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['**/__tests__/**/*.test.ts'],
    globals: true,
  },
});
