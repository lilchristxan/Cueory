import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRED_CHECKS, type CheckRun, type IssueComment, type PullRequest } from '../../scripts/automerge/decide.ts';
import { createGateWriter, nativeGateProblems, NATIVE_GATE_NAMES, publishNativeGate } from '../../scripts/automerge/native-gate.ts';

const HEAD = 'a'.repeat(40);
const REPO = 'owner/site';
const checks = (): CheckRun[] => REQUIRED_CHECKS.map((name, id) => ({
  name, id, status: 'completed', conclusion: 'success',
  app: { slug: name === 'CodeQL' ? 'github-advanced-security' : name === 'Workers Builds: cueory' ? 'cloudflare-workers-and-pages' : 'github-actions' },
}));
function comment(review = {}): IssueComment {
  return { id: 1, updated_at: '2026-11-06T00:00:00Z', user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
    body: '<!-- codex-review-state:v1 ' + JSON.stringify({ code_review: {
      commit_sha: HEAD, status: 'completed', has_any_findings: false, has_unresolved_findings: false, ...review,
    } }) + ' -->' };
}
function pull(over: Partial<PullRequest> = {}): PullRequest {
  return { number: 7, state: 'open', draft: false, title: 'Test', user: { login: 'owner' }, mergeable: true,
    head: { sha: HEAD, ref: 'task-7/test', repo: { full_name: REPO } }, base: { ref: 'staging', sha: 'b'.repeat(40) }, labels: [], ...over };
}
function fixture(pr = pull()) {
  const github = { pull: vi.fn().mockResolvedValue(pr), checks: vi.fn().mockResolvedValue(checks()), comments: vi.fn().mockResolvedValue([comment()]) };
  const writer = { start: vi.fn().mockResolvedValue(42), finish: vi.fn().mockResolvedValue(undefined) };
  return { repo: REPO, pr: 7, github, writer };
}

