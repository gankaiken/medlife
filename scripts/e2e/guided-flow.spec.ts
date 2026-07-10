import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixtureDir = resolve('fixtures/rule-based');
const headacheEvaluation = JSON.parse(
  readFileSync(resolve(fixtureDir, 'case-headache-001.expected.json'), 'utf8'),
);

function runtimeCapabilities(overrides: Record<string, unknown> = {}) {
  return {
    backend_available: true,
    ai_debrief_available: false,
    guided_mode_available: true,
    text_ai_patient_available: false,
    voice_backend_configured: false,
    voice_frontend_supported: false,
    live_voice_usable: false,
    ehr_demo_available: false,
    triage_available: false,
    persistence_mode: 'local_storage',
    ...overrides,
  };
}

async function completeSplashAndOnboarding(page: Page) {
  await page.goto('/');
  await page.getByTestId('enter-training-floor').click({ force: true });
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('finish-onboarding').click({ force: true });
}

async function reachHeadacheEncounter(page: Page) {
  await completeSplashAndOnboarding(page);
  await page.getByTestId('start-new-case').click();
  await page.getByText(/^Polyclinics$/).click();
  await page.getByTestId('browse-case-folder').click();
  await page.getByTestId('case-card-case-headache-001').click();
  await page.getByTestId('enter-encounter').click({ force: true });
}

test('full guided browser journey saves, reopens, and survives reload with rule-based debrief', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.route('**/health', async (route) => {
    await route.fulfill({ json: runtimeCapabilities() });
  });
  await page.route('**/agent/capabilities', async (route) => {
    await route.fulfill({ json: runtimeCapabilities() });
  });
  await page.route('**/agent/debrief', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    await route.fulfill({
      json: {
        encounter_id: body.encounter_id,
        engine: 'rule_based',
        evaluation: headacheEvaluation,
        warnings: ['Rule-based assessment generated for browser verification.'],
      },
    });
  });

  await reachHeadacheEncounter(page);

  await expect(page.getByText(/Loading encounter/i)).toHaveCount(0);
  await expect(page.getByTestId('open-examination')).toBeVisible();
  await page.getByTestId('open-examination').click();
  await expect(page.getByTestId('examination-overlay')).toBeVisible();

  await page.getByTestId('history-question-ha-onset').click();
  await page.getByRole('button', { name: /Order tests/i }).click({ force: true });
  await page.getByTestId('order-test-bp-check').scrollIntoViewIfNeeded();
  await page.getByTestId('order-test-bp-check').evaluate((button: HTMLButtonElement) => button.click());
  await page.getByRole('button', { name: /Results/i }).click();
  await page.locator('[data-testid="result-bp-check"] summary').first().evaluate((summary: HTMLElement) => summary.click());
  await page.getByRole('button', { name: /Diagnose/i }).click();
  await page.getByTestId('diagnosis-option-tension_headache').click();
  await expect(page.getByText(/Diagnosis locked in:/i)).toBeVisible();
  await expect(page.getByText(/correct diagnosis|spot on|not quite/i)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('examination-overlay')).toHaveCount(0);
  await page.getByTestId('wrap-for-assessment').click({ force: true });
  await expect(page.getByTestId('end-confirm-screen')).toBeVisible();

  await page.getByText(/Have you summarised back to the patient/i).click({ force: true });
  await page.getByText(/Have you safety-netted/i).click({ force: true });
  await page.getByTestId('submit-for-assessment').click({ force: true });

  await expect(page.getByRole('heading', { name: /Rule-based assessment/i })).toBeVisible();
  await expect(page.getByText(/Asked 2 relevant history questions\./i)).toBeVisible();

  await page.getByTitle('Open profile').click();
  await expect(page.getByTestId('recent-attempts')).toContainText('Aisha Rahman');

  await page.getByTestId('open-history').click();
  await expect(page.getByTestId('history-attempts')).toContainText('Aisha Rahman');
  await page.getByTestId('history-attempts').getByText('Aisha Rahman').first().click();
  await expect(page.getByText(/A management plan was recorded\./i)).toBeVisible();

  await page.reload();
  await page.getByTestId('enter-training-floor').click({ force: true });
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('finish-onboarding').click({ force: true });
  await expect(page.getByTestId('recent-attempts')).toContainText('Aisha Rahman');

  expect(pageErrors).toEqual([]);
});

