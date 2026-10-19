import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The obsidian package ships types only; tests run against a thin fake of the API the plugin uses.
    alias: { obsidian: fileURLToPath(new URL('test/utils/obsidian-fake.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
