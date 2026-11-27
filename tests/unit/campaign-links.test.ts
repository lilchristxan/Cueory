import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_DESTINATION, campaignSources, isCampaignSource } from '../../src/config/campaigns';
import { CAMPAIGN_FORWARD_DELAY, forwardCampaignVisitor } from '../../src/scripts/campaignlink';

describe('campaign links', () => {
  it('names each source in lower-case letters, digits and hyphens, once', () => {
    for (const source of campaignSources) expect(source).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(new Set(campaignSources).size).toBe(campaignSources.length);
    expect(isCampaignSource('tiktok')).toBe(true);
    expect(isCampaignSource('../admin')).toBe(false);
  });

  it('always ends on the home page, never on an address taken from the link', () => {
    expect(CAMPAIGN_DESTINATION).toBe('/');
  });

  const fakeWindow = (readyState: DocumentReadyState) => {
    const listeners: (() => void)[] = [];
    const timers: { handler: () => void; timeout: number }[] = [];
    const replace = vi.fn();
    return {
      win: {
        document: { readyState },
        location: { replace },
        addEventListener: (_type: 'load', listener: () => void) => { listeners.push(listener); },
        setTimeout: (handler: () => void, timeout: number) => { timers.push({ handler, timeout }); },
      },
      listeners,
      timers,
      replace,
    };
  };

  it('waits for the page to finish loading, then a short moment, before it sends the visitor on', () => {
    const { win, listeners, timers, replace } = fakeWindow('loading');
    forwardCampaignVisitor(win);
    expect(timers).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    listeners[0]!();
    expect(timers.map((t) => t.timeout)).toEqual([CAMPAIGN_FORWARD_DELAY]);
    expect(replace).not.toHaveBeenCalled();
    timers[0]!.handler();
    expect(replace).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('does not wait for a load event that has already happened', () => {
    const { win, listeners, timers } = fakeWindow('complete');
    forwardCampaignVisitor(win);
    expect(listeners).toHaveLength(0);
    expect(timers).toHaveLength(1);
  });
});
