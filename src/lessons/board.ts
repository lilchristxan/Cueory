/**
 * A lesson board (Christian's plan, 2026-11-26): the one file a teaching video leaves behind, so the same reviewed
 * script and the same pictures become every way to study. The video script writes it; the site only reads it.
 *
 *   pictures -> label it (the finished drawing with each written label's word and place)
 *   clauses  -> cards, learn, matching, fill in and questions (one spoken clause per fact)
 *
 * Nothing here invents content. A clause becomes a study row only when the reviewed script gave it a question and an
 * answer; wrong choices are other answers from the same lesson, never new words. Pure functions, unit tested.
 */
import type { Label, LabelSet } from '../islands/labelit';
import { studyTargetSchema, type ModuleLesson, type StudyTarget } from './module-path';

export interface BoardPicture {
  id: string;
  image: LabelSet['image'];
  labels: (Label & Partial<StudyTarget>)[];
}

export interface BoardClause extends Partial<StudyTarget> {
  id: string;
  /** The clause exactly as the narrator says it. */
  said: string;
  /** From the reviewed script, when this clause teaches one fact. */
  question?: string;
  answer?: string;
  /** The label this clause writes on a picture, by label id. */
  label?: string;
}

export interface LessonBoard {
  id: string;
  lesson: string;
  status: 'sample' | 'draft' | 'approved';
  title: string;
  pictures: BoardPicture[];
  clauses: BoardClause[];
}

/** One fact in the shape every study mode shares (the same columns as the study-set spreadsheet template). */
export interface StudyRow extends Partial<StudyTarget> {
  id: string;
  question: string;
  answer: string;
  /** The spoken clause with the answer left out, for fill in; absent when the clause does not contain the answer. */
  sentence?: string;
}

const BLANK = '___';
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const inRange = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

/** Every problem with a board, in plain words. An empty list means the board can be used. */
export function boardProblems(raw: unknown, lesson?: ModuleLesson): string[] {
  if (!isRecord(raw)) return ['a lesson board must be an object'];
  const problems: string[] = [];
  const where = isText(raw.id) ? `board "${raw.id}"` : 'the board';
  for (const key of ['id', 'lesson', 'title'] as const) if (!isText(raw[key])) problems.push(`${where} needs ${key}`);
  if (!['sample', 'draft', 'approved'].includes(String(raw.status))) problems.push(`${where} needs a status of sample, draft or approved`);
  const pictures = Array.isArray(raw.pictures) ? raw.pictures : [];
  const clauses = Array.isArray(raw.clauses) ? raw.clauses : [];
  if (pictures.length === 0) problems.push(`${where} needs at least one picture`);
  if (clauses.length === 0) problems.push(`${where} needs its spoken clauses`);

  function checkTarget(row: Record<string, unknown>, what: string, requiresTarget: boolean, labelId?: string) {
    // Old standalone boards remain readable. A module-linked study row must carry all four tags.
    if (!requiresTarget && !['lo', 'bloom', 'level', 'anchor'].some(key => key in row)) return;
    const target = studyTargetSchema.safeParse(row);
    if (!target.success) {
      problems.push(`${where}: ${what} needs lo, bloom, level and anchor study tags`);
      return;
    }
    if (lesson) {
      const { lo, anchor } = target.data;
      const shared = labelId && lesson.items.find(item => item.activity === 'label-it' && item.id === labelId);
      if (shared && (shared.lo !== lo || shared.anchor !== anchor || shared.bloom !== target.data.bloom || shared.level !== target.data.level)) {
        problems.push(`${where}: ${what} study tags differ from its indexed module item`);
      }
      const objective = lesson.objectives.find(objective => objective.id === lo);
      if (!objective || !objective.anchors.includes(anchor)) problems.push(`${where}: ${what} needs an objective and teaching anchor in lesson ${lesson.id}`);
    }
  }
  if (lesson && raw.lesson !== lesson.id) problems.push(`${where}: expected board for lesson ${lesson.id}`);
  const labelIds = new Set<string>();
  const pictureIds = new Set<string>();
  for (const picture of pictures) {
    if (!isRecord(picture) || !isText(picture.id)) { problems.push(`${where}: every picture needs an id`); continue; }
    if (pictureIds.has(picture.id)) problems.push(`${where}: picture "${picture.id}" appears twice`);
    pictureIds.add(picture.id);
    const image = picture.image;
    if (!isRecord(image) || !isText(image.src) || !isText(image.alt) || !isText(image.credit)) problems.push(`${where}: picture "${picture.id}" needs an image with src, alt and credit`);
    else if (!(typeof image.width === 'number' && image.width > 0 && typeof image.height === 'number' && image.height > 0)) problems.push(`${where}: picture "${picture.id}" needs its width and height`);
    const labels = Array.isArray(picture.labels) ? picture.labels : [];
    if (labels.length === 0) problems.push(`${where}: picture "${picture.id}" has no labels`);
    for (const label of labels) {
      if (!isRecord(label) || !isText(label.id) || !isText(label.text)) { problems.push(`${where}: a label on "${picture.id}" needs an id and its word`); continue; }
      if (labelIds.has(label.id)) problems.push(`${where}: label "${label.id}" appears twice`);
      labelIds.add(label.id);
      checkTarget(label, `label "${label.id}"`, !!lesson, label.id);
      // The box needs a real width and height (the label-it page rejects an empty box); x and y may be 0.
      const sized = (label.w as number) > 0 && (label.h as number) > 0;
      if (![label.x, label.y, label.w, label.h].every(inRange) || !sized || (label.x as number) + (label.w as number) > 100 || (label.y as number) + (label.h as number) > 100) {
        problems.push(`${where}: label "${label.id}" must be a real box inside the picture (percent values from 0 to 100, width and height above 0)`);
      }
    }
  }

  const clauseIds = new Set<string>();
  const written = new Set<string>();
  for (const clause of clauses) {
    if (!isRecord(clause) || !isText(clause.id) || !isText(clause.said)) { problems.push(`${where}: every clause needs an id and what is said`); continue; }
    if (clauseIds.has(clause.id)) problems.push(`${where}: clause "${clause.id}" appears twice`);
    clauseIds.add(clause.id);
    checkTarget(clause, `clause "${clause.id}"`, !!lesson && clause.question !== undefined);
    // Absent is fine (the clause teaches no single fact); present must be real text, so a number or an empty string
    // is a mistake in the file, never a silent "no question".
    const present = (value: unknown) => value !== undefined;
    for (const key of ['question', 'answer'] as const) {
      if (present(clause[key]) && !isText(clause[key])) problems.push(`${where}: clause "${clause.id}" ${key} must be text`);
    }
    if (present(clause.question) !== present(clause.answer)) problems.push(`${where}: clause "${clause.id}" needs both a question and an answer, or neither`);
    if (clause.label !== undefined) {
      if (!isText(clause.label) || !labelIds.has(clause.label)) problems.push(`${where}: clause "${clause.id}" writes a label that is on no picture`);
      else written.add(clause.label);
    }
  }
  // The standard: each label is written as its word is spoken, so a label no clause writes is a mistake in the file.
  for (const id of labelIds) if (!written.has(id)) problems.push(`${where}: label "${id}" is never written by a clause`);
  return problems;
}

