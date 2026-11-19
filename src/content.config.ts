import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { sentenceParts } from './islands/fillin';
import { parseSet as parseLabelSet } from './islands/labelit';
import { sampleChecker, type SampleItem } from './islands/questions';
import { questionContentProblems } from './content/question-validation';
import { existsSync } from 'node:fs';
import { modelFileProblems, visualProblems } from './visuals/sources';
import { videoSchema } from './videos/schema';
import { repeatedCardIndexes } from './content/card-schema';
import { lessonSentenceProblems } from './content/lesson-validation';

/**
 * Lessons are content, not code: they live as JSON files in /content/lessons.
 * The build fails with a clear message if a file is missing a field or has a
 * value of the wrong shape.
 */
const lessons = defineCollection({
  loader: glob({ base: './content/lessons', pattern: '**/*.json' }),
  schema: z.object({
    course: z.string().min(1, 'course cannot be empty'),
    order: z.number().int('order must be a whole number').positive('order must be above zero'),
    title: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer'),
    summary: z.string().max(300, 'too long: keep the summary to 300 characters or fewer'),
    status: z.enum(['placeholder', 'sample', 'draft', 'in_review', 'published'], 'must be one of: placeholder, sample, draft, in_review, published'),
    sentences: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
          text: z.string().min(1, 'this cannot be empty').max(400, 'too long: keep it to 400 characters or fewer'),
        }),
      )
      .min(1, 'needs at least 1 entry')
      .superRefine((sentences, context) => {
        for (const message of lessonSentenceProblems(sentences)) {
          context.addIssue({ code: 'custom', message });
        }
      }),
  }),
});

/**
 * Cards are content too: one JSON file per lesson deck in /content/cards. `lesson` names the lesson the deck
 * belongs to (a file name in /content/lessons, without .json). A card's optional `blank` is the words from its back
 * that Learn mode's fill-in leaves out (D-43); they must appear in the back exactly as written.
 */
const cards = defineCollection({
  loader: glob({ base: './content/cards', pattern: '**/*.json' }),
  schema: z.object({
    lesson: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
    title: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer'),
    status: z.enum(['placeholder', 'sample', 'draft', 'in_review', 'published'], 'must be one of: placeholder, sample, draft, in_review, published'),
    cards: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
            front: z.string().min(1, 'this cannot be empty').max(300, 'too long: keep it to 300 characters or fewer'),
            back: z.string().min(1, 'this cannot be empty').max(600, 'too long: keep it to 600 characters or fewer'),
            blank: z.string().trim().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer').optional(),
          })
          .refine((card) => card.blank === undefined || card.back.includes(card.blank), {
            message: "blank must be words that appear in the card's back, exactly as written",
            path: ['blank'],
          }),
      )
      .min(1, 'needs at least 1 entry')
      .superRefine((cards, context) => {
        for (const index of repeatedCardIndexes(cards.map((card) => card.id))) {
          context.addIssue({
            code: 'custom',
            path: [index, 'id'],
            message: 'a card id is repeated in this deck',
          });
        }
      }),
  }),
});

/**
 * Daily games (D-61): sample puzzles for pulse, one JSON file each in /content/games/pulse. Samples use everyday words
 * and say so on the page. Real puzzles are nursing content whose answers are answer keys, so they never go in this
 * repository: they come from the reviewed database with Task 2, one day at a time (D-61).
 */
const pulse = defineCollection({
  loader: glob({ base: './content/games/pulse', pattern: '**/*.json' }),
  schema: z.object({
    status: z.literal('sample', 'must be exactly "sample"'),
    word: z.string().regex(/^[a-z]{5,7}$/, 'a pulse word is five to seven lowercase letters'),
    cue: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer'),
  }),
});

/**
 * triage (D-63): sample sorting puzzles, one JSON file each in /content/games/triage. Three named groups of three terms
 * and one odd one out that belongs to none; every term appears once. Everyday words, labeled as samples on the page.
 */
