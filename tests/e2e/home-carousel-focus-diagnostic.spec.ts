import { expect, test } from "@playwright/test";

test.describe.configure({ retries: 0 });

/**
 * Ephemeral WebKit diagnostic for the Home carousel's first ArrowRight focus handoff.
 * This records the event, focus-call and layout timeline without changing product code or
 * relaxing the existing home-games-carousel assertions.
 */
test("Home carousel ArrowRight focus diagnostic", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "webkit-desktop",
    "diagnostic runs once in Linux WebKit desktop",
  );

  const evidence: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    const records: Array<Record<string, unknown>> = [];
    const record = (event: string, extra: Record<string, unknown> = {}) => {
      if (records.length < 120)
        records.push({ event, at: performance.now(), ...extra });
    };
    const cardState = () =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "#daily-games [data-game-card]",
        ),
      ].map((card) => ({
        game: card.dataset.gameCard,
        active: card.classList.contains("on"),
      }));
    const active = () =>
      (document.activeElement as HTMLElement | null)?.dataset.gameCard ??
      document.activeElement?.tagName;
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focus(
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      const target = this.dataset.gameCard ?? this.tagName;
      record("focus-before", { target, active: active(), cards: cardState() });
      const result = originalFocus.call(this, options);
      record("focus-after", { target, active: active(), cards: cardState() });
      return result;
    };
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          record("keydown", {
            key: event.key,
            active: active(),
            cards: cardState(),
          });
        }
      },
      true,
    );
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.matches("[data-game-card]"))
          record("focusin", {
            target: target.dataset.gameCard,
            active: active(),
            cards: cardState(),
          });
      },
      true,
    );
    Object.defineProperty(window, "__carouselFocusDiagnostic", {
      configurable: true,
      value: records,
    });
  });

  const snapshot = async (label: string) => {
    const value = await page.evaluate((label) => {
      const cards = [
        ...document.querySelectorAll<HTMLElement>(
          "#daily-games [data-game-card]",
        ),
      ];
      const track = document.querySelector<HTMLElement>("[data-games-track]");
      const car = document.querySelector<HTMLElement>("[data-games-car]");
      return {
        label,
        active:
          (document.activeElement as HTMLElement | null)?.dataset.gameCard ??
          document.activeElement?.tagName,
        carouselState: document.querySelector<HTMLElement>(
          "[data-games-carousel]",
        )?.dataset.carouselState,
        transform: track ? getComputedStyle(track).transform : null,
        scrollTop: document.documentElement.scrollTop,
        cards: cards.slice(0, 2).map((card) => ({
          game: card.dataset.gameCard,
          className: card.className,
          rect: card.getBoundingClientRect().toJSON(),
        })),
        car: car?.getBoundingClientRect().toJSON(),
        records:
          (window as unknown as { __carouselFocusDiagnostic?: unknown[] })
            .__carouselFocusDiagnostic ?? [],
      };
    }, label);
    evidence.push(value);
  };

  try {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cueory-promo-seen", String(Date.now()));
        localStorage.setItem("cueory-signup-popup-seen", String(Date.now()));
      } catch {
        // Optional storage.
      }
    });
    await page.goto("/");
    const section = page.locator("#daily-games");
    await section.scrollIntoViewIfNeeded();
    const cards = section.locator("[data-game-card]");
    const firstCard = cards.nth(0);
    const secondCard = cards.nth(1);
    await firstCard.focus();
    await expect(firstCard).toBeFocused();
    await snapshot("before-arrow-right");
    await page.keyboard.press("ArrowRight");
    await snapshot("after-arrow-right");
    await expect(secondCard).toBeFocused();
    await expect(secondCard).toHaveClass(/on/);
  } finally {
    console.log(
      `__CUEORY_DIAG__${JSON.stringify({ probe: "home-carousel-focus", evidence })}`,
    );
    await testInfo.attach("home-carousel-focus-evidence", {
      body: JSON.stringify({ evidence }, null, 2),
      contentType: "application/json",
    });
  }
});
