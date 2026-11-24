import { describe, expect, it, vi } from 'vitest';
import { bindInfoTips, relabelInfoTip, setInfoTip } from '../../src/scripts/infotip';

type Listener = (event: FakeEvent) => void;
interface FakeEvent { target: FakeEl | null; key?: string; defaultPrevented: boolean; stopped: boolean; preventDefault(): void; stopPropagation(): void }

class FakeEl {
  attrs = new Map<string, string>();
  hidden = false;
  classes = new Set<string>();
  focus = vi.fn();
  parent: FakeEl | null = null;
  constructor(public id = '', public marks: string[] = []) {}
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  get classList() { return { remove: (name: string) => void this.classes.delete(name) }; }
  closest(selector: string): FakeEl | null {
    const mark = /^\[(data-[a-z-]+)\]$/.exec(selector)?.[1];
    for (let el: FakeEl | null = this; el; el = el.parent) if (mark && el.marks.includes(mark)) return el;
    return null;
  }
}

function page() {
  const button = new FakeEl('b1', ['data-infotip']);
  button.classes.add('invisible');
  button.setAttribute('aria-controls', 'p1');
  button.setAttribute('aria-expanded', 'false');
  const panel = new FakeEl('p1', ['data-infotip-panel']);
  panel.hidden = true;
  const inside = new FakeEl('in');
  inside.parent = panel;
  const outside = new FakeEl('out');
  const listeners: Record<string, { fn: Listener; capture: boolean }[]> = {};
  const doc = {
    getElementById: (id: string) => (id === 'p1' ? panel : null),
    querySelectorAll: () => [button],
    querySelector: (selector: string) => (selector === '[data-infotip][aria-controls="p1"]' ? button : null),
    addEventListener: (type: string, fn: Listener, capture?: boolean) => { (listeners[type] ??= []).push({ fn, capture: capture === true }); },
  };
  const fire = (type: string, target: FakeEl | null, key?: string) => {
    const event: FakeEvent = {
      target, key, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
    };
    for (const { fn } of listeners[type] ?? []) fn(event);
    return event;
  };
  return { button, panel, inside, outside, doc: doc as unknown as Document, listeners, fire };
}

describe('setInfoTip and relabelInfoTip', () => {
  it('opens and closes the panel and keeps aria-expanded in step', () => {
    const { button, panel, doc } = page();
    setInfoTip(button as unknown as HTMLElement, true, doc);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    setInfoTip(button as unknown as HTMLElement, false, doc);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('still updates the button when it has no panel or points at a missing one', () => {
    const { button, doc } = page();
    button.attrs.delete('aria-controls');
    expect(() => setInfoTip(button as unknown as HTMLElement, true, doc)).not.toThrow();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.setAttribute('aria-controls', 'missing');
    expect(() => setInfoTip(button as unknown as HTMLElement, false, doc)).not.toThrow();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('gives a new name and closes an open panel', () => {
    const { button, panel, doc } = page();
    setInfoTip(button as unknown as HTMLElement, true, doc);
    relabelInfoTip(button as unknown as HTMLElement, 'matching', doc);
    expect(button.getAttribute('aria-label')).toBe('more about matching');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });
});

describe('bindInfoTips', () => {
  it('shows the buttons and toggles on click, ignoring clicks elsewhere', () => {
    const { button, panel, outside, doc, fire } = page();
    bindInfoTips(doc);
    expect(button.classes.has('invisible')).toBe(false);
    fire('click', outside);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fire('click', button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    fire('click', button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(() => fire('click', null)).not.toThrow();
  });

  it('binds a document only once', () => {
    const { doc, listeners } = page();
    bindInfoTips(doc);
    bindInfoTips(doc);
    expect(listeners.click).toHaveLength(1);
    expect(listeners.keydown).toHaveLength(1);
    expect(listeners.keydown![0]!.capture).toBe(true);
  });

  it('closes from Escape inside the panel, returns focus to the button and stops the event', () => {
    const { button, panel, inside, doc, fire } = page();
    bindInfoTips(doc);
    setInfoTip(button as unknown as HTMLElement, true, doc);
    const event = fire('keydown', inside, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(event.stopped).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(button.focus).toHaveBeenCalledTimes(1);
  });

  it('closes from Escape on the button itself', () => {
    const { button, doc, fire } = page();
    bindInfoTips(doc);
    setInfoTip(button as unknown as HTMLElement, true, doc);
    fire('keydown', button, 'Escape');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves Escape alone when the panel is already closed, so an outer menu can handle it', () => {
    const { button, inside, doc, fire } = page();
    bindInfoTips(doc);
    const event = fire('keydown', inside, 'Escape');
    expect(event.defaultPrevented).toBe(false);
    expect(event.stopped).toBe(false);
    expect(button.focus).not.toHaveBeenCalled();
  });

  it('leaves other keys and other targets alone', () => {
    const { button, outside, doc, fire } = page();
    bindInfoTips(doc);
    setInfoTip(button as unknown as HTMLElement, true, doc);
    expect(fire('keydown', button, 'Enter').defaultPrevented).toBe(false);
    expect(fire('keydown', outside, 'Escape').defaultPrevented).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});
