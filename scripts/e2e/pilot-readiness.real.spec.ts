import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const APP_URL = process.env.MEDLIFE_E2E_APP_URL ?? 'http://127.0.0.1:4173/';
const API_ORIGIN = process.env.MEDLIFE_E2E_API_ORIGIN ?? 'http://127.0.0.1:8787';
const emails = {
  learner: process.env.MEDLIFE_E2E_ROLE_LEARNER_EMAIL ?? 'learner@example.com',
  educator: process.env.MEDLIFE_E2E_ROLE_EDUCATOR_EMAIL ?? 'educator@example.com',
  clinical: process.env.MEDLIFE_E2E_ROLE_CLINICAL_EMAIL ?? 'clinical@example.com',
  curriculum: process.env.MEDLIFE_E2E_ROLE_CURRICULUM_EMAIL ?? 'curriculum@example.com',
  admin: process.env.MEDLIFE_E2E_ROLE_ADMIN_EMAIL ?? 'admin@example.com',
};
const expectedRoles = {
  learner: 'learner',
  educator: 'educator_reviewer',
  clinical: 'clinical_reviewer',
  curriculum: 'curriculum_reviewer',
  admin: 'pilot_admin',
} as const;
type ExpectedRole = (typeof expectedRoles)[keyof typeof expectedRoles];

interface ApiJsonResponse {
  status: number;
  ok: boolean;
  json: unknown;
  text: string;
  headers: Record<string, string>;
}

interface PageDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
}

function throwIfForcedFailure(marker: string) {
  if (process.env.MEDLIFE_E2E_FORCE_FAILURE === marker) {
    throw new Error(`Deliberate pilot-readiness failure triggered for cleanup verification: ${marker}`);
  }
}

function attachPageDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { consoleErrors: [], pageErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message);
  });
  return diagnostics;
}

async function openHomeAndWait(page: Page) {
  const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  expect(response?.status()).toBe(200);
  if (await page.getByTestId('auth-panel').isVisible().catch(() => false)) return;
  if (await page.getByTestId('enter-training-floor').isVisible().catch(() => false)) {
    await page.getByTestId('enter-training-floor').click({ force: true });
  }
  if (await page.getByTestId('onboarding-next').isVisible().catch(() => false)) {
    await page.getByTestId('onboarding-next').click();
  }
  if (await page.getByTestId('onboarding-next').isVisible().catch(() => false)) {
    await page.getByTestId('onboarding-next').click();
  }
  if (await page.getByTestId('finish-onboarding').isVisible().catch(() => false)) {
    await page.getByTestId('finish-onboarding').click({ force: true });
  }
  await expect(page.getByTestId('app-ready')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByTestId('auth-panel')).toBeVisible({ timeout: 15000 });
}

async function collectHistoricalDebriefDiagnostics(
  page: Page,
  encounterId: string,
  diagnostics: PageDiagnostics,
  navigationStatus: number | null,
) {
  const selectorStates = await page.evaluate(() => {
    const has = (value: string) => document.querySelector(`[data-testid="${value}"]`) !== null;
    return {
      readyState: document.readyState,
      appReady: has('app-ready'),
      historicalReady: has('historical-debrief-ready'),
      historicalLoading: has('historical-debrief-loading'),
      historicalUnavailable: has('historical-debrief-unavailable'),
      historicalError: has('historical-debrief-error'),
      historicalEmpty: has('historical-debrief-empty'),
      evidenceIntegrity: has('evidence-integrity-line'),
    };
  }).catch((error) => ({ evaluateError: error instanceof Error ? error.message : String(error) }));

  const authState = await readSession(page)
    .then((response) => response.json)
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const encounterState = await apiRequest(page, `/encounters/${encodeURIComponent(encounterId)}`)
    .then((response) => ({ status: response.status, json: response.json }))
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  return {
    targetUrl: `${APP_URL}history/${encodeURIComponent(encounterId)}/debrief`,
    finalUrl: page.url(),
    navigationStatus,
    selectorStates,
    authState,
    encounterState,
    consoleErrors: diagnostics.consoleErrors,
    pageErrors: diagnostics.pageErrors,
  };
}

async function openHistoricalDebriefAndWait(
  page: Page,
  encounterId: string,
  expectedState: 'owner' | 'non_owner',
) {
  const diagnostics = attachPageDiagnostics(page);
  const targetUrl = `${APP_URL}history/${encodeURIComponent(encounterId)}/debrief`;
  let navigationStatus: number | null = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    expect(response, 'historical debrief navigation response missing').toBeTruthy();
    navigationStatus = response?.status() ?? null;
    expect(navigationStatus, 'historical debrief navigation status').toBe(200);
    await expect(page.getByTestId('app-ready')).toHaveCount(1, { timeout: 15000 });
    if (expectedState === 'owner') {
      await expect(page.getByTestId('historical-debrief-ready')).toHaveCount(1, { timeout: 15000 });
      await expect(page.getByTestId('evidence-integrity-line')).toBeVisible({ timeout: 15000 });
      return;
    }
    await expect(page.getByTestId('historical-debrief-unavailable')).toHaveCount(1, { timeout: 15000 });
  } catch (error) {
    const detail = await collectHistoricalDebriefDiagnostics(page, encounterId, diagnostics, navigationStatus);
    throw new Error(
      `historical debrief ${expectedState} navigation failed: ${
        error instanceof Error ? error.message : String(error)
      }\n${JSON.stringify(detail, null, 2)}`,
    );
  }
}

async function readSession(page: Page) {
  return await apiRequest(page, '/auth/me');
}

async function apiJsonRequest(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<ApiJsonResponse> {
  const response = await fetch(new URL(path, API_ORIGIN).toString(), {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    ok: response.ok,
    json,
    text,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function ensureServerAccount(email: string, displayName: string, expectedRole: ExpectedRole) {
  const register = await apiJsonRequest('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, display_name: displayName },
  });
  if (register.status !== 409) {
    expect(register.status).toBe(200);
    expect((register.json as { user?: { role?: string; email?: string } }).user?.email).toBe(email);
    expect((register.json as { user?: { role?: string; email?: string } }).user?.role).toBe(expectedRole);
    return;
  }
  const login = await apiJsonRequest('/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  expect(login.status).toBe(200);
  expect((login.json as { user?: { role?: string; email?: string } }).user?.email).toBe(email);
  expect((login.json as { user?: { role?: string; email?: string } }).user?.role).toBe(expectedRole);
}

async function assertCurrentRole(page: Page, email: string, expectedRole: ExpectedRole) {
  const session = await readSession(page);
  const payload = session.json as { authenticated?: boolean; user?: { email?: string; role?: string } | null };
  expect(payload.authenticated).toBeTruthy();
  expect(String(payload.user?.email ?? '')).toBe(email);
  expect(String(payload.user?.role ?? '')).toBe(expectedRole);
}

async function ensureAccount(page: Page, email: string, displayName: string, expectedRole: ExpectedRole) {
  await openHomeAndWait(page);
  const panel = page.getByTestId('auth-panel');
  const currentSession = await readSession(page).catch(() => null);
  const currentPayload = currentSession?.json as { authenticated?: boolean; user?: { email?: string } | null } | null;
  if (currentPayload?.authenticated && String(currentPayload.user?.email ?? '') !== email) {
    await logoutIfNeeded(page);
  }
  if (await panel.getByText(email).isVisible().catch(() => false)) {
    await assertCurrentRole(page, email, expectedRole);
    return;
  }
  await panel.getByText('Register').click();
  await page.getByTestId('register-display-name').fill(displayName);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('register-button').click();
  const duplicateMessage = /That account could not be created with the current details\./i;
  const outcome = await expect
    .poll(async () => {
      const text = (await panel.textContent()) ?? '';
      const session = await readSession(page).catch(() => null);
      const payload = session?.json as { authenticated?: boolean; user?: { email?: string } | null } | null;
      if (payload?.authenticated && String(payload.user?.email ?? '') === email) return 'registered';
      if (duplicateMessage.test(text)) return 'duplicate';
      return 'pending';
    }, { timeout: 15000 })
    .not.toBe('pending')
    .then(async () => {
      const text = (await panel.textContent()) ?? '';
      const session = await readSession(page).catch(() => null);
      const payload = session?.json as { authenticated?: boolean; user?: { email?: string } | null } | null;
      if (payload?.authenticated && String(payload.user?.email ?? '') === email) return 'registered';
      return duplicateMessage.test(text) ? 'duplicate' : 'pending';
    });
  if (outcome === 'duplicate') {
    await loginAccount(page, email, expectedRole);
    return;
  }
  await expect(page.getByTestId('auth-panel')).toContainText(email, { timeout: 15000 });
  await assertCurrentRole(page, email, expectedRole);
}

async function loginAccount(page: Page, email: string, expectedRole: ExpectedRole) {
  await openHomeAndWait(page);
  const currentSession = await readSession(page).catch(() => null);
  const currentPayload = currentSession?.json as { authenticated?: boolean; user?: { email?: string } | null } | null;
  if (currentPayload?.authenticated && String(currentPayload.user?.email ?? '') !== email) {
    await logoutIfNeeded(page);
  }
  if (currentPayload?.authenticated && String(currentPayload.user?.email ?? '') === email) {
    await assertCurrentRole(page, email, expectedRole);
    return;
  }
  const login = await page.evaluate(
    async ({ nextEmail, password }) => {
      const response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nextEmail, password }),
      });
      return { status: response.status, json: await response.json() };
    },
    { nextEmail: email, password: PASSWORD },
  );
  expect(login.status).toBe(200);
  await page.reload();
  await openHomeAndWait(page);
  await expect
    .poll(async () => {
      const session = await readSession(page).catch(() => null);
      const payload = session?.json as { authenticated?: boolean; user?: { email?: string } | null } | null;
      return payload?.authenticated && String(payload.user?.email ?? '') === email;
    }, { timeout: 15000 })
    .toBeTruthy();
  await assertCurrentRole(page, email, expectedRole);
}

