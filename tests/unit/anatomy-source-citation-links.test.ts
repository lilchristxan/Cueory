/** BodyParts3D names must cite the official file with the row, not the overview README. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const archive = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const bySection: Record<string, string> = {
  'README_e.html, Release 4.0': archive + 'README_e.html',
  'partof_parts_list_e.txt, Release 4.0': archive + 'partof_parts_list_e.txt',
  'isa_parts_list_e.txt, Release 4.0': archive + 'isa_parts_list_e.txt',
};
interface Source {
  id: string;
  book: string;
  license: string;
  quote: string;
  section: string;
  url: string;
}
interface Label { id: string; text: string; source: string }
interface Manifest { kind: string; sources: Source[]; labels: Label[] }

const directCitation = (source: Source): boolean =>
  source.book === 'BodyParts3D' && source.license === 'CC BY 4.0' &&
  Object.hasOwn(bySection, source.section) && source.url === bySection[source.section];

describe('anatomy source-table citation integrity', () => {
  it('checks exact official source files and quoted structure identity in every manifest', () => {
    const root = resolve('content/visuals');
    const files = readdirSync(root).filter((name) => /^anatomy-[a-z0-9-]+\.json$/.test(name)).sort();
    expect(files.length).toBeGreaterThan(0);
    let checked = 0;
    for (const file of files) {
      const model = JSON.parse(readFileSync(join(root, file), 'utf8')) as Manifest;
      expect(model.kind, file).toBe('model');
      const byId = new Map(model.sources.map((source) => [source.id, source]));
      for (const source of model.sources) {
        expect(directCitation(source), file + ': ' + source.id).toBe(true);
      }
      for (const label of model.labels) {
        const source = byId.get(label.source);
        expect(label.source, file + ': ' + label.id).toBe('bp3d-' + label.id);
        expect(source, file + ': missing source for ' + label.id).toBeDefined();
        expect(source?.section, file + ': source table for ' + label.id)
          .toMatch(/^(?:partof|isa)_parts_list_e\.txt, Release 4\.0$/);
        const quote = /^(FMA\d+[A-Za-z0-9_-]*)\s+(BP\d+[A-Za-z0-9_-]*)\s+(.+)$/
          .exec(source?.quote ?? '');
        expect(quote?.[1], file + ': source FMA id').toBe(label.id);
        expect(quote?.[3], file + ': source name').toBe(label.text);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rejects an overview README used for a source-specific quote', () => {
    const source: Source = {
      id: 'bp3d-FMA1',
      book: 'BodyParts3D',
      license: 'CC BY 4.0',
      quote: 'FMA1 BP1 synthetic test only',
      section: 'partof_parts_list_e.txt, Release 4.0',
      url: archive + 'README_e.html',
    };
    expect(directCitation(source)).toBe(false);
    expect(directCitation({ ...source, url: archive + 'partof_parts_list_e.txt' })).toBe(true);
    expect(directCitation({ ...source, section: 'isa_parts_list_e.txt, Release 4.0' })).toBe(false);
  });
});
