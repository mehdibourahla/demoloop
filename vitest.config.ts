import { defineConfig } from 'vitest/config';

// web/ is a separate deployable with its own suite and jsdom environment; sweeping it
// in here collects its node_modules and runs its component tests without a DOM.
export default defineConfig({
  test: { fileParallelism: false, exclude: ['**/node_modules/**', '**/dist/**', 'web/**'] }
});
