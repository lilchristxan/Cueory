import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

/*
  With the device set to reduce motion, no element on these pages may transition, animate for longer than a frame,
  loop, or wait on a delay (lane 8). Reads the computed style of every element, including ::before and ::after.
*/
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

for (const path of ['/', '/play/pillo', '/play/sudoku', '/learn/study-skills/cards', '/support']) {
  test(`${path}: nothing moves under reduced motion`, async ({ page }) => {
    await page.goto(path);
    const moving = await page.evaluate(() => {
      const timesInMs = (value: string) => value.split(',').map((time) => {
        const amount = Number.parseFloat(time);
        return time.trim().endsWith('ms') ? amount : amount * 1000;
      });
      const found: string[] = [];
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const s = getComputedStyle(el, pseudo);
          const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}${pseudo ?? ''}`;
          if (timesInMs(s.transitionDelay).some((delay) => delay !== 0)) {
            found.push(`${name}: transition delay ${s.transitionDelay}`);
          }
          if (timesInMs(s.animationDelay).some((delay) => delay !== 0)) {
            found.push(`${name}: animation delay ${s.animationDelay}`);
          }
          if (s.transitionProperty !== 'none' && timesInMs(s.transitionDuration).some((duration) => duration > 0.01)) {
            found.push(`${name}: transition ${s.transitionProperty} ${s.transitionDuration}`);
          }
          if (s.animationName !== 'none') {
            if (timesInMs(s.animationDuration).some((duration) => duration > 0.01)) {
              found.push(`${name}: animation ${s.animationName} ${s.animationDuration}`);
            }
            if (s.animationIterationCount !== '1') found.push(`${name}: animation loops (${s.animationIterationCount})`);
          }
        }
      }
      return [...new Set(found)];
    });
    expect(moving).toEqual([]);
  });
}