async function logoutIfNeeded(page: Page) {
  const logoutButton = page.getByTestId('logout-button');
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
    await expect(page.getByTestId('auth-panel')).toContainText(/Signed-out local mode stays available/i);
  }
}

async function registerAllRoles(browser: Browser) {
  const roles = [
    ['learner', emails.learner, 'Learner Pilot', expectedRoles.learner],
    ['educator', emails.educator, 'Educator Reviewer', expectedRoles.educator],
    ['clinical', emails.clinical, 'Clinical Reviewer', expectedRoles.clinical],
    ['curriculum', emails.curriculum, 'Curriculum Reviewer', expectedRoles.curriculum],
    ['admin', emails.admin, 'Pilot Admin', expectedRoles.admin],
  ] as const;
  for (const [, email, name, expectedRole] of roles) {
    await ensureServerAccount(email, name, expectedRole);
  }
}

async function registerRoleIfNeeded(_browser: Browser, email: string, displayName: string, expectedRole: ExpectedRole) {
  await ensureServerAccount(email, displayName, expectedRole);
}

async function apiRequest(page: Page, path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
  return await page.evaluate(
    async ({ path: requestPath, method, body }) => {
      const csrfCookie = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('medlife_csrf='));
      const csrf = csrfCookie ? decodeURIComponent(csrfCookie.slice('medlife_csrf='.length)) : null;
      const headers: Record<string, string> = {};
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
      if (csrf && method && method !== 'GET') {
        headers['X-CSRF-Token'] = csrf;
      }
      const response = await fetch(requestPath, {
        method,
        credentials: 'include',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return {
        status: response.status,
        ok: response.ok,
        text,
        json,
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
    { path, method: options.method ?? 'GET', body: options.body ?? null },
  );
}

async function choosePolyclinic(page: Page) {
  const stageSelect = page.getByTestId('learner-stage-select');
  if (await stageSelect.isVisible().catch(() => false)) {
    await stageSelect.selectOption('early_clinical');
  }
  await page.getByTestId('start-new-case').click();
  await page.getByText(/^Polyclinics$/).click();
  await page.getByTestId('browse-case-folder').click();
}

async function startHeadacheCase(page: Page) {
  await choosePolyclinic(page);
  await page.getByTestId('case-card-case-headache-001').click();
  await page.getByTestId('enter-encounter').click({ force: true });
  await expect(page.getByText(/Loading encounter/i)).toHaveCount(0, { timeout: 15000 });
}

async function completeAccessibleCase(page: Page) {
  await startHeadacheCase(page);
  const accessibleButton = page.getByTestId('open-examination-accessible');
  if (await accessibleButton.isVisible().catch(() => false)) {
    await accessibleButton.click();
  } else {
    await page.getByTestId('open-examination').click();
  }
  await page.getByTestId('history-question-ha-onset').click();
  await page.getByRole('button', { name: /Order tests/i }).click({ force: true });
  await page.getByTestId('order-test-bp-check').scrollIntoViewIfNeeded();
  await page.getByTestId('order-test-bp-check').evaluate((button: HTMLButtonElement) => button.click());
  await page.getByRole('button', { name: /Results/i }).click({ force: true });
  await page.locator('[data-testid="result-bp-check"] summary').first().evaluate((summary: HTMLElement) => summary.click());
  await page.getByRole('button', { name: /Diagnose/i }).click();
  await page.getByTestId('diagnosis-option-tension_headache').click();
  await page.keyboard.press('Escape');
  const wrapAccessible = page.getByTestId('wrap-for-assessment-accessible');
  if (await wrapAccessible.isVisible().catch(() => false)) {
    await wrapAccessible.click();
  } else {
    await page.getByTestId('wrap-for-assessment').click({ force: true });
  }
  await page.getByText(/Have you summarised back to the patient/i).click({ force: true }).catch(() => undefined);
  await page.getByText(/Have you safety-netted/i).click({ force: true });
  await page.getByTestId('submit-for-assessment').click({ force: true });
  await expect(page.getByRole('heading', { name: /Rule-based assessment/i })).toBeVisible({ timeout: 15000 });
}

async function getFirstEncounter(page: Page) {
  const response = await apiRequest(page, '/encounters');
  expect(response.status).toBe(200);
  return (response.json as Array<Record<string, unknown>>)[0];
}

async function listEncounterIds(page: Page) {
  const response = await apiRequest(page, '/encounters');
  expect(response.status).toBe(200);
  return new Set((response.json as Array<Record<string, unknown>>).map((item) => String(item.id)));
}

async function waitForNewCompletedEncounter(page: Page, previousEncounterIds: Set<string>) {
  await expect
    .poll(async () => {
      const response = await apiRequest(page, '/encounters');
      const attempts = response.json as Array<Record<string, unknown>>;
      const created = attempts.find(
        (item) => !previousEncounterIds.has(String(item.id)) && String(item.status) === 'completed',
      );
      if (!created) return null;
      return {
        id: String(created.id),
        status: String(created.status),
        completedAt: String(created.completed_at ?? ''),
      };
    }, { timeout: 30000 })
    .not.toBeNull();

  const response = await apiRequest(page, '/encounters');
  const attempts = response.json as Array<Record<string, unknown>>;
  const created = attempts.find(
    (item) => !previousEncounterIds.has(String(item.id)) && String(item.status) === 'completed',
  );
  expect(created).toBeTruthy();
  return created as Record<string, unknown>;
}

async function waitForNewEncounter(page: Page, previousEncounterIds: Set<string>) {
  await expect
    .poll(async () => {
      const response = await apiRequest(page, '/encounters');
      const attempts = response.json as Array<Record<string, unknown>>;
      return attempts.find((item) => !previousEncounterIds.has(String(item.id))) ?? null;
    }, { timeout: 30000 })
    .not.toBeNull();

  const response = await apiRequest(page, '/encounters');
  const attempts = response.json as Array<Record<string, unknown>>;
  const created = attempts.find((item) => !previousEncounterIds.has(String(item.id)));
  expect(created).toBeTruthy();
  return created as Record<string, unknown>;
}

async function waitForEncounterStatus(page: Page, encounterId: string, status: string) {
  await expect
    .poll(async () => {
      const response = await apiRequest(page, '/encounters');
      const attempts = response.json as Array<Record<string, unknown>>;
      const attempt = attempts.find((item) => String(item.id) === encounterId);
      return attempt ? String(attempt.status ?? '') : null;
    }, { timeout: 30000 })
    .toBe(status);
}

function buildHeadacheDraftSnapshot(encounterId: string) {
  return {
    encounterId,
    arrivedAt: 1720603200000,
    bedIndex: 0,
    case: {
      id: 'case-headache-001',
      caseVersion: '1.0.0',
      status: 'development_only',
      approvalStatus: 'clinical_review_required',
      reviewBanner: 'Development case - clinical review required',
      name: 'Aisha Rahman',
      age: 28,
      gender: 'F',
      diagnosisOptions: ['tension_headache', 'migraine', 'community_acquired_pneumonia'],
    },
    askedQuestionIds: [],
    orderedTestIds: [],
    completedTestIds: [],
    viewedResultIds: [],
    testOrderedAt: {},
    givenTreatmentIds: [],
    prescriptions: [],
    submittedDiagnosisId: null,
    conversationMode: 'guided',
    conversationTurnCount: 0,
    failedConversationTurnIds: [],
    fallbackTransitions: [],
    transcript: [],
    disclosureReceipts: [],
    evidenceIntegrityStatus: 'pending_sync',
    completedAt: null,
    endConfirm: { sum: false, safe: false, ice: false },
  };
}

async function seedHistoricalDebriefFixture(page: Page, encounterId: string) {
  const draftSnapshot = buildHeadacheDraftSnapshot(encounterId);
  expect((await apiRequest(page, '/encounters', {
    method: 'POST',
    body: {
      encounter_id: encounterId,
      case_id: 'case-headache-001',
      conversation_mode: 'guided',
      draft_snapshot: draftSnapshot,
    },
  })).status).toBe(200);
  expect((await apiRequest(page, `/encounters/${encodeURIComponent(encounterId)}/assessment`, {
    method: 'POST',
    body: {
      completion_snapshot: {
        ...draftSnapshot,
        submittedDiagnosisId: 'tension_headache',
        completedAt: Date.now(),
        evidenceIntegrityStatus: 'server_verified',
        endConfirm: { sum: true, safe: true, ice: false },
      },
      integrity_status: 'server_verified',
      engine: 'rule_based',
      assessment_status: 'completed',
      evaluation: {
        case_id: 'case-headache-001',
        global_rating: 'satisfactory',
        domain_scores: {
          data_gathering: { raw: 2, max: 3, verdict: 'satisfactory' },
          clinical_management: { raw: 2, max: 3, verdict: 'satisfactory' },
          interpersonal: { raw: 2, max: 3, verdict: 'satisfactory' },
        },
        criteria: [],
        highlights: [],
        improvements: [],
        narrative: 'Direct-link historical debrief fixture.',
        safety_breach: null,
      },
      evidence_refs: [],
      receipts: [],
    },
  })).status).toBe(200);
}

async function openEducatorWorkspaceAndWait(page: Page, email: string, expectedRole: Exclude<ExpectedRole, 'learner'>) {
  await loginAccount(page, email, expectedRole);
  if (!(await page.getByTestId('open-pilot-workspace').isVisible().catch(() => false))) {
    await page.getByTitle('Open profile').click();
  }
  await page.getByTestId('open-pilot-workspace').click();
  await expect(page.getByText(/Educator and reviewer workspace/i)).toBeVisible();
}

async function scanForCriticalA11y(page: Page, label: string, includeSelectors: string[] = ['body']) {
  let builder = new AxeBuilder({ page });
  for (const selector of includeSelectors) {
    builder = builder.include(selector);
  }
  const results = await builder.analyze();
  const blocking = results.violations.filter((item) => {
    if (item.impact !== 'serious' && item.impact !== 'critical') return false;
    if (label === 'case library' && item.id === 'color-contrast') return false;
    return true;
  });
  expect(blocking, `${label} serious/critical accessibility violations`).toEqual([]);
}

async function enableStubbedTextAiPatient(page: Page) {
  await page.route('**/health', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({
      response,
      json: {
        ...json,
        backend_available: true,
        text_ai_patient_available: true,
      },
    });
  });
  await page.route('**/agent/capabilities', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({
      response,
      json: {
        ...json,
        backend_available: true,
        text_ai_patient_available: true,
      },
    });
  });
  await page.route('**/agent/patient/respond', async (route) => {
    const body = route.request().postDataJSON() as {
      encounter_id: string;
      case_id: string;
      learner_message_id: string;
      conversation_turn_number: number;
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message_id: `patient-${body.learner_message_id}`,
        encounter_id: body.encounter_id,
        case_id: body.case_id,
        patient_reply: 'I have mostly been worried that the cough is getting worse at night.',
        engine: 'ai_text',
        timestamp: Date.now(),
        eligible_fact_ids: ['hx_cough_duration', 'hx_cough_worse_night'],
        verified_disclosed_fact_ids: ['hx_cough_worse_night'],
        disclosure_receipt: {
          receiptId: `receipt-${body.learner_message_id}`,
          encounterId: body.encounter_id,
          learnerMessageId: body.learner_message_id,
          patientMessageId: `patient-${body.learner_message_id}`,
          caseId: body.case_id,
          caseVersion: '1.0.0',
          eligibleFactIds: ['hx_cough_duration', 'hx_cough_worse_night'],
          verifiedDisclosedFactIds: ['hx_cough_worse_night'],
          historyDomainIds: ['history_of_presenting_complaint'],
          conversationTurn: body.conversation_turn_number,
          engine: 'ai_text',
          createdAt: Date.now(),
          integrityDigest: `digest-${body.learner_message_id}`,
          integritySource: 'backend',
          status: 'verified',
        },
        refused_hidden_request: false,
        conversation_status: 'answered',
        safety_status: 'ok',
      }),
    });
  });
}

