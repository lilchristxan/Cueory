/**
 * README.txt for download my data (lane 2): one plain-language line for every file in the download, so a student who
 * opens the files later knows what each one holds. Pure text; tests/unit/exportreadme.test.ts checks it names exactly
 * the files exportdata.ts makes, so a new file can't ship without its line.
 */

/** What each spreadsheet file holds, keyed by its name after the `cueory-data-<date>-` prefix. */
export const SPREADSHEET_FILES: Readonly<Record<string, string>> = {
  'profile.csv': 'your display name, your email, when your account was made, and how many times you changed your name in the last hour (the limit is 10).',
  'signInDetails.csv': 'the details your sign-in provider (such as google) shared when you signed in, one per line.',
  'account.csv': 'your sign-in record: when the account was made and last signed in, how you sign in, and what each sign-in method shared, one field per line.',
  'onboarding.csv': 'your setup answers: your course and exam date, and whether you finished setup.',
  'progress.csv': 'the cards you studied in this browser and how each one went, with your setup answers on each line.',
  'reviewState.csv': 'when each card is next due for review in this browser, and how far apart its reviews are.',
  'gameStats.csv': 'your daily puzzle results in this browser: the game, the day, whether you solved it and how many tries it took.',
  'sudokuStats.csv': 'your sudoku results in this browser: the level, the day and how many seconds it took.',
  'attempts.csv': 'every answer you checked on a question: which version of the question, what you picked, whether it was right, and when.',
  'examPlans.csv': 'the exam dates saved in your account, one per course.',
  'reviewRows.csv': 'your spaced-review progress saved in your account: each question, your streak level, when you last reviewed it and when it is next due.',
  'reports.csv': 'the "flag or comment" reports you sent: the page, the question if there was one, the reason, your comment and when.',
  'sessions.csv': 'where you are signed in: when each sign-in started and was last used, the browser, and the ip address.',
  'studyEvents.csv': 'your study activity, one line per action on a question: what you did, how long you spent on it and when.',
  'dropped.csv': 'the names of any saved fields that couldn’t be read and were left out of this download. usually empty.',
};

/** The README's text, for the download made on `today` (YYYY-MM-DD). Lines stay within 100 characters. */
export function exportReadmeText(today: string): string {
  const prefix = `cueory-data-${today}`;
  const wrap = (text: string, indent: string) => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && (indent + line + ' ' + word).length > 100) {
        lines.push(indent + line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(indent + line);
    return lines.join('\r\n');
  };
  const parts = [
    `your cueory data, downloaded on ${today}`,
    '',
    wrap('this download holds your cueory data: what is saved in your account and what is saved in this browser.', ''),
    wrap('your browser made these files and saved them only on this device. keep them somewhere safe: they include your email and sign-in details.', ''),
    '',
    `${prefix}.json`,
    wrap('everything in one file, in a format other apps and programs can read (json).', '  '),
    '',
    'the spreadsheet files (open them in google sheets, excel or numbers):',
    '',
    ...Object.entries(SPREADSHEET_FILES).flatMap(([name, text]) => [`${prefix}-${name}`, wrap(text, '  '), '']),
    wrap('times are in utc (the same time everywhere). dates without a time are calendar days, as your device counted them.', ''),
    wrap('questions? see cueory.app/privacy.', ''),
    '',
  ];
  return parts.join('\r\n');
}
