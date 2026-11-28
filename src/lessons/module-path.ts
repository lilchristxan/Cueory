import { z } from 'astro/zod';

export const moduleContentId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use a lowercase ID with digits or dashes');
const id = moduleContentId;
export const bloomTiers = ['remember', 'understand', 'apply', 'analyze', 'evaluate'] as const;
export const practiceActivities = ['flashcard', 'label-it', 'learning-question', 'fill-in', 'matching'] as const;
export const studyTargetSchema = z.object({
  lo: id,
  bloom: z.enum(bloomTiers),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  anchor: id,
});
export type StudyTarget = z.infer<typeof studyTargetSchema>;
export type BloomTier = StudyTarget['bloom'];

const anchor = z.discriminatedUnion('kind', [
  z.strictObject({
    id, kind: z.literal('video'), startSeconds: z.int().nonnegative(), endSeconds: z.int().positive(),
    // An illustrative time range cannot be played or published as a verified source.
    sampleTiming: z.literal(true).optional(),
  }),
  z.strictObject({ id, kind: z.literal('reading'), section: id }),
]);
const objective = z.strictObject({
  id, title: z.string().trim().min(1), concepts: z.array(id).min(1), bloom: z.enum(bloomTiers),
  anchors: z.array(id),
});
export const itemActivity = z.enum([...practiceActivities, 'diagnostic', 'practice-exam']);
const item = z.strictObject({
  ...studyTargetSchema.shape,
  id, activity: itemActivity,
});
const structure = z.strictObject({
  id, course: id, title: z.string().trim().min(1), status: z.enum(['sample', 'draft', 'published']),
  lessons: z.array(z.strictObject({
    id, video: id, reading: id, board: id.optional(), anchors: z.array(anchor), objectives: z.array(objective).min(1), items: z.array(item),
  })).min(1),
});
export type ModulePath = z.infer<typeof structure>;
export type ModuleLesson = ModulePath['lessons'][number];
export type ModuleItem = ModuleLesson['items'][number];

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

/** Count distinct, reserved exam items only. IDs identify items across the whole module. */
export function coverageWarnings(module: ModulePath): string[] {
  const warnings: string[] = [];
  for (const lesson of module.lessons) {
    for (const objective of lesson.objectives) {
      const items = lesson.items.filter(item => item.lo === objective.id);
      const missing = practiceActivities.filter(activity => !items.some(item => item.activity === activity));
      const prefix = `module ${module.id}, objective ${objective.id}`;
      if (missing.length) warnings.push(`${prefix}: missing practice activities: ${missing.join(', ')}`);
      const examItems = new Set(items.filter(item => item.activity === 'practice-exam').map(item => item.id));
      if (examItems.size < 3) warnings.push(`${prefix}: ${examItems.size} of 3 fresh practice exam items available`);
    }
  }
  return warnings;
}

export const modulePathSchema = structure.superRefine((module, context) => {
  const error = (message: string) => context.addIssue({ code: 'custom', message });
  const unique = (kind: string, ids: string[]) => {
    for (const duplicate of duplicates(ids)) error(`Duplicate ${kind} ID: ${duplicate}`);
  };
  unique('lesson', module.lessons.map(lesson => lesson.id));
  unique('objective', module.lessons.flatMap(lesson => lesson.objectives.map(objective => objective.id)));
  unique('item', module.lessons.flatMap(lesson => lesson.items.map(item => item.id)));

  for (const lesson of module.lessons) {
    unique('anchor in ' + lesson.id, lesson.anchors.map(anchor => anchor.id));
    const anchors = new Set(lesson.anchors.map(anchor => anchor.id));
    if (module.status === 'published') {
      for (const kind of ['video', 'reading'] as const) {
        if (!lesson.anchors.some(anchor => anchor.kind === kind)) error(`Published lesson ${lesson.id} needs a ${kind} anchor`);
      }
    }
    const objectives = new Map(lesson.objectives.map(objective => [objective.id, objective]));
    for (const anchor of lesson.anchors) {
      if (anchor.kind === 'video') {
        if (anchor.endSeconds <= anchor.startSeconds) error(`Video anchor ${anchor.id} must end after it starts`);
        if (module.status === 'published' && anchor.sampleTiming) error(`Published video anchor ${anchor.id} has sample timing`);
      }
    }
    for (const objective of lesson.objectives) {
      unique('concept on ' + objective.id, objective.concepts);
      unique('anchor on ' + objective.id, objective.anchors);
      for (const id of objective.anchors) {
        if (!anchors.has(id)) error(`Objective ${objective.id} refers to missing lesson anchor ${id}`);
      }
      if (module.status === 'published') {
        if (!objective.anchors.length) error(`Published objective ${objective.id} has no teaching anchor`);
        const hasDiagnostic = lesson.items.some(item => item.lo === objective.id && item.activity === 'diagnostic' &&
          (item.bloom === 'understand' || item.bloom === 'apply'));
        if (!hasDiagnostic) error(`Published objective ${objective.id} needs an understand or apply diagnostic item`);
      }
    }
    for (const item of lesson.items) {
      const objective = objectives.get(item.lo);
      if (!objective) error(`Item ${item.id} refers to missing lesson objective ${item.lo}`);
      if (!anchors.has(item.anchor) || (objective && !objective.anchors.includes(item.anchor))) {
        error(`Item ${item.id} needs a teaching anchor of its objective`);
      }
    }
  }
});
