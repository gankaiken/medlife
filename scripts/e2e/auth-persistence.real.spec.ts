import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixtureDir = resolve('fixtures/rule-based');
const localEvaluation = JSON.parse(
  readFileSync(resolve(fixtureDir, 'case-headache-001.expected.json'), 'utf8'),
);

function throwIfForcedFailure(marker: string) {
  if (process.env.MEDLIFE_E2E_FORCE_FAILURE === marker) {
    throw new Error(`Deliberate real-suite failure triggered for cleanup verification: ${marker}`);
  }
}

async function completeSplashAndOnboarding(page: Page) {
  await expect.poll(async () => {
    const response = await page.request.get('/');
    return response.status();
  }).toBe(200);
  await page.goto('/');
  await page.getByTestId('enter-training-floor').click({ force: true });
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('finish-onboarding').click({ force: true });
}

async function registerLearner(page: Page, suffix: string) {
  await page.getByTestId('auth-panel').getByText('Register').click();
  await page.getByTestId('register-display-name').fill(`Learner ${suffix}`);
  await page.getByTestId('auth-email').fill(`learner.${suffix}@example.com`);
  await page.getByTestId('auth-password').fill('correct horse battery');
  await page.getByTestId('register-button').click();
  await expect(page.getByTestId('auth-panel')).toContainText(`learner.${suffix}@example.com`, { timeout: 15000 });
}

async function loginLearner(page: Page, suffix: string) {
  await page.getByTestId('auth-panel').locator('span').filter({ hasText: 'Login' }).first().click();
  await page.getByTestId('auth-email').fill(`learner.${suffix}@example.com`);
  await page.getByTestId('auth-password').fill('correct horse battery');
  await page.getByTestId('login-button').click();
  await expect(page.getByTestId('auth-panel')).toContainText(`learner.${suffix}@example.com`, { timeout: 15000 });
}

async function waitForSignedOutSession(page: Page) {
  await page.waitForFunction(async () => {
    const me = await fetch('http://127.0.0.1:8787/auth/me', { credentials: 'include' });
    if (!me.ok) return false;
    const session = (await me.json()) as { authenticated?: boolean };
    if (session.authenticated) return false;
    const protectedResponse = await fetch('http://127.0.0.1:8787/encounters', { credentials: 'include' });
    return protectedResponse.status === 401;
  });
}

async function startHeadacheCase(page: Page) {
  await page.getByTestId('start-new-case').click();
  await page.getByText(/^Polyclinics$/).click();
  await page.getByTestId('browse-case-folder').click();
  await page.getByTestId('case-card-case-headache-001').click();
  await page.getByTestId('enter-encounter').click({ force: true });
  await expect(page.getByText(/Loading encounter/i)).toHaveCount(0);
}

async function completeGuidedEncounter(page: Page) {
  await page.getByTestId('open-examination').click();
  await expect(page.getByTestId('examination-overlay')).toBeVisible();
  await page.getByTestId('history-question-ha-onset').click();
  await page.getByRole('button', { name: /Order tests/i }).click({ force: true });
  await page.getByTestId('order-test-bp-check').scrollIntoViewIfNeeded();
  await page.getByTestId('order-test-bp-check').evaluate((button: HTMLButtonElement) => button.click());
  await page.getByRole('button', { name: /Diagnose/i }).click();
  await page.getByTestId('diagnosis-option-tension_headache').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('examination-overlay')).toHaveCount(0);
  await page.getByTestId('wrap-for-assessment').click({ force: true });
  await expect(page.getByTestId('end-confirm-screen')).toBeVisible();
  await page.getByText(/Have you summarised back to the patient/i).click({ force: true });
  await page.getByText(/Have you safety-netted/i).click({ force: true });
  await page.getByTestId('submit-for-assessment').click({ force: true });
  const finalHeading = page.getByRole('heading', { name: /Rule-based assessment/i });
  const loadingHeading = page.getByRole('heading', { name: /The attending is grading/i });
  await expect(finalHeading.or(loadingHeading)).toBeVisible({ timeout: 15000 });
  if (await loadingHeading.isVisible().catch(() => false)) {
    await expect(finalHeading).toBeVisible({ timeout: 15000 });
  }
}

