import { afterEach, describe, expect, it, vi } from 'vitest';
import { playwrightPort } from '../../playwright.config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('playwright port configuration', () => {
  it('defaults to 4322 when PLAYWRIGHT_PORT is not set', () => {
    expect(playwrightPort({})).toBe(4322);
  });

  it('reads port from PLAYWRIGHT_PORT when set', () => {
    expect(playwrightPort({ PLAYWRIGHT_PORT: '4399' })).toBe(4399);
  });

  it('falls back to 4322 on invalid port string', () => {
    expect(playwrightPort({ PLAYWRIGHT_PORT: 'invalid' })).toBe(4322);
    expect(playwrightPort({ PLAYWRIGHT_PORT: '' })).toBe(4322);
    expect(playwrightPort({ PLAYWRIGHT_PORT: '-1' })).toBe(4322);
  });

  it('uses the configured port in playwright config baseURL and webServer', async () => {
    vi.resetModules();
    vi.stubEnv('PLAYWRIGHT_PORT', '4399');
    const config = (await import('../../playwright.config')).default;
    expect(config.use?.baseURL).toBe('http://localhost:4399');
    const webServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
    expect(webServer?.url).toBe('http://localhost:4399');
    expect(webServer?.command).toContain('--port 4399');
  });
});
