import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { boardProblems } from './board';
import { contentEntryId, visibility } from './catalog';
import { coverageWarnings, itemActivity, moduleContentId, modulePathSchema, type ModuleLesson, type ModulePath } from './module-path';

interface Source {
  id?: string;
  lesson?: string;
  course?: string;
  status?: string;
  videoId?: string;
  sentences?: { id: string }[];
  cards?: { id: string }[];
  labels?: { id: string }[];
  items?: { id: string }[];
}

function source(root: string, folder: string, id: string): Source | undefined {
  const path = resolve(root, folder, id + '.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

const collectionPatterns = {
  lessons: '**/*.json', videos: '**/*.json', cards: '**/*.json',
  'label-it': '*.json', 'fill-in': '*.json', questions: '*.json',
};

// Use the same entry identity as Astro's glob loader. A raw JSON id is not an entry ID.
function collectionsAt(root: string) {
  const cached = new Map<string, (Source & { id: string })[]>();
  return (folder: keyof typeof collectionPatterns) => {
    const existing = cached.get(folder);
    if (existing) return existing;
    const cwd = resolve(root, folder);
    const files = existsSync(cwd) ? globSync(collectionPatterns[folder], { cwd }).sort() : [];
    const entries = files.map(file => {
      const data: Source & { slug?: unknown } = JSON.parse(readFileSync(resolve(cwd, file), 'utf8'));
      return { ...data, id: data.slug ? String(data.slug) : contentEntryId(file) };
    });
    cached.set(folder, entries);
    return entries;
  };
}

function sampleItemProblems(collections: ReturnType<typeof collectionsAt>, lesson: ModuleLesson): string[] {
  const cards = collections('cards').find(entry => entry.lesson === lesson.id);
  const labels = collections('label-it').find(entry => entry.id === lesson.id);
  const blanks = collections('fill-in').find(entry => entry.lesson === lesson.id);
  const questions = collections('questions').find(entry => entry.id === lesson.id);
  // The public sample kit contains only content already present in this lesson. Index IDs
  // only: no stems, backs, checks or rationales enter the module collection.
  const sources = [
    { kinds: ['flashcard'], file: cards, records: cards?.cards },
    { kinds: ['matching'], file: cards, records: cards ? [{ id: cards.id }] : [] },
    { kinds: ['label-it'], file: labels, records: labels?.labels },
    { kinds: ['fill-in'], file: blanks, records: blanks?.items },
    { kinds: ['learning-question', 'diagnostic', 'practice-exam'], file: questions, records: questions?.items },
  ];
  const problems: string[] = [];
  for (const { kinds, file, records } of sources) {
    const ids = new Set(records?.map(record => record.id));
    const tagged = new Set(lesson.items.filter(item => kinds.includes(item.activity)).map(item => item.id));
    if (tagged.size && file?.lesson !== lesson.id) {
      problems.push(`Lesson ${lesson.id} needs its own ${kinds.join('/')} source`);
    }
    if (tagged.size && file && visibility(file.status) !== 'labeled') {
      problems.push(`Lesson ${lesson.id} needs a labeled sample or placeholder ${kinds.join('/')} source`);
    }
    for (const id of tagged) if (!ids.has(id)) problems.push(`Study item ${id} has no matching source in lesson ${lesson.id}`);
    for (const id of ids) if (id && !tagged.has(id)) problems.push(`Study item ${id} in lesson ${lesson.id} is missing its study tags`);
  }
  return problems;
}

// The reviewed bank remains on the server. Its independently supplied authoring inventory
// contains public-safe item identifiers only; the build cannot certify live bank availability.
const reviewedCatalog = z.strictObject({
  status: z.literal('approved'), lesson: moduleContentId,
  items: z.array(z.strictObject({ id: moduleContentId, activity: itemActivity })),
});

function reviewedItemProblems(root: string, lesson: ModuleLesson): string[] {
  const catalog = reviewedCatalog.safeParse(source(root, 'module-path/sources', lesson.id));
  if (!catalog.success || catalog.data.lesson !== lesson.id) return [`Lesson ${lesson.id} needs its approved item metadata catalog`];
  const byId = new Map(catalog.data.items.map(item => [item.id, item.activity]));
  if (byId.size !== catalog.data.items.length) return [`Lesson ${lesson.id} has duplicate reviewed item IDs`];
  const problems = lesson.items.filter(item => byId.get(item.id) !== item.activity)
    .map(item => `Study item ${item.id} has no ${item.activity} source in the approved catalog`);
  const tagged = new Set(lesson.items.map(item => item.id));
  for (const id of byId.keys()) if (!tagged.has(id)) problems.push(`Reviewed item ${id} is missing its study tags`);
  return problems;
}

/** Resolve the actual video, reading, board and activity sources at build time. */
function sourceProblems(module: ModulePath, root: string, collections: ReturnType<typeof collectionsAt>): string[] {
  const problems: string[] = [];
  for (const lesson of module.lessons) {
    const reading = collections('lessons').find(entry => entry.id === lesson.reading);
    const video = collections('videos').find(entry => entry.id === lesson.video);
    if (!reading || reading.id !== lesson.id || reading.course !== module.course) {
      problems.push(`Lesson ${lesson.id} needs its reading in course ${module.course}`);
    }
    if (!video || video.lesson !== lesson.id) problems.push(`Lesson ${lesson.id} needs its own video source`);
    if (module.status === 'sample') {
      if (reading && visibility(reading.status) !== 'labeled') problems.push(`Sample lesson ${lesson.id} needs a labeled reading`);
      const modeledDraft = video?.status === 'draft' && video.videoId === 'xxxxxxxxxxx' &&
        lesson.anchors.some(anchor => anchor.kind === 'video' && anchor.sampleTiming);
      if (video && visibility(video.status) !== 'labeled' && !modeledDraft) problems.push(`Sample lesson ${lesson.id} needs a labeled video or explicitly modeled draft placeholder`);
    }
    if (module.status === 'published' && (video?.status !== 'published' || video.videoId === 'xxxxxxxxxxx' || reading?.status !== 'published')) {
      problems.push(`Published lesson ${lesson.id} needs published video and reading sources`);
    }
    const sections = new Set(reading?.sentences?.map(sentence => sentence.id));
    for (const anchor of lesson.anchors) {
      if (anchor.kind === 'reading' && !sections.has(anchor.section)) {
        problems.push(`Reading anchor ${anchor.id} refers to missing section ${anchor.section}`);
      }
      if (anchor.kind === 'video' && video?.videoId === 'xxxxxxxxxxx' && !anchor.sampleTiming) {
        problems.push(`Video anchor ${anchor.id} must identify placeholder timing`);
      }
    }
    if (lesson.board) {
      if (module.status !== 'sample') {
        problems.push(`Lesson ${lesson.id} must use its approved item metadata catalog instead of a raw lesson board`);
      } else {
        const board = source(root, 'samples/templates', lesson.board);
        if (!board || board.status !== 'sample') problems.push(`Lesson ${lesson.id} needs a labeled sample board ${lesson.board}`);
        else problems.push(...boardProblems(board, lesson));
      }
    }
    problems.push(...(module.status === 'sample' ? sampleItemProblems(collections, lesson) : reviewedItemProblems(root, lesson)));
  }
  return problems;
}

/** Astro's function loader runs for each content sync, even when only a referenced file changed. */
export function loadModulePaths(root: string, warn: (message: string) => void): ModulePath[] {
  const modules: ModulePath[] = [];
  const collections = collectionsAt(root);
  for (const folder of ['samples/module-path', 'module-path/manifests']) {
    const directory = resolve(root, folder);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter(file => file.endsWith('.json')).sort()) {
      const module = modulePathSchema.parse(JSON.parse(readFileSync(resolve(directory, file), 'utf8')));
      if ((module.status === 'sample') !== (folder === 'samples/module-path')) throw new Error(`Wrong content folder for ${module.status} module ${module.id}`);
      if (modules.some(other => other.id === module.id)) throw new Error(`Duplicate module ID: ${module.id}`);
      const problems = sourceProblems(module, root, collections);
      if (problems.length) throw new Error(`module ${module.id}: ${problems.join('; ')}`);
      for (const message of coverageWarnings(module)) warn(message);
      modules.push(module);
    }
  }
  return modules;
}
