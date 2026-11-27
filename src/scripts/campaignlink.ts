/**
 * A campaign link's page (src/pages/from/[source].astro) loads this as a bundled module (no inline script, so the CSP is
 * untouched). The page-visit statistics report a visit when the page has finished loading, so this waits for that and a
 * short moment more before it sends the visitor on. replace, not assign, so the campaign address does not stay in the
 * back history.
 */
import { CAMPAIGN_DESTINATION } from '../config/campaigns';

/** How long after the page has loaded the visitor is sent on, in milliseconds. */
export const CAMPAIGN_FORWARD_DELAY = 600;

type ForwardWindow = {
  document: Pick<Document, 'readyState'>;
  location: Pick<Location, 'replace'>;
  addEventListener: (type: 'load', listener: () => void, options?: { once: boolean }) => void;
  setTimeout: (handler: () => void, timeout: number) => unknown;
};

export function forwardCampaignVisitor(win: ForwardWindow): void {
  const go = () => win.setTimeout(() => win.location.replace(CAMPAIGN_DESTINATION), CAMPAIGN_FORWARD_DELAY);
  if (win.document.readyState === 'complete') go();
  else win.addEventListener('load', go, { once: true });
}