const term = z.string().regex(/^[a-z][a-z -]{0,23}$/, 'a triage term is lowercase letters, up to 24 characters');
const triage = defineCollection({
  loader: glob({ base: './content/games/triage', pattern: '**/*.json' }),
  schema: z
    .object({
      status: z.literal('sample', 'must be exactly "sample"'),
      groups: z
        .array(
          z.object({
            name: z.string().regex(/^[a-z][a-z -]{0,31}$/, 'a group name is lowercase letters, up to 32 characters'),
            terms: z.array(term).length(3),
          }),
        )
        .length(3),
      oddOne: term,
    })
    .refine(
      ({ groups, oddOne }) => new Set([...groups.flatMap((group) => group.terms), oddOne]).size === 10,
      'every triage term appears once: nine in the groups and the odd one out',
    ),
});

/**
 * Organizer sets (ROADMAP Task 4): one JSON file per lesson in /content/organizer, sorted with OrganizerBoard. The rules
 * match parseSet in src/islands/organizer.ts: 2 to 4 groups, 4 to 12 items, unique ids, every item in a real group.
 * Until reviewed batches exist (Task 2 and 3), a set is an everyday "sample" and the page says so; no clinical facts.
 */
const organizerId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes');
const organizer = defineCollection({
  loader: glob({ base: './content/organizer', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
      status: z.literal('sample', 'must be exactly "sample"'),
      title: z.string().min(1, 'this cannot be empty').max(200, 'too long: keep it to 200 characters or fewer'),
      groups: z
        .array(z.object({ id: organizerId.refine((id) => id !== 'tray', 'tray is reserved for unsorted items'), name: z.string().min(1, 'this cannot be empty').max(200, 'too long: keep it to 200 characters or fewer') }))
        .min(2, 'needs at least 2 entries')
        .max(4, 'has too many entries: the most allowed is 4'),
      items: z.array(z.object({ id: organizerId, text: z.string().min(1, 'this cannot be empty').max(1000, 'too long: keep it to 1000 characters or fewer'), group: organizerId })).min(4, 'needs at least 4 entries').max(12, 'has too many entries: the most allowed is 12'),
    })
    .superRefine(({ groups, items }, context) => {
      const groupIds = new Set(groups.map((group) => group.id));
      if (groupIds.size !== groups.length) context.addIssue({ code: 'custom', path: ['groups'], message: 'a group id is repeated' });
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        context.addIssue({ code: 'custom', path: ['items'], message: 'an item id is repeated' });
      }
      for (const item of items) {
        if (!groupIds.has(item.group)) {
          context.addIssue({ code: 'custom', path: ['items'], message: `item "${item.id}" names a group that does not exist` });
        }
      }
    }),
});

/**
 * Fill-in sets (ROADMAP Task 4): one JSON file per lesson in /content/fill-in, played with FillInBoard. Each sentence
 * wraps its one missing word in double brackets, checked with the same sentenceParts as the board. Until reviewed
 * batches exist, a set is an everyday "sample" and the page says so; no clinical facts.
 */
const fillIn = defineCollection({
  loader: glob({ base: './content/fill-in', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
      status: z.literal('sample', 'must be exactly "sample"'),
      items: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes'),
            sentence: z.string().min(1, 'this cannot be empty').max(400, 'too long: keep it to 400 characters or fewer'),
            distractors: z.array(z.string().min(1, 'this cannot be empty').max(200, 'too long: keep it to 200 characters or fewer')).optional(),
          }),
        )
        .min(1, 'needs at least 1 entry')
        .max(30, 'has too many entries: the most allowed is 30'),
    })
    .superRefine(({ items }, context) => {
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        context.addIssue({ code: 'custom', path: ['items'], message: 'an item id is repeated' });
      }
      items.forEach((item, i) => {
        try {
          sentenceParts(item.sentence);
        } catch (error) {
          context.addIssue({ code: 'custom', path: ['items', i, 'sentence'], message: (error as Error).message });
        }
      });
    }),
});

/**
 * "label it" sets (ROADMAP Task 4c): one JSON file per lesson in /content/label-it, checked with the board's own
 * parseSet (boxes inside the image, unique ids, label text, and an image credit: no credit, no image). The page never
 * puts this file in its HTML; a static endpoint serves it and the board fetches it after the page loads.
 * Until reviewed images with rights records exist (Task 2), a set is an everyday "sample" drawn for Cueory.
 */
