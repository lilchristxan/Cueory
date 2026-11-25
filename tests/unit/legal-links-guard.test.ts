/**
 * #747 guard on the built site: a legal page that isn't approved yet is reachable from no footer, no ☰ menu and not
 * from the sitemap, and Privacy is always linked from both. Run `npm run build` first (CI does).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { footerLinks, menuSmallLinks } from '../../src/config/site';
import { legalFooterRoutes, legalPageHasFinalCopy, visibleFooterLinks } from '../../src/config/legalfooter';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

/** The legal routes that must not be linked from navigation in this build. */
function unapprovedRoutes(): string[] {
  return Object.entries(legalFooterRoutes).filter(([, page]) => !legalPageHasFinalCopy(page)).map(([href]) => href);
}

const footerOf = (html: string) => html.match(/<footer\b[^>]*data-site-footer[\s\S]*?<\/footer>/)?.[0];
const menuOf = (html: string) => html.match(/<dialog\b[^>]*id="site-menu"[\s\S]*?<\/dialog>/)?.[0];

describe('the ☰ menu uses the same rule as the footer', () => {
  it('hides an unapproved legal link and shows it once approved', () => {
    const hrefs = (approved: boolean) => visibleFooterLinks(menuSmallLinks, () => approved).map((link) => link.href);
    expect(hrefs(false)).toEqual(['/privacy']);
    expect(hrefs(true)).toEqual(menuSmallLinks.map((link) => link.href));
  });
});

describe.runIf(existsSync(join(dist, 'index.html')))('built navigation and sitemap', () => {
  it('no footer or menu links to a legal page that is not approved yet; both always link to Privacy', () => {
    const hidden = unapprovedRoutes();
    let footers = 0;
    let menus = 0;
    for (const file of htmlFiles(dist)) {
      const html = readFileSync(file, 'utf8');
      const name = relative(dist, file);
      for (const [label, part] of [['footer', footerOf(html)], ['menu', menuOf(html)]] as const) {
        if (!part) continue;
        if (label === 'footer') footers++;
        else menus++;
        for (const href of hidden) expect(part, `${name} ${label} links to ${href}`).not.toContain(`href="${href}"`);
        // The side bar no longer lists the legal pages (they sit on the about page), so only the footer must link Privacy.
        if (label === 'footer') expect(part, `${name} ${label} has no Privacy link`).toContain('href="/privacy"');
      }
    }
    expect(footers).toBeGreaterThan(0);
    expect(menus).toBeGreaterThan(0);
  });

  it('the sitemap lists no unapproved legal page and no page that is noindex', () => {
    const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
    expect(paths.length).toBeGreaterThan(0);
    for (const href of unapprovedRoutes()) expect(paths, href).not.toContain(href);
    for (const path of paths) {
      const file = path === '/' ? join(dist, 'index.html') : join(dist, `${path.replace(/^\/|\/$/g, '')}.html`);
      const built = existsSync(file) ? file : join(dist, path, 'index.html');
      expect(existsSync(built), `${path} is in the sitemap but not built`).toBe(true);
      expect(readFileSync(built, 'utf8'), `${path} is in the sitemap but noindex`).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
    }
  });

  it('unapproved legal pages themselves stay noindex', () => {
    for (const href of unapprovedRoutes()) {
      expect(readFileSync(join(dist, `${href.slice(1)}.html`), 'utf8'), href).toMatch(/<meta name="robots" content="[^"]*noindex/);
    }
  });
});
