import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { footerLinks, menuLinks, site } from '../../src/config/site';
import { indexablePages } from '../../src/config/routes';

const pageSource = readFileSync(new URL('../../src/pages/message.astro', import.meta.url), 'utf8');

describe('message page shell', () => {
  it('uses the shared marketing layout and keeps the page out of search results', () => {
    expect(pageSource).toContain("import Layout from '../layouts/Layout.astro'");
    expect(pageSource).toMatch(/<Layout\b[\s\S]*?\bnoindex\b/);
    expect(pageSource).toContain('title="message us"');
    expect(pageSource).toContain('class="veil');
  });

  it('does not add a working form, fields, submit controls or scripts', () => {
    expect(pageSource).not.toMatch(/<\s*\/?\s*(?:form|input|select|textarea|button|script)\b/i);
    expect(pageSource).not.toMatch(/\b(?:action|method)\s*=/i);
    expect(pageSource).toContain('coming soon');
  });

  it('uses the configured email address for the only contact link', () => {
    expect(pageSource).toContain("import { site } from '../config/site'");
    expect(pageSource).toContain('href={`mailto:${site.contactEmail}`}');
    expect(pageSource).toContain('email {site.contactEmail}');
    expect(pageSource).not.toContain(site.contactEmail);
    expect(pageSource.match(/mailto:/g)).toHaveLength(1);
  });

  it('is linked once from the footer as drawn, but not the menu or public sitemap', () => {
    // Footer as drawn (#918, approved by Christian 2026-11-19) adds "contact" -> /message.
    expect(menuLinks.map((link) => link.href)).not.toContain('/message');
    expect(footerLinks.filter((link) => link.href === '/message')).toEqual([{ href: '/message', label: 'contact' }]);
    expect(indexablePages).not.toContain('/message');
  });

  it('explains the page-level flag and uses the approved intro copy', () => {
    expect(pageSource).toContain('flag or comment on a page');
    expect(pageSource).toContain('PATIENT_INFO_WARNING');
    expect(pageSource).toContain('Something broken, confusing or missing? An idea that would help? We read every message.');
    expect(pageSource).not.toContain('[Christian writes this]');
  });
});
