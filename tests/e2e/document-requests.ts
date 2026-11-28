import type { Page, Request } from '@playwright/test';

function isMainDocumentRequest(page: Page, request: Request): boolean {
  if (!request.isNavigationRequest()) return false;
  try {
    return request.frame() === page.mainFrame();
  } catch {
    // Playwright can report a navigation request before its frame exists.
    return false;
  }
}

export function trackDocumentRequests(page: Page) {
  const tracker = { open: new Map<Request, number>(), lastActivity: Date.now() };
  let navigation: { url: string; previous: Request[] } | undefined;
  page.on('request', request => {
    if (isMainDocumentRequest(page, request)) {
      navigation = { url: request.url(), previous: [...tracker.open.keys()] };
    }
    tracker.open.set(request, Date.now());
    tracker.lastActivity = Date.now();
  });
  const settle = (request: Request) => {
    if (tracker.open.delete(request)) tracker.lastActivity = Date.now();
  };
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame() || !navigation
      || frame.url().split('#', 1)[0] !== navigation.url.split('#', 1)[0]) return;

    // Chromium can discard an early module request during a client redirect
    // without emitting requestfinished or requestfailed. Wait until the new
    // document commits before retiring those old requests. Requests started
    // during the new navigation (even before commit) remain tracked.
    for (const request of navigation.previous) tracker.open.delete(request);
    navigation = undefined;
    tracker.lastActivity = Date.now();
  });
  return tracker;
}
