/**
 * Forgiving search over a system's structure names (Task 178, part B). A drop-in for the list's current
 * `matchesSearch` (src/islands/anatomylab.ts), which stays untouched: this one also ranks the results.
 *
 * Tolerant to word order ("ligament round uterus" finds "round ligament of uterus"), punctuation, extra spaces and
 * plain English plurals (s / es / ies). A label's optional `also` field, alternative names from the source file, is
 * searched too. Nothing here invents a name: it only compares the text the file gives.
 *
 * Ranking (D-pending, Task 178): an exact name first, then names that contain every word of the query, then names
 * that contain some of them (more matched words first). Within a tier the file's order is kept, so the result is stable.
 */

export interface SearchLabel {
  id: string;
  text: string;
  /** Alternative names from the source file, searched like the official name. Never written by the lab itself. */
  also?: readonly string[];
}

/** Lowercase, accents removed, punctuation and runs of spaces collapsed to one space. */
export function normalizeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * One word's plural stripped by the plain rules of English spelling ("arteries" and "artery", "bones" and "bone",
 * "branches" and "branch"), applied to both sides of a comparison so "uterus" and "uterus" still agree.
 */
export function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

function words(value: string): string[] {
  const normalized = normalizeQuery(value);
  return normalized ? normalized.split(' ') : [];
}

/** True when the query word is the start of the name word, before or after plural stripping. */
function wordMatches(nameWord: string, queryWord: string): boolean {
  if (nameWord.startsWith(queryWord)) return true;
  const stem = singular(queryWord);
  return nameWord.startsWith(stem) || singular(nameWord).startsWith(stem);
}

/** How many of the query's words are found in the name, each name word counting once. */
function matchedWords(nameWords: readonly string[], queryWords: readonly string[]): number {
  const free = [...nameWords];
  let matched = 0;
  for (const part of queryWords) {
    const at = free.findIndex((word) => wordMatches(word, part));
    if (at === -1) continue;
    free.splice(at, 1);
    matched++;
  }
  return matched;
}

export const EXACT = 3;
export const ALL_WORDS = 2;
export const SOME_WORDS = 1;

export interface SearchScore {
  /** EXACT, ALL_WORDS, SOME_WORDS, or 0 for no match. */
  tier: number;
  matched: number;
}

/** The best score the query earns against one name. */
export function scoreName(name: string, query: string): SearchScore {
  const queryWords = words(query);
  if (queryWords.length === 0) return { tier: ALL_WORDS, matched: 0 };
  const nameWords = words(name);
  // Exact means the same words, in any order ("ventricle, left" is "left ventricle"), plurals aside.
  const sorted = (list: readonly string[]) => [...list].sort();
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && sorted(a).every((word, i) => word === sorted(b)[i]);
  if (same(nameWords, queryWords) || same(nameWords.map(singular), queryWords.map(singular))) {
    return { tier: EXACT, matched: queryWords.length };
  }
  const matched = matchedWords(nameWords, queryWords);
  if (matched === queryWords.length) return { tier: ALL_WORDS, matched };
  return { tier: matched > 0 ? SOME_WORDS : 0, matched };
}

/** The label's best score over its official name and its alternative names. */
export function scoreLabel(label: SearchLabel, query: string): SearchScore {
  let best = scoreName(label.text, query);
  for (const alias of label.also ?? []) {
    const score = scoreName(alias, query);
    if (score.tier > best.tier || (score.tier === best.tier && score.matched > best.matched)) best = score;
  }
  return best;
}

/**
 * The ids of the labels that match the query, best first: exact names, then names with every query word, then names
 * with some (more matched words first), each tier in file order. An empty query lists every id in file order.
 */
export function searchStructures(labels: readonly SearchLabel[], query: string): string[] {
  if (words(query).length === 0) return labels.map((label) => label.id);
  const scored: { id: string; score: SearchScore; at: number }[] = [];
  labels.forEach((label, at) => {
    const score = scoreLabel(label, query);
    if (score.tier > 0) scored.push({ id: label.id, score, at });
  });
  scored.sort((a, b) => b.score.tier - a.score.tier || b.score.matched - a.score.matched || a.at - b.at);
  return scored.map((entry) => entry.id);
}
