import { describe, expect, it } from 'vitest';
import { kitFormAction, kitLandingUrl, newsletter, signupState } from '../../src/config/site';

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
  // The same Kit-host check guards both addresses, so a mistaken host never becomes a link or widens form-action.
  describe.each([
    ['landingUrl', kitLandingUrl],
    ['formAction', kitFormAction],
  ] as const)('%s host check', (_name, check) => {
    it('rejects hosts that are not kit.com, and addresses with sign-in details or a port', () => {
      for (const bad of [
        'https://example.com/forms/0000000/subscriptions',
        'https://kit.com.example.com/forms/0000000/subscriptions',
        'https://appkit.com/forms/0000000/subscriptions',
        'https://user:pass@app.kit.com/forms/0000000/subscriptions',
        'https://app.kit.com:8443/forms/0000000/subscriptions',
        'http://app.kit.com/forms/0000000/subscriptions',
      ]) {
        expect(check(bad), bad).toBe('');
      }
    });

    it('lowercases an uppercase scheme and host (the path keeps its case)', () => {
      expect(check('HTTPS://APP.KIT.COM/Forms/0000000')).toBe('https://app.kit.com/Forms/0000000');
    });

    it('rejects a trailing-dot host', () => {
      expect(check('https://cueory.kit.com./0000000000')).toBe('');
      expect(check('https://kit.com./0000000000')).toBe('');
    });

    it('rejects a punycode look-alike of kit.com, and keeps a real kit.com subdomain in punycode form', () => {
      // A Cyrillic "і" instead of "i": the parser turns it into punycode (xn--kt-hoc.com), which is not kit.com.
      expect(check('https://k\u0456t.com/0000000000')).toBe('');
      expect(check('https://xn--kt-hoc.com/0000000000')).toBe('');
      expect(check('https://xn--kit-abc.com/0000000000')).toBe('');
      // An international subdomain of kit.com is still Kit's own host; it is kept in its punycode form.
      expect(check('https://\u4f8b\u3048.kit.com/0000000000')).toBe('https://xn--r8jz45g.kit.com/0000000000');
    });
  });

  it('falls back from an invalid form address to the landing link, then to the pending line', () => {
    const landing = 'https://sample.kit.com/0000000000';
    expect(signupState('https://example.com/forms/0000000/subscriptions', landing)).toBe('landing');
    expect(signupState('https://example.com/forms/0000000/subscriptions', '')).toBe('pending');
    expect(signupState('https://app.kit.com./forms/0000000/subscriptions', 'https://cueory.kit.com./0000000000')).toBe('pending');
    expect(signupState('HTTPS://APP.KIT.COM/forms/0000000/subscriptions', '')).toBe('form');
  });
});
