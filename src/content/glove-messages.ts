/**
 * The message gloves' text is content (CLAUDE.md rule 7): content/gloves/messages.json, one entry per glove photo in
 * public/gloves/messages/. The text is the photo's accessible name, so it is checked here (build time, in
 * src/content.config.ts) and in tests/unit/glove-messages.test.ts. Christian's handwriting is transcribed exactly,
 * including its capitals; the little drawings next to a message are named in `ornament`, never typed into `text`.
 */

export const GLOVE_ORNAMENTS = ['heart', 'sparkle', 'smile', 'drop', 'note', 'leaf', 'sun', 'wave', 'swirl', 'sprout'] as const;
export const GLOVE_COLOURS = ['periwinkle', 'pink', 'sky blue', 'cream'] as const;

export interface GloveMessage {
  id: string;
  file: string;
  text: string;
  ornament?: (typeof GLOVE_ORNAMENTS)[number] | null;
  colour: (typeof GLOVE_COLOURS)[number];
  width: number;
  height: number;
}

/** Reads content/gloves/messages.json's text: the label must say approved, and the list must be well formed. */
export function parseGloveMessages(data: unknown): GloveMessage[] {
  const record = data as { status?: unknown; messages?: unknown };
  if (!record || typeof record !== 'object' || record.status !== 'approved' || !Array.isArray(record.messages)) {
    throw new Error('content/gloves/messages.json needs status "approved" and a messages list');
  }
  const messages = record.messages as GloveMessage[];
  const problems = gloveMessageProblems(messages);
  messages.forEach((message, index) => {
    if (!Number.isInteger(message.width) || !Number.isInteger(message.height) || message.width < 1 || message.height < 1) {
      problems.push(`entry ${index + 1}: width and height must be whole numbers above zero`);
    }
    if (message.ornament != null && !GLOVE_ORNAMENTS.includes(message.ornament)) problems.push(`entry ${index + 1}: unknown ornament "${message.ornament}"`);
    if (!GLOVE_COLOURS.includes(message.colour)) problems.push(`entry ${index + 1}: unknown colour "${message.colour}"`);
  });
  if (problems.length > 0) throw new Error(`content/gloves/messages.json: ${problems.join('; ')}`);
  return messages;
}

/** What is wrong with a list of glove messages, in plain words (empty when it is fine). */
export function gloveMessageProblems(messages: readonly GloveMessage[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const files = new Set<string>();
  messages.forEach((message, index) => {
    const expected = `msg-${String(index + 1).padStart(3, '0')}`;
    if (message.id !== expected) problems.push(`entry ${index + 1} has id "${message.id}", expected "${expected}"`);
    if (message.file !== `${message.id}.webp`) problems.push(`${message.id}: file must be ${message.id}.webp`);
    if (ids.has(message.id)) problems.push(`${message.id}: repeated id`);
    if (files.has(message.file)) problems.push(`${message.id}: repeated file`);
    ids.add(message.id);
    files.add(message.file);
    const text = message.text;
    if (text.trim() !== text || text.length === 0) problems.push(`${message.id}: text is empty or has spaces at its ends`);
    if (text.length > 100) problems.push(`${message.id}: text is longer than 100 characters`);
    if (/break idea/i.test(text)) problems.push(`${message.id}: text must not include "break idea" (the note adds it)`);
    if (/\s{2,}|[\n\t]/.test(text)) problems.push(`${message.id}: text has a line break or a double space`);
  });
  return problems;
}
