/** Integration smoke checks for the combined November staging merge train.
 *
 * This test lives on the integration branch rather than one of the older PR
 * heads so CI exercises the combined tree with the full browser suite.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupStructures } from '../../src/islands/anatomylab.ts';
import { validateUrl } from '../../src/islands/supabaseenv.ts';
import { selectEventPullRequest } from '../../scripts/automerge/event.ts';
import { REQUIRED_CHECKS, isHeldPath } from '../../scripts/automerge/decide.ts';
import { indexablePages } from '../../src/config/routes.ts';

describe('staging merge integration', () => {
  it('preserves original anatomy structure ID lookup and name lookup together', () => {
    const items = [
      { id: 'FMA7204', text: 'Left ventricle', group: 'heart' },
      { id: 'FMA7205', text: 'Right ventricle', group: 'heart' },
    ];
    expect(groupStructures(items, 'FMA7204').flatMap((x) => x.items.map((s) => s.id))).toEqual(['FMA7204']);
    expect(groupStructures(items, 'left vent').flatMap((x) => x.items.map((s) => s.id))).toEqual(['FMA7204']);
  });

  it('keeps the stricter local Supabase URL validation while allowing a valid local origin', () => {
    expect(validateUrl('http://localhost:54321')).toBe('http://localhost:54321');
    expect(validateUrl('http://localhost:54321/rest/v1')).toBeNull();
    expect(validateUrl('http://localhost:54321?debug=1')).toBeNull();
    expect(validateUrl('http://127.0.0.1:54321/#debug')).toBeNull();
  });

  it('keeps CI events scoped to a PR instead of scanning every open PR', () => {
    expect(selectEventPullRequest('workflow_run', { workflow_run: { pull_requests: [{ number: 599 }] } }))
      .toEqual({ kind: 'one', pr: 599 });
    expect(selectEventPullRequest('check_run', { check_run: { pull_requests: [] } }))
      .toEqual({ kind: 'none' });
    expect(selectEventPullRequest('schedule', {})).toEqual({ kind: 'sweep' });
  });

  it('holds legal release controls and account data-access boundaries in both automation modes', () => {
    const protectedPaths = [
      'src/pages/privacy.astro',
      'src/pages/terms.astro',
      'src/pages/disclaimer.astro',
      'src/config/routes.ts',
      'src/pages/auth/callback.astro',
      'src/pages/admin/flags.astro',
      'src/islands/supabaseclient.ts',
      'src/islands/checkanswer.ts',
      'src/islands/examplansync.ts',
      'src/islands/reviewsync.ts',
      'src/islands/studyrecorder.ts',
    ];
    for (const path of protectedPaths) {
      expect(isHeldPath(path, 'prelaunch'), path).toBe(true);
      expect(isHeldPath(path, 'launched'), path).toBe(true);
    }
    expect(isHeldPath('src/islands/cards.ts', 'prelaunch')).toBe(false);
  });

  it('keeps unfinished legal pages out of public and in-site indexes', () => {
    for (const name of ['privacy', 'terms', 'disclaimer']) {
      expect(indexablePages).not.toContain(`/${name}`);
      const page = readFileSync(new URL(`../../src/pages/${name}.astro`, import.meta.url), 'utf8');
      expect(page).toMatch(/<Layout\b[^>]*\bnoindex\b/);
    }
    const layout = readFileSync(new URL('../../src/layouts/Layout.astro', import.meta.url), 'utf8');
    expect(layout).toContain("data-pagefind-body={noindex ? undefined : ''}");
    expect(layout).toContain('content="noindex, nofollow"');
    expect(indexablePages).toContain('/support');
  });

  it('retains the production legal-copy prebuild guard and CodeQL merge requirement', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.prebuild).toBe('node scripts/check-legal-release.mjs');
    expect(REQUIRED_CHECKS).toContain('CodeQL');
  });
});