const labelIt = defineCollection({
  loader: glob({ base: './content/label-it', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
      status: z.literal('sample', 'must be exactly "sample"'),
      image: z.object({
        src: z.string().regex(/^\/[\w\-./]+\.(svg|png|webp|jpg)$/, 'the image is a file on this site, starting with /'),
        alt: z.string().min(1, 'this cannot be empty').max(300, 'too long: keep it to 300 characters or fewer'),
        width: z.number('width is a number').positive('width must be above zero'),
        height: z.number('height is a number').positive('height must be above zero'),
        credit: z.string().min(1, 'this cannot be empty').max(300, 'too long: keep it to 300 characters or fewer'),
      }),
      labels: z.array(z.object({ id: z.string(), text: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
    })
    .superRefine((data, context) => {
      try {
        parseLabelSet({ id: 'check', image: data.image, labels: data.labels });
      } catch (error) {
        context.addIssue({ code: 'custom', path: ['labels'], message: (error as Error).message });
      }
    }),
});

/**
 * Sample questions (ROADMAP Task 4, D-33, D-45): one JSON file per lesson in /content/questions, with everyday
 * questions only. Their keys and rationales are for the sample checker; real questions never go in this repository:
 * their keys stay in the database and are checked by check_answer (Task 2). Checked with the player's own
 * sampleChecker, which refuses anything that isn't marked "sample".
 */
const choiceId = z.enum(['a', 'b', 'c', 'd', 'e'], 'must be one of: a, b, c, d, e');
const questions = defineCollection({
  loader: glob({ base: './content/questions', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes only, with no spaces or capitals'),
      status: z.literal('sample', 'must be exactly "sample"'),
      items: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes'),
            status: z.literal('sample', 'must be exactly "sample"'),
            type: z.enum(['single', 'sata'], 'must be one of: single, sata'),
            stem: z.string().min(1, 'this cannot be empty').max(400, 'too long: keep it to 400 characters or fewer'),
            choices: z.array(z.object({ id: choiceId, text: z.string().min(1, 'this cannot be empty').max(300, 'too long: keep it to 300 characters or fewer') })).min(2, 'a question needs at least 2 choices').max(5, 'a question has at most 5 choices (a to e)'),
            key: z.array(choiceId).min(1, 'a question needs at least one correct choice in its key'),
            rationales: z.partialRecord(choiceId, z.string().min(1, 'this cannot be empty').max(400, 'too long: keep it to 400 characters or fewer')),
          }),
        )
        .min(1, 'needs at least 1 entry')
        .max(30, 'has too many entries: the most allowed is 30'),
    })
    .superRefine(({ items }, context) => {
      try {
        sampleChecker(items as SampleItem[]);
      } catch (error) {
        context.addIssue({ code: 'custom', path: ['items'], message: (error as Error).message });
      }
      for (const message of questionContentProblems(items)) {
        context.addIssue({ code: 'custom', path: ['items'], message });
      }
    }),
});

/**
 * The small crossword (internal id cueword, D-70): sample puzzles, one JSON file each in /content/games/cueword. The
 * shape is checked here; /play also runs each one through the game's own parsePuzzle at build time, so a clue that
 * doesn't match a word stops the build with a plain message.
 */
