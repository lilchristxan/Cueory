import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameHelpState } from '../../src/islands/GameHelp';

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => undefined],
}));

import GameHeader from '../../src/islands/GameHeader';
import { registerFrameHelpButton } from '../../src/islands/GameFrameControls';

const cleanups: (() => void)[] = [];

class FrameHelpButton {
  focus = vi.fn();
}

function helpWithDismissal(initial: HTMLButtonElement): GameHelpState {
  const help = {
    content: {} as GameHelpState['content'],
    firstVisit: true,
    open: false,
    button: { current: initial },
    show: () => undefined,
    close: () => undefined,
    dismiss: () => help.button.current?.focus(),
  };
  return help;
}

function mountFramedHeader(help: GameHelpState) {
  GameHeader({ name: 'crossword', help, framed: true });
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
}

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('HTMLButtonElement', FrameHelpButton);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  hooks.effects.length = 0;
  vi.unstubAllGlobals();
});

describe('framed first-visit help focus', () => {
  it.each(['before', 'after'] as const)('returns focus to the visible Frame help button when controls hydrate %s the game', (order) => {
    const hidden = new FrameHelpButton() as unknown as HTMLButtonElement;
    const visible = new FrameHelpButton() as unknown as HTMLButtonElement;
    const help = helpWithDismissal(hidden);
    let release: (() => void) | undefined;

    if (order === 'before') release = registerFrameHelpButton('crossword', visible);
    mountFramedHeader(help);
    if (order === 'after') release = registerFrameHelpButton('crossword', visible);

    help.dismiss();
    expect(visible.focus).toHaveBeenCalledOnce();
    expect(hidden.focus).not.toHaveBeenCalled();
    release?.();
  });
});