async function focusAndPress(locator: Locator, key: 'Enter' | ' ') {
  await locator.focus();
  await locator.press(key === ' ' ? 'Space' : key);
}

async function setCheckboxWithKeyboard(locator: Locator, desiredChecked: boolean) {
  await locator.focus();
  const currentlyChecked = await locator.isChecked();
  if (currentlyChecked !== desiredChecked) {
    await locator.press('Space');
  }
  if (desiredChecked) {
    await expect(locator).toBeChecked();
    return;
  }
  await expect(locator).not.toBeChecked();
}

async function setSelectWithKeyboard(locator: Locator, desiredValue: string, orderedValues: readonly string[]) {
  await locator.focus();
  const currentValue = await locator.inputValue();
  if (currentValue === desiredValue) return;
  const currentIndex = orderedValues.indexOf(currentValue);
  const desiredIndex = orderedValues.indexOf(desiredValue);
  expect(currentIndex, `unknown current select value ${currentValue}`).toBeGreaterThanOrEqual(0);
  expect(desiredIndex, `unknown desired select value ${desiredValue}`).toBeGreaterThanOrEqual(0);
  const step = desiredIndex > currentIndex ? 1 : -1;
  const key = step > 0 ? 'ArrowDown' : 'ArrowUp';
  for (let index = currentIndex; index !== desiredIndex; index += step) {
    await locator.press(key);
  }
  await expect(locator).toHaveValue(desiredValue);
}

async function waitForPreferenceState(
  page: Page,
  expected: Partial<{
    non_3d_mode: boolean;
    low_bandwidth_mode: boolean;
    reduced_motion_mode: boolean;
    background_audio_enabled: boolean;
  }>,
) {
  await expect
    .poll(async () => {
      const response = await apiRequest(page, '/auth/preferences');
      const payload = response.json as Record<string, unknown>;
      return Object.entries(expected).every(([key, value]) => payload[key] === value);
    })
    .toBeTruthy();
}

async function waitForConsentStatus(
  page: Page,
  expectedStatus: 'consented' | 'declined' | 'withdrawn' | 'not_answered',
) {
  await expect
    .poll(async () => {
      const response = await apiRequest(page, '/auth/research-consent-events');
      const items = response.json as Array<Record<string, unknown>>;
      return String(items[0]?.research_participation_status ?? '');
    })
    .toBe(expectedStatus);
}

async function waitForResearchExportRowCount(page: Page, expectedMinimum: number) {
  await expect
    .poll(async () => {
      const response = await apiRequest(page, '/pilot/research/export');
      const payload = response.json as { rows?: Array<unknown> };
      return payload.rows?.length ?? 0;
    })
    .toBeGreaterThanOrEqual(expectedMinimum);
}

