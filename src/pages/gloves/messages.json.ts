import type { APIRoute } from 'astro';
import { parseGloveMessages } from '../../content/glove-messages';
import data from '../../../content/gloves/messages.json';

/**
 * The message gloves as one small static file (about 20 KB), fetched by the glove-note script only when a note is
 * due (src/components/GloveNote.astro), so no page carries the list. Only what the note shows: photo, words, size.
 * Like the break ideas (src/pages/breaks.astro), the content file is imported directly and checked at build time.
 */
export const GET: APIRoute = () => {
  const messages = parseGloveMessages(data).map(({ file, text, width, height }) => ({ file, text, width, height }));
  return new Response(JSON.stringify({ messages }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
