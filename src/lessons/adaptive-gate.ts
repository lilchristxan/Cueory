import { isDraftStatus, sampleLessonShown } from './draftgate';

/** Opt-in for the one labeled study-skills deck. Reviewed content never enters this pilot. */
export function adaptiveLearnEnabled(
  deckId: string,
  status: unknown,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CUEORY_ADAPTIVE_LEARN === '1' &&
    deckId === 'study-skills-01' &&
    isDraftStatus(status) &&
    sampleLessonShown(env);
}
