import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { coverageWarnings, modulePathSchema, type ModulePath } from '../../src/lessons/module-path';
import { loadModulePaths } from '../../src/lessons/module-sources';

const content = resolve('content');
const manifest = 'samples/module-path/study-skills.json';
function readModule(): ModulePath {
  return JSON.parse(readFileSync(join(content, manifest), 'utf8'));
}

describe('module content model', () => {
  it('keeps the item tier independent from the objective target, practice activity and level', () => {
    const module = readModule();
    module.lessons[0]!.objectives[0]!.bloom = 'apply';
    const lesson = modulePathSchema.parse(module).lessons[0]!;
    const diagnostic = lesson.items.find(item => item.activity === 'diagnostic');
    expect(lesson.objectives[0]).toMatchObject({ id: diagnostic!.lo, bloom: 'apply' });
    expect(diagnostic).toMatchObject({ bloom: 'understand', level: 2, anchor: 'sample-reading' });
  });

  it('requires all four tags on every item and rejects embedded content or scoring fields', () => {
    for (const key of ['lo', 'bloom', 'level', 'anchor']) {
      const module = readModule();
      const item = module.lessons[0]!.items[0]!;
      expect(modulePathSchema.safeParse({ ...module, lessons: [{ ...module.lessons[0], items: [{ ...item, [key]: undefined }] }] }).success).toBe(false);
    }
    const module = readModule();
    const item = module.lessons[0]!.items[0]!;
    Object.assign(item, { key: [], stem: 'sample' });
    expect(modulePathSchema.safeParse(module).success).toBe(false);
  });

  it('rejects unknown references, even when a different lesson has the named objective', () => {
    const module = readModule();
    const lesson = module.lessons[0]!;
    module.lessons.push({ ...lesson, id: 'other', objectives: [{ ...lesson.objectives[0]!, id: 'foreign' }], items: [] });
    lesson.items[0]!.lo = 'foreign';
    expect(() => modulePathSchema.parse(module)).toThrow(/missing lesson objective foreign/);
    lesson.items[0]!.lo = lesson.objectives[0]!.id;
    lesson.objectives[0]!.anchors = ['sample-video', 'nonexistent'];
    expect(() => modulePathSchema.parse(module)).toThrow(/missing lesson anchor nonexistent/);
    expect(() => modulePathSchema.parse(module)).toThrow(/needs a teaching anchor of its objective/);
  });

  it('rejects reversed video ranges and duplicate IDs within their scope', () => {
    const module = readModule();
    const lesson = module.lessons[0]!;
    lesson.anchors.push({ id: 'sample-video', kind: 'video', startSeconds: 10, endSeconds: 10 });
    lesson.items.push({ ...lesson.items[0]!, activity: 'practice-exam' });
    lesson.objectives.push({ ...lesson.objectives[0]! });
    expect(() => modulePathSchema.parse(module)).toThrow(/Duplicate anchor/);
    expect(() => modulePathSchema.parse(module)).toThrow(/must end after it starts/);
    expect(() => modulePathSchema.parse(module)).toThrow(/Duplicate item ID/);
    expect(() => modulePathSchema.parse(module)).toThrow(/Duplicate objective ID/);
  });

  it('requires an anchor and an understand/apply diagnostic for each published objective', () => {
    const module = readModule();
    const lesson = module.lessons[0]!;
    module.status = 'published';
    expect(() => modulePathSchema.parse(module)).toThrow(/sample timing/);
    lesson.anchors = lesson.anchors.map(anchor => anchor.kind === 'video' ? { ...anchor, sampleTiming: undefined } : anchor);
    expect(modulePathSchema.safeParse(module).success).toBe(true);
    lesson.items.find(item => item.activity === 'diagnostic')!.bloom = 'remember';
    lesson.objectives[0]!.anchors = [];
    expect(() => modulePathSchema.parse(module)).toThrow(/has no teaching anchor/);
    expect(() => modulePathSchema.parse(module)).toThrow(/needs an understand or apply diagnostic/);
  });

  it('warns for each uncovered activity and counts distinct reserved items per objective', () => {
    const module = readModule();
    const lesson = module.lessons[0]!;
    expect(coverageWarnings(module)).toEqual([expect.stringContaining('1 of 3 fresh')]);
    lesson.items = lesson.items.filter(item => !['matching', 'learning-question'].includes(item.activity));
    const exam = lesson.items.find(item => item.activity === 'practice-exam')!;
    lesson.items.push({ ...exam, id: 'exam-two' }, { ...exam, id: 'exam-three' });
    expect(coverageWarnings(module)).toEqual([expect.stringContaining('learning-question, matching')]);
  });
});

