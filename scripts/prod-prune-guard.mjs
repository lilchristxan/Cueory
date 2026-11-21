/**
 * Post-build verification guard (Task 634).
 * Ensures that a production build's dist/ does not contain any /preview/ pages,
 * draft anatomy models, or test fixture assets that the draft gates are meant to drop.
 *
 * Runs after `scripts/prune-preview.mjs` and `pruneDraftModelsIntegration`.
 *
 * Usage: node scripts/prod-prune-guard.mjs [dist-dir] [content/visuals-dir]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProductionBuild } from './prune-preview.mjs';

/**
 * Extracts model file paths declared by an anatomy system source object.
 * Replicates modelPathsOf from src/visuals/prunedrafts.ts without build-step dependencies.
 */
export function modelPathsOfSystem(system) {
  const m = system?.model ?? {};
  const direct = m.file ? [m.file] : [];
  const files = Array.isArray(m.files) ? m.files : [];
  const layerFiles = m.layerFiles && typeof m.layerFiles === 'object'
    ? Object.values(m.layerFiles).flat()
    : [];
  return [...direct, ...files, ...layerFiles];
}

/**
 * Reads approved anatomy model paths from the content directory.
 */
export function getApprovedModelPaths(contentDir) {
  if (!existsSync(contentDir)) return new Set();
  const entries = readdirSync(contentDir);
  const approvedPaths = new Set();
  for (const entry of entries) {
    if (!/^anatomy-[a-z0-9-]+\.json$/.test(entry)) continue;
    try {
      const data = JSON.parse(readFileSync(join(contentDir, entry), 'utf8'));
      if (data?.status === 'approved') {
        for (const p of modelPathsOfSystem(data)) {
          approvedPaths.add(p);
        }
      }
    } catch {
      // Ignore unparseable files here; schema validation owns file syntax.
    }
  }
  return approvedPaths;
}

/** Recursively collect all regular files in a directory. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Checks a built dist directory against production pruning rules.
 *
 * @param {object} [options]
 * @param {string} [options.dist] Absolute path to dist directory.
 * @param {string} [options.contentDir] Absolute path to content/visuals directory.
 * @param {Record<string, string | undefined>} [options.env] Build environment variables.
 * @returns {{ isProduction: boolean, violations: string[] }}
 */
export function verifyProductionDist({
  dist = resolve('dist'),
  contentDir = resolve('content/visuals'),
  env = process.env,
} = {}) {
  if (!isProductionBuild(env)) {
    return { isProduction: false, violations: [] };
  }

  const violations = [];
  if (!existsSync(dist)) {
    violations.push(`dist directory does not exist: ${dist}`);
    return { isProduction: true, violations };
  }

  // 1. Must not contain /preview/ directory or preview pages
  const previewDir = join(dist, 'preview');
  if (existsSync(previewDir)) {
    violations.push(`production build contains /preview/ directory: ${previewDir}`);
  }

  // Walk dist to check for any preview files or test fixtures
  const allFiles = walk(dist);
  for (const file of allFiles) {
    const rel = relative(dist, file).replaceAll('\\', '/');
    if (rel === 'preview' || rel.startsWith('preview/') || rel === 'preview.html') {
      violations.push(`production build contains preview file: ${rel}`);
    }
    if (rel.includes('anatomy-fixture') || rel.endsWith('/fixture.glb') || rel === 'fixture.glb') {
      violations.push(`production build contains test fixture asset: ${rel}`);
    }
  }

  // 2. Must not contain draft anatomy models under dist/models/anatomy
  const anatomyModelsDir = join(dist, 'models', 'anatomy');
  if (existsSync(anatomyModelsDir)) {
    const approvedPaths = getApprovedModelPaths(contentDir);
    const modelFiles = walk(anatomyModelsDir);
    for (const file of modelFiles) {
      if (!/\.glb$/i.test(file)) continue;
      const relToDist = '/' + relative(dist, file).replaceAll('\\', '/');
      if (!approvedPaths.has(relToDist)) {
        violations.push(`production build contains unapproved draft anatomy model: ${relToDist}`);
      }
    }
  }

  return { isProduction: true, violations };
}

/**
 * Runs the guard and logs results. Returns exit code 0 or 1.
 */
export function prodPruneGuard(dist = resolve('dist'), contentDir = resolve('content/visuals'), env = process.env) {
  const result = verifyProductionDist({ dist, contentDir, env });
  if (!result.isProduction) {
    console.log('prod-prune-guard: skipped (not a production build).');
    return 0;
  }
  if (result.violations.length > 0) {
    console.error(`prod-prune-guard: FAILED with ${result.violations.length} violation(s):`);
    for (const v of result.violations) {
      console.error(`  - ${v}`);
    }
    return 1;
  }
  console.log('prod-prune-guard: OK (clean production build, no draft or preview assets).');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ? resolve(process.argv[2]) : resolve('dist');
  const contentDir = process.argv[3] ? resolve(process.argv[3]) : resolve('content/visuals');
  const code = prodPruneGuard(dist, contentDir, process.env);
  if (code !== 0) process.exitCode = code;
}
