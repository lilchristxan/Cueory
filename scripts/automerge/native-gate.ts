/** Native-check adapter for the existing strict check and independent-review policy (#585).
 * Runs only the default branch's reviewed code; never downloads or executes PR files.
 * https://docs.github.com/en/rest/checks/runs
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkProblems, codexProblems, codexState, type CheckRun, type IssueComment } from './decide.ts';
import { createGitHub, type Fetch, type GitHub } from './github.ts';
import { selectEventPullRequest } from './event.ts';

export const NATIVE_GATE_NAMES = ['Cueory merge policy (staging)', 'Cueory merge policy (main)'] as const;

/** The gate must ignore its own previous failure, or it could never recover after a clean review. */
export function nativeGateProblems(checks: readonly CheckRun[], comments: readonly IssueComment[], head: string): string[] {
  return [
    ...checkProblems(checks.filter((check) => !(NATIVE_GATE_NAMES as readonly string[]).includes(check.name))),
    ...codexProblems(codexState(comments), head),
  ];
}

export interface GateWriter {
  start(sha: string, pr: number, base: 'staging' | 'main'): Promise<number>;
  finish(id: number, problems: readonly string[]): Promise<void>;
}

/** A write-only Checks API client. Never log headers, tokens, or arbitrary response bodies. */
export function createGateWriter(repo: string, token: string, fetch: Fetch = globalThis.fetch): GateWriter {
  async function call(method: string, path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Checks API ${method} failed with HTTP ${response.status}`);
    return response.json();
  }
  return {
    async start(sha, pr, base) {
      const result = await call('POST', '/check-runs', {
        name: `Cueory merge policy (${base})`,
        head_sha: sha,
        external_id: `cueory-policy-pr-${pr}`,
        status: 'in_progress',
        output: { title: 'Checking current evidence', summary: 'Reading trusted check results and the independent Codex receipt.' },
      }) as { id?: unknown };
      if (typeof result.id !== 'number' || !Number.isSafeInteger(result.id) || result.id <= 0) {
        throw new Error('Checks API returned no valid check id');
      }
      return result.id;
    },
    async finish(id, problems) {
      await call('PATCH', `/check-runs/${id}`, {
        status: 'completed',
        conclusion: problems.length === 0 ? 'success' : 'failure',
        output: {
          title: problems.length === 0 ? 'Required evidence passed' : 'Required evidence is not complete',
          summary: problems.length === 0
            ? 'All required checks succeeded from their trusted publishers and Codex completed a finding-free review of this exact head. Founder holds and native branch rules still apply.'
            : 'Merge remains blocked.\n\n' + problems.map((problem) => `- ${problem}`).join('\n').slice(0, 60_000),
        },
      });
    },
  };
}

type GateGitHub = Pick<GitHub, 'pull' | 'checks' | 'comments'>;

export async function publishNativeGate({ repo, pr: number, github, writer }: {
  repo: string; pr: number; github: GateGitHub; writer: GateWriter;
}): Promise<'skipped' | 'success' | 'failure'> {
  const pr = await github.pull(number);
  if (pr.state !== 'open' || pr.draft || pr.head.repo?.full_name !== repo || !['staging', 'main'].includes(pr.base.ref)) {
    return 'skipped';
  }
  if (!/^[a-f0-9]{40}$/i.test(pr.head.sha)) throw new Error('Invalid PR head SHA');
  // Publish a blocking result before reading evidence, replacing any older green result on this head.
  const id = await writer.start(pr.head.sha, number, pr.base.ref as 'staging' | 'main');
  try {
    const [checks, comments] = await Promise.all([github.checks(pr.head.sha), github.comments(number)]);
    const problems = nativeGateProblems(checks, comments, pr.head.sha);
    if (pr.base.ref === 'main' && pr.head.ref !== 'staging') problems.push('Production release PR must come from staging');
    if (!pr.base.sha) problems.push('Cannot verify the base commit');
    // A delayed CI/review event must not approve a head/base that has since changed or a now-held draft.
    const current = await github.pull(number);
    if (current.state !== 'open' || current.draft || current.head.repo?.full_name !== repo ||
        current.head.sha !== pr.head.sha || current.base.sha !== pr.base.sha || current.base.ref !== pr.base.ref ||
        current.head.ref !== pr.head.ref) problems.push('Pull request changed while evidence was being checked');
    await writer.finish(id, problems);
    return problems.length === 0 ? 'success' : 'failure';
  } catch {
    // Read/truncation/rate-limit failures must never preserve a green result from this evaluation.
    await writer.finish(id, ['Could not read and verify the complete current evidence; retry after the API recovers']);
    return 'failure';
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--publish')) throw new Error('Only --publish is supported; no flag means read-only evaluation');
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token) throw new Error('Repository and token are required');
  // This is a default-branch control-plane workflow, never a feature-branch manual invocation.
  const payload: unknown = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const selection = selectEventPullRequest(process.env.GITHUB_EVENT_NAME, payload);
  if (selection.kind === 'none') return;
  const github = createGitHub({ repo, token });
  // Local/manual evaluation is read-only unless publishing was explicitly requested.
  const writer = args.includes('--publish') ? createGateWriter(repo, token) : {
    async start() { return 1; },
    async finish(_id: number, problems: readonly string[]) { console.log(JSON.stringify({ dry_run: true, problems })); },
  };
  const numbers = selection.kind === 'one' ? [selection.pr] : [...new Set([
    ...await github.openPulls('staging'), ...await github.openPulls('main'),
  ].map((pr) => pr.number))];
  for (const pr of numbers) console.log(`PR #${pr}: ${await publishNativeGate({ repo, pr, github, writer })}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Merge policy gate failed; no approval was issued.'); process.exitCode = 1; });
}