const tempDirs: string[] = [];
function copySources() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-module-'));
  tempDirs.push(root);
  const names = ['lessons', 'videos', 'cards', 'fill-in', 'label-it', 'questions'].map(folder => folder + '/study-skills-01.json');
  for (const name of [manifest, 'samples/templates/lesson-board.json', ...names]) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    copyFileSync(join(content, name), join(root, name));
  }
  return root;
}
afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true });
});

describe('Astro module content loader', () => {
  it('loads all labeled sample deck cards and emits only the fresh-exam coverage warning', () => {
    const warn = vi.fn();
    const [sample] = loadModulePaths(content, warn);
    const sources = JSON.parse(readFileSync(join(content, 'cards/study-skills-01.json'), 'utf8'));
    expect(sample!.lessons[0]!.items.filter(item => item.activity === 'flashcard').map(item => item.id)).toEqual(sources.cards.map((card: { id: string }) => card.id));
    expect(warn.mock.calls).toEqual([[expect.stringContaining('1 of 3 fresh')]]);
  });

  it('uses normalized file IDs for id-less readings and decks, and honors an explicit Astro slug', () => {
    const root = copySources();
    for (const folder of ['lessons', 'cards']) {
      const path = join(root, folder, 'study-skills-01.json');
      const data = JSON.parse(readFileSync(path, 'utf8'));
      delete data.id;
      writeFileSync(path, JSON.stringify(data));
      renameSync(path, join(root, folder, 'Study Skills 01!.json'));
    }
    expect(loadModulePaths(root, () => {})).toHaveLength(1);

    const deckPath = join(root, 'cards', 'Study Skills 01!.json');
    const deck = JSON.parse(readFileSync(deckPath, 'utf8'));
    writeFileSync(deckPath, JSON.stringify({ ...deck, id: 'study-skills-01', slug: 'sample-deck' }));
    expect(() => loadModulePaths(root, () => {})).toThrow(/Study item study-skills-01 has no matching source/);
    const module = readModule();
    module.lessons[0]!.items.find(item => item.activity === 'matching')!.id = 'sample-deck';
    writeFileSync(join(root, manifest), JSON.stringify(module));
    expect(loadModulePaths(root, () => {})).toHaveLength(1);
  });

  it('rejects a different reading whose raw JSON claims the intended lesson ID', () => {
    const root = copySources();
    const module = readModule();
    module.lessons[0]!.reading = 'alternate';
    writeFileSync(join(root, manifest), JSON.stringify(module));
    renameSync(join(root, 'lessons/study-skills-01.json'), join(root, 'lessons/alternate.json'));
    expect(() => loadModulePaths(root, () => {})).toThrow(/needs its reading in course study-skills/);
  });

  it.each([
    ['lessons', 'labeled reading'], ['videos', 'labeled video'], ['cards', 'labeled sample or placeholder flashcard'],
    ['fill-in', 'labeled sample or placeholder fill-in'], ['label-it', 'labeled sample or placeholder label-it'],
    ['questions', 'labeled sample or placeholder learning-question'],
  ])('rejects changing only a consumed %s source from sample data to published', (folder, message) => {
    const root = copySources();
    expect(loadModulePaths(root, () => {})).toHaveLength(1);
    const path = join(root, folder, 'study-skills-01.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...data, status: 'published' }));
    expect(() => loadModulePaths(root, () => {})).toThrow(message);
  });

  it('accepts the modeled draft video only while its video ID is the placeholder', () => {
    const root = copySources();
    const path = join(root, 'videos/study-skills-01.json');
    const video = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...video, videoId: 'sample00001' }));
    expect(() => loadModulePaths(root, () => {})).toThrow(/labeled video or explicitly modeled draft placeholder/);
  });

  it.each([
    ['videos', 'video source'], ['lessons', 'reading in course'], ['questions', 'Study item weekdays has no matching source'],
  ])('fails when only the referenced %s file disappears between builds', (folder, message) => {
    const root = copySources();
    loadModulePaths(root, () => {});
    unlinkSync(join(root, folder, 'study-skills-01.json'));
    expect(() => loadModulePaths(root, () => {})).toThrow(message);
  });

  it('checks the actual reading section and catches removed diagnostic IDs on the next load', () => {
    const root = copySources();
    const reading = join(root, 'lessons/study-skills-01.json');
    const questions = join(root, 'questions/study-skills-01.json');
    const metadata = JSON.parse(readFileSync(reading, 'utf8'));
    metadata.sentences = [];
    writeFileSync(reading, JSON.stringify(metadata));
    writeFileSync(questions, JSON.stringify({ lesson: 'study-skills-01', status: 'sample', items: [] }));
    expect(() => loadModulePaths(root, () => {})).toThrow(/missing section ss01-s02/);
    expect(() => loadModulePaths(root, () => {})).toThrow(/Study item weekdays has no matching source/);
  });

  it('builds a published module from independently declared public-safe references and rejects missing or unsafe catalogs', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-reviewed-module-'));
    tempDirs.push(root);
    function put(path: string, data: unknown) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(data));
    }
    const module = readModule();
    module.status = 'published';
    const lesson = module.lessons[0]!;
    delete lesson.board;
    lesson.anchors = lesson.anchors.map(anchor => anchor.kind === 'video' ? { ...anchor, sampleTiming: undefined } : anchor);
    put('module-path/manifests/module.json', module);
    put('lessons/study-skills-01.json', {
      status: 'published', course: module.course, order: 1,
      title: 'Synthetic lesson fixture', summary: 'For the loader test only.',
      sentences: [{ id: 'ss01-s02', text: 'A synthetic reading section.' }],
    });
    put('videos/study-skills-01.json', {
      lesson: lesson.id, status: 'published', title: 'Synthetic video fixture', videoId: 'sample00001',
      captionsUrl: '/test-only/captions.vtt', transcriptUrl: '/test-only/transcript',
    });
    const catalog = { status: 'approved', lesson: lesson.id, items: lesson.items.map(({ id, activity }) => ({ id, activity })) };
    const file = 'module-path/sources/study-skills-01.json';
    put(file, catalog);
    expect(loadModulePaths(root, () => {})).toHaveLength(1);
    lesson.board = 'lesson-board';
    put('module-path/manifests/module.json', module);
    expect(() => loadModulePaths(root, () => {})).toThrow(/instead of a raw lesson board/);
    delete lesson.board;
    put('module-path/manifests/module.json', module);
    put(file, { ...catalog, items: catalog.items.filter(item => item.activity !== 'diagnostic') });
    expect(() => loadModulePaths(root, () => {})).toThrow(/weekdays has no diagnostic source/);
    put(file, { ...catalog, items: [...catalog.items, { id: 'unmapped', activity: 'diagnostic' }] });
    expect(() => loadModulePaths(root, () => {})).toThrow(/Reviewed item unmapped is missing its study tags/);
    put(file, { ...catalog, items: [...catalog.items, catalog.items[0]] });
    expect(() => loadModulePaths(root, () => {})).toThrow(/duplicate reviewed item IDs/);
    put(file, { ...catalog, items: [{ ...catalog.items[0], key: [] }] });
    expect(() => loadModulePaths(root, () => {})).toThrow(/needs its approved item metadata catalog/);
  });

  it('requires every selected deck card to have a tag and board targets to belong to the lesson', () => {
    const root = copySources();
    const data = readModule();
    data.lessons[0]!.items = data.lessons[0]!.items.filter(item => item.id !== 'ss01-c01');
    writeFileSync(join(root, manifest), JSON.stringify(data));
    const board = join(root, 'samples/templates/lesson-board.json');
    const changed = JSON.parse(readFileSync(board, 'utf8'));
    changed.clauses[0].lo = 'other';
    changed.pictures[0].labels[0].level = 3;
    writeFileSync(board, JSON.stringify(changed));
    expect(() => loadModulePaths(root, () => {})).toThrow(/ss01-c01.*missing its study tags/);
    expect(() => loadModulePaths(root, () => {})).toThrow(/clause "c1" needs an objective and teaching anchor/);
    expect(() => loadModulePaths(root, () => {})).toThrow(/label "roof" study tags differ/);
  });
});
