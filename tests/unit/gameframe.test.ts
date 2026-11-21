import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatGameDateLine } from '../../src/scripts/gamedateline';

describe('GameFrame (Scope 1)', () => {
  const root = resolve(__dirname, '../..');

  it('provides the GameFrame Astro component and layout', () => {
    expect(existsSync(resolve(root, 'src/components/GameFrame.astro'))).toBe(true);
    expect(existsSync(resolve(root, 'src/layouts/GameFrame.astro'))).toBe(true);
    const content = readFileSync(resolve(root, 'src/components/GameFrame.astro'), 'utf-8');
    // Left panel: 240px sidebar, back link, logo PNG, game icon, wordmark, tagline, stats
    expect(content).toContain('game-frame-sidebar');
    expect(content).toContain('href="/play"');
    expect(content).toContain('aria-label="all games"');
    expect(content).toContain('logo-full-light-960.png');
    expect(content).toContain('GameFrameStats');
    // Date line and controls
    expect(content).toContain('game-frame-dateline');
    expect(content).toContain('GameFrameControls');
  });

  it('formats lowercase italic date line according to the design spec', () => {
    const fixedDate = new Date('2026-11-20T12:00:00Z');
    const formatted = formatGameDateLine(fixedDate, 312);
    expect(formatted).toBe('friday, november 20th · #312');
  });

  it('GameFrameControls provides gear, help popover, and middle slot', () => {
    const controlsCode = readFileSync(resolve(root, 'src/islands/GameFrameControls.tsx'), 'utf-8');
    expect(controlsCode).toContain('data-testid="game-frame-gear"');
    expect(controlsCode).toContain('data-testid="game-frame-help-button"');
    expect(controlsCode).toContain('game-frame-controls-middle');
    expect(controlsCode).toContain('game-frame-popover');
    expect(controlsCode).toContain('game-frame-legend');
  });

  it('GameFrameStats renders % solved, current streak, best streak, and played', () => {
    const statsCode = readFileSync(resolve(root, 'src/islands/GameFrameStats.tsx'), 'utf-8');
    expect(statsCode).toContain('% solved');
    expect(statsCode).toContain('current streak');
    expect(statsCode).toContain('best streak');
    expect(statsCode).toContain('played');
  });

  it('defines the required design tokens in tokens.css', () => {
    const tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf-8');
    expect(tokens).toContain('--game-oxblood: #6e2019;');
    expect(tokens).toContain('--game-dark-green: #0e5a3d;');
    expect(tokens).toContain('--game-frame-sidebar-width');
    expect(tokens).toContain('--game-frame-btn-size');
  });
});
