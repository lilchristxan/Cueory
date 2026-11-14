import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { anatomyInventory, anatomyReviewMarkdown, anatomyReviewSheets, draftReviewSheetsAllowed, writeAnatomyReviewSheets } from '../../scripts/anatomy-review-report.mjs';

/** Fake model names and source lines only; no clinical content or answer keys in a public test. */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-review-'));
  roots.push(root);
  mkdirSync(join(root, 'content', 'visuals'), { recursive: true });
  mkdirSync(join(root, 'public', 'models', 'anatomy'), { recursive: true });
  return root;
}

function source(fmaId = 'FMA1') {
  return {
    id: `bp3d-${fmaId}`,
    quote: 'FMA1 BP1 sample part | with punctuation',
    book: 'BodyParts3D',
    section: 'sample_parts_list_e.txt',
    url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/synthetic-test-only',
    license: 'CC BY 4.0',
  };
}

function visual(id = 'sample', labelId = 'FMA1') {
  return {
    kind: 'model', title: `sample ${id}`, status: 'draft',
    model: { file: `/models/anatomy/${id}.glb`, release: 'sample release' },
    labels: [{ id: labelId, text: 'sample part | exact', group: 'sample group', layer: 'organs', source: `bp3d-${labelId}` }],
    sources: [source(labelId)],
  };
}

function writeSystem(root: string, id: string, data = visual(id)) {
  writeFileSync(join(root, 'content', 'visuals', `anatomy-${id}.json`), JSON.stringify(data));
  writeFileSync(join(root, 'public', 'models', 'anatomy', `${id}.glb`), Buffer.alloc(4096));
}