test('backend unavailable still supports guided completion and local rule-based saving', async ({ page }) => {
  await reachHeadacheEncounter(page);

  await expect(page.getByText(/Offline\/demo fallback mode/i)).toBeVisible();
  await page.getByTestId('open-examination').click();
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
  await page.getByText(/Have you safety-netted/i).click({ force: true });
  await page.getByTestId('submit-for-assessment').click({ force: true });

  await expect(page.getByRole('heading', { name: /Rule-based assessment/i })).toBeVisible();
  await expect(page.getByText(/Backend unavailable\. Showing a local rule-based assessment\./i)).toBeVisible();

  await page.getByTitle('Open profile').click();
  await expect(page.getByTestId('recent-attempts')).toContainText('Aisha Rahman');
});

test('debrief failure keeps retry available without duplicating saved attempts, and corrupted history recovers safely', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'medlife.evalHistory',
      JSON.stringify([
        {
          id: 'enc-legacy',
          encounterId: 'enc-legacy',
          savedAt: '2026-07-09T09:00:00.000Z',
          caseId: 'case-headache-001',
          caseName: 'Recovered Attempt',
          caseAge: 22,
          caseGender: 'F',
          diagnosisLabel: 'Tension headache',
          patientName: 'Recovered Attempt',
          verdict: 'good',
          engine: 'rule_based',
          evaluation: {
            case_id: 'case-headache-001',
            global_rating: 'good',
            domain_scores: {
              data_gathering: { raw: 2, max: 3, verdict: 'good' },
              clinical_management: { raw: 2, max: 3, verdict: 'good' },
              interpersonal: { raw: 2, max: 3, verdict: 'good' }
            },
            criteria: [],
            safety_breach: null,
            highlights: [],
            improvements: [],
            narrative: 'Recovered entry'
          }
        },
        { broken: true }
      ]),
    );
  });

  await page.route('**/health', async (route) => {
    await route.fulfill({ json: runtimeCapabilities() });
  });
  await page.route('**/agent/capabilities', async (route) => {
    await route.fulfill({ json: runtimeCapabilities() });
  });
  await page.route('**/agent/debrief', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'text/plain; charset=utf-8',
      body: 'debrief backend error',
    });
  });

  await completeSplashAndOnboarding(page);
  await expect(page.getByTestId('history-recovery-banner')).toContainText(/skipped safely/i);
  await expect(page.getByTestId('recent-attempts')).toContainText('Recovered Attempt');

  await page.getByTestId('start-new-case').click();
  await page.getByText(/^Polyclinics$/).click();
  await page.getByTestId('browse-case-folder').click();
  await page.getByTestId('case-card-case-headache-001').click();
  await page.getByTestId('enter-encounter').click({ force: true });
  await page.getByTestId('open-examination').click();
  await page.getByTestId('history-question-ha-onset').click();
  await page.getByRole('button', { name: /Diagnose/i }).click();
  await page.getByTestId('diagnosis-option-tension_headache').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('examination-overlay')).toHaveCount(0);
  await page.getByTestId('wrap-for-assessment').click({ force: true });
  await expect(page.getByTestId('end-confirm-screen')).toBeVisible();
  await page.getByTestId('submit-for-assessment').click({ force: true });

  await expect(page.getByRole('heading', { name: /Rule-based assessment/i })).toBeVisible();
  await expect(page.getByText(/AI debrief failed\. Showing a rule-based assessment instead\./i)).toBeVisible();
  await expect(page.getByTestId('retry-debrief')).toBeVisible();

  await page.getByTestId('retry-debrief').click();
  await page.getByTestId('retry-debrief').click();
  await page.getByTitle('Open profile').click();
  await page.getByTestId('open-history').click();
  await expect(page.getByTestId('history-attempts').locator('[data-testid^="history-attempt-"]')).toHaveCount(2);
});