async function waitForEligibleResearchAttempt(page: Page, encounterId: string) {
  await expect
    .poll(
      async () => {
        const response = await apiRequest(
          page,
          `/test-support/research-export-eligibility?encounter_id=${encodeURIComponent(encounterId)}`,
        );
        const payload = response.json as {
          attempts?: Array<{ eligible?: boolean; reason?: string; details?: Record<string, unknown> }>;
        };
        return payload.attempts?.[0] ?? null;
      },
      { timeout: 30000 },
    )
    .toMatchObject({ eligible: true, reason: 'eligible' });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

test('pilot readiness role boundaries are enforced through backend and browser-visible access', async ({ browser }) => {
  await registerAllRoles(browser);

  const learner = await browser.newPage();
  const pages: Page[] = [learner];
  try {
    await loginAccount(learner, emails.learner, expectedRoles.learner);
    const selfPromote = await learner.evaluate(async (email) => {
      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'correct horse battery', display_name: 'Self Promote', role: 'pilot_admin' }),
      });
      return { status: response.status, json: await response.json() };
    }, `promote.${Date.now()}@example.com`);
    expect(selfPromote.status).toBe(200);
    expect(selfPromote.json.user.role).toBe('learner');

    await completeAccessibleCase(learner);
    const encounter = await getFirstEncounter(learner);
    const encounterId = String(encounter.id);

    const learnerAttempts = await apiRequest(learner, '/pilot/attempts');
    const learnerScoreDenied = await apiRequest(learner, `/pilot/attempts/${encounterId}/scores`, {
      method: 'POST',
      body: {
        rubric_version: 'medlife-formative-rubric-v1',
        review_mode: 'independent',
        overall_score: 70,
        overall_category: 'satisfactory',
        domain_scores: { data_gathering: { verdict: 'satisfactory' } },
        safety_findings: [],
        missed_history_concepts: [],
        investigation_evaluation: 'n/a',
        diagnosis_evaluation: 'n/a',
        communication_evaluation: 'n/a',
        educator_comment: 'denied',
        confidence_label: 'medium',
        review_minutes: 5,
        submit_status: 'submitted',
      },
    });
    const learnerClinicalDenied = await apiRequest(learner, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: {
        review_type: 'clinical',
        decision: 'request_revision',
        comments: 'deny learner',
        fixture_label: 'development_test_fixture',
      },
    });
    const learnerCurriculumDenied = await apiRequest(learner, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: {
        review_type: 'curriculum',
        decision: 'request_revision',
        comments: 'deny learner',
        mapping_version: '1.0.0',
        fixture_label: 'development_test_fixture',
      },
    });
    const learnerExportDenied = await apiRequest(learner, '/pilot/research/export');
    expect(learnerAttempts.status).toBe(403);
    expect(learnerScoreDenied.status).toBe(403);
    expect(learnerClinicalDenied.status).toBe(403);
    expect(learnerCurriculumDenied.status).toBe(403);
    expect(learnerExportDenied.status).toBe(403);
    await expect(learner.getByTestId('open-pilot-workspace')).toHaveCount(0);

    const educator = await browser.newPage();
    pages.push(educator);
    await openEducatorWorkspaceAndWait(educator, emails.educator, expectedRoles.educator);
    expect((await apiRequest(educator, '/pilot/attempts')).status).toBe(200);
    expect((await apiRequest(educator, '/pilot/research/export')).status).toBe(403);
    expect((await apiRequest(educator, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: { review_type: 'clinical', decision: 'request_revision', comments: 'deny educator', fixture_label: 'development_test_fixture' },
    })).status).toBe(403);
    expect((await apiRequest(educator, `/pilot/attempts/${encounterId}/scores`, {
      method: 'POST',
      body: {
        rubric_version: 'medlife-formative-rubric-v1',
        review_mode: 'independent',
        overall_score: 82,
        overall_category: 'good',
        domain_scores: { data_gathering: { verdict: 'good' } },
        safety_findings: [],
        missed_history_concepts: ['stress context'],
        investigation_evaluation: 'Appropriate',
        diagnosis_evaluation: 'Reasonable',
        communication_evaluation: 'Clear',
        educator_comment: 'Educator score allowed.',
        confidence_label: 'high',
        review_minutes: 8,
        submit_status: 'submitted',
      },
    })).status).toBe(200);

    const clinical = await browser.newPage();
    pages.push(clinical);
    await openEducatorWorkspaceAndWait(clinical, emails.clinical, expectedRoles.clinical);
    expect((await apiRequest(clinical, '/pilot/attempts')).status).toBe(200);
    expect((await apiRequest(clinical, `/pilot/attempts/${encounterId}/scores`, {
      method: 'POST',
      body: {
        rubric_version: 'medlife-formative-rubric-v1',
        review_mode: 'independent',
        overall_score: 50,
        overall_category: 'borderline',
        domain_scores: {},
        safety_findings: [],
        missed_history_concepts: [],
        investigation_evaluation: 'n/a',
        diagnosis_evaluation: 'n/a',
        communication_evaluation: 'n/a',
        educator_comment: 'should deny',
        confidence_label: 'low',
        review_minutes: 5,
        submit_status: 'submitted',
      },
    })).status).toBe(403);
    expect((await apiRequest(clinical, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: { review_type: 'clinical', decision: 'request_revision', comments: 'Clinical request revision', fixture_label: 'development_test_fixture' },
    })).status).toBe(200);
    expect((await apiRequest(clinical, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: { review_type: 'curriculum', decision: 'request_revision', comments: 'deny clinical', mapping_version: '1.0.0', fixture_label: 'development_test_fixture' },
    })).status).toBe(403);

    const curriculum = await browser.newPage();
    pages.push(curriculum);
    await openEducatorWorkspaceAndWait(curriculum, emails.curriculum, expectedRoles.curriculum);
    expect((await apiRequest(curriculum, '/pilot/attempts')).status).toBe(200);
    expect((await apiRequest(curriculum, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: { review_type: 'curriculum', decision: 'request_revision', comments: 'Curriculum request revision', mapping_version: '1.0.0', fixture_label: 'development_test_fixture' },
    })).status).toBe(200);
    expect((await apiRequest(curriculum, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: { review_type: 'clinical', decision: 'request_revision', comments: 'deny curriculum', fixture_label: 'development_test_fixture' },
    })).status).toBe(403);
    expect((await apiRequest(curriculum, '/pilot/research/export')).status).toBe(403);

    const admin = await browser.newPage();
    pages.push(admin);
    await openEducatorWorkspaceAndWait(admin, emails.admin, expectedRoles.admin);
    const exportAllowed = await apiRequest(admin, '/pilot/research/export');
    expect(exportAllowed.status).toBe(200);
    expect(exportAllowed.headers['content-type']).toContain('application/json');
    expect(exportAllowed.headers['cache-control']).toContain('no-store');
  } finally {
    await Promise.all(pages.map(async (page) => page.close().catch(() => undefined)));
  }
});

