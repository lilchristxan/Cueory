/**
 * Lets the content tools load the site's own TypeScript rules without running a build (the same approach as
 * scripts/check-content.mjs). src/content.config.ts imports `astro:content` and `astro/loaders`, which exist only
 * inside Astro: they get tiny stand-ins (defineCollection returns the collection as written, glob returns its folder
 * and pattern). The site's TypeScript also imports its own files without an extension (`./islands/fillin`), as Vite
 * allows, so those are resolved to the .ts file. Import this module before any of the site's files.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const stubs = {
  'astro:content': 'export const defineCollection = (collection) => collection;',
  'astro/loaders': 'export const glob = (options) => ({ glob: options });',
};

registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(stubs, specifier)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    }
    if (/^\.\.?\//.test(specifier) && context.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ending of ['.ts', '/index.ts']) {
        const candidate = new URL(specifier + ending, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
});
