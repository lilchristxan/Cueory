/**
 * The real pixel size of each vial picture in public/vials/ (lane 9, images). ModeVial.astro writes these as the
 * image's width and height, so the browser reserves exactly the right space before a lazily loaded vial arrives and
 * the label laid over it never jumps. tests/unit/perf-images.test.ts checks them against the files.
 */
import type { StudyVial } from './modes';

export const VIAL_SIZES: Record<StudyVial | 'practice-exams', { width: number; height: number }> = {
  'adaptive-quiz': { width: 225, height: 475 },
  'fill-in': { width: 221, height: 472 },
  flashcards: { width: 225, height: 475 },
  'label-it': { width: 221, height: 468 },
  'learn-mode': { width: 222, height: 471 },
  'level-test': { width: 224, height: 469 },
  matching: { width: 221, height: 469 },
  organizer: { width: 226, height: 468 },
  'practice-exams': { width: 224, height: 469 },
  questions: { width: 221, height: 474 },
  'spaced-review': { width: 221, height: 469 },
  'video-lessons': { width: 224, height: 472 },
};
