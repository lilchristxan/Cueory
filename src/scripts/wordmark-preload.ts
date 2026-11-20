/**
 * The palette is a site setting rather than an OS media query. CSS can swap the
 * two logo elements immediately, but Firefox does not start a hidden lazy image
 * merely because its `loading` property changes. On desktop, give the actual
 * switch targets a concrete responsive file so both can finish before a palette
 * change. This module is bundled as a same-origin script; the strict CSP stays
 * unchanged. Phones never enter this branch.
 */
const desktop = window.matchMedia('(min-width: 40rem)');

function sourceFor(image: HTMLImageElement, targetWidth: number) {
  const candidates = (image.getAttribute('srcset') ?? '')
    .split(',')
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/, 2);
      return { url, width: Number.parseInt(descriptor ?? '', 10) };
    })
    .filter((candidate) => candidate.url && Number.isFinite(candidate.width))
    .sort((a, b) => a.width - b.width);
  return candidates.find((candidate) => candidate.width >= targetWidth)?.url ?? candidates.at(-1)?.url ?? image.src;
}

function prepare(logo: HTMLElement) {
  if (!desktop.matches) return;
  const targetWidth = Math.ceil(logo.getBoundingClientRect().width * window.devicePixelRatio);
  for (const image of logo.querySelectorAll<HTMLImageElement>('img')) {
    const source = sourceFor(image, targetWidth);
    // A concrete source makes Firefox select hidden Evening art now, not only
    // after CSS makes it visible. Keep this scoped to the desktop-only hero.
    image.srcset = '';
    image.loading = 'eager';
    image.src = source;
    void image.decode().catch(() => {});
  }
  logo.dataset.wordmarkPrepared = 'true';
}

export function prepareDesktopWordmarks() {
  const prepareAll = () => document.querySelectorAll<HTMLElement>('[data-wordmark-preload]').forEach(prepare);
  prepareAll();
  desktop.addEventListener('change', prepareAll);
}
