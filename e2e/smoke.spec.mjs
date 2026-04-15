import { expect, test } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_EMAIL?.trim();
const E2E_PASSWORD = process.env.E2E_PASSWORD?.trim();
const E2E_WORD = process.env.E2E_WORD?.trim() || 'vector';

async function gotoAppWithRetry(page) {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await page.goto('/', {
        // `domcontentloaded` can hang on unstable remote networks; `commit` is enough
        // because we validate app readiness via explicit UI locators below.
        waitUntil: 'commit',
        timeout: 45_000,
      });

      const status = response?.status?.();
      if (status === 401) {
        throw new Error('Preview entry returned HTTP 401 (deployment protection is blocking access).');
      }

      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await page.waitForTimeout(2_000);
      }
    }
  }

  throw new Error(
    `Failed to open app entry after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function ensureLoggedIn(page) {
  await gotoAppWithRetry(page);

  const emailInput = page.locator('input[type="email"]').first();
  const homeNav = page.getByTestId('nav-home');

  // Mobile WebKit can render slower than desktop; wait for either logged-in shell or login form.
  await Promise.race([
    homeNav.waitFor({ state: 'visible', timeout: 30_000 }),
    emailInput.waitFor({ state: 'visible', timeout: 30_000 }),
  ]);

  const onLoginPage = await emailInput.isVisible().catch(() => false);

  if (!onLoginPage) {
    await expect(homeNav).toBeVisible({ timeout: 30_000 });
    return;
  }

  if (!E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error(
      'E2E detected login page but E2E_EMAIL/E2E_PASSWORD are missing. Set them in env or .env.e2e.'
    );
  }

  await emailInput.fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  await expect(homeNav).toBeVisible({ timeout: 45_000 });
}

test('desktop smoke: login, save word, pet image, notebook translation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop-only smoke flow');

  await ensureLoggedIn(page);
  const petImage = page.getByTestId('pet-image');
  await expect(petImage).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2_000);
  await expect(petImage).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('nav-dictionary').click();
  await expect(page.getByTestId('dictionary-input')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('dictionary-input').fill(E2E_WORD);
  await page.getByTestId('dictionary-search').click();
  await Promise.race([
    page.getByText('Added to Memory').waitFor({ state: 'visible', timeout: 80_000 }),
    page.getByText('Example').first().waitFor({ state: 'visible', timeout: 80_000 }),
  ]);

  await page.getByTestId('nav-profile').click();
  await page.getByTestId('open-notebook').click();

  const firstTranslation = page.locator('[data-testid^="notebook-translation-"]').first();
  await expect(firstTranslation).toBeVisible({ timeout: 30_000 });

  const translationText = (await firstTranslation.innerText()).trim();
  expect(translationText).not.toMatch(/learning|translating/i);
});

test('mobile smoke: bottom nav is tappable and content can scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only smoke flow');

  await ensureLoggedIn(page);

  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  for (const testId of ['nav-home', 'nav-dictionary', 'nav-profile']) {
    const locator = page.getByTestId(testId);
    await expect(locator).toBeVisible({ timeout: 20_000 });
    const box = await locator.boundingBox();
    expect(box, `${testId} has no bounding box`).toBeTruthy();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  const firstScrollable = page.locator('.app-main-scroll').first();
  await expect(firstScrollable).toBeVisible({ timeout: 20_000 });

  const scrollState = await firstScrollable.evaluate((node) => ({
    before: node.scrollTop,
    hasOverflow: node.scrollHeight > node.clientHeight,
  }));

  if (!scrollState.hasOverflow) {
    test.info().annotations.push({
      type: 'note',
      description: 'No overflow in current viewport; skipped active scroll movement assertion.',
    });
    return;
  }

  const scrolled = await firstScrollable.evaluate((node) => {
    const before = node.scrollTop;
    node.scrollTop = before + 200;
    return node.scrollTop > before;
  });
  expect(scrolled).toBeTruthy();
});

test('daily review keeps progressing when image API is slow/failing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop-only BUG7 regression flow');

  await ensureLoggedIn(page);

  await page.route('**/api/image', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Simulated timeout for BUG7 regression test' }),
    });
  });

  await page.getByTestId('nav-home').click();
  await page.getByTestId('start-daily-review').click();
  await page.getByTestId('passive-play-toggle').click();

  const reviewProgress = page.getByTestId('review-progress');
  await expect(reviewProgress).toContainText(/1\//, { timeout: 20_000 });

  // BUG7 regression assertion:
  // even if image generation is slow/failing, passive review should not stay on the first word.
  await expect(reviewProgress).toContainText(/2\//, { timeout: 12_000 });
});