describe('native merge evidence', () => {
  it.each(['missing', 'pending', 'failure', 'neutral', 'skipped', 'timed_out', 'wrong-publisher'])('blocks required check %s', (state) => {
    const sample = checks();
    if (state === 'missing') sample.shift();
    else if (state === 'pending') sample[0]!.status = 'in_progress';
    else if (state === 'wrong-publisher') sample[0]!.app = { slug: 'untrusted' };
    else sample[0]!.conclusion = state;
    expect(nativeGateProblems(sample, [comment()], HEAD).length).toBeGreaterThan(0);
  });
  it.each([
    { status: 'failed' }, { status: 'running' }, { commit_sha: 'c'.repeat(40) },
    { has_any_findings: true }, { has_unresolved_findings: true }, { has_any_findings: null },
  ])('rejects incomplete/stale/finding receipts %j', (review) => {
    expect(nativeGateProblems(checks(), [comment(review)], HEAD).length).toBeGreaterThan(0);
  });
  it('rejects missing, malformed, forged and deleted receipts', () => {
    const forged = { ...comment(), user: { login: 'owner', type: 'User' } };
    for (const comments of [[], [forged], [{ ...comment(), body: '<!-- codex-review-state:v1 {broken} -->' }]]) {
      expect(nativeGateProblems(checks(), comments, HEAD).length).toBeGreaterThan(0);
    }
  });
  it('can recover from an older failed policy check without ignoring other failed checks', () => {
    const sample = [...checks(), ...NATIVE_GATE_NAMES.map((name, id) => ({ id: 100 + id, name, status: 'completed', conclusion: 'failure' }))];
    expect(nativeGateProblems(sample, [comment()], HEAD)).toEqual([]);
    sample.push({ id: 200, name: 'other security gate', status: 'completed', conclusion: 'failure' });
    expect(nativeGateProblems(sample, [comment()], HEAD)).not.toEqual([]);
  });
  it('uses the newest bot receipt, including an edit that revokes approval', () => {
    const failed = { ...comment({ status: 'failed' }), id: 2, updated_at: '2026-11-06T01:00:00Z' };
    expect(nativeGateProblems(checks(), [comment(), failed], HEAD)).not.toEqual([]);
  });
  it('publishes in-progress before reads and success only after a fresh PR read', async () => {
    const f = fixture();
    expect(await publishNativeGate(f)).toBe('success');
    expect(f.writer.start).toHaveBeenCalledWith(HEAD, 7, 'staging');
    expect(f.writer.start.mock.invocationCallOrder[0]).toBeLessThan(f.github.comments.mock.invocationCallOrder[0]!);
    expect(f.github.pull).toHaveBeenCalledTimes(2);
    expect(f.writer.finish).toHaveBeenCalledWith(42, []);
  });
  it.each(['head', 'base', 'draft', 'closed', 'fork', 'retarget'])('blocks a PR changed during the read: %s', async (change) => {
    const f = fixture();
    const current = pull();
    if (change === 'head') current.head.sha = 'c'.repeat(40);
    if (change === 'base') current.base.sha = 'c'.repeat(40);
    if (change === 'draft') current.draft = true;
    if (change === 'closed') current.state = 'closed';
    if (change === 'fork') current.head.repo = { full_name: 'fork/site' };
    if (change === 'retarget') current.base.ref = 'main';
    f.github.pull.mockResolvedValueOnce(pull()).mockResolvedValueOnce(current);
    expect(await publishNativeGate(f)).toBe('failure');
  });
  it.each(['fork', 'draft', 'closed', 'unsupported'])('does not publish for %s', async (kind) => {
    const pr = pull();
    if (kind === 'fork') pr.head.repo = { full_name: 'fork/site' };
    if (kind === 'draft') pr.draft = true;
    if (kind === 'closed') pr.state = 'closed';
    if (kind === 'unsupported') pr.base.ref = 'other';
    const f = fixture(pr);
    expect(await publishNativeGate(f)).toBe('skipped');
    expect(f.writer.start).not.toHaveBeenCalled();
    expect(f.github.comments).not.toHaveBeenCalled();
  });
  it('fails closed on API and pagination errors after starting the check', async () => {
    const f = fixture();
    f.github.comments.mockRejectedValue(new Error('truncated or rate limited'));
    expect(await publishNativeGate(f)).toBe('failure');
    expect(f.writer.finish).toHaveBeenCalledWith(42, expect.arrayContaining([expect.stringContaining('Could not read')]));
  });
  it('keeps staging and production check identities separate and requires release source staging', async () => {
    const f = fixture(pull({ base: { ref: 'main', sha: 'b'.repeat(40) } }));
    expect(await publishNativeGate(f)).toBe('failure');
    expect(f.writer.start).toHaveBeenCalledWith(HEAD, 7, 'main');
    const release = pull({ base: { ref: 'main', sha: 'b'.repeat(40) }, head: { sha: HEAD, ref: 'staging', repo: { full_name: REPO } } });
    expect(await publishNativeGate(fixture(release))).toBe('success');
  });
  it('does not report completion if Checks API publishing is unavailable', async () => {
    const f = fixture();
    f.writer.start.mockRejectedValue(new Error('403'));
    await expect(publishNativeGate(f)).rejects.toThrow('403');
    expect(f.github.checks).not.toHaveBeenCalled();
    expect(f.writer.finish).not.toHaveBeenCalled();
  });
});

describe('Checks API publisher and trusted workflow', () => {
  it('sends the exact head and branch-specific name, then explicit success/failure only', async () => {
    const bodies: unknown[] = [];
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ id: 42 }), { status: 201 });
    });
    const writer = createGateWriter(REPO, 'test-token', fetch);
    expect(await writer.start(HEAD, 7, 'main')).toBe(42);
    await writer.finish(42, []);
    await writer.finish(42, ['missing review']);
    expect(bodies[0]).toMatchObject({ head_sha: HEAD, name: 'Cueory merge policy (main)', status: 'in_progress' });
    expect(bodies[1]).toMatchObject({ status: 'completed', conclusion: 'success' });
    expect(bodies[2]).toMatchObject({ status: 'completed', conclusion: 'failure' });
  });
  it('does not expose response bodies or credentials when the API fails', async () => {
    const fetch = vi.fn(async () => new Response('private response detail', { status: 403 }));
    await expect(createGateWriter(REPO, 'secret-test-value', fetch).start(HEAD, 7, 'staging')).rejects.toThrow('Checks API POST failed with HTTP 403');
  });
  it('uses default-branch control code, minimal permissions, and no PR checkout/install/merge/deploy', () => {
    const workflow = readFileSync('.github/workflows/merge-policy-gate.yml', 'utf8');
    expect(workflow).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('checks: write');
    expect(workflow).toContain('types: [created, edited, deleted]');
    expect(workflow).not.toMatch(/contents: write|pull-requests: write|issues: write|pull_request_target|npm ci|wrangler|head\.sha/);
    expect(workflow).toContain("github.event.comment.user.login == 'chatgpt-codex-connector[bot]'");
  });
});
