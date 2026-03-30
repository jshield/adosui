import { defineConfig } from 'vitest/config';
import path from 'path';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'src': resolve(__dirname, 'src'),
    },
  },
});