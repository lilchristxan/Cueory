import { describe, expect, it } from 'vitest';
import { downloadFiles, prepareDownload } from '../../src/islands/accountsettings';
import { exportCsv } from '../../src/islands/exportdata';
import { exportReadmeText, SPREADSHEET_FILES } from '../../src/islands/exportreadme';

const today = '2026-11-17';

describe('README.txt in download my data (lane 2)', () => {
  it('has one line for exactly the spreadsheet files the export makes, in the same order', () => {
    expect(Object.keys(SPREADSHEET_FILES)).toEqual(exportCsv({}).map(file => file.fileName));
  });

  it('names the data file and every spreadsheet file by its downloaded name', () => {
    const text = exportReadmeText(today);
    expect(text).toContain(`cueory-data-${today}.json`);
    for (const name of Object.keys(SPREADSHEET_FILES)) expect(text).toContain(`cueory-data-${today}-${name}`);
    expect(text.startsWith(`your cueory data, downloaded on ${today}`)).toBe(true);
  });

  it('is plain, lowercase text with short lines that opens anywhere', () => {
    const text = exportReadmeText(today);
    // File names keep their own spelling (studyEvents.csv); every other word is lowercase.
    const words = Object.keys(SPREADSHEET_FILES).reduce((rest, name) => rest.replaceAll(name, ''), text);
    expect(words).not.toMatch(/[A-Z]/);
    expect(text).not.toMatch(/[^\x20-\x7e\r\n’]/);
    for (const line of text.split('\r\n')) expect(line.length).toBeLessThanOrEqual(100);
    expect(text.split('\r\n').every(line => !line.includes('\n'))).toBe(true);
  });

  it('every description is one plain sentence', () => {
    for (const description of Object.values(SPREADSHEET_FILES)) {
      expect(description).toMatch(/^[a-z"][^A-Z]*\.$/);
    }
  });

  it('comes first with the spreadsheet files, as README.txt', async () => {
    const files = downloadFiles({}, today, exportReadmeText(today));
    expect(files.ok).toBe(true);
    if (!files.ok) return;
    expect(files.csv[0]!.fileName).toBe(`cueory-data-${today}-README.txt`);
    expect(files.csv[0]!.blob.type).toBe('text/plain;charset=utf-8');
    expect(await files.csv[0]!.blob.text()).toBe(exportReadmeText(today));
    expect(files.csv.slice(1).map(file => file.fileName))
      .toEqual(Object.keys(SPREADSHEET_FILES).map(name => `cueory-data-${today}-${name}`));
  });

  it('the real download gets it: prepareDownload loads the text and puts README.txt first', async () => {
    const reader = {
      select: async (table: string) => ({ data: table === 'profiles' ? [] : [], error: null }),
      async *selectPages() { yield { data: [], error: null }; },
      rpc: async () => ({ data: [], error: null }),
      user: async () => ({ data: { user: { created_at: '2026-11-01T08:00:00.000Z' } }, error: null }),
      // Task 178: the export checks the session's assurance before reading tables behind the opt-in MFA policies.
      assurance: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
    };
    const files = await prepareDownload(reader as never, { email: '', signInDetails: undefined, storage: undefined, today } as never);
    expect(files.ok).toBe(true);
    if (!files.ok) return;
    expect(files.csv[0]!.fileName).toBe(`cueory-data-${today}-README.txt`);
  });

  it('without the text (it could not load) the data files still download, with no README', () => {
    const files = downloadFiles({}, today);
    expect(files.ok && files.csv.map(file => file.fileName)).not.toContain(`cueory-data-${today}-README.txt`);
  });
});
