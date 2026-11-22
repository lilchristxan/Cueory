import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

/*
 * Ephemeral diagnostic for #634 / f8df1b91. The original hover
 * assertions below are intentionally unchanged; the only addition is a bounded
 * failure attachment that samples all related state in one page evaluation.
 */

const section = (page: Page) => page.locator("#ways-to-study");

async function showRing(page: Page) {
  await page.goto("/");
  await section(page).scrollIntoViewIfNeeded();
  await expect(section(page)).toHaveClass(/modes-p6/);
  await expect(
    section(page).getByText("one lesson, multiple ways to study", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    section(page).getByText("pick the method that fits your brain today.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(section(page)).toHaveAttribute("data-ring", "");
  await expect(section(page).locator("[data-modes-controls]")).not.toHaveClass(
    /invisible/,
  );
  await expect
    .poll(() =>
      section(page)
        .locator("[data-reveal-section]")
        .evaluate((el) => getComputedStyle(el).translate),
    )
    .toMatch(/^(none|0px)$/);
}

async function installPointerReceipt(page: Page) {
  await page.evaluate(() => {
    const key = "__vialHoverEvents";
    const events: Array<Record<string, unknown>> = [];
    (window as Window & { [key]?: Array<Record<string, unknown>> })[key] =
      events;
    for (const type of [
      "pointerenter",
      "pointermove",
      "pointerover",
      "pointerout",
      "pointerleave",
    ]) {
      window.addEventListener(
        type,
        (event) => {
          const pointer = event as PointerEvent;
          if (events.length >= 200) return;
          events.push({
            type,
            pointerType: pointer.pointerType,
            isTrusted: pointer.isTrusted,
            x: pointer.clientX,
            y: pointer.clientY,
            target:
              (pointer.target as Element | null)?.closest?.("[data-mode-card]")
                ?.id ?? null,
            relatedTarget:
              (pointer.relatedTarget as Element | null)?.closest?.(
                "[data-mode-card]",
              )?.id ?? null,
            time: performance.now(),
          });
        },
        true,
      );
    }
  });
}

async function sampleHoverState(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("#ways-to-study");
    const card = document.querySelector<HTMLElement>("#mode-video");
    const open = card?.querySelector<HTMLElement>("[data-mode-open]");
    const shine = card?.querySelector<HTMLElement>(".vial-shine");
    const image = card?.querySelector<HTMLElement>(".vial-img");
    const pointer = [
      ...((
        window as Window & {
          __vialHoverEvents?: Array<Record<string, unknown>>;
        }
      ).__vialHoverEvents ?? []),
    ]
      .reverse()
      .find(
        (event) => typeof event.x === "number" && typeof event.y === "number",
      );
    const point =
      pointer && typeof pointer.x === "number" && typeof pointer.y === "number"
        ? document.elementFromPoint(pointer.x, pointer.y)
        : null;
    const computed = (element: Element | null | undefined) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        scale: style.scale,
        translate: style.translate,
        opacity: style.opacity,
        filter: style.filter,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        transitionDelay: style.transitionDelay,
      };
    };
    const animations = (element: Element | null | undefined) =>
      element?.getAnimations().map((animation) => ({
        playState: animation.playState,
        pending: animation.pending,
        currentTime: animation.currentTime,
        target:
          (animation.effect as KeyframeEffect | null)?.target instanceof Element
            ? ((animation.effect as KeyframeEffect).target as Element).className
            : null,
        timing: animation.effect?.getComputedTiming(),
      })) ?? [];
    return {
      frame: performance.now(),
      pointer,
      elementFromPoint:
        point?.id ?? point?.closest?.("[data-mode-card]")?.id ?? null,
      cardHover: card?.matches(":hover") ?? false,
      openerFocus: open === document.activeElement,
      cardFocusWithin: card?.matches(":focus-within") ?? false,
      root: root
        ? {
            active: card?.hasAttribute("data-active") ?? false,
            autoplay: root.dataset.autoplay ?? null,
            hold: root.dataset.autoplayHold ?? null,
            carouselState: root.dataset.carouselState ?? null,
          }
        : null,
      card: computed(card),
      shine: computed(shine),
      image: computed(image),
      cardAnimations: animations(card),
      shineAnimations: animations(shine),
      events:
        (
          window as Window & {
            __vialHoverEvents?: Array<Record<string, unknown>>;
          }
        ).__vialHoverEvents ?? [],
    };
  });
}

test("scratch: preserve the vial hover contract while recording CSS state", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "firefox-desktop",
    "diagnostic runs once in Linux Firefox desktop",
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cueory-promo-seen", String(Date.now()));
      localStorage.setItem("cueory-signup-popup-seen", String(Date.now()));
    } catch {
      /* optional storage */
    }
  });
  await showRing(page);
  await installPointerReceipt(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.effect?.getComputedTiming().iterations !== Infinity &&
                a.playState === "running",
            ).length,
      ),
    )
    .toBe(0);
  const look = (id: string) =>
    page.locator(`#mode-${id}`).evaluate((card: HTMLElement) => ({
      scale: getComputedStyle(card).scale,
      translate: getComputedStyle(card).translate,
      shine: getComputedStyle(card.querySelector(".vial-shine")!).opacity,
      glass: getComputedStyle(card.querySelector(".vial-img")!).filter,
    }));
  const sideBefore = await look("cards");
  const samples: unknown[] = [];
  await page.locator("#mode-video [data-mode-open]").hover();
  samples.push(await sampleHoverState(page));
  try {
    // Original assertions, unchanged.
    await expect.poll(async () => (await look("video")).scale).toBe("1.04");
    await expect.poll(async () => (await look("video")).shine).toBe("1");
    await expect
      .poll(async () => (await look("video")).translate)
      .toBe("0px -6px");
    expect(await look("cards")).toEqual(sideBefore);
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await look("video")).scale).toBe("none");
  } catch (error) {
    samples.push(await sampleHoverState(page));
    await testInfo.attach("vial-hover-state", {
      body: JSON.stringify({ viewport: page.viewportSize(), samples }, null, 2),
      contentType: "application/json",
    });
    throw error;
  } finally {
    console.log(
      `__CUEORY_DIAG__${JSON.stringify({ probe: "vial-hover", viewport: page.viewportSize(), url: page.url(), samples })}`,
    );
    await testInfo.attach("vial-hover-state-final", {
      body: JSON.stringify(
        { viewport: page.viewportSize(), url: page.url(), samples },
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
});
