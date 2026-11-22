import { expect, test } from "@playwright/test";

test.describe.configure({ retries: 0 });

/**
 * Scratch-only diagnostic for the exact 1440px Light Home hero case.
 *
 * This is an ephemeral diagnostic. Run once per arm on an allocated Linux
 * WebKit worker with retries disabled. It preserves the
 * production test's focus, keyboard, and navigation assertions and adds only
 * bounded evidence around view-transition admission, pageswap, requests,
 * responses, and frame commits.
 */

type Arm = "control" | "navigation-none";

async function runHeroCase(
  page: import("@playwright/test").Page,
  arm: Arm,
  evidence: Array<Record<string, unknown>>,
) {
  const note = (event: string, extra: Record<string, unknown> = {}) => {
    if (evidence.length < 80)
      evidence.push({ event, at: Date.now(), ...extra });
  };

  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/play")
      note("request", { method: request.method(), url: request.url() });
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/play")
      note("response", { status: response.status(), url: response.url() });
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/play")
      note("requestfailed", {
        method: request.method(),
        url: request.url(),
        failure: request.failure()?.errorText ?? null,
      });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      note("framenavigated", { url: frame.url() });
  });
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("__hero-lifecycle__")) {
      try {
        note("lifecycle", JSON.parse(text.slice("__hero-lifecycle__".length)));
      } catch {
        note("lifecycle", { text: text.slice(0, 240) });
      }
    } else note("console", { type: message.type(), text: text.slice(0, 240) });
  });
  page.on("pageerror", (error) =>
    note("pageerror", { text: error.message.slice(0, 240) }),
  );

  await page.addInitScript(() => {
    const events: Array<Record<string, unknown>> = [];
    const record = (event: string) => {
      if (events.length < 20)
        events.push({ event, at: performance.now(), url: location.href });
      console.info(
        "__hero-lifecycle__" +
          JSON.stringify({ event, at: performance.now(), url: location.href }),
      );
    };
    window.addEventListener("pageswap", () => record("pageswap"));
    window.addEventListener("pagehide", () => record("pagehide"));
    Object.defineProperty(window, "__heroTransitionEvidence", {
      configurable: true,
      value: events,
    });
  });

  await page.goto("/");
  if (arm === "navigation-none") {
    await page.addStyleTag({
      content: "@view-transition { navigation: none; }",
    });
    const admission = await page.evaluate(() => {
      const styles = [...document.querySelectorAll("style")];
      const diagnostic = styles.find((style) =>
        style.textContent?.includes("@view-transition"),
      );
      const rules = diagnostic?.sheet
        ? [...diagnostic.sheet.cssRules].map((rule) => rule.cssText)
        : [];
      return {
        present: Boolean(diagnostic),
        rules,
        navigationNone: rules.some((rule) =>
          /navigation\s*:\s*none/i.test(rule),
        ),
      };
    });
    note("navigation-none-admission", admission);
    expect(admission.present).toBe(true);
    expect(admission.navigationNone).toBe(true);
  }

  const hero = page.locator(".scene-hero");
  const start = hero.getByTestId("hero-start");
  await expect(start).toBeVisible();
  await expect(start).toHaveAttribute("href", "/learn/study-skills");
  for (const id of [
    "hero-support",
    "explore-lessons",
    "explore-materials",
    "explore-games",
    "explore-suggestions",
  ]) {
    const box = (await hero.getByTestId(id).boundingBox())!;
    expect(box.width, id).toBeGreaterThanOrEqual(44);
    expect(box.height, id).toBeGreaterThanOrEqual(44);
  }
  const startBox = (await start.boundingBox())!;
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await start.focus();
  await expect(start).toBeFocused();
  expect(
    await start.evaluate(
      (el) =>
        el.matches(":focus-visible") &&
        getComputedStyle(el).outlineStyle !== "none" &&
        Number.parseFloat(getComputedStyle(el).outlineWidth) > 0,
    ),
  ).toBe(true);
  for (const id of [
    "hero-support",
    "explore-lessons",
    "explore-materials",
    "explore-games",
  ]) {
    await page.keyboard.press("Tab");
    const link = hero.getByTestId(id);
    await expect(link, id).toBeFocused();
    expect(
      await link.evaluate(
        (el) =>
          el.matches(":focus-visible") &&
          getComputedStyle(el).outlineStyle !== "none" &&
          Number.parseFloat(getComputedStyle(el).outlineWidth) > 0,
      ),
      id,
    ).toBe(true);
  }
  note("before-enter", {
    url: page.url(),
    active: await page.evaluate(
      () =>
        (document.activeElement as HTMLElement | null)?.dataset.testid ??
        document.activeElement?.tagName,
    ),
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/play\/?$/);
  note("url-committed", { url: page.url() });
  note("page-lifecycle", {
    events: await page.evaluate(
      () =>
        (window as unknown as { __heroTransitionEvidence?: unknown[] })
          .__heroTransitionEvidence ?? [],
    ),
  });
}

for (const arm of ["control", "navigation-none"] as const) {
  test(`hero view-transition diagnostic (${arm})`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "webkit-desktop",
      "diagnostic runs once in Linux WebKit desktop",
    );
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
      reducedMotion: "reduce",
      hasTouch: true,
      serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("cueory-promo-seen", String(Date.now()));
        localStorage.setItem("cueory-signup-popup-seen", String(Date.now()));
      } catch {
        /* optional storage */
      }
    });
    const page = await context.newPage();
    const evidence: Array<Record<string, unknown>> = [];
    try {
      await runHeroCase(page, arm, evidence);
    } finally {
      console.log(
        `__CUEORY_DIAG__${JSON.stringify({ probe: "hero-view-transition", arm, evidence })}`,
      );
      await testInfo.attach(`hero-${arm}-evidence-final`, {
        body: JSON.stringify({ arm, url: page.url(), evidence }, null, 2),
        contentType: "application/json",
      });
      await context.close();
    }
  });
}
