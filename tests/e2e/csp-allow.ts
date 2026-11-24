import type { Page } from '@playwright/test';

/**
 * The one CSP exception in the browser tests: WebKit's native <select>.
 *
 * Probe result (#862, tests/e2e/csp-element-probe.spec.ts): in WebKit a native <select> raises a `style-src-attr`
 * report with the blocked target "inline", whether the select is parsed from HTML or created by script, with no page
 * code involved. The site's CSP is correct and stays as it is. Only /resources (disabled filter selects) and the
 * anatomy lab's body-systems select (AnatomyTextRecall) contain one; the fill-in choices became radio buttons (E5). The
 * selects are being replaced with custom controls after launch (docs/status/in-review/p21-replace-native-selects.md);
 * delete this file when they are.
 *
 * Narrow on purpose, and decided ONLY from structured `securitypolicyviolation` events (the `events` argument, text
 * "effectiveDirective: blockedURI at file:line"). A console line alone never qualifies anything. The events set aside
 * are those that are `style-src-attr` with an inline target, and only when ALL of these hold: the engine is WebKit,
 * the page currently has at least one <select>, and the number of such events is no more than the number of <select>
 * elements. Only then may console lines carrying WebKit's wording for the same violation be set aside, and never more
 * of them than there were qualifying events. Everything else is returned and fails as before: any other engine,
 * directive or target, a page without a select, one event too many, a console line with no matching event, and every
 * non-CSP finding. A real inline style on a page with a select therefore still fails: it adds an event beyond the
 * select's own.
 */
const EVENT_FORM = /^style-src-attr: inline(?: at |$)/;
const CONSOLE_FORM =
  /^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy\.?$/;

/** Items left after the exception, in the order: others (console lines, errors) first, then events. */
export function dropWebkitSelectReports<T>(
  events: readonly T[],
  others: readonly T[],
  text: (item: T) => string,
  context: { browserName: string; selectCount: number },
): T[] {
  const keepAll = () => [...others, ...events];
  if (context.browserName !== 'webkit' || context.selectCount < 1) return keepAll();
  const qualified = events.filter((item) => EVENT_FORM.test(text(item)));
  if (qualified.length < 1 || qualified.length > context.selectCount) return keepAll();
  // Console lines are only mirrors of qualified events: set aside at most one per event, never a surplus.
  let mirrorsLeft = qualified.length;
  const remainingOthers = others.filter((item) => {
    if (mirrorsLeft > 0 && CONSOLE_FORM.test(text(item))) {
      mirrorsLeft -= 1;
      return false;
    }
    return true;
  });
  return [...remainingOthers, ...events.filter((item) => !qualified.includes(item))];
}

const EVENTS_KEY = '__cueoryCspEvents';

/** Records every securitypolicyviolation on the page from before it loads. Call before the first goto. */
export async function recordCspEvents(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const found: string[] = [];
    Object.assign(window, { [key]: found });
    document.addEventListener('securitypolicyviolation', (event) => {
      found.push(`${event.effectiveDirective}: ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
    });
  }, EVENTS_KEY);
}

/**
 * The same rule for message strings a spec collected from console and pageerror, with the page's own recorded events
 * (recordCspEvents, or `events` when the spec keeps its own list). A spec that never recorded events gets no
 * exception at all, so it fails closed.
 */
export async function withoutWebkitSelectReports(
  page: Page,
  messages: readonly string[],
  events?: readonly string[],
): Promise<string[]> {
  const browserName = page.context().browser()?.browserType().name() ?? '';
  const selectCount = browserName === 'webkit' ? await page.locator('select').count() : 0;
  const recorded = events ?? (await page.evaluate((key) => (window as unknown as Record<string, string[] | undefined>)[key] ?? [], EVENTS_KEY));
  return dropWebkitSelectReports(recorded, messages, (message) => message, { browserName, selectCount });
}
