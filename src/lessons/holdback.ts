import { getEntry } from 'astro:content';
import { draftBuildEnv, lessonHeldBack } from './draftgate';

/** Does the live build hold this lesson back? Used by every page that renders its lesson, cards or questions. */
export async function lessonIsHeldBack(lessonId: string): Promise<boolean> {
  const entry = await getEntry('lessons', lessonId);
  return lessonHeldBack(entry?.data.status, draftBuildEnv(process.env));
}
