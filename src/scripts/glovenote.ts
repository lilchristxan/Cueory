import {
  decideNote,
  messageTimeDue,
  pageKindFor,
  readVisit,
  recordShown,
  startVisit,
  writeVisit,
  type Busy,
  type Visit,
} from '../islands/stickynote';
import { isTextEntry } from './promo';

interface Glove {
  file: string;
  text: string;
  width: number;
  height: number;
}

export function startGloveNote(region: HTMLElement): void {
  const page = pageKindFor(location.pathname);
  const pageStart = performance.now();
  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = undefined;
  }
  // A browser that can't remember keeps the visit in memory: the 30 minutes then count from this page load.
  let visit: Visit = startVisit(readVisit(storage), Date.now());
  const remembered = writeVisit(storage, visit);

  /** A number from 0 (inclusive) to 1 (exclusive) from the browser's secure random source. */
  const random = () => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0]! / 4294967296;
  };

  // "A pause" means 3 seconds without the visitor touching anything.
  let lastInteraction = Date.now();
  let pointerDown = false;
  const touched = () => {
    lastInteraction = Date.now();
  };
  for (const name of ['pointermove', 'wheel', 'scroll', 'keydown', 'touchstart', 'input']) {
    window.addEventListener(name, touched, { passive: true, capture: true });
  }
  window.addEventListener('pointerdown', () => {
    pointerDown = true;
    touched();
  }, { passive: true, capture: true });
  for (const name of ['pointerup', 'pointercancel', 'dragend', 'blur']) {
    window.addEventListener(name, () => {
      pointerDown = false;
    }, { passive: true, capture: true });
  }

  /** Anything that has the visitor's attention. Any open dialog counts as the menu panel, a preview or a form. */
  const busy = (): Busy => ({
    typing: isTextEntry(document.activeElement as HTMLElement | null),
    dragging: pointerDown || document.querySelector('[aria-grabbed="true"], [data-dragging]') !== null,
    // Study islands can mark an unanswered question with data-note-busy; nothing else says "mid-question".
    midQuestion: document.querySelector('[data-note-busy]') !== null,
    menuOpen: document.querySelector('dialog[open]') !== null || document.querySelector('[data-result-dialog]') !== null,
    previewOpen: document.querySelector('[data-mode-preview][open]') !== null,
    accountMenuOpen: document.querySelector('#account-menu:not([hidden])') !== null,
  });

  let gloves: Glove[] | undefined;
  let loading = false;
  let retryAfter = 0;
  const loadGloves = () => {
    if (loading || Date.now() < retryAfter) return;
    loading = true;
    fetch('/gloves/messages.json', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { messages?: Glove[] }) => {
        gloves = Array.isArray(data.messages) && data.messages.length > 0 ? data.messages : undefined;
        if (!gloves) retryAfter = Date.now() + 60_000;
      })
      .catch(() => {
        retryAfter = Date.now() + 60_000;
      })
      .finally(() => {
        loading = false;
      });
  };

  let open: HTMLElement | null = null;
  const close = () => {
    open?.remove();
    open = null;
  };

  // One selection and one photo load at a time: the once-a-second check must not start another while one is pending.
  let pending = false;
  let photoRetryAfter = 0;
  const show = async (glove: Glove, gloveIndex: number) => {
    pending = true;
    try {
      await present(glove, gloveIndex);
    } finally {
      pending = false;
    }
  };
  const present = async (glove: Glove, gloveIndex: number) => {
    const source = `/gloves/messages/${glove.file}`;
    // Only this one photo is fetched. It is ready before the note appears, so the note never pops in empty.
    const probe = new Image();
    probe.src = source;
    const decoded = await probe.decode().then(() => true, () => false);
    if (!decoded) {
      // A photo that did not load is neither shown nor recorded; the next try waits a minute.
      photoRetryAfter = Date.now() + 60_000;
      return;
    }
    // The visitor may have started something while the photo loaded: wait for the next 3-second pause instead.
    const b = busy();
    if (open || document.hidden || Date.now() - lastInteraction < 3_000 || Object.values(b).some(Boolean)) return;

    const note = document.createElement('div');
    note.className = 'glove-note';
    note.dataset.gloveNote = '';
    note.dataset.testid = 'glove-note';
    // A named region so the note is inside a landmark (axe: all content in landmarks) only while it is on screen.
    note.setAttribute('role', 'region');
    note.setAttribute('aria-label', 'glove note');
    const link = document.createElement('a');
    link.className = 'glove-note-link';
    link.href = '/breaks';
    const image = document.createElement('img');
    image.src = source;
    image.alt = glove.text;
    image.width = glove.width;
    image.height = glove.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.className = 'glove-note-image';
    const hidden = document.createElement('span');
    hidden.className = 'sr-only';
    hidden.textContent = 'break idea';
    link.append(image, document.createTextNode(' '), hidden);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'corner-button glove-note-close';
    closeButton.setAttribute('aria-label', 'close glove note');
    closeButton.innerHTML =
      '<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>';
    closeButton.addEventListener('click', close);
    note.append(link, closeButton);
    region.append(note);
    open = note;
    visit = recordShown(visit, { show: true, kind: 'message', gloveIndex }, Date.now(), gloves?.length ?? 0);
    writeVisit(storage, visit);
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open && !event.defaultPrevented && document.querySelector('dialog[open]') === null) close();
  });

  const tick = () => {
    if (document.hidden || open || pending || Date.now() < photoRetryAfter) return;
    const now = Date.now();
    if (!messageTimeDue(visit, now)) return;
    if (!gloves) {
      loadGloves();
      return;
    }
    const decision = decideNote({
      visit,
      remembered,
      page,
      secondsOnScreen: (performance.now() - pageStart) / 1000,
      scrollFraction: 0,
      secondsIdle: (now - lastInteraction) / 1000,
      atStepEnd: false,
      busy: busy(),
      timerOn: false,
      timerBreakDue: false,
      noteOnScreen: null,
      joinedLaunchList: false,
      hasAccount: false,
      lastWelcome: null,
      random,
      now,
      gloveCount: gloves.length,
    });
    if (decision.show && decision.kind === 'message') {
      const glove = gloves[decision.gloveIndex];
      if (glove) void show(glove, decision.gloveIndex);
    }
  };
  window.setInterval(tick, 1000);
}
