import type { Page } from '@playwright/test';

/**
 * The one CSP exception in the browser tests: WebKit's native <select>.
 *
 * Probe result (#862, tests/e2e/csp-element-probe.spec.ts): in WebKit a native <select> raises a `style-src-attr`
 * report with the blocked target "inline", whether the select is parsed from HTML or created by script, with no page
 * code involved. The site's CSP is correct and stays as it is. Only /resources (disabled filter selects), the fill-in
 * dropdown (FillInBoard) and the anatomy lab's body-systems select (AnatomyTextRecall) contain one. The selects are
 * being replaced with custom controls after launch (docs/status/in-review/p21-replace-native-selects.md); delete this
 * file when they are.
 *
 * Narrow on purpose. A report is set aside only when ALL of these hold: the engine is WebKit, the page currently has at
 * least one <select>, the report is `style-src-attr` with an inline target (or WebKit's console wording for it), and
 * the number of such reports is no more than the number of <select> elements. Any other engine, directive or target, a
 * page without a select, or one report too many, and every report is kept and fails as before. A real inline style on a
 * page with a select therefore still fails: it adds a report beyond the select's own.
 */
const EVENT_FORM = /^style-src-attr: inline(?: at |$)/;
const CONSOLE_FORM =
  /^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy\.?$/;

export function dropWebkitSelectReports<T>(
  items: readonly T[],
  text: (item: T) => string,
  context: { browserName: string; selectCount: number },
): T[] {
  if (context.browserName !== 'webkit' || context.selectCount < 1) return [...items];
  let kept = [...items];
  // A violation can be seen twice (the DOM event and the console line); each form is counted on its own.
  for (const form of [EVENT_FORM, CONSOLE_FORM]) {
    const matching = kept.filter((item) => form.test(text(item)));
    if (matching.length > 0 && matching.length <= context.selectCount) {
      kept = kept.filter((item) => !matching.includes(item));
    }
  }
  return kept;
}

/** The same rule for a list of message strings collected from a live page. */
export async function withoutWebkitSelectReports(page: Page, messages: readonly string[]): Promise<string[]> {
  const browserName = page.context().browser()?.browserType().name() ?? '';
  const selectCount = browserName === 'webkit' ? await page.locator('select').count() : 0;
  return dropWebkitSelectReports(messages, (message) => message, { browserName, selectCount });
}
