import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emailProblem } from '../../src/scripts/formerrors';

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

  it('the pop-up marks the message as an alert, hidden until needed, and wires the script', () => {
    const source = readFileSync('src/components/SignupPopup.astro', 'utf8');
    expect(source).toMatch(/id="signup-popup-email-error"[^>]*role="alert"[^>]*hidden/);
    expect(source).toContain('attachEmailErrors(emailForm, emailInput, emailError)');
    expect(source).not.toMatch(/style="/);
  });
});
