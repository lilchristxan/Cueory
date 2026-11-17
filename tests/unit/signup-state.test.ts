import { describe, expect, it } from 'vitest';
import { kitLandingUrl, newsletter, signupState } from '../../src/config/site';

// Launch-updates box states (lane 14): Kit's form, a plain link to Kit's landing page, or "sign ups open soon.".
// Every address below except the configured one is a made-up sample.
describe('launch-updates signup state', () => {
  it('accepts only an https landing page on kit.com', () => {
    expect(kitLandingUrl('https://sample.kit.com/0000000000')).toBe('https://sample.kit.com/0000000000');
    expect(kitLandingUrl('https://kit.com/sample')).toBe('https://kit.com/sample');
    for (const bad of [
      '',
      'not a url',
      'http://sample.kit.com/0000000000',
      'https://kit.com.example.com/sample',
      'https://examplekit.com/sample',
      'https://user:pass@sample.kit.com/0000000000',
      'javascript:alert(1)',
    ]) {
      expect(kitLandingUrl(bad), bad).toBe('');
    }
  });

  it('keeps the configured landing page valid', () => {
    expect(newsletter.landingUrl).toBe('https://cueory.kit.com/bfd9609b46');
    expect(kitLandingUrl(newsletter.landingUrl)).toBe(newsletter.landingUrl);
  });

  it('prefers the form, then the landing page, then the pending line', () => {
    const form = 'https://app.kit.com/forms/0000000/subscriptions';
    const landing = 'https://sample.kit.com/0000000000';
    expect(signupState(form, landing)).toBe('form');
    expect(signupState(form, '')).toBe('form');
    expect(signupState('', landing)).toBe('landing');
    expect(signupState('', 'https://example.com/not-kit')).toBe('pending');
    expect(signupState('', '')).toBe('pending');
  });
});
