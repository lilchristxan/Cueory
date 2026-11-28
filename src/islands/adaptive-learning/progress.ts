/** An on-device progress payload. This module never reads or writes storage itself. */
export interface StoredCardProgress {
  lastAt: number;
  lastDay: string;
  lastCorrect: boolean;
  halfLifeDays: number;
  spacedSuccesses: number;
}

export interface StoredConceptProgress {
  right: number;
  wrong: number;
  lastCorrect: boolean;
  lastDay: string;
}

export interface StoredAdaptiveDeck {
  revision: string;
  cards: Record<string, StoredCardProgress>;
  concepts: Record<string, StoredConceptProgress>;
}

export interface StoredAdaptiveProgress {
  version: 1;
  decks: Record<string, StoredAdaptiveDeck>;
}

type Fields = Record<string, unknown>;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_DECKS = 100;
const MAX_ENTRIES = 500;
// Keep the pilot's progress payload comfortably below typical browser quotas,
// including when a student has opened many decks.
const MAX_TOTAL_CARDS = 2_500;
const MAX_TOTAL_CONCEPTS = 800;
const HOUR_MS = 3_600_000;

function fields(input: unknown): Fields | undefined {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Fields : undefined;
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkedRecord<T>(
  input: unknown,
  limit: number,
  read: (candidate: Fields) => T | undefined,
): Record<string, T> {
  const result: Record<string, T> = Object.create(null);
  for (const [id, candidate] of Object.entries(fields(input) ?? {}).slice(0, limit)) {
    if (!ID.test(id) || id === 'constructor' || id === 'prototype') continue;
    const values = fields(candidate);
    const clean = values && read(values);
    if (clean) result[id] = clean;
  }
  return result;
}

function readCard({ lastAt, lastDay, lastCorrect, halfLifeDays, spacedSuccesses }: Fields): StoredCardProgress | undefined {
  if (
    typeof lastAt !== 'number' || !Number.isSafeInteger(lastAt) || lastAt < 0 || lastAt > 8_640_000_000_000_000 ||
    !validDay(lastDay) || typeof lastCorrect !== 'boolean' ||
    typeof halfLifeDays !== 'number' || !Number.isFinite(halfLifeDays) || halfLifeDays < 1 || halfLifeDays > 120 ||
    typeof spacedSuccesses !== 'number' || !Number.isInteger(spacedSuccesses) || spacedSuccesses < 0 || spacedSuccesses > 2 ||
    (!lastCorrect && spacedSuccesses !== 0)
  ) return;
  const dayStart = Date.parse(`${lastDay}T00:00:00.000Z`);
  // The same local day can start at UTC+14 and end at UTC-12. Outside
  // that window, the recorded instant and date cannot describe one answer.
  if (lastAt < dayStart - 14 * HOUR_MS || lastAt >= dayStart + 36 * HOUR_MS) return;
  return { lastAt, lastDay, lastCorrect, halfLifeDays, spacedSuccesses };
}

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function readConcept({ right, wrong, lastCorrect, lastDay }: Fields): StoredConceptProgress | undefined {
  if (!validCount(right) || !validCount(wrong) || !validDay(lastDay) || typeof lastCorrect !== 'boolean') return;
  if (lastCorrect ? right === 0 : wrong === 0) return;
  return { right, wrong, lastCorrect, lastDay };
}

/**
 * Migrate the optional adaptive field of local progress, not the parent progress record.
 * A missing field is the pre-adaptive format, whose piles cannot establish recall evidence.
 * An unknown version returns undefined so a future writer can preserve that newer record.
 */
export function migrateAdaptiveProgress(input: unknown): StoredAdaptiveProgress | undefined {
  if (input === undefined || input === null) return { version: 1, decks: {} };
  const source = fields(input);
  if (source?.version !== 1) return;
  let cardsLeft = MAX_TOTAL_CARDS;
  let conceptsLeft = MAX_TOTAL_CONCEPTS;
  const decks = checkedRecord(source.decks, MAX_DECKS, ({ revision, cards, concepts }) => {
    if (typeof revision !== 'string' || !ID.test(revision)) return;
    const storedCards = checkedRecord(cards, Math.min(MAX_ENTRIES, cardsLeft), readCard);
    const storedConcepts = checkedRecord(concepts, Math.min(MAX_ENTRIES, conceptsLeft), readConcept);
    const cardCount = Object.keys(storedCards).length;
    const conceptCount = Object.keys(storedConcepts).length;
    cardsLeft -= cardCount;
    conceptsLeft -= conceptCount;
    if (cardCount === 0 && conceptCount === 0) return;
    return { revision, cards: storedCards, concepts: storedConcepts };
  });
  return { version: 1, decks };
}

export function adaptiveDeckFor(
  progress: StoredAdaptiveProgress,
  deckId: string,
  revision: string,
): StoredAdaptiveDeck | undefined {
  if (!Object.hasOwn(progress.decks, deckId)) return;
  const deck = progress.decks[deckId];
  return deck?.revision === revision ? deck : undefined;
}