test('pilot readiness review versions, consent flow, and research export behavior remain auditable', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  await registerRoleIfNeeded(browser, emails.clinical, 'Clinical Reviewer', expectedRoles.clinical);
  await registerRoleIfNeeded(browser, emails.curriculum, 'Curriculum Reviewer', expectedRoles.curriculum);
  await registerRoleIfNeeded(browser, emails.admin, 'Pilot Admin', expectedRoles.admin);
  const learner = await browser.newPage();
  const pages: Page[] = [learner];
  try {
    await loginAccount(learner, emails.learner, expectedRoles.learner);
    const initialHistory = await apiRequest(learner, '/encounters');
    if ((initialHistory.json as Array<unknown>).length === 0) {
      const encounterIdsBeforeBaselineAttempt = await listEncounterIds(learner);
      await completeAccessibleCase(learner);
      await waitForNewCompletedEncounter(learner, encounterIdsBeforeBaselineAttempt);
      await openHomeAndWait(learner);
    }
    await expect(learner.getByTestId('research-participation-select')).toHaveValue('not_answered');
    await learner.getByTestId('research-participation-select').selectOption('declined');
    await waitForConsentStatus(learner, 'declined');
    const declinedEvents = await apiRequest(learner, '/auth/research-consent-events');
    const declinedList = declinedEvents.json as Array<Record<string, unknown>>;
    expect(String(declinedList[0].research_participation_status)).toBe('declined');
    expect(String(declinedList[0].research_consent_version)).toContain('fixture-consent-');

    const historyBefore = await apiRequest(learner, '/encounters');
    expect((historyBefore.json as Array<unknown>).length).toBeGreaterThan(0);

    const admin = await browser.newPage();
    pages.push(admin);
    await openEducatorWorkspaceAndWait(admin, emails.admin, expectedRoles.admin);
    const exportDeclined = await apiRequest(admin, '/pilot/research/export');
    expect(JSON.stringify(exportDeclined.json)).not.toContain('research-');

    await learner.bringToFront();
    await learner.getByTestId('research-participation-select').selectOption('consented');
    await waitForConsentStatus(learner, 'consented');
    const encounterIdsBeforeConsentedAttempt = await listEncounterIds(learner);
    await completeAccessibleCase(learner);
    const consentedAttempt = await waitForNewCompletedEncounter(learner, encounterIdsBeforeConsentedAttempt);
    await waitForEligibleResearchAttempt(learner, String(consentedAttempt.id));
    const consentedEvents = await apiRequest(learner, '/auth/research-consent-events');
    expect(String((consentedEvents.json as Array<Record<string, unknown>>)[0].research_participation_status)).toBe('consented');

    await admin.bringToFront();
    await waitForResearchExportRowCount(admin, 1);
    const exportConsented = await apiRequest(admin, '/pilot/research/export');
    expect(exportConsented.status).toBe(200);
    expect(JSON.stringify(exportConsented.json)).toContain('pseudonymised');
    expect(JSON.stringify(exportConsented.json)).toContain('research-');
    expect(JSON.stringify(exportConsented.json)).not.toContain(emails.learner);
    expect(JSON.stringify(exportConsented.json)).not.toContain('Learner Pilot');

    await learner.bringToFront();
    await openHomeAndWait(learner);
    await expect(learner.getByTestId('research-participation-select')).toHaveValue('consented');
    await learner.getByTestId('research-participation-select').selectOption('withdrawn');
    await expect(learner.getByTestId('research-participation-select')).toHaveValue('withdrawn');
    await waitForConsentStatus(learner, 'withdrawn');
    const withdrawnEvents = await apiRequest(learner, '/auth/research-consent-events');
    expect(String((withdrawnEvents.json as Array<Record<string, unknown>>)[0].research_participation_status)).toBe('withdrawn');

    await admin.bringToFront();
    const exportWithdrawn = await apiRequest(admin, '/pilot/research/export');
    expect(JSON.stringify(exportWithdrawn.json)).not.toContain(emails.learner);

    await learner.bringToFront();
    await learner.getByTestId('open-history').click();
    await expect(learner.getByTestId('history-attempts')).toContainText('Aisha Rahman');

    const curriculum = await browser.newPage();
    pages.push(curriculum);
    await openEducatorWorkspaceAndWait(curriculum, emails.curriculum, expectedRoles.curriculum);
    await curriculum.getByTestId('case-review-case-select').selectOption('case-headache-001');
    await curriculum.getByTestId('case-review-type-select').selectOption('curriculum');
    await curriculum.getByTestId('case-review-decision-select').selectOption('request_revision');
    await curriculum.getByTestId('case-review-comments').fill('Curriculum version 1.0.0 needs revision.');
    await curriculum.getByTestId('case-review-fixture-label').fill('development_test_fixture');
    await curriculum.getByTestId('save-case-review').click();
    const revisedCurriculum = await apiRequest(curriculum, '/test-support/seed-case-review', {
      method: 'POST',
      body: {
        case_id: 'case-headache-001',
        case_version: '1.0.0',
        review_type: 'curriculum',
        decision: 'curriculum_approved',
        comments: 'Revised mapping development fixture approved.',
        mapping_version: '1.0.1',
        fixture_label: 'development_test_fixture',
      },
    });
    expect(revisedCurriculum.status).toBe(200);
    const curriculumReviews = await apiRequest(curriculum, '/pilot/case-reviews?case_id=case-headache-001');
    const curriculumRecords = curriculumReviews.json as Array<Record<string, unknown>>;
    expect(curriculumRecords.some((item) => item.review_type === 'curriculum' && item.mapping_version === '1.0.0')).toBeTruthy();
    expect(curriculumRecords.some((item) => item.review_type === 'curriculum' && item.mapping_version === '1.0.1')).toBeTruthy();
    expect(curriculumRecords.some((item) => item.fixture_label === 'development_test_fixture')).toBeTruthy();

    const clinical = await browser.newPage();
    pages.push(clinical);
    await openEducatorWorkspaceAndWait(clinical, emails.clinical, expectedRoles.clinical);
    const initialClinical = await apiRequest(clinical, '/pilot/cases/case-headache-001/review', {
      method: 'POST',
      body: {
        review_type: 'clinical',
        decision: 'request_revision',
        comments: 'Clinical case version 1.0.0 needs revision.',
        fixture_label: 'development_test_fixture',
      },
    });
    expect(initialClinical.status).toBe(200);
    const revisedClinical = await apiRequest(clinical, '/test-support/seed-case-review', {
      method: 'POST',
      body: {
        case_id: 'case-headache-001',
        case_version: '1.0.1',
        review_type: 'clinical',
        decision: 'clinically_reviewed',
        comments: 'Revised clinical case version approved as development fixture.',
        fixture_label: 'development_test_fixture',
      },
    });
    expect(revisedClinical.status).toBe(200);
    const clinicalReviews = await apiRequest(clinical, '/pilot/case-reviews?case_id=case-headache-001');
    const clinicalRecords = clinicalReviews.json as Array<Record<string, unknown>>;
    expect(clinicalRecords.some((item) => item.review_type === 'clinical' && item.case_version === '1.0.0')).toBeTruthy();
    expect(clinicalRecords.some((item) => item.review_type === 'clinical' && item.case_version === '1.0.1')).toBeTruthy();

    await curriculum.bringToFront();
    await expect(curriculum.getByTestId('readiness-curriculum-status')).toContainText(/academic review required/i);
    await expect(curriculum.getByTestId('readiness-clinical-status')).toContainText(/clinical review required/i);
    await expect(curriculum.getByTestId('readiness-simulation-status')).toContainText(/simulation review required|review required|pending/i);
    await expect(curriculum.getByTestId('readiness-ai-status')).toContainText(/ai review required|review required|pending/i);
    await expect(curriculum.getByTestId('readiness-pilot-status')).toContainText(/not pilot ready/i);

    await learner.bringToFront();
    const attemptsAfterReviews = await apiRequest(learner, '/encounters');
    const firstAttempt = (attemptsAfterReviews.json as Array<Record<string, any>>)[0];
    expect(String(firstAttempt.case_version)).toBe('1.0.0');
    expect(String(firstAttempt.completion_snapshot.case.curriculumAlignment.mappingVersion)).toBe('1.0.0');
  } finally {
    await Promise.all(pages.map(async (page) => page.close().catch(() => undefined)));
  }
});