async function getFirstEncounterId(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:8787/encounters', {
      credentials: 'include',
    });
    const payload = (await response.json()) as Array<{ id: string }>;
    return String(payload[0]?.id ?? '');
  });
}

test('real backend persists a completed authenticated attempt across logout and login', async ({ page }) => {
  await completeSplashAndOnboarding(page);
  await registerLearner(page, 'persist');

  const suspiciousKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => /auth|token|session/i.test(key)),
  );
  expect(suspiciousKeys).toEqual([]);

  await startHeadacheCase(page);
  await completeGuidedEncounter(page);
  await expect(page.getByRole('heading', { name: /Rule-based assessment/i })).toBeVisible();

  await page.getByTitle('Open profile').click();
  await expect(page.getByTestId('auth-panel')).toContainText('learner.persist@example.com');
  await page.getByTestId('logout-button').click();
  await waitForSignedOutSession(page);
  await expect(page.getByTestId('auth-panel')).toContainText('Signed-out local mode stays available', { timeout: 15000 });

  await loginLearner(page, 'persist');
  await page.getByTestId('open-history').click();
  await expect(page.getByTestId('history-attempts')).toContainText('Aisha Rahman');
  await page.locator('[data-testid^="history-attempt-"]').first().click();
  await expect(page.getByTestId('evidence-integrity-line')).toBeVisible();
});

test('real backend resumes an incomplete authenticated encounter after reload', async ({ page }) => {
  await completeSplashAndOnboarding(page);
  await registerLearner(page, 'resume');
  await startHeadacheCase(page);

  await page.getByTestId('open-examination').click();
  await page.getByTestId('history-question-ha-onset').click();
  await expect(page.getByTestId('sync-status')).toContainText(/Saved to server|Pending sync/i);

  await page.reload();
  await page.getByTestId('enter-training-floor').click({ force: true });
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('finish-onboarding').click({ force: true });

  await expect(page.getByTestId('resume-attempts')).toContainText('Aisha Rahman', { timeout: 15000 });
  await page.locator('[data-testid^="resume-attempt-"]').first().click();
  await expect(page.getByTestId('wrap-for-assessment')).toBeVisible();

  await page.getByTestId('open-examination').click();
  await page.getByRole('button', { name: /Diagnose/i }).click();
  await page.getByTestId('diagnosis-option-tension_headache').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('wrap-for-assessment').click({ force: true });
  await page.getByText(/Have you safety-netted/i).click({ force: true });
  await page.getByTestId('submit-for-assessment').click({ force: true });
  const finalHeading = page.getByRole('heading', { name: /Rule-based assessment/i });
  const loadingHeading = page.getByRole('heading', { name: /The attending is grading/i });
  await expect(finalHeading.or(loadingHeading)).toBeVisible({ timeout: 15000 });
  if (await loadingHeading.isVisible().catch(() => false)) {
    await expect(finalHeading).toBeVisible({ timeout: 15000 });
  }
});

test('real backend enforces cross-user encounter isolation', async ({ browser }) => {
  const pageA = await browser.newPage();
  await completeSplashAndOnboarding(pageA);
  await registerLearner(pageA, 'usera');
  await startHeadacheCase(pageA);
  await pageA.getByTestId('open-examination').click();
  await pageA.getByTestId('history-question-ha-onset').click();
  const encounterId = await getFirstEncounterId(pageA);
  expect(encounterId).not.toEqual('');

  const pageB = await browser.newPage();
  await completeSplashAndOnboarding(pageB);
  await registerLearner(pageB, 'userb');
  await pageB.getByTestId('open-history').click();
  await expect(pageB.getByTestId('history-empty')).toBeVisible();

  const denied = await pageB.evaluate(async (id) => {
    const response = await fetch(`http://127.0.0.1:8787/encounters/${id}`, {
      credentials: 'include',
    });
    return {
      status: response.status,
      body: await response.text(),
    };
  }, encounterId);
  expect(denied.status).toBe(404);

  await pageA.close();
  await pageB.close();
});

