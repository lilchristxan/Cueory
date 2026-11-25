import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOVE_ORNAMENTS, gloveMessageProblems, parseGloveMessages, type GloveMessage } from '../../src/content/glove-messages';

const raw: unknown = JSON.parse(readFileSync(new URL('../../content/gloves/messages.json', import.meta.url), 'utf8'));
const messages = parseGloveMessages(raw);
const photo = (file: string) => new URL(`../../public/gloves/messages/${file}`, import.meta.url);

describe('content/gloves/messages.json', () => {
  it('has the whole set and nothing wrong with it', () => {
    expect(messages.length).toBeGreaterThan(150);
    expect(gloveMessageProblems(messages)).toEqual([]);
  });

  it('has a photo for every message, with the size it says, and no photo without a message', () => {
    for (const message of messages) {
      expect(existsSync(photo(message.file)), message.file).toBe(true);
      expect(statSync(photo(message.file)).size, message.file).toBeLessThan(110_000);
      expect(message.width).toBeGreaterThan(300);
      expect(message.height).toBeGreaterThan(300);
    }
  });

  it('keeps the whole set small enough (the pop-up loads one photo at a time, but the repository carries all)', () => {
    const total = messages.reduce((sum, message) => sum + statSync(photo(message.file)).size, 0);
    expect(total).toBeLessThan(15 * 1024 * 1024);
  });

  it('names ornaments only from the known list, and never types them into the text', () => {
    for (const message of messages) {
      if (message.ornament) expect(GLOVE_ORNAMENTS).toContain(message.ornament);
      expect(message.text, message.id).not.toMatch(/[♡✧♪☺]/u);
    }
  });

  it('has no two messages with the same words', () => {
    const words = messages.map((message) => message.text.toLowerCase().replace(/[^a-z0-9 ]/g, ''));
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('parseGloveMessages', () => {
  it('needs the approved label, a list, known colours and ornaments, and whole-number sizes', () => {
    const good = { id: 'msg-001', file: 'msg-001.webp', text: 'x', colour: 'pink', width: 720, height: 560 };
    expect(parseGloveMessages({ status: 'approved', messages: [good] })).toHaveLength(1);
    expect(() => parseGloveMessages({ messages: [good] })).toThrow(/approved/);
    expect(() => parseGloveMessages({ status: 'approved', messages: [{ ...good, colour: 'mauve' }] })).toThrow(/colour/);
    expect(() => parseGloveMessages({ status: 'approved', messages: [{ ...good, ornament: 'skull' }] })).toThrow(/ornament/);
    expect(() => parseGloveMessages({ status: 'approved', messages: [{ ...good, width: 1.5 }] })).toThrow(/whole numbers/);
    expect(() => parseGloveMessages(null)).toThrow(/approved/);
  });
});

describe('gloveMessageProblems', () => {
  const good: GloveMessage = { id: 'msg-001', file: 'msg-001.webp', text: 'rest is part of studying too.', colour: 'pink', width: 720, height: 560 };

  it('accepts a good entry', () => {
    expect(gloveMessageProblems([good])).toEqual([]);
  });

  it('flags ids out of order, wrong files, repeats, bad wording', () => {
    expect(gloveMessageProblems([{ ...good, id: 'msg-002', file: 'msg-002.webp' }]).join()).toMatch(/expected "msg-001"/);
    expect(gloveMessageProblems([{ ...good, file: 'other.webp' }]).join()).toMatch(/file must be msg-001.webp/);
    expect(gloveMessageProblems([{ ...good, text: ' spaced ' }]).join()).toMatch(/spaces at its ends/);
    expect(gloveMessageProblems([{ ...good, text: '' }]).join()).toMatch(/empty/);
    expect(gloveMessageProblems([{ ...good, text: 'a'.repeat(101) }]).join()).toMatch(/longer than 100/);
    expect(gloveMessageProblems([{ ...good, text: 'try this break idea' }]).join()).toMatch(/break idea/);
    expect(gloveMessageProblems([{ ...good, text: 'two  spaces' }]).join()).toMatch(/double space/);
  });
});
