import { describe, expect, test } from 'vitest';
import { browserContextOptions } from '../src/runner.js';
import { ConfigSchema } from '../src/schemas.js';

describe('browser actor context', () => {
  test('uses the scenario locale and actor storage state', () => {
    const config = ConfigSchema.parse({
      app: { url: 'http://127.0.0.1:3005' },
      devices: { desktop: { width: 1440, height: 900 } }
    });

    const options = browserContextOptions(
      config,
      'desktop',
      { id: 'operator-console', label: 'Operator console', storageState: '/tmp/operator.json' },
      'en'
    );

    expect(options).toMatchObject({
      viewport: { width: 1440, height: 900 },
      locale: 'en',
      storageState: '/tmp/operator.json',
      colorScheme: 'light'
    });
  });
});
