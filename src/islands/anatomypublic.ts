/**
 * Public Anatomy Lab eligibility.
 *
 * Use the existing manifest parser and the exact production-build gate, not
 * the draft-enabled preview environment. This deliberately ignores
 * CUEORY_ANATOMY_DRAFTS and any staging/preview branch variables.
 * Only manifests explicitly marked approved can appear on /anatomy or
 * cause its public navigation link to appear.
 */
import { labDataForBuild, type AnatomySystem } from './anatomylab';

export function publicAnatomySystems(
  files: Readonly<Record<string, unknown>>,
): AnatomySystem[] {
  return labDataForBuild(files, null, {
    WORKERS_CI: '1',
    WORKERS_CI_BRANCH: 'main',
  }).systems;
}