const clue = z.object({ number: z.number().int('a clue number is a whole number').positive('a clue number is above zero'), text: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer') });
const cueword = defineCollection({
  loader: glob({ base: './content/games/cueword', pattern: '**/*.json' }),
  schema: z.object({
    status: z.literal('sample', 'must be exactly "sample"'),
    level: z.enum(['easy', 'mid', 'hard'], 'must be one of: easy, mid, hard').optional(),
    grid: z
      .array(z.string().regex(/^[A-Z.]{3,15}$/, 'a crossword row is 3 to 15 capital letters or dots'))
      .min(3, 'needs at least 3 entries')
      .max(15, 'has too many entries: the most allowed is 15'),
    clues: z.object({ across: z.array(clue), down: z.array(clue) }),
  }),
});

/**
 * Word path (internal id suture, D-71): sample puzzles, one JSON file each in /content/games/suture. The shape is checked
 * here; /play also runs each one through the game's own rules at build time (parseWordPath), which check every path.
 *
 * Two formats load (#722). The board format is preferred: `"format": "path"`, a theme `clue`, a 6 by 8 `grid` where
 * every letter belongs to exactly one answer, one answer marked `"special": true` that touches two opposite edges, and
 * optional `extras` (other words of 4 letters or more that earn hints). The older themed word search (Task 97) has no
 * `format`, a `theme` title, a grid up to 11 by 11, and words in straight lines with an optional cue.
 */
/** A word path step's row or column: squares count from 0 at the top left. */
const pathCoordinate = z
  .number('a path row or column is a number')
  .int('a path row or column is a whole number, such as 0 or 3')
  .min(0, 'a path row or column starts at 0, so it cannot be negative');

const suture = defineCollection({
  loader: glob({ base: './content/games/suture', pattern: '**/*.json' }),
  schema: z
    .object({
      status: z.literal('sample', 'must be exactly "sample"'),
      format: z.literal('path', 'must be exactly "path"').optional(),
      theme: z.string().trim().min(1, 'this cannot be empty').max(60, 'too long: keep it to 60 characters or fewer').optional(),
      clue: z.string().trim().min(1, 'this cannot be empty').max(60, 'too long: keep it to 60 characters or fewer').optional(),
      grid: z.array(z.string().regex(/^[A-Z]{3,11}$/, 'a word path row is 3 to 11 capital letters')).min(3, 'a word path grid needs at least 3 rows').max(11, 'a word path grid has at most 11 rows'),
      words: z
        .array(
          z.object({
            cue: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer').optional(),
            answer: z.string().regex(/^[A-Z]{3,48}$/, 'an answer is 3 to 48 capital letters A to Z, with no spaces'),
            path: z.array(z.tuple([pathCoordinate, pathCoordinate], 'each path step is [row, column]')),
            special: z.boolean().optional(),
          }),
        )
        .min(3, 'needs at least 3 entries')
        .max(20, 'has too many entries: the most allowed is 20'),
      extras: z.array(z.string().regex(/^[A-Z]{4,48}$/, 'an extra word is 4 to 48 capital letters A to Z, with no spaces')).max(300, 'too many extra words: the most allowed is 300').optional(),
    })
    .superRefine((data, context) => {
      const issue = (message: string) => context.addIssue({ code: 'custom', message });
      if (data.format === 'path') {
        if (!data.clue) issue('a board puzzle ("format": "path") needs a clue.');
        if (data.theme !== undefined) issue('a board puzzle uses clue, not theme.');
      } else {
        if (!data.theme) issue('a word search (no format) needs a theme.');
        if (data.clue !== undefined || data.extras !== undefined || data.words.some((word) => word.special !== undefined)) {
          issue('clue, extras and special belong to board puzzles: add "format": "path".');
        }
      }
    }),
});

/**
 * The visuals kit (Task 6, D-56, docs/VISUALS.md): one source file per visual in /content/visuals. Every label and
 * every depiction points to a source that gives the book's exact words, its section and the page address, and only
 * allowed books can be quoted (src/visuals/sources.ts). The build stops with a plain message when a file breaks a rule.
 * Only a visual whose file says "approved" can appear on a page.
 */
const visualId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes');
// A 3D model's label is named after its structure's BodyParts3D id, which is also the model's node name (FMA7204,
// FMA7198nsn, BP24), and cites that structure's parts-list line as bp3d-<id> (Task 177).
const structureId = z.string().regex(/^(FMA|BP)\d+[a-z]*$/, 'a structure id is FMA or BP, digits, then lowercase letters');
const structureSourceId = z.string().regex(/^bp3d-(FMA|BP)\d+[a-z]*$/, 'a structure source id is bp3d- and the structure id');
const visuals = defineCollection({
  // One file per visual, directly in content/visuals (no subfolders), so the unit tests check exactly these files.
  loader: glob({ base: './content/visuals', pattern: '*.json' }),
  schema: z
    .object({
      id: visualId,
      title: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer'),
      kind: z.enum(['diagram', 'model', 'overlay'], 'must be one of: diagram, model, overlay'),
      lessonIds: z.array(z.string().regex(/^U\d{2}-T\d{2}-L\d{2}$/, 'a lesson id looks like U01-T01-L01')).min(1, 'list at least one lesson id'),
      status: z.enum(['draft', 'approved'], 'must be one of: draft, approved'),
      labels: z.array(
        z.object({
          id: visualId.or(structureId),
          text: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer'),
          source: visualId.or(structureSourceId),
          group: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer').optional(),
          layer: z.enum(['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton'], 'must be one of: skin, muscle, nerves, vessels, organs, skeleton').optional(),
        }),
      ),
      depictions: z.array(z.object({ id: visualId, what: z.string().min(1, 'this cannot be empty').max(300, 'too long: keep it to 300 characters or fewer'), source: visualId })),
      sources: z
        .array(
          z.object({
            id: visualId.or(structureSourceId),
            quote: z.string().min(1, 'this cannot be empty').max(1000, 'too long: keep it to 1000 characters or fewer'),
            book: z.string().min(1, 'book cannot be empty'),
            section: z.string().min(1, 'this cannot be empty').max(200, 'too long: keep it to 200 characters or fewer'),
            url: z.string().regex(/^https:\/\/\S+$/, 'a page address starts with https://'),
            license: z.string().min(1, 'license cannot be empty'),
            retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'retrieved is the day the words were copied, YYYY-MM-DD'),
          }),
        )
        .min(1, 'needs at least 1 entry'),
      // A 3D model's file under public/ (kind "model" only), the atlas release and how the files reached us.
      model: z
        .object({ file: z.string().min(1, 'this cannot be empty').max(200, 'too long: keep it to 200 characters or fewer'), release: z.string().min(1, 'this cannot be empty').max(120, 'too long: keep it to 120 characters or fewer'), via: z.string().min(1, 'this cannot be empty').max(200, 'too long: keep it to 200 characters or fewer').optional() })
        .optional(),
    })
    .superRefine((visual, context) => {
      const problems = [...visualProblems(visual), ...modelFileProblems(visual, (path) => existsSync(`public/${path}`))];
      for (const { field, message } of problems) context.addIssue({ code: 'custom', path: [field], message });
    }),
});

/**
 * Lesson videos (D-82): one JSON file per video in /content/videos. The videoId is a YouTube video id
 * (or a clearly labeled placeholder). A video appears on the lesson page only when its status is 'published'.
 */
const videos = defineCollection({
  loader: glob({ base: './content/videos', pattern: '**/*.json' }),
  schema: videoSchema,
});

/**
 * Hello cards (Task 201): conversation starters for the flip-the-card game, in content/games/hello-cards. Warm, open
 * questions with no clinical facts; draft samples until Christian approves the wording.
 */
const helloCards = defineCollection({
  loader: glob({ base: './content/games/hello-cards', pattern: '**/*.json' }),
  schema: z
    .object({
      // `sample` is a draft awaiting Christian's wording review; only `approved` may reach the live site.
      status: z.enum(['sample', 'approved'], 'must be one of: sample, approved'),
      note: z.string().max(300, 'too long: keep the note to 300 characters or fewer').optional(),
      starters: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z]+(-[a-z0-9]+)+$/, 'an id is lowercase letters, digits and dashes'),
            category: z.enum(['patients', 'coworkers', 'classmates', 'yourself'], 'must be one of: patients, coworkers, classmates, yourself'),
            depth: z.enum(['small', 'deep'], 'must be one of: small, deep'),
            text: z.string().trim().min(5, 'too short: write at least 5 characters').max(140, 'too long: keep it to 140 characters or fewer'),
          }),
        )
        .min(3, 'needs at least 3 entries'),
    })
    .superRefine(({ starters }, context) => {
      if (new Set(starters.map((starter) => starter.id)).size !== starters.length) {
        context.addIssue({ code: 'custom', path: ['starters'], message: 'a starter id is repeated' });
      }
      for (const category of ['patients', 'coworkers', 'classmates', 'yourself']) {
        if (!starters.some((starter) => starter.category === category)) {
          context.addIssue({ code: 'custom', path: ['starters'], message: `no starter for ${category}` });
        }
        for (const depth of ['small', 'deep']) {
          if (!starters.some((starter) => starter.category === category && starter.depth === depth)) {
            context.addIssue({ code: 'custom', path: ['starters'], message: `no ${depth} starter for ${category}` });
          }
        }
      }
    }),
});

export const collections = { lessons, cards, pulse, triage, cueword, suture, 'hello-cards': helloCards, organizer, 'fill-in': fillIn, 'label-it': labelIt, questions, visuals, videos };
