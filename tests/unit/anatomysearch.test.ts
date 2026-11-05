import { describe, expect, it } from 'vitest';
import { ALL_WORDS, EXACT, SOME_WORDS, normalizeQuery, scoreName, searchStructures, singular, type SearchLabel } from '../../src/islands/anatomysearch';

// Names here are BodyParts3D's own words (they appear in content/visuals) or plain test strings; nothing is invented as
// anatomy. `also` is filled only to test the field: the real content leaves it alone.
const labels: SearchLabel[] = [
  { id: 'FMA1', text: 'round ligament of uterus' },
  { id: 'FMA2', text: 'uterus' },
  { id: 'FMA3', text: 'ligament of head of femur' },
  { id: 'FMA4', text: 'left ventricle' },
  { id: 'FMA5', text: 'right ventricle' },
  { id: 'FMA6', text: 'left coronary artery' },
  { id: 'FMA7', text: 'left atrium', also: ['test alias one'] },
  { id: 'FMA8', text: 'right atrium' },
];

describe('normalizeQuery and singular', () => {
  it('lowercases, strips accents and punctuation, collapses spaces', () => {
    expect(normalizeQuery('  Léft,  Ventricle!! ')).toBe('left ventricle');
    expect(normalizeQuery('---')).toBe('');
  });

  it('strips plain English plurals and leaves other words alone', () => {
    expect(singular('arteries')).toBe('artery');
    expect(singular('branches')).toBe('branch');
    expect(singular('bones')).toBe('bone');
    expect(singular('uterus')).toBe('uterus');
    expect(singular('pelvis')).toBe('pelvis');
    expect(singular('glass')).toBe('glass');
    expect(singular('is')).toBe('is');
  });
});

describe('scoreName', () => {
  it('tiers exact, all words, some words, none', () => {
    expect(scoreName('left ventricle', 'left ventricle').tier).toBe(EXACT);
    expect(scoreName('left ventricle', 'Ventricle, left').tier).toBe(EXACT);
    expect(scoreName('left ventricle', 'left vent').tier).toBe(ALL_WORDS);
    expect(scoreName('left ventricle', 'left thing').tier).toBe(SOME_WORDS);
    expect(scoreName('left ventricle', 'nothing').tier).toBe(0);
  });

  it('counts each name word once, so "left left" needs two left words', () => {
    expect(scoreName('left ventricle', 'left left')).toEqual({ tier: SOME_WORDS, matched: 1 });
  });
});

describe('searchStructures', () => {
  it('ignores word order, punctuation and extra spaces', () => {
    expect(searchStructures(labels, 'ligament round uterus')[0]).toBe('FMA1');
    expect(searchStructures(labels, '  uterus,  ligament -- round ')[0]).toBe('FMA1');
    // FMA3 shares two words ("ligament", "of"), FMA2 one ("uterus"): more matched words first, then file order.
    expect(searchStructures(labels, 'Round Ligament of Uterus')).toEqual(['FMA1', 'FMA3', 'FMA2']);
  });

  it('matches plurals both ways', () => {
    expect(searchStructures(labels, 'ventricles')).toEqual(['FMA4', 'FMA5']);
    expect(searchStructures(labels, 'ligaments')).toEqual(['FMA1', 'FMA3']);
    expect(searchStructures([{ id: 'X', text: 'arteries' }], 'artery')).toEqual(['X']);
  });

  it('ranks exact above all-words above some-words, each tier in file order', () => {
    expect(searchStructures(labels, 'uterus')).toEqual(['FMA2', 'FMA1']);
    expect(searchStructures(labels, 'left')).toEqual(['FMA4', 'FMA6', 'FMA7']);
    // "left atrium": FMA7 exact; FMA4 and FMA6 share "left"; FMA8 shares "atrium". All some-words, file order.
    expect(searchStructures(labels, 'left atrium')).toEqual(['FMA7', 'FMA4', 'FMA6', 'FMA8']);
  });

  it('puts more matched words first within the some-words tier', () => {
    expect(searchStructures(labels, 'right ventricle uterus')).toEqual(['FMA5', 'FMA1', 'FMA2', 'FMA4', 'FMA8']);
  });

  it('searches the optional alternative names', () => {
    expect(searchStructures(labels, 'alias one test')).toEqual(['FMA7']);
    expect(searchStructures(labels, 'alias')).toEqual(['FMA7']);
  });

  it('lists every id for an empty or punctuation-only query, and nothing for no match', () => {
    expect(searchStructures(labels, '')).toEqual(labels.map((l) => l.id));
    expect(searchStructures(labels, ' ,. ')).toEqual(labels.map((l) => l.id));
    expect(searchStructures(labels, 'zzz')).toEqual([]);
  });

  it('is stable: the same query gives the same order', () => {
    expect(searchStructures(labels, 'left')).toEqual(searchStructures(labels, 'left'));
  });
});