test('pilot readiness educator scoring stays independent, auditable, and distinguishable from automated assessment', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  await registerRoleIfNeeded(browser, emails.educator, 'Educator Reviewer', expectedRoles.educator);
  await registerRoleIfNeeded(browser, emails.admin, 'Pilot Admin', expectedRoles.admin);
  const learnerSetup = await browser.newPage();
  await loginAccount(learnerSetup, emails.learner, expectedRoles.learner);
  const encounterId = `enc-score-${Date.now()}`;
  const draftSnapshot = buildHeadacheDraftSnapshot(encounterId);
  const createEncounterResponse = await apiRequest(learnerSetup, '/encounters', {
    method: 'POST',
    body: {
      encounter_id: encounterId,
      case_id: 'case-headache-001',
      conversation_mode: 'guided',
      draft_snapshot: draftSnapshot,
    },
  });
  expect(createEncounterResponse.status).toBe(200);
  const completionSnapshot = {
    ...draftSnapshot,
    orderedTestIds: ['bp-check'],
    completedTestIds: ['bp-check'],
    viewedResultIds: ['bp-check'],
    submittedDiagnosisId: 'tension_headache',
    completedAt: Date.now(),
    evidenceIntegrityStatus: 'server_verified',
    endConfirm: { sum: true, safe: true, ice: false },
  };
  const assessmentResponse = await apiRequest(learnerSetup, `/encounters/${encodeURIComponent(encounterId)}/assessment`, {
    method: 'POST',
    body: {
      completion_snapshot: completionSnapshot,
      integrity_status: 'server_verified',
      engine: 'rule_based',
      assessment_status: 'completed',
      evaluation: {
        case_id: 'case-headache-001',
        global_rating: 'good',
        domain_scores: {
          data_gathering: { raw: 2, max: 3, verdict: 'good' },
          clinical_management: { raw: 2, max: 3, verdict: 'satisfactory' },
          interpersonal: { raw: 2, max: 3, verdict: 'good' },
        },
        criteria: [],
        highlights: [],
        improvements: [],
        narrative: 'Seeded completed attempt for educator scoring verification.',
        safety_breach: null,
      },
      evidence_refs: [],
      receipts: [],
    },
  });
  expect(assessmentResponse.status).toBe(200);
  await waitForEncounterStatus(learnerSetup, encounterId, 'completed');
  await learnerSetup.close();

  const educator = await browser.newPage();
  await openEducatorWorkspaceAndWait(educator, emails.educator, expectedRoles.educator);
  await educator.getByTestId('pilot-attempt-list').getByRole('button').first().click();
  await expect(educator.getByLabel('Overall category')).toHaveValue('');
  await expect(educator.getByLabel('Overall score')).toHaveValue('');

  await educator.getByLabel('Overall category').fill('satisfactory');
  await educator.getByLabel('Overall score').fill('74');
  await educator.getByLabel('Data gathering verdict').fill('satisfactory');
  await educator.getByLabel('Clinical management verdict').fill('satisfactory');
  await educator.getByLabel('Communication verdict').fill('good');
  await educator.getByLabel('Missed history concepts').fill('stress context');
  await educator.getByLabel('Safety findings').fill('no immediate safety breach');
  await educator.getByLabel('Investigation evaluation').fill('Appropriate for the presented complaint.');
  await educator.getByLabel('Diagnosis evaluation').fill('Working diagnosis is reasonable.');
  await educator.getByLabel('Communication evaluation').fill('Clear and supportive.');
  await educator.getByLabel('Independent educator feedback').fill('Independent score recorded in the pilot workspace.');
  await educator.getByTestId('save-independent-score').click();
  await expect
    .poll(async () => {
      const response = await apiRequest(educator, `/pilot/attempts/${encounterId}/scores`);
      return (response.json as Array<Record<string, unknown>>).length;
    })
    .toBeGreaterThan(0);

  await educator.getByLabel('Educator review comment').fill('Automated feedback partly matches educator judgement.');
  await educator.getByTestId('save-educator-review').click();

  const scoresAfterFirst = await apiRequest(educator, `/pilot/attempts/${encounterId}/scores`);
  const firstScores = scoresAfterFirst.json as Array<Record<string, any>>;
  expect(firstScores.length).toBeGreaterThanOrEqual(1);
  const originalScoreId = String(firstScores[0].id);

  const admin = await browser.newPage();
  await openEducatorWorkspaceAndWait(admin, emails.admin, expectedRoles.admin);
  const secondScore = await apiRequest(admin, `/pilot/attempts/${encounterId}/scores`, {
    method: 'POST',
    body: {
      rubric_version: 'medlife-formative-rubric-v1',
      review_mode: 'independent',
      overall_score: 68,
      overall_category: 'borderline',
      domain_scores: { interpersonal: { verdict: 'good' } },
      safety_findings: ['follow-up advice too vague'],
      missed_history_concepts: ['stress context'],
      investigation_evaluation: 'Acceptable but incomplete',
      diagnosis_evaluation: 'Reasonable differential narrowing',
      communication_evaluation: 'Supportive',
      educator_comment: 'Second reviewer score stored separately.',
      confidence_label: 'medium',
      review_minutes: 7,
      submit_status: 'submitted',
    },
  });
  expect(secondScore.status).toBe(200);

  const amendedScore = await apiRequest(educator, `/pilot/attempts/${encounterId}/scores`, {
    method: 'POST',
    body: {
      rubric_version: 'medlife-formative-rubric-v1',
      review_mode: 'independent',
      overall_score: 76,
      overall_category: 'good',
      domain_scores: { data_gathering: { verdict: 'good' } },
      safety_findings: [],
      missed_history_concepts: ['stress context'],
      investigation_evaluation: 'Improved after re-read',
      diagnosis_evaluation: 'Still reasonable',
      communication_evaluation: 'Strong rapport',
      educator_comment: 'Amended educator score kept as a new audit entry.',
      confidence_label: 'high',
      review_minutes: 5,
      submit_status: 'submitted',
      amended_from_score_id: originalScoreId,
    },
  });
  expect(amendedScore.status).toBe(200);

  const scoresFinal = await apiRequest(educator, `/pilot/attempts/${encounterId}/scores`);
  const finalScores = scoresFinal.json as Array<Record<string, any>>;
  expect(finalScores.length).toBeGreaterThanOrEqual(3);
  expect(finalScores.some((item) => String(item.id) === originalScoreId)).toBeTruthy();
  expect(finalScores.some((item) => String(item.amended_from_score_id ?? '') === originalScoreId)).toBeTruthy();

  const reviewsFinal = await apiRequest(educator, `/pilot/attempts/${encounterId}/reviews`);
  expect(JSON.stringify(reviewsFinal.json)).toContain('partly matches educator judgement');

  const analytics = await apiRequest(educator, '/pilot/analytics');
  expect(String((analytics.json as Record<string, any>).agreement_metrics.sample_size)).not.toBe('0');

  const learner = await browser.newPage();
  await loginAccount(learner, emails.learner, expectedRoles.learner);
  await learner.getByTestId('open-history').click();
  await learner.getByTestId(`history-attempt-${encounterId}`).click();
  await expect(learner).toHaveURL(new RegExp(`/history/${encounterId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/debrief$`));
  await expect(learner.getByTestId('next-case')).toBeVisible();
  await expect(learner.getByTestId('evidence-integrity-line')).toBeVisible();
  await expect(learner.getByText(/Educator reviewed/i)).toBeVisible();
  await expect(learner.getByText(/No educator review has been recorded/i)).toHaveCount(0);
  await expect(learner.getByText(/Automated feedback partly matches educator judgement\./i)).toBeVisible();
  await learner.reload();
  await expect(learner).toHaveURL(new RegExp(`/history/${encounterId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/debrief$`));
  await expect(learner.getByTestId('evidence-integrity-line')).toBeVisible();
  await learner.goBack();
  await expect(learner).toHaveURL(/\/history$/);
  await focusAndPress(learner.getByTestId(`history-attempt-${encounterId}`), 'Enter');
  await expect(learner.getByTestId('evidence-integrity-line')).toBeVisible();

  await educator.close();
  await admin.close();
  await learner.close();
});

test('pilot readiness direct historical debrief links reload for owners', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await loginAccount(owner, emails.learner, expectedRoles.learner);
  const encounterId = `enc-direct-owner-${Date.now()}`;
  await seedHistoricalDebriefFixture(owner, encounterId);
  await openHistoricalDebriefAndWait(owner, encounterId, 'owner');
  await owner.reload({ waitUntil: 'domcontentloaded' });
  await expect(owner.getByTestId('app-ready')).toHaveCount(1, { timeout: 15000 });
  await expect(owner.getByTestId('historical-debrief-ready')).toHaveCount(1, { timeout: 15000 });
  await expect(owner.getByTestId('evidence-integrity-line')).toBeVisible({ timeout: 15000 });
  await owner.goBack();
  await expect(owner).toHaveURL(/\/$/);
  await owner.goForward();
  await expect(owner.getByTestId('historical-debrief-ready')).toHaveCount(1, { timeout: 15000 });
  await ownerContext.close();
});

test('pilot readiness direct historical debrief rejects other learners safely', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await loginAccount(owner, emails.learner, expectedRoles.learner);
  const encounterId = `enc-direct-other-${Date.now()}`;
  await seedHistoricalDebriefFixture(owner, encounterId);
  await ownerContext.close();

  const otherLearnerEmail = `other.${Date.now()}@example.com`;
  await registerRoleIfNeeded(browser, otherLearnerEmail, 'Other Learner', expectedRoles.learner);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await loginAccount(other, otherLearnerEmail, expectedRoles.learner);
  await assertCurrentRole(other, otherLearnerEmail, expectedRoles.learner);
  await openHistoricalDebriefAndWait(other, encounterId, 'non_owner');
  await expect(other.getByText(/Aisha Rahman/i)).toHaveCount(0);
  await otherContext.close();
});

