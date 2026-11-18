/**
 * Sample and placeholder lessons (content status "placeholder" or "sample") only show where drafts may show: staging,
 * previews, local and test builds. The live build (a Workers Build of main) holds them back behind a plain coming-soon
 * page, the same fail-closed gate as stat, hello cards and the anatomy drafts (draftsAllowed in src/islands/anatomylab.ts).
 */
import { draftsAllowed, type BuildEnv } from '../islands/anatomylab';

/** Is this content status a sample or placeholder rather than reviewed text? */
export function isDraftStatus(status: unknown): boolean {
  return status === 'placeholder' || status === 'sample';
}

/** Hold a lesson back when its status is a draft and this build may not show drafts. */
export function lessonHeldBack(status: unknown, env: BuildEnv): boolean {
  return isDraftStatus(status) && !draftsAllowed(env);
}

/** Only the variables the gate reads, from the build's environment. */
export function draftBuildEnv(source: Record<string, string | undefined>): BuildEnv {
  return {
    WORKERS_CI: source.WORKERS_CI,
    WORKERS_CI_BRANCH: source.WORKERS_CI_BRANCH,
    CUEORY_ANATOMY_DRAFTS: source.CUEORY_ANATOMY_DRAFTS,
  };
}