test('real backend offers explicit local-history migration with honest legacy integrity labels', async ({ page }) => {
  await page.addInitScript((evaluation) => {
    window.localStorage.setItem(
      'medlife.evalHistory',
      JSON.stringify([
        {
          id: 'local-import-1',
          encounterId: 'local-import-1',
          savedAt: '2026-07-11T09:00:00.000Z',
          caseId: 'case-headache-001',
          caseName: 'Aisha Rahman',
          caseAge: 28,
          caseGender: 'F',
          diagnosisLabel: 'Tension headache',
          patientName: 'Aisha Rahman',
          verdict: 'good',
          engine: 'rule_based',
          evaluation,
          integrityStatus: 'live_verified',
          patientSnapshot: {
            encounterId: 'local-import-1',
            case: {
              id: 'case-headache-001',
              caseVersion: '1.0.0',
              status: 'development_only',
              approvalStatus: 'clinical_review_required',
              reviewBanner: 'Development case - clinical review required',
              name: 'Aisha Rahman',
              age: 28,
              gender: 'F',
            },
            transcript: [],
            disclosureReceipts: [],
            conversationMode: 'guided',
            evidenceIntegrityStatus: 'live_verified',
          },
        },
      ]),
    );
  }, localEvaluation);

  await completeSplashAndOnboarding(page);
  await registerLearner(page, 'migration');

  page.once('dialog', (dialog) => dialog.accept());
  const migrationResponse = page.waitForResponse((response) => response.url().includes('/auth/migrate-local') && response.ok());
  await page.getByTestId('migrate-local-history').click();
  const migrationPayload = await (await migrationResponse).json() as Array<{ id?: string; integrity_status?: string }>;
  expect(migrationPayload[0]?.id).toBe('migrated-local-import-1');
  await expect.poll(async () => {
    return await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:8787/encounters', {
        credentials: 'include',
      });
      const attempts = (await response.json()) as Array<{ id?: string; integrity_status?: string }>;
      return attempts[0]?.id ?? '';
    });
  }).toBe('migrated-local-import-1');
  await expect(page.getByTestId('recent-attempts')).toContainText('Aisha Rahman');
  const attempts = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:8787/encounters', {
      credentials: 'include',
    });
    return (await response.json()) as Array<{ id?: string; integrity_status?: string }>;
  });
  expect(attempts[0]?.id).toBe('migrated-local-import-1');
  expect(attempts[0]?.integrity_status).toBe('server_recorded_legacy_evidence');
  throwIfForcedFailure('real-migration');
});

test('real backend flow shows pending sync during a forced save failure and recovers on retry', async ({ page }) => {
  let failedOnce = false;
  await completeSplashAndOnboarding(page);
  await registerLearner(page, 'syncfail');

  await page.route('**/encounters/*/events', async (route) => {
    if (route.request().method() === 'POST' && !failedOnce) {
      failedOnce = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'forced failure for e2e' }),
      });
      return;
    }
    await route.continue();
  });

  await startHeadacheCase(page);
  await page.getByTestId('open-examination').click();
  await page.getByTestId('history-question-ha-onset').click();
  await expect(page.getByTestId('sync-status')).toContainText(/Pending sync/i);

  await page.keyboard.press('Escape');
  await page.getByTestId('retry-sync-inline').click({ force: true });
  await expect(page.getByTestId('sync-status')).toContainText(/Saved to server/i, { timeout: 15000 });
});