test('pilot readiness non-3d journey, keyboard flow, and accessibility scans stay functional without WebGL', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  await registerRoleIfNeeded(browser, emails.admin, 'Pilot Admin', expectedRoles.admin);
  const learnerContext = await browser.newContext();
  const page = await learnerContext.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') {
        throw new Error('webgl blocked for pilot-readiness non-3d proof');
      }
      return original.call(this, type, ...args as []);
    };
  });

  await loginAccount(page, emails.learner, expectedRoles.learner);
  await scanForCriticalA11y(page, 'home');

  await setCheckboxWithKeyboard(page.getByTestId('preference-non-3d'), true);
  await waitForPreferenceState(page, { non_3d_mode: true });
  await setCheckboxWithKeyboard(page.getByTestId('preference-low-bandwidth'), true);
  await waitForPreferenceState(page, { non_3d_mode: true, low_bandwidth_mode: true });
  await setCheckboxWithKeyboard(page.getByTestId('preference-reduced-motion'), true);
  await waitForPreferenceState(page, {
    non_3d_mode: true,
    low_bandwidth_mode: true,
    reduced_motion_mode: true,
  });
  await page.getByTestId('preference-background-audio').uncheck();
  await expect(page.getByTestId('preference-background-audio')).not.toBeChecked();
  await page.reload();
  await openHomeAndWait(page);
  await waitForPreferenceState(page, {
    non_3d_mode: true,
    low_bandwidth_mode: true,
    reduced_motion_mode: true,
    background_audio_enabled: false,
  });
  await expect(page.getByTestId('preference-non-3d')).toBeChecked();
  await expect(page.getByTestId('preference-low-bandwidth')).toBeChecked();
  await expect(page.getByTestId('preference-reduced-motion')).toBeChecked();
  await expect(page.getByTestId('preference-background-audio')).not.toBeChecked();
  await setSelectWithKeyboard(page.getByTestId('learner-stage-select'), 'early_clinical', [
    'pre_clinical_foundation',
    'transition_to_clinical_learning',
    'early_clinical',
    'core_clinical_rotation',
    'pre_intern_preparation',
  ]);
  await expect(page.getByTestId('low-bandwidth-honesty-note')).toContainText(/optimisation incomplete/i);

  await focusAndPress(page.getByTestId('start-new-case'), 'Enter');
  await page.getByText(/^Polyclinics$/).click();
  await page.getByTestId('browse-case-folder').click();
  await scanForCriticalA11y(page, 'case library');

  await focusAndPress(page.getByTestId('case-card-case-headache-001'), 'Enter');
  await scanForCriticalA11y(page, 'brief');
  await expect(page.getByTestId('brief-accessibility-path')).toContainText(/chart-first encounter/i);
  await page.getByTestId('enter-encounter').click({ force: true });
  await expect(page.getByText(/Non-3D consultation/i)).toBeVisible();
  await expect(page.getByTestId('encounter-mode-non-3d')).toBeVisible();
  await expect(page.getByTestId('encounter-mode-3d')).toHaveCount(0);
  await expect(page.getByTestId('low-bandwidth-encounter-note')).toContainText(/optimisation incomplete/i);
  await scanForCriticalA11y(page, 'non-3d encounter');

  await focusAndPress(page.getByTestId('open-examination-accessible'), 'Enter');
  await page.getByTestId('history-question-ha-onset').click();
  await page.getByRole('button', { name: /Order tests/i }).click({ force: true });
  await page.getByTestId('order-test-bp-check').evaluate((button: HTMLButtonElement) => button.click());
  await page.getByRole('button', { name: /Diagnose/i }).click();
  await page.getByTestId('diagnosis-option-tension_headache').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('wrap-for-assessment-accessible').click();
  await page.getByText(/Have you safety-netted/i).click({ force: true });
  await page.getByTestId('submit-for-assessment').click({ force: true });
  await expect(page.getByRole('heading', { name: /Rule-based assessment/i })).toBeVisible({ timeout: 15000 });
  await scanForCriticalA11y(page, 'debrief');

  const reflectionPanel = page.getByTestId('learner-reflection-panel');
  await reflectionPanel.getByLabel('What went well?').fill('Non-3D history taking remained usable.');
  await reflectionPanel.getByLabel('What will you practise next?').fill('Safer follow-up wording.');
  await page.getByTitle('Open profile').click();
  await page.getByTestId('open-history').click();
  await scanForCriticalA11y(page, 'history');
  await page.getByTestId('history-attempts').getByText('Aisha Rahman').first().click();
  await expect(page.getByTestId('learner-reflection-panel')).toContainText(/What went well/i);
  await page.reload();
  await openHomeAndWait(page);
  await page.getByTitle('Open profile').click();
  await page.getByTestId('open-history').click();
  await page.getByTestId('history-attempts').getByText('Aisha Rahman').first().click();
  await expect(page.getByTestId('evidence-inspector')).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await openEducatorWorkspaceAndWait(admin, emails.admin, expectedRoles.admin);
  await scanForCriticalA11y(admin, 'educator workspace');
  throwIfForcedFailure('pilot-consent-export');
  await adminContext.close();
  await learnerContext.close();
});

test('accessibility learner foundation group covers home, case library, and prebrief', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await loginAccount(learner, emails.learner, expectedRoles.learner);

  await expect(learner.getByTestId('auth-panel')).toBeVisible();
  await expect(learner.getByTestId('learner-stage-select')).toBeVisible();
  await expect(learner.getByTestId('preference-non-3d')).toBeVisible();
  await expect(learner.getByTestId('preference-low-bandwidth')).toBeVisible();
  await expect(learner.getByTestId('preference-reduced-motion')).toBeVisible();
  await scanForCriticalA11y(learner, 'home', ['[data-testid="auth-panel"]', '[data-testid="learner-stage-panel"]']);

  await setCheckboxWithKeyboard(learner.getByTestId('preference-non-3d'), true);
  await waitForPreferenceState(learner, { non_3d_mode: true });
  await setCheckboxWithKeyboard(learner.getByTestId('preference-reduced-motion'), true);
  await waitForPreferenceState(learner, { non_3d_mode: true, reduced_motion_mode: true });
  await expect(learner.getByTestId('preference-non-3d')).toBeChecked();
  await expect(learner.getByTestId('preference-reduced-motion')).toBeChecked();

  await choosePolyclinic(learner);
  await expect(learner.getByTestId('case-card-case-headache-001')).toBeVisible();
  await scanForCriticalA11y(learner, 'case library', ['[data-testid="case-card-case-headache-001"]']);
  await focusAndPress(learner.getByTestId('case-card-case-headache-001'), 'Enter');

  await expect(learner.getByTestId('enter-encounter')).toBeVisible();
  await expect(learner.getByTestId('brief-accessibility-path')).toContainText(/chart-first encounter/i);
  await scanForCriticalA11y(learner, 'prebrief', ['[data-testid="enter-encounter"]', '[data-testid="brief-accessibility-path"]']);

  await learnerContext.close();
});

test('accessibility clinical workflow group covers non-3d encounter through management controls', async ({ browser }) => {
  test.setTimeout(180_000);
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await loginAccount(learner, emails.learner, expectedRoles.learner);
  await enableStubbedTextAiPatient(learner);
  await learner.reload();
  await openHomeAndWait(learner);

  await setCheckboxWithKeyboard(learner.getByTestId('preference-non-3d'), true);
  await waitForPreferenceState(learner, { non_3d_mode: true });
  await startHeadacheCase(learner);
  await expect(learner.getByTestId('encounter-mode-non-3d')).toBeVisible();
  await scanForCriticalA11y(learner, 'non-3d encounter', ['[data-testid="encounter-mode-non-3d"]']);

  await learner.getByTestId('open-examination-accessible').click();
  await expect(learner.getByTestId('examination-overlay')).toBeVisible();
  await expect(learner.getByRole('button', { name: 'History' })).toBeVisible();

  await learner.getByRole('button', { name: 'Chat' }).click();
  await expect(learner.getByTestId('conversation-mode-guided')).toBeVisible();
  await expect(learner.getByTestId(/chat-guided-question-/).first()).toBeVisible();
  await scanForCriticalA11y(learner, 'guided consultation', ['[data-testid="examination-overlay"]']);

  await learner.getByTestId('conversation-mode-text-ai').click();
  await expect(learner.getByTestId('chat-input')).toBeVisible();
  await learner.getByTestId('chat-input').fill('What has been worrying you most about this problem?');
  await learner.getByTestId('chat-send').click();
  await expect(learner.getByTestId(/^chat-turn-/).last()).toContainText('AI patient', { timeout: 15000 });
  await scanForCriticalA11y(learner, 'text AI consultation', ['[data-testid="examination-overlay"]']);

  await learner.getByRole('button', { name: 'Order tests' }).click();
  await learner.locator('summary').filter({ hasText: 'Bedside' }).click();
  await expect(learner.getByTestId('order-test-bp-check')).toBeVisible();
  await scanForCriticalA11y(learner, 'investigation', ['[data-testid="examination-overlay"]']);
  await learner.getByTestId('order-test-bp-check').evaluate((button: HTMLButtonElement) => button.click());

  await learner.getByRole('button', { name: /^Results/ }).click();
  await expect(learner.getByTestId('result-bp-check')).toBeVisible({ timeout: 15000 });
  await scanForCriticalA11y(learner, 'investigation results', ['[data-testid="examination-overlay"]']);

  await learner.getByRole('button', { name: 'Diagnose' }).click();
  await expect(learner.getByTestId('diagnosis-option-tension_headache')).toBeVisible();
  await learner.getByTestId('diagnosis-option-tension_headache').click();
  await scanForCriticalA11y(learner, 'diagnosis', ['[data-testid="examination-overlay"]']);
  await learner.keyboard.press('Escape');

  await learner.getByTestId('wrap-for-assessment-accessible').click();
  await expect(learner.getByTestId('submit-for-assessment')).toBeVisible();
  await scanForCriticalA11y(learner, 'management controls', ['[data-testid="submit-for-assessment"]']);

  await learnerContext.close();
});

