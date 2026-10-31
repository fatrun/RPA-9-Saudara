import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      DATABASE_URL: 'memory',
      NODE_ENV: 'test',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
