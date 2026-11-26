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
    expect(content).toContain('/brand/v1/logo-full-light-480.png');
    expect(content).toContain('/brand/v1/logo-full-dark-480.png');
    // The 80 px Frame logo must not reuse the share image's 960 px logo: WebKit would then serve the share image's logo
    // from memory cache, and the "preparing image" state in game-results.spec.ts could never be observed.
    const share = readFileSync(resolve(root, 'src/islands/share.ts'), 'utf-8');
    for (const url of share.match(/\/brand\/v1\/logo-full-[a-z]+-\d+\.png/g) ?? []) expect(content).not.toContain(url);
    expect(content).toContain('GameFrameStats');
    // Date line and controls
    expect(content).toContain('game-frame-dateline');
    expect(content).toContain('GameFrameControls');
    expect(content).toContain('data-game-frame-dateline');
    expect(content).toContain('formatGameDateLine(new Date())');
  });

  it('formats lowercase italic date line according to the design spec', () => {
    const fixedDate = new Date('2026-11-20T12:00:00Z');
    const formatted = formatGameDateLine(fixedDate, 312);
    expect(formatted).toBe('friday, november 20th · #312');
  });

  it('GameFrameControls owns visible controls and dispatches to the framed island dialogs', () => {
    const controlsCode = readFileSync(resolve(root, 'src/islands/GameFrameControls.tsx'), 'utf-8');
    expect(controlsCode).toContain('data-testid="game-frame-gear"');
    expect(controlsCode).toContain('data-testid="game-frame-help-button"');
    expect(controlsCode).toContain('game-frame-controls-middle');
    expect(controlsCode).toContain("'cueory:game-frame-settings'");
    expect(controlsCode).toContain("'cueory:game-frame-help'");
    expect(controlsCode).toContain("'cueory:game-frame-help-ready'");
    expect(controlsCode).toContain('bridge = false');
    expect(controlsCode).toContain('game-frame-popover');
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
    expect(tokens).toContain('--game-frame-logo-width: 6rem;');
    expect(tokens).toContain('--game-frame-dateline-lh: 1.3125rem;');
  });

  it('keeps theme utilities in control of the sidebar logo visibility', () => {
    const styles = readFileSync(resolve(root, 'src/styles/gameframe.css'), 'utf-8');
    expect(styles).toMatch(/\.game-frame-logo\s*\{[^}]*width: var\(--game-frame-logo-width\);/s);
    expect(styles).not.toMatch(/\.game-frame-logo\s*\{[^}]*display:/s);
  });

  it('refreshes sidebar stats only after the shared history has changed', () => {
    const statsCode = readFileSync(resolve(root, 'src/islands/GameFrameStats.tsx'), 'utf-8');
    const resultCode = readFileSync(resolve(root, 'src/islands/gameresults.ts'), 'utf-8');
    const panelCode = readFileSync(resolve(root, 'src/islands/GameStatsPanel.tsx'), 'utf-8');
    expect(statsCode).toContain('GAME_STATS_CHANGED_EVENT');
    expect(statsCode).not.toContain('GAME_RESULT_EVENT');
    expect(resultCode).toContain("'cueory:game-stats-changed'");
    expect(panelCode).toContain('reportStatsChanged()');
    expect(statsCode).toContain("addEventListener('pageshow', onPageShow)");
    expect(statsCode).toContain('if (event.persisted) refresh()');
  });

  it('surfaces framed persistence status without mounting a second stats panel', () => {
    const statsCode = readFileSync(resolve(root, 'src/islands/GameFrameStats.tsx'), 'utf-8');
    const resultCode = readFileSync(resolve(root, 'src/islands/gameresults.ts'), 'utf-8');
    const panelCode = readFileSync(resolve(root, 'src/islands/GameStatsPanel.tsx'), 'utf-8');
    expect(resultCode).toContain("'cueory:game-stats-status'");
    expect(panelCode).toContain('reportStatsStatus');
    expect(statsCode).toContain('game-frame-stats-status');
    expect(statsCode).toContain("role=\"status\"");
  });

  it('keeps framed interface text upright, readable, and inside the shell', () => {
    const styles = readFileSync(resolve(root, 'src/styles/gameframe.css'), 'utf-8');
    expect(styles).toMatch(/\.game-frame-serif-title\s*\{[^}]*font-family:\s*var\(--font-body\);[^}]*line-height:\s*1\.5;/s);
    expect(styles).toMatch(/\.game-frame-dateline\s*\{[^}]*font-style:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s);
    expect(styles).toContain('max-inline-size: 100%');
    expect(styles).toMatch(/\.game-frame-board\s*\{\s*--wordpath-bleed: calc\(var\(--spacing\) \* 3\);/s);
  });

  it('keeps Sudoku-owned stats out of the shared framed stats lifecycle', () => {
    const frame = readFileSync(resolve(root, 'src/components/GameFrame.astro'), 'utf-8');
    const statsCode = readFileSync(resolve(root, 'src/islands/GameFrameStats.tsx'), 'utf-8');
    expect(frame).not.toContain("currentConfig.id === 'triage' && <>");
    expect(frame).not.toContain('SudokuFrameStats');
    expect(frame).not.toContain('Sudoku level statistics appear when JavaScript is available.');
    expect(statsCode).not.toContain('lazy(');
    expect(statsCode).not.toContain('Suspense');
  });

  it('uses the crossword assisted-solve eligibility for the sidebar best streak', () => {
    const statsCode = readFileSync(resolve(root, 'src/islands/GameFrameStats.tsx'), 'utf-8');
    expect(statsCode).toContain("id === 'cueword' ? longestStreak(stats, id) : ds.longestStreak");
  });

  it('makes framing an explicit route opt-in and retains legacy controls elsewhere', () => {
    const frame = readFileSync(resolve(root, 'src/components/GameFrame.astro'), 'utf-8');
    const page = readFileSync(resolve(root, 'src/components/GamePage.astro'), 'utf-8');
    const helloCards = readFileSync(resolve(root, 'src/pages/play/hello-cards.astro'), 'utf-8');
    const header = readFileSync(resolve(root, 'src/islands/GameHeader.tsx'), 'utf-8');
    expect(frame).toContain('framed = true');
    // Stats are signed-in only (2026-11-25): no static zeros in the page markup, the island draws the panel itself.
    expect(frame).not.toContain('staticNoScoreStats');
    expect(frame).not.toContain('class="game-frame-stats"');
    expect(frame).toContain('<GameFrameStats client:load game={currentConfig.id} />');
    expect(helloCards).toContain('<GameFrame game="hello-cards">');
    expect(page).toContain('framed = false');
    // The four stats sit in the frame's left panel on every game page, so no separate stats block follows the frame.
    expect(page).not.toContain('game-page-stats-container');
    expect(page).toContain('bridge={framed} stats>');
    expect(page).toContain('<GameStatsPersistence client:only="react" />');
    expect(page).toContain('finish a game with JavaScript to keep its result in this browser.');
    expect(header).toContain('GAME_FRAME_SETTINGS_EVENT');
    expect(header).toContain('GAME_FRAME_HELP_EVENT');
    expect(header).toContain('<GameHelpDialog help={help} name={name} extra={helpExtra} />');
    const sudoku = readFileSync(resolve(root, 'src/islands/SudokuGame.tsx'), 'utf-8');
    expect(sudoku).toContain('<GameHelpButton help={help} name={gameName(\'triage\')} className="sudoku-icon-button" />');
    expect(header).toContain('{framed && end &&');
  });

  it('keeps Frame interface text in upright Lato at readable line spacing, and lets the dateline wrap', () => {
    const css = readFileSync(resolve(root, 'src/styles/gameframe.css'), 'utf-8');
    const astro = readFileSync(resolve(root, 'src/components/GameFrame.astro'), 'utf-8');
    const block = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    const title = block('.game-frame-serif-title');
    expect(title).toContain('font-family: var(--font-body)');
    expect(title).toContain('line-height: 1.5');
    const date = block('.game-frame-dateline');
    expect(date).toContain('font-style: normal');
    expect(date).not.toContain('italic');
    expect(date).toContain('white-space: normal');
    expect(date).not.toContain('nowrap');
    expect(astro).not.toMatch(/data-game-frame-dateline[^>]*><i>/);
    expect(block('.game-frame-stats-status')).toContain('line-height: 1.5');
  });

  it('gives Word Path its Frame gutter back so phone cells keep the 44px floor', () => {
    const css = readFileSync(resolve(root, 'src/styles/gameframe.css'), 'utf-8');
    // Below 30rem the gutter is 3 units, from 30rem to 64rem it is 4; the panel's bleed matches each (sm:mx-0 from 40rem).
    expect(css).toMatch(/@media \(width < 30rem\)[\s\S]*\.game-frame-board \{\s*--wordpath-bleed: calc\(var\(--spacing\) \* 3\);/);
    expect(css).toMatch(/@media \(width < 64rem\)[\s\S]*\.game-frame-board \{\s*--wordpath-bleed: calc\(var\(--spacing\) \* 4\);/);
    expect(css).toMatch(/\.game-frame-stat-value \{[^}]*line-height: 1\.5;/);
    for (const file of ['src/islands/SutureGame.tsx', 'src/islands/SuturePathBoard.tsx']) {
      expect(readFileSync(resolve(root, file), 'utf-8')).toContain('wordpath-panel -mx-(--wordpath-bleed) ');
    }
  });

  it('switches from the plain row of cards to the deck at the one token width (70rem)', () => {
    const tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf-8');
    const css = readFileSync(resolve(root, 'src/styles/gameframe.css'), 'utf-8');
    expect(/--breakpoint-deck:\s*70rem/.test(tokens)).toBe(true);
    // The plain-row rules use the token's variant, never a raw width.
    const block = css.slice(css.indexOf('@variant max-deck'));
    expect(block.startsWith('@variant max-deck')).toBe(true);
    expect(block.slice(0, block.indexOf('/* ----------------', 10))).toContain('.game-frame-deck-slot');
    expect(css).not.toMatch(/70rem\)/);
  });
});

