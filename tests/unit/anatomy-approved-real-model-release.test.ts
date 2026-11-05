import { describe, expect, it } from 'vitest';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditAnatomyProduction } from '../../scripts/anatomy-production-audit.mjs';

const modelDirectory = new URL('../../public/models/anatomy/', import.meta.url);
const manifestDirectory = new URL('../../content/visuals/', import.meta.url);

/**
 * Compatibility regression for the actual, checked-in BodyParts3D GLBs.
 * Publication status is changed ONLY on temporary copies in the OS temp directory.
 * No real anatomy model is approved or exposed by this test.
 */
describe('production anatomy audit against all real model files', () => {
  it('accepts each existing GLB and its real source manifest in an isolated temporary approval', () => {
    const files = readdirSync(modelDirectory)
      .filter((file) => /^[a-z0-9-]+\.glb$/.test(file))
      .sort();
    expect(files).toHaveLength(11);

    const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-release-models-'));
    const dist = join(root, 'dist');
    const content = join(root, 'content', 'visuals');
    const distModels = join(dist, 'models', 'anatomy');
    mkdirSync(content, { recursive: true });
    mkdirSync(distModels, { recursive: true });
    try {
      writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body>Test-only site</body></html>');

      for (const file of files) {
        const system = file.slice(0, -'.glb'.length);
        const stored = JSON.parse(readFileSync(new URL(`anatomy-${system}.json`, manifestDirectory), 'utf8'));
        expect(stored.status, system).toBe('draft');
        expect(stored.model?.file, system).toBe(`/models/anatomy/${file}`);
        expect(stored.model?.files ?? [], system).toEqual([]);
        expect(stored.model?.layerFiles ?? {}, system).toEqual({});

        const temporaryManifest = join(content, `anatomy-${system}.json`);
        const temporaryModel = join(distModels, file);
        writeFileSync(temporaryManifest, JSON.stringify({ ...stored, status: 'approved' }));
        copyFileSync(new URL(file, modelDirectory), temporaryModel);

        const result = auditAnatomyProduction(dist, content);
        expect(result.errors, `${system}: ${result.errors.join(' | ')}`).toEqual([]);
        expect(result.approvedSystems, system).toBe(1);
        expect(result.draftSystems, system).toBe(0);
        expect(result.shippedModels, system).toBe(1);

        unlinkSync(temporaryManifest);
        unlinkSync(temporaryModel);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