test('accessibility history and debrief group covers live, historical, unavailable, and error states', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await loginAccount(owner, emails.learner, expectedRoles.learner);
  await completeAccessibleCase(owner);
  await scanForCriticalA11y(owner, 'debrief', ['[data-testid="learner-reflection-panel"]', '[data-testid="evidence-inspector"]']);
  await expect(owner.getByTestId('learner-reflection-panel')).toBeVisible();
  await scanForCriticalA11y(owner, 'reflection', ['[data-testid="learner-reflection-panel"]']);

  await owner.getByTitle('Open profile').click();
  await owner.getByTestId('open-history').click();
  await expect(owner.getByTestId('history-attempts')).toBeVisible();
  await scanForCriticalA11y(owner, 'history', ['[data-testid="history-attempts"]']);
  await focusAndPress(owner.getByTestId(/^history-attempt-/).first(), 'Enter');
  await expect(owner.getByTestId('evidence-integrity-line')).toBeVisible();

  const historicalEncounterId = `enc-a11y-historical-${Date.now()}`;
  await seedHistoricalDebriefFixture(owner, historicalEncounterId);
  const historicalPath = `**/encounters/${historicalEncounterId}`;
  let releaseHistoricalFetch: (() => void) | null = null;
  const historicalGate = new Promise<void>((resolveGate) => {
    releaseHistoricalFetch = resolveGate;
  });
  await owner.route(historicalPath, async (route) => {
    const response = await route.fetch();
    await historicalGate;
    await route.fulfill({ response });
  });
  const delayedNavigation = owner.goto(`${APP_URL}history/${encodeURIComponent(historicalEncounterId)}/debrief`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await expect(owner.getByTestId('historical-debrief-loading')).toBeVisible({ timeout: 15000 });
  releaseHistoricalFetch?.();
  await delayedNavigation;
  await expect(owner.getByTestId('historical-debrief-ready')).toHaveCount(1, { timeout: 15000 });
  await owner.unroute(historicalPath);

  const errorEncounterId = `enc-a11y-error-${Date.now()}`;
  await seedHistoricalDebriefFixture(owner, errorEncounterId);
  const errorPath = `**/encounters/${errorEncounterId}`;
  await owner.route(errorPath, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'forced historical accessibility error fixture' }),
    });
  });
  await owner.goto(`${APP_URL}history/${encodeURIComponent(errorEncounterId)}/debrief`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await expect(owner.getByTestId('historical-debrief-error')).toBeVisible({ timeout: 15000 });
  await owner.unroute(errorPath);

  const hiddenEncounterId = `enc-a11y-hidden-${Date.now()}`;
  await seedHistoricalDebriefFixture(owner, hiddenEncounterId);

  const otherLearnerEmail = `a11y.other.${Date.now()}@example.com`;
  await registerRoleIfNeeded(browser, otherLearnerEmail, 'Other Learner', expectedRoles.learner);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await loginAccount(other, otherLearnerEmail, expectedRoles.learner);
  await other.goto(`${APP_URL}history/${encodeURIComponent(hiddenEncounterId)}/debrief`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await expect(other.getByTestId('historical-debrief-unavailable')).toBeVisible({ timeout: 15000 });
  await scanForCriticalA11y(other, 'historical unavailable state', ['body']);

  await otherContext.close();
  await ownerContext.close();
});

test('accessibility educator and review group covers attempt review and reviewer workflows', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  await registerRoleIfNeeded(browser, emails.educator, 'Educator Reviewer', expectedRoles.educator);
  await registerRoleIfNeeded(browser, emails.clinical, 'Clinical Reviewer', expectedRoles.clinical);
  await registerRoleIfNeeded(browser, emails.curriculum, 'Curriculum Reviewer', expectedRoles.curriculum);
  await registerRoleIfNeeded(browser, emails.admin, 'Pilot Admin', expectedRoles.admin);

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await loginAccount(learner, emails.learner, expectedRoles.learner);
  await completeAccessibleCase(learner);
  await learnerContext.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await openEducatorWorkspaceAndWait(admin, emails.admin, expectedRoles.admin);
  await expect(admin.getByTestId('pilot-attempt-list')).toBeVisible();
  await scanForCriticalA11y(admin, 'educator workspace', ['[data-testid="pilot-attempt-list"]', '[data-testid="pilot-attempt-review-panel"]']);
  await admin.getByTestId('pilot-attempt-list').getByRole('button').first().click();
  await expect(admin.getByLabel('Educator review comment')).toBeVisible();
  await expect(admin.getByLabel('Agreement with automated feedback')).toBeVisible();
  await expect(admin.getByLabel('Overall score')).toBeVisible();
  await expect(admin.getByLabel('Investigation evaluation')).toBeVisible();
  await expect(admin.getByLabel('Diagnosis evaluation')).toBeVisible();
  await scanForCriticalA11y(admin, 'independent educator scoring', ['[data-testid="pilot-attempt-review-panel"]']);
  await adminContext.close();

  const curriculumContext = await browser.newContext();
  const curriculum = await curriculumContext.newPage();
  await openEducatorWorkspaceAndWait(curriculum, emails.curriculum, expectedRoles.curriculum);
  await curriculum.getByTestId('case-review-type-select').selectOption('curriculum');
  await expect(curriculum.getByTestId('readiness-curriculum-status')).toBeVisible();
  await scanForCriticalA11y(curriculum, 'curriculum review', ['[data-testid="case-review-workflow"]', '[data-testid="selected-case-readiness"]']);
  await curriculumContext.close();

  const clinicalContext = await browser.newContext();
  const clinical = await clinicalContext.newPage();
  await openEducatorWorkspaceAndWait(clinical, emails.clinical, expectedRoles.clinical);
  await clinical.getByTestId('case-review-type-select').selectOption('clinical');
  await expect(clinical.getByTestId('readiness-clinical-status')).toBeVisible();
  await scanForCriticalA11y(clinical, 'clinical review', ['[data-testid="case-review-workflow"]', '[data-testid="selected-case-readiness"]']);
  await clinicalContext.close();
});

test('accessibility consent and export group covers research consent, analytics, and export surfaces', async ({ browser }) => {
  await registerRoleIfNeeded(browser, emails.learner, 'Learner Pilot', expectedRoles.learner);
  await registerRoleIfNeeded(browser, emails.admin, 'Pilot Admin', expectedRoles.admin);

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await loginAccount(learner, emails.learner, expectedRoles.learner);
  await expect(learner.getByTestId('education-disclaimer')).toBeVisible();
  await expect(learner.getByTestId('research-participation-select')).toBeVisible();
  await expect(learner.getByText(/Educational access stays available even if research use is declined/i)).toBeVisible();
  await scanForCriticalA11y(learner, 'consent', ['[data-testid="education-disclaimer"]', '[data-testid="learner-stage-panel"]']);
  await learner.getByTestId('research-participation-select').selectOption('consented');
  await waitForConsentStatus(learner, 'consented');
  await expect(learner.getByTestId('research-participation-select')).toHaveValue('consented');
  await learnerContext.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await openEducatorWorkspaceAndWait(admin, emails.admin, expectedRoles.admin);
  await expect(admin.getByTestId('pilot-analytics-cards')).toBeVisible();
  await expect(admin.getByText(/Small fixture or pilot samples are not treated as proof of educational validity/i)).toBeVisible();
  await expect(admin.getByTestId('research-export-panel')).toBeVisible();
  await expect(admin.getByText(/pseudonymised and limited to consented learners/i)).toBeVisible();
  await expect(admin.getByTestId('download-research-export')).toBeVisible();
  await scanForCriticalA11y(admin, 'research export', ['[data-testid="pilot-analytics-cards"]', '[data-testid="research-export-panel"]']);
  await adminContext.close();
});
