import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/anatomy-phone-benchmark.mjs', import.meta.url));

function invalidRun(overrides: Record<string, string>) {
  // These fail in CLI validation, before launching or downloading any browser.
  return spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      ANATOMY_BENCH_URL: 'http://127.0.0.1:4322/preview/anatomy-lab',
      ANATOMY_BENCH_ENGINES: 'chromium',
      ANATOMY_BENCH_ROUNDS: '1',
      ...overrides,
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

describe('Anatomy Lab manual phone benchmark safety', () => {
  it('refuses unsupported browser engines before launching a browser', () => {
    const result = invalidRun({ ANATOMY_BENCH_ENGINES: 'chromium,unknown' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ANATOMY_BENCH_ENGINES must contain chromium and/or webkit.');
  });

  it('rejects an explicitly empty browser-engine setting', () => {
    const result = invalidRun({ ANATOMY_BENCH_ENGINES: '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ANATOMY_BENCH_ENGINES must contain chromium and/or webkit.');
  });

  it('bounds repeated test rounds instead of running indefinitely', () => {
    for (const count of ['', '0', '11', '2.5', 'NaN']) {
      const result = invalidRun({ ANATOMY_BENCH_ROUNDS: count });
      expect(result.status, count).toBe(1);
      expect(result.stderr, count).toContain('ANATOMY_BENCH_ROUNDS must be an integer from 1 to 10.');
    }
  });

  it('will not benchmark the production site address by mistake', () => {
    const result = invalidRun({ ANATOMY_BENCH_URL: 'https://cueory.app/' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Only the unpublished /preview/anatomy-lab route on loopback may be benchmarked.');
  });

  it('rejects remote preview lookalikes and query-bearing URLs', () => {
    for (const address of [
      'https://example.com/preview/anatomy-lab',
      'http://127.0.0.1:4322/preview/anatomy-lab?publish=1',
      'http://user:secret@localhost:4322/preview/anatomy-lab',
    ]) {
      const result = invalidRun({ ANATOMY_BENCH_URL: address });
      expect(result.status, address).toBe(1);
      expect(result.stderr, address).toContain('on loopback may be benchmarked.');
    }
  });

  it('rejects non-web URLs', () => {
    const result = invalidRun({ ANATOMY_BENCH_URL: 'file:///etc/passwd' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ANATOMY_BENCH_URL must be an HTTP(S) address.');
  });
});