describe('read-only anatomy review inventory', () => {
  it('reads a draft and its cited label without altering the name, quote or status', () => {
    const root = setup();
    writeSystem(root, 'sample');
    const [entry] = anatomyInventory(root);
    expect(entry).toMatchObject({
      id: 'sample', status: 'draft', bytes: 4096, path: '/models/anatomy/sample.glb',
      labels: [{ id: 'FMA1', name: 'sample part | exact', layer: 'organs', source: { quote: 'FMA1 BP1 sample part | with punctuation' } }],
    });
    const report = anatomyReviewMarkdown(anatomyInventory(root));
    expect(report).toContain('sample part \\| exact');
    expect(report).toContain('FMA1 BP1 sample part \\| with punctuation');
    expect(report).toContain('[BodyParts3D, sample_parts_list_e.txt](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/synthetic-test-only)');
    expect(report).toContain('4.0 KiB');
    expect(report).toContain('does not verify anatomy geometry or approve a draft');
  });

  it('lists all systems in a stable file-name order and can select just one', () => {
    const root = setup();
    writeSystem(root, 'zeta', visual('zeta', 'FMA2'));
    writeSystem(root, 'alpha', visual('alpha', 'FMA1'));
    expect(anatomyInventory(root).map((item: { id: string }) => item.id)).toEqual(['alpha', 'zeta']);
    expect(anatomyInventory(root, 'zeta').map((item: { id: string }) => item.id)).toEqual(['zeta']);
    expect(() => anatomyInventory(root, 'not-here')).toThrow('No anatomy source file');
  });

  it('refuses duplicate structure identifiers across source files', () => {
    const root = setup();
    writeSystem(root, 'alpha', visual('alpha', 'FMA1'));
    writeSystem(root, 'beta', visual('beta', 'FMA1'));
    expect(() => anatomyInventory(root)).toThrow('anatomy-beta.json: structure id repeated: FMA1');
  });

  it('refuses a missing or unsafe model file path', () => {
    const root = setup();
    writeSystem(root, 'sample', { ...visual(), model: { file: '../outside.glb', release: 'sample' } });
    expect(() => anatomyInventory(root)).toThrow('model.file must be a local');
    writeSystem(root, 'sample', { ...visual(), model: { file: '/models/anatomy/absent.glb', release: 'sample' } });
    expect(() => anatomyInventory(root)).toThrow('model file missing');
  });

  it('refuses a missing source record and an unsafe source link', () => {
    const root = setup();
    writeSystem(root, 'sample', { ...visual(), sources: [] });
    expect(() => anatomyInventory(root)).toThrow('has no cited source');
    writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), url: 'javascript:alert(1)' }] });
    expect(() => anatomyInventory(root)).toThrow('must be a safe HTTPS URL');
  });

  it('refuses to attribute one structure to another structure\'s existing source record', () => {
    const root = setup();
    const one = { ...source(), id: 'bp3d-FMA1' };
    const two = { ...source(), id: 'bp3d-FMA2', quote: 'FMA2 BP2 synthetic fixture only' };
    writeSystem(root, 'sample', {
      ...visual(),
      labels: [{ ...visual().labels[0], source: 'bp3d-FMA2' }],
      sources: [one, two],
    });
    expect(() => anatomyInventory(root)).toThrow('label FMA1 cites a different structure source');
    writeSystem(root, 'sample', {
      ...visual(),
      labels: [{ ...visual().labels[0], source: 'bp3d-FMA1' }],
      sources: [one, two],
    });
    expect(anatomyInventory(root)[0]?.labels[0]?.source.id).toBe('bp3d-FMA1');
  });

  it('rejects non-BodyParts3D HTTPS sources and incorrect rights in the review inventory', () => {
    const root = setup();
    for (const url of [
      'https://example.org/sample',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html',
      // URL() normalizes these back into the allowed LATEST path.
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/../LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/%2e%2e/LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp.evil.example/data/bodyparts3d/fake',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/../private',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/%2e%2e/private',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/%2e%2e%2fprivate',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/?page=1', // query alone is not a source document
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/#contents', // fragment alone is not a document
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/../outside-source', // normalized path escapes the official collection
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/%2e%2e/outside-source', // encoded dot segments also escape
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/../outside',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/%2e%2e/outside',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/?resource=outside',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/#outside',
    ]) {
      writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), url }] });
      expect(() => anatomyInventory(root), url).toThrow('must link to the official BodyParts3D source');
    }
    for (const override of [{ book: 'Unreviewed Atlas' }, { license: 'CC BY-NC 4.0' }]) {
      writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), ...override }] });
      expect(() => anatomyInventory(root)).toThrow('must cite BodyParts3D under CC BY 4.0');
    }
    writeSystem(root, 'sample');
    expect(anatomyInventory(root)).toHaveLength(1);
    // Current labels are sourced from the approved, current archive collection.
    writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html' }] });
    expect(anatomyInventory(root)).toHaveLength(1);
  });

  it('refuses repeated source IDs, unknown layers and incomplete citations', () => {
    const root = setup();
    writeSystem(root, 'sample', { ...visual(), sources: [source(), source()] });
    expect(() => anatomyInventory(root)).toThrow('source id repeated');
    writeSystem(root, 'sample', { ...visual(), labels: [{ ...visual().labels[0], layer: 'made-up' }] });
    expect(() => anatomyInventory(root)).toThrow('no recognized layer');
    writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), quote: '' }] });
    expect(() => anatomyInventory(root)).toThrow('source quote must be nonempty text');
  });

  it('does not allow path separators or other input inside a requested system ID', () => {
    const root = setup();
    writeSystem(root, 'sample');
    for (const bad of ['../secret', 'ABC', 'a/b', '', '--help']) {
      expect(() => anatomyInventory(root, bad)).toThrow('system must be a lowercase anatomy file ID');
    }
  });

  it('accepts the real committed BodyParts3D source inventory under the current reviewed license', () => {
    // Synthetic links alone missed the double-LATEST regression in this PR.
    // Exercise the actual draft manifests and asset paths without publishing them.
    const entries = anatomyInventory() as {
      labels: { source: { url: string; book: string; license: string } }[];
    }[];
    expect(entries.length).toBeGreaterThan(0);
    const sources = entries.flatMap((entry) => entry.labels.map((label) => label.source));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.url).toMatch(/^https:\/\/dbarchive\.biosciencedbc\.jp\/data\/bodyparts3d\/LATEST\/[^\s?#]+$/);
      expect(source.book).toBe('BodyParts3D');
      expect(source.license).toBe('CC BY 4.0');
    }
  });

  it('keeps zero-count layers out and lists reviewer gates without granting approval', () => {
    const root = setup();
    writeSystem(root, 'sample');
    const report = anatomyReviewMarkdown(anatomyInventory(root));
    expect(report).toContain('| organs | 1 |');
    expect(report).not.toContain('| skin | 0 |');
    expect(report).toContain('Keep the source status as `draft` until the founder approves publication.');
  });

  it('creates individual review-sheet routes with unchanged source quotes and a front/side picture plan', () => {
    const root = setup();
    writeSystem(root, 'zeta', visual('zeta', 'FMA2'));
    writeSystem(root, 'alpha', visual('alpha', 'FMA1'));
    const sheets = anatomyReviewSheets(anatomyInventory(root));
    expect(sheets.map((sheet: { url: string }) => sheet.url)).toEqual([
      '/preview/anatomy-review/alpha',
      '/preview/anatomy-review/zeta',
    ]);
    for (const sheet of sheets) {
      expect(sheet.structureCount).toBe(1);
      expect(sheet.pictureViews).toEqual(['front', 'side']);
      expect(sheet.status).toBe('draft');
      expect(sheet.labels[0]?.source.quote).toBe('FMA1 BP1 sample part | with punctuation');
      expect(sheet.labels[0]?.name).toBe('sample part | exact');
      expect(sheet.labels[0]?.source.url).toBe('https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/synthetic-test-only');
    }
  });

  it('does not generate an unsafe link from a malformed review sheet identifier', () => {
    const entry = {
      id: 'sample',
      title: 'synthetic model',
      status: 'draft' as const,
      release: 'sample release',
      path: '/models/anatomy/sample.glb',
      bytes: 1,
      labels: [],
    };
    expect(() => anatomyReviewSheets([{ ...entry, id: '../private' }])).toThrow('invalid anatomy review sheet data');
    expect(() => anatomyReviewSheets([{ ...entry, id: 'SAFE' }])).toThrow('invalid anatomy review sheet data');
  });


  it('writes one independent checklist per source model without overwriting human edits', () => {
    const root = setup();
    writeSystem(root, 'alpha', visual('alpha', 'FMA1'));
    writeSystem(root, 'zeta', visual('zeta', 'FMA2'));
    const target = join(root, 'exported-review');
    const files = writeAnatomyReviewSheets(anatomyInventory(root), target);
    expect(files.map((file: string) => file.split('/').pop())).toEqual([
      'anatomy-alpha-review.md',
      'anatomy-zeta-review.md',
    ]);
    expect(readdirSync(target).sort()).toEqual([
      'anatomy-alpha-review.md',
      'anatomy-zeta-review.md',
    ]);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text).toContain('sample part \\| exact');
      expect(text).toContain('FMA1 BP1 sample part');
      expect(text).toContain('Human review before approval');
      expect(text).toContain('Keep the source status as `draft` until the founder approves publication.');
    }
    const first = readFileSync(files[0]!, 'utf8');
    expect(() => writeAnatomyReviewSheets(anatomyInventory(root), target))
      .toThrow('review output already exists');
    expect(readFileSync(files[0]!, 'utf8')).toBe(first);
    expect(existsSync(join(root, 'content', 'visuals', 'anatomy-alpha.json'))).toBe(true);
  });

  it('refuses a file path as a review output directory', () => {
    const root = setup();
    writeSystem(root, 'alpha');
    const file = join(root, 'existing-file.txt');
    writeFileSync(file, 'human review');
    expect(() => writeAnatomyReviewSheets(anatomyInventory(root), file))
      .toThrow('review output directory must be a real directory');
    expect(readFileSync(file, 'utf8')).toBe('human review');
  });


  it('fails closed on production branch aliases even when preview opt-in is set', () => {
    for (const ci of ['1', 'true', 'TRUE']) {
      for (const branch of ['main', 'legacy/main', 'refs/heads/main', 'refs/heads/legacy/main', 'other/main']) {
        const env = {
          WORKERS_CI: ci,
          WORKERS_CI_BRANCH: branch,
          CUEORY_ANATOMY_DRAFTS: '1',
        };
        expect(draftReviewSheetsAllowed(env), `${ci} ${branch}`).toBe(false);
      }
    }
    expect(draftReviewSheetsAllowed({ WORKERS_CI_BRANCH: 'legacy/main', CUEORY_ANATOMY_DRAFTS: '1' }))
      .toBe(false);
    expect(draftReviewSheetsAllowed({ WORKERS_CI: 'true', CUEORY_ANATOMY_DRAFTS: '1' }))
      .toBe(false);
    expect(draftReviewSheetsAllowed({ WORKERS_CI: 'unknown', WORKERS_CI_BRANCH: 'task-178/test', CUEORY_ANATOMY_DRAFTS: '1' }))
      .toBe(false);
  });

  it('only offers draft review names and routes for an explicitly nonproduction build', () => {
    const root = setup();
    writeSystem(root, 'sample');
    const source = anatomyReviewSheets(anatomyInventory(root));
    const shown = (env: Parameters<typeof draftReviewSheetsAllowed>[0]) =>
      source.filter((sheet) => sheet.status === 'approved' || draftReviewSheetsAllowed(env));
    expect(shown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'legacy/main' })).toEqual([]);
    expect(shown({ WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'refs/heads/main' })).toEqual([]);
    expect(shown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: '' })).toEqual([]);
    expect(shown({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/review-sheets' })
      .map((sheet) => sheet.url)).toEqual(['/preview/anatomy-review/sample']);
    expect(shown({ WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'refs/heads/task-178/review-sheets' })
      .map((sheet) => sheet.labels[0]!.name)).toEqual(['sample part | exact']);
    expect(shown({ CUEORY_ANATOMY_DRAFTS: '1' }).length).toBe(1);
    expect(shown({}).length).toBe(0);
  });

});
