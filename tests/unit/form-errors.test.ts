import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attachEmailErrors, emailProblem } from '../../src/scripts/formerrors';

describe('inline email errors (x2 lane 9)', () => {
  it('accepts a normal address, ignoring spaces around it', () => {
    expect(emailProblem('name@example.com')).toBeNull();
    expect(emailProblem('  name@example.com ')).toBeNull();
  });

  it('says what is wrong in words, starting "problem:" so colour is never the only signal', () => {
    for (const bad of ['', '   ', 'name', 'name@', '@example.com', 'na me@example.com']) {
      expect(emailProblem(bad), JSON.stringify(bad)).toMatch(/^problem: /);
    }
  });

  it('keeps the browser verdict: a malformed domain it rejects still gets the written message', () => {
    for (const bad of ['name@example,com', 'name@example..com']) {
      expect(emailProblem(bad, true), bad).toMatch(/^problem: /);
    }
    expect(emailProblem('name@example.com', false)).toBeNull();
  });

  it('blocks the send and shows the message when the native check says type mismatch', () => {
    const listeners: Record<string, (event: { preventDefault: () => void }) => void> = {};
    const attrs = new Map<string, string>();
    const form = { noValidate: false, addEventListener: (type: string, fn: never) => (listeners[type] = fn) };
    let focused = false;
    const input = {
      value: 'name@example,com',
      validity: { typeMismatch: true },
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name),
      hasAttribute: (name: string) => attrs.has(name),
      focus: () => (focused = true),
      addEventListener: () => undefined,
    };
    const message = { id: 'signup-popup-email-error', textContent: '', hidden: true };
    attachEmailErrors(form as never, input as never, message as never);
    let prevented = false;
    listeners.submit!({ preventDefault: () => (prevented = true) });
    expect(form.noValidate).toBe(true);
    expect(prevented).toBe(true);
    expect(focused).toBe(true);
    expect(message.hidden).toBe(false);
    expect(message.textContent).toMatch(/^problem: /);
    expect(attrs.get('aria-invalid')).toBe('true');
    expect(attrs.get('aria-describedby')).toBe('signup-popup-email-error');
  });

  it('the pop-up marks the message as an alert, hidden until needed, and wires the script', () => {
    const source = readFileSync('src/components/SignupPopup.astro', 'utf8');
    expect(source).toMatch(/id="signup-popup-email-error"[^>]*role="alert"[^>]*hidden/);
    expect(source).toContain('attachEmailErrors(emailForm, emailInput, emailError)');
    expect(source).not.toMatch(/style="/);
  });
});
