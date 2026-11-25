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

/**
 * Does this build show the study-skills sample lesson (and so link to it)? Menu, home and library entry points use this
 * one answer, so the live build advertises nothing it holds back. Reads the same variables as the lesson pages.
 */
export function sampleLessonShown(source: Record<string, string | undefined> = process.env): boolean {
  return draftsAllowed(draftBuildEnv(source));
}

/** The one menu address that opens the sample lesson. */
export const SAMPLE_LESSON_HREF = '/learn/study-skills';

/** Where "start studying" style links go: the sample lesson where it shows, the lesson library everywhere else. */
export function lessonEntryHref(source: Record<string, string | undefined> = process.env): string {
  return sampleLessonShown(source) ? SAMPLE_LESSON_HREF : '/learn';
}

/**
 * Where the home hero's one "start studying for free" button goes: the sample lesson where it shows, the lesson library
 * (/learn, a public page that itself holds the sample back) on the live build.
 */
export function heroStartHref(source: Record<string, string | undefined> = process.env): string {
  return lessonEntryHref(source);
}

/**
 * Does this build show the setup questions at /start? Accounts are closed at launch (Christian, 18 Nov), so the live
 * build holds /start behind a coming-soon page and links to it nowhere. Staging, previews and test builds keep the real
 * questions. Same fail-closed gate as the sample lesson.
 */
export function onboardingShown(source: Record<string, string | undefined> = process.env): boolean {
  return draftsAllowed(draftBuildEnv(source));
}
