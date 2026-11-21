import { describe, expect, it } from 'vitest';
import { attachEmailErrors, emailProblem } from '../../src/scripts/formerrors';

const EMPTY = 'problem: enter your email address.';

function setup(options: { value?: string; mismatch?: boolean; describedBy?: string } = {}) {
  const attrs = new Map<string, string>();
  if (options.describedBy) attrs.set('aria-describedby', options.describedBy);
  const formListeners: Record<string, (event: { preventDefault: () => void }) => void> = {};
  const inputListeners: Record<string, () => void> = {};
  const form = { noValidate: false, addEventListener: (type: string, fn: never) => { formListeners[type] = fn; } };
  const state = { focused: 0, prevented: 0 };
  const input = {
    value: options.value ?? '',
    validity: { typeMismatch: options.mismatch ?? false },
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attrs.set(name, value); },
    removeAttribute: (name: string) => { attrs.delete(name); },
    hasAttribute: (name: string) => attrs.has(name),
    focus: () => { state.focused += 1; },
    addEventListener: (type: string, fn: never) => { inputListeners[type] = fn; },
  };
  const message = { id: 'email-error', textContent: '', hidden: true };
  attachEmailErrors(form as never, input as never, message as never);
  const submit = () => formListeners.submit!({ preventDefault: () => { state.prevented += 1; } });
  return { attrs, form, input, message, state, submit, typeInto: () => inputListeners.input!() };
}

describe('email problem edges', () => {
  it.each(['', ' ', '\t', '\n', '   \n  '])('asks for an address when the value is %j', (value) => {
    expect(emailProblem(value)).toBe(EMPTY);
  });
  it('asks for an address even when the browser also reports a mismatch', () => {
    expect(emailProblem('', true)).toBe(EMPTY);
  });
  it.each(['a@b', 'a@b.c', 'a+tag@example.com', 'ünï@exämple.com', 'a.b@c-d.example'])('accepts the loose shape %j', (value) => {
    expect(emailProblem(value)).toBeNull();
  });
  it.each(['@', 'a@', '@b', 'a@b@c', 'a b@c', 'a@b c', 'a\t@b', 'a@\nb'])('refuses %j', (value) => {
    expect(emailProblem(value)).toMatch(/^problem: that email address needs an @/);
  });
  it('trims only the outside, so a space inside still fails', () => {
    expect(emailProblem(' a@b ')).toBeNull();
    expect(emailProblem(' a @b ')).not.toBeNull();
  });
  it('gives the same mismatch text for a bad shape and for the browser verdict', () => {
    expect(emailProblem('nope')).toBe(emailProblem('a@b.c', true));
  });
  it('always starts with the word problem so color is never the only signal', () => {
    for (const value of ['', 'x', ' @ ']) expect(emailProblem(value)).toMatch(/^problem: /);
  });
  it('uses lowercase brand voice in both messages', () => {
    for (const text of [emailProblem('')!, emailProblem('x')!]) expect(text).toBe(text.toLowerCase());
  });
});

describe('email form wiring edges', () => {
  it('turns off the browser bubble and does not touch the page until something happens', () => {
    const { form, message, attrs } = setup();
    expect(form.noValidate).toBe(true);
    expect(message.hidden).toBe(true);
    expect(message.textContent).toBe('');
    expect(attrs.size).toBe(0);
  });
  it('does not block a good address and leaves the box clean', () => {
    const { submit, state, message, attrs } = setup({ value: 'a@b.c' });
    submit();
    expect(state).toEqual({ focused: 0, prevented: 0 });
    expect(message.hidden).toBe(true);
    expect(attrs.has('aria-invalid')).toBe(false);
  });
  it('blocks an empty box, shows the ask, marks it invalid and moves focus to it', () => {
    const { submit, state, message, attrs } = setup({ value: '  ' });
    submit();
    expect(state).toEqual({ focused: 1, prevented: 1 });
    expect(message).toMatchObject({ hidden: false, textContent: EMPTY });
    expect(attrs.get('aria-invalid')).toBe('true');
  });
  it('keeps an existing hint and adds the message after it, in that order', () => {
    const { submit, attrs } = setup({ value: 'x', describedBy: 'hint' });
    submit();
    expect(attrs.get('aria-describedby')).toBe('hint email-error');
  });
  it('restores just the hint when the message goes away', () => {
    const { submit, input, typeInto, attrs, message } = setup({ value: 'x', describedBy: 'hint' });
    submit();
    input.value = 'a@b.c';
    typeInto();
    expect(attrs.get('aria-describedby')).toBe('hint');
    expect(attrs.has('aria-invalid')).toBe(false);
    expect(message).toMatchObject({ hidden: true, textContent: '' });
  });
  it('removes the describedby attribute completely when there was no hint and the message goes away', () => {
    const { submit, input, typeInto, attrs } = setup({ value: 'x' });
    submit();
    expect(attrs.get('aria-describedby')).toBe('email-error');
    input.value = 'a@b.c';
    typeInto();
    expect(attrs.has('aria-describedby')).toBe(false);
  });
  it('does not repeat the message id when the problem is shown twice', () => {
    const { submit, attrs } = setup({ value: 'x' });
    submit();
    submit();
    expect(attrs.get('aria-describedby')).toBe('email-error');
  });
  it('stays quiet while typing before any problem was shown', () => {
    const { input, typeInto, message, attrs } = setup({ value: '' });
    input.value = 'half';
    typeInto();
    expect(message.hidden).toBe(true);
    expect(attrs.has('aria-invalid')).toBe(false);
  });
  it('rechecks while typing once a problem is shown, and the message changes with the fix', () => {
    const { submit, input, typeInto, message } = setup({ value: '' });
    submit();
    expect(message.textContent).toBe(EMPTY);
    input.value = 'half';
    typeInto();
    expect(message.textContent).toMatch(/needs an @/);
    expect(message.hidden).toBe(false);
  });
  it('uses the browser verdict at the moment of the check, not an earlier one', () => {
    const { submit, input, state, message } = setup({ value: 'a@b.c', mismatch: true });
    submit();
    expect(state.prevented).toBe(1);
    input.validity.typeMismatch = false;
    submit();
    expect(state.prevented).toBe(1);
    expect(message.hidden).toBe(true);
  });
});
