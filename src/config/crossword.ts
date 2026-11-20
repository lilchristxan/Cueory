/**
 * Whether this build shows the crossword. The live build shows it only once `crosswordOpen` (site.ts) is true; builds
 * that may show drafts keep the sample crossword so its tests still run (see draftsAllowed in anatomylab.ts).
 */
import { draftsAllowed, type BuildEnv } from '../islands/anatomylab';
import { crosswordOpen } from './site';

export function crosswordShown(env: BuildEnv, open: boolean = crosswordOpen): boolean {
  return open || draftsAllowed(env);
}

/** The build's environment as the pages read it (same three variables as stat). */
export function pageBuildEnv(): BuildEnv {
  return {
    WORKERS_CI: process.env.WORKERS_CI,
    WORKERS_CI_BRANCH: process.env.WORKERS_CI_BRANCH,
    CUEORY_ANATOMY_DRAFTS: process.env.CUEORY_ANATOMY_DRAFTS,
  };
}
