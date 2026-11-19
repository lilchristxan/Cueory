import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKS } from '../../scripts/automerge/decide';

/**
 * Task 308: the browser tests run in parts, and one check still stands for all of CI's build and test work.
 * The parts of one run must always cover every test exactly once, in Chromium and in each Release engine.
 */
const yml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

/** The text of one job, from its key to the next job's key. */
function job(id: string): string {
  const start = yml.indexOf(`\n  ${id}:\n`);
  expect(start, `job ${id}`).toBeGreaterThan(-1);
  const next = yml.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next === -1 ? yml.slice(start) : yml.slice(start, start + 1 + next);
}

describe('CI workflow', () => {
  it('keeps the required check name on the job that waits for every part', () => {
    expect(REQUIRED_CHECKS).toContain('Type check, build and test');
    const verify = job('verify');
    expect(verify).toContain('name: Type check, build and test');
    expect(verify).toContain('needs: [checks, browser, engines]');
    expect(verify).toContain('if [ "$MAIN_RELEASE_PR" = "true" ] && [ "$ENGINES" != "success" ]; then');
    // It must run (and fail) when a part failed, so it can't use the default success() condition.
    expect(verify).toContain('!cancelled()');
    expect(verify).toContain('if [ "$CHECKS" != "success" ]; then');
    expect(verify).toContain('if [ "$BROWSER" != "success" ]; then');
    // Browser tests may be skipped only for a Markdown-only pull request.
    expect(verify).toContain('if [ "$DOCS_ONLY" = "true" ] && [ "$BROWSER" = "skipped" ]; then exit 0; fi');
  });

  it('runs every part of the browser tests, each with its own time limit', () => {
    const browser = job('browser');
    expect(browser).toContain('needs: checks');
    expect(browser).toMatch(/timeout-minutes: \d+/);
    expect(browser).toContain('fail-fast: false');
    expect(browser).toContain('SHARDS: ${{ strategy.job-total }}');
    // Both branches of the project choice run only this part.
    expect(browser.match(/--shard="\$SHARD\/\$SHARDS"/g)).toHaveLength(2);
  });

  it('runs twice the Chromium parts when every project runs, by the same condition that picks the projects', () => {
    const checks = job('checks');
    const browser = job('browser');
    // One condition decides both the projects (two for a staging pull request, all four otherwise) and the parts.
    const stagingPullRequest = 'if [ "$GITHUB_EVENT_NAME" = "pull_request" ] && [ "$GITHUB_BASE_REF" = "staging" ]; then';
    expect(checks).toContain(
      `${stagingPullRequest}\n            echo "browser_parts=[1, 2, 3, 4]" >> "$GITHUB_OUTPUT"\n          else\n` +
        '            echo "browser_parts=[1, 2, 3, 4, 5, 6, 7, 8]" >> "$GITHUB_OUTPUT"\n          fi',
    );
    expect(browser).toContain(
      `${stagingPullRequest}\n            npm run test:e2e -- --project=phone --project=desktop --shard="$SHARD/$SHARDS"\n          else\n` +
        '            npm run test:e2e -- --shard="$SHARD/$SHARDS"\n          fi',
    );
    expect(checks).toContain('browser_parts: ${{ steps.scope.outputs.browser_parts }}');
    expect(browser).toContain("shard: ${{ fromJSON(needs.checks.outputs.browser_parts || '[1, 2, 3, 4]') }}");
    // Every list of parts counts 1, 2, 3 ... with no gap. The total is the number of jobs (checked above), so the
    // parts of one run always cover every test exactly once.
    const lists = [...`${checks}${browser}`.matchAll(/\[(\d+(?:, \d+)*)\]/g)].map((m) => m[1].split(', ').map(Number));
    expect(lists).toHaveLength(3);
    for (const list of lists) expect(list).toEqual(list.map((_, i) => i + 1));
  });

  it('runs each Safari and Firefox project in parts that together cover every test', () => {
    const engines = job('engines');
    const total = Number(/^ {6}ENGINE_PARTS: (\d+)$/m.exec(engines)?.[1]);
    const parts = /^ {8}shard: \[(\d+(?:, \d+)*)\]$/m.exec(engines)?.[1].split(', ').map(Number);
    // The matrix lists parts 1 to ENGINE_PARTS, and both ways of starting the tests run exactly one of them.
    expect(total).toBeGreaterThan(1);
    expect(parts).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(engines).toContain('SHARD: ${{ matrix.shard }}');
    expect(engines.match(/npm run test:e2e -- --project="\$PROJECT" --shard="\$SHARD\/\$ENGINE_PARTS"$/gm)).toHaveLength(2);
    expect(engines.match(/npm run test:e2e/g)).toHaveLength(2);
    // Every project is split, has its engine named, and one failing part does not stop the others.
    const projects = ['webkit-phone', 'webkit-desktop', 'firefox-desktop'];
    expect(engines).toContain(`project: [${projects.join(', ')}]`);
    for (const project of projects) {
      const engine = project.startsWith('firefox') ? 'firefox' : 'webkit';
      expect(engines).toContain(`          - project: ${project}\n            browser: ${engine}\n`);
    }
    expect(engines).toContain('fail-fast: false');
    expect(engines).toMatch(/timeout-minutes: \d+/);
    // Parts of the same project need different names for their jobs and their saved reports.
    expect(engines).toContain('name: Browser tests in ${{ matrix.project }}, part ${{ matrix.shard }}');
    expect(engines).toContain('name: playwright-report-${{ matrix.project }}-part-${{ matrix.shard }}');
  });

  it('gives no job more than read access and pins every action to a full commit SHA', () => {
    expect(yml.match(/permissions:/g)).toHaveLength(1);
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    for (const use of yml.match(/uses: \S+/g) ?? []) expect(use).toMatch(/@[0-9a-f]{40}$/);
  });
});
