import { expect, test } from "@playwright/test";

/**
 * Returns the shared language toggle button in either locale.
 * @param {import("@playwright/test").Page} page
 */
function getLanguageToggle(page) {
  return page.getByRole("button", { name: /превключи на английски|switch to bulgarian/i });
}

/**
 * Returns the accessibility trigger button in either locale/state.
 * @param {import("@playwright/test").Page} page
 */
function getAccessibilityTrigger(page) {
  return page.getByRole("button", { name: /accessibility|достъпност|уиджет/i });
}

test.describe("homepage quality gates", () => {
  test("renders core controls and player actions", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /пусни|play/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /звук|mute|unmute/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /външен.*пле|external player/i })).toBeVisible();
  });

  test("switches language and updates html lang attribute", async ({ page }) => {
    await page.goto("/");

    await expect(getLanguageToggle(page)).toBeVisible();
    await getLanguageToggle(page).click();

    await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe("en");
    await expect(page.getByRole("button", { name: /switch to bulgarian/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /listen live/i })).toBeVisible();
  });

  test("opens accessibility widget and exposes readability controls", async ({ page }) => {
    await page.goto("/");

    const accessibilityTrigger = getAccessibilityTrigger(page);
    await expect(accessibilityTrigger).toBeVisible();
    await accessibilityTrigger.click();

    await expect(page.getByRole("button", { name: /increase text size|увеличи текста/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /decrease text size|намали текста/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /high contrast|контраст/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /motion|движение/i })).toBeVisible();
  });
});

test.describe("mobile behavior checks", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps language and accessibility controls usable on mobile", async ({ page }) => {
    await page.goto("/");

    await expect(getLanguageToggle(page)).toBeVisible();
    await expect(getAccessibilityTrigger(page)).toBeVisible();

    await getLanguageToggle(page).click();
    await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe("en");

    await getAccessibilityTrigger(page).click();
    await expect(page.getByRole("button", { name: /enable high contrast|включи висок контраст/i })).toBeVisible();
  });
});