/** A checked board, or an error that lists every problem. */
export function parseBoard(raw: unknown): LessonBoard {
  const problems = boardProblems(raw);
  if (problems.length > 0) throw new Error(problems.join('; '));
  return raw as LessonBoard;
}

/** One label-it set per picture, so a phone shows one section of the board at a time. */
export function boardLabelSets(board: LessonBoard): (Omit<LabelSet, 'labels'> & { labels: BoardPicture['labels'] })[] {
  return board.pictures.map((picture) => ({
    id: board.pictures.length === 1 ? board.id : `${board.id}-${picture.id}`,
    image: picture.image,
    labels: picture.labels.map((label) => ({ ...label })),
  }));
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The clauses that teach one fact each, as study rows in script order. */
export function boardRows(board: LessonBoard): StudyRow[] {
  const rows: StudyRow[] = [];
  for (const clause of board.clauses) {
    if (!clause.question || !clause.answer) continue;
    const answer = clause.answer.trim();
    // Whole words only, any letter case: "roof" is blanked in "The roof covers…" but not inside "roofing".
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeForPattern(answer)}(?![\\p{L}\\p{N}])`, 'iu');
    const row: StudyRow = { id: clause.id, question: clause.question.trim(), answer };
    if (clause.lo !== undefined) Object.assign(row, studyTargetSchema.parse(clause));
    if (pattern.test(clause.said)) row.sentence = clause.said.replace(pattern, BLANK);
    rows.push(row);
  }
  return rows;
}

/**
 * Up to `count` wrong choices for one row: other answers from the same lesson, never invented words. Deterministic
 * (the rows that follow it in script order, wrapping round), so a build always gives the same choices.
 */
export function wrongChoices(rows: readonly StudyRow[], rowId: string, count = 3): string[] {
  const at = rows.findIndex((row) => row.id === rowId);
  if (at < 0) return [];
  const own = rows[at]!.answer.toLowerCase();
  const picked: string[] = [];
  for (let step = 1; step < rows.length && picked.length < count; step++) {
    const other = rows[(at + step) % rows.length]!.answer;
    if (other.toLowerCase() !== own && !picked.some((p) => p.toLowerCase() === other.toLowerCase())) picked.push(other);
  }
  return picked;
}
