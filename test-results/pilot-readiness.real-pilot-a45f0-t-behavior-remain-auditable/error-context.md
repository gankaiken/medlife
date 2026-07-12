# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pilot-readiness.real.spec.ts >> pilot readiness review versions, consent flow, and research export behavior remain auditable
- Location: scripts\e2e\pilot-readiness.real.spec.ts:368:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('auth-panel')
Expected substring: "learner.1783860317435@example.com"
Received string:    "LoginRegisterSigned-out local mode stays availableLoginSign-in failed. Check your email and password and try again."
Timeout: 15000ms

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for getByTestId('auth-panel')
    3 × locator resolved to <div class="plush" data-testid="auth-panel">…</div>
      - unexpected value "LoginRegisterSigned-out local mode stays availableLogin"
    30 × locator resolved to <div class="plush" data-testid="auth-panel">…</div>
       - unexpected value "LoginRegisterSigned-out local mode stays availableLoginSign-in failed. Check your email and password and try again."

```

```yaml
- text: Login Register Signed-out local mode stays available
- textbox "Email": learner.1783860317435@example.com
- textbox "Password": correct horse battery
- button "Login"
- text: Sign-in failed. Check your email and password and try again.
```

# Test source

```ts
  1   | import AxeBuilder from '@axe-core/playwright';
  2   | import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
  3   | 
  4   | const PASSWORD = 'correct horse battery';
  5   | const APP_URL = 'http://127.0.0.1:4173/';
  6   | const emails = {
  7   |   learner: process.env.MEDLIFE_E2E_ROLE_LEARNER_EMAIL ?? 'learner@example.com',
  8   |   educator: process.env.MEDLIFE_E2E_ROLE_EDUCATOR_EMAIL ?? 'educator@example.com',
  9   |   clinical: process.env.MEDLIFE_E2E_ROLE_CLINICAL_EMAIL ?? 'clinical@example.com',
  10  |   curriculum: process.env.MEDLIFE_E2E_ROLE_CURRICULUM_EMAIL ?? 'curriculum@example.com',
  11  |   admin: process.env.MEDLIFE_E2E_ROLE_ADMIN_EMAIL ?? 'admin@example.com',
  12  | };
  13  | 
  14  | function throwIfForcedFailure(marker: string) {
  15  |   if (process.env.MEDLIFE_E2E_FORCE_FAILURE === marker) {
  16  |     throw new Error(`Deliberate pilot-readiness failure triggered for cleanup verification: ${marker}`);
  17  |   }
  18  | }
  19  | 
  20  | async function waitForApp(page: Page) {
  21  |   await expect.poll(async () => {
  22  |     const response = await page.request.get(APP_URL);
  23  |     return response.status();
  24  |   }).toBe(200);
  25  |   await page.goto(APP_URL);
  26  |   await page.getByTestId('enter-training-floor').click({ force: true });
  27  |   await page.getByTestId('onboarding-next').click();
  28  |   await page.getByTestId('onboarding-next').click();
  29  |   await page.getByTestId('finish-onboarding').click({ force: true });
  30  | }
  31  | 
  32  | async function ensureAccount(page: Page, email: string, displayName: string) {
  33  |   await waitForApp(page);
  34  |   const panel = page.getByTestId('auth-panel');
  35  |   if (await panel.getByText(email).isVisible().catch(() => false)) {
  36  |     return;
  37  |   }
  38  |   await panel.getByText('Register').click();
  39  |   await page.getByTestId('register-display-name').fill(displayName);
  40  |   await page.getByTestId('auth-email').fill(email);
  41  |   await page.getByTestId('auth-password').fill(PASSWORD);
  42  |   await page.getByTestId('register-button').click();
  43  |   await expect(page.getByTestId('auth-panel')).toContainText(email, { timeout: 15000 });
  44  | }
  45  | 
  46  | async function loginAccount(page: Page, email: string) {
  47  |   await waitForApp(page);
  48  |   const panel = page.getByTestId('auth-panel');
  49  |   if (await panel.getByText(email).isVisible().catch(() => false)) {
  50  |     return;
  51  |   }
  52  |   await panel.getByText('Login').first().click();
  53  |   await page.getByTestId('auth-email').fill(email);
  54  |   await page.getByTestId('auth-password').fill(PASSWORD);
  55  |   await page.getByTestId('login-button').click();
> 56  |   await expect(page.getByTestId('auth-panel')).toContainText(email, { timeout: 15000 });
      |                                                ^ Error: expect(locator).toContainText(expected) failed
  57  | }
  58  | 
  59  | async function logoutIfNeeded(page: Page) {
  60  |   const logoutButton = page.getByTestId('logout-button');
  61  |   if (await logoutButton.isVisible().catch(() => false)) {
  62  |     await logoutButton.click();
  63  |     await expect(page.getByTestId('auth-panel')).toContainText(/Signed-out local mode stays available/i);
  64  |   }
  65  | }
  66  | 
  67  | async function registerAllRoles(browser: Browser) {
  68  |   const roles = [
  69  |     ['learner', emails.learner, 'Learner Pilot'],
  70  |     ['educator', emails.educator, 'Educator Reviewer'],
  71  |     ['clinical', emails.clinical, 'Clinical Reviewer'],
  72  |     ['curriculum', emails.curriculum, 'Curriculum Reviewer'],
  73  |     ['admin', emails.admin, 'Pilot Admin'],
  74  |   ] as const;
  75  |   for (const [, email, name] of roles) {
  76  |     const page = await browser.newPage();
  77  |     await ensureAccount(page, email, name);
  78  |     await page.close();
  79  |   }
  80  | }
  81  | 
  82  | async function apiRequest(page: Page, path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
  83  |   return await page.evaluate(
  84  |     async ({ path: requestPath, method, body }) => {
  85  |       const csrfCookie = document.cookie
  86  |         .split(';')
  87  |         .map((part) => part.trim())
  88  |         .find((part) => part.startsWith('medlife_csrf='));
  89  |       const csrf = csrfCookie ? decodeURIComponent(csrfCookie.slice('medlife_csrf='.length)) : null;
  90  |       const headers: Record<string, string> = {};
  91  |       if (body) {
  92  |         headers['Content-Type'] = 'application/json';
  93  |       }
  94  |       if (csrf && method && method !== 'GET') {
  95  |         headers['X-CSRF-Token'] = csrf;
  96  |       }
  97  |       const response = await fetch(`http://127.0.0.1:8787${requestPath}`, {
  98  |         method,
  99  |         credentials: 'include',
  100 |         headers,
  101 |         body: body ? JSON.stringify(body) : undefined,
  102 |       });
  103 |       const text = await response.text();
  104 |       let json: unknown = null;
  105 |       try {
  106 |         json = JSON.parse(text);
  107 |       } catch {}
  108 |       return {
  109 |         status: response.status,
  110 |         ok: response.ok,
  111 |         text,
  112 |         json,
  113 |         headers: Object.fromEntries(response.headers.entries()),
  114 |       };
  115 |     },
  116 |     { path, method: options.method ?? 'GET', body: options.body ?? null },
  117 |   );
  118 | }
  119 | 
  120 | async function choosePolyclinic(page: Page) {
  121 |   const stageSelect = page.getByTestId('learner-stage-select');
  122 |   if (await stageSelect.isVisible().catch(() => false)) {
  123 |     await stageSelect.selectOption('early_clinical');
  124 |   }
  125 |   await page.getByTestId('start-new-case').click();
  126 |   await page.getByText(/^Polyclinics$/).click();
  127 |   await page.getByTestId('browse-case-folder').click();
  128 | }
  129 | 
  130 | async function startHeadacheCase(page: Page) {
  131 |   await choosePolyclinic(page);
  132 |   await page.getByTestId('case-card-case-headache-001').click();
  133 |   await page.getByTestId('enter-encounter').click({ force: true });
  134 |   await expect(page.getByText(/Loading encounter/i)).toHaveCount(0);
  135 | }
  136 | 
  137 | async function completeAccessibleCase(page: Page) {
  138 |   await startHeadacheCase(page);
  139 |   const accessibleButton = page.getByTestId('open-examination-accessible');
  140 |   if (await accessibleButton.isVisible().catch(() => false)) {
  141 |     await accessibleButton.click();
  142 |   } else {
  143 |     await page.getByTestId('open-examination').click();
  144 |   }
  145 |   await page.getByTestId('history-question-ha-onset').click();
  146 |   await page.getByRole('button', { name: /Order tests/i }).click({ force: true });
  147 |   await page.getByTestId('order-test-bp-check').scrollIntoViewIfNeeded();
  148 |   await page.getByTestId('order-test-bp-check').evaluate((button: HTMLButtonElement) => button.click());
  149 |   await page.getByRole('button', { name: /Results/i }).click({ force: true });
  150 |   await page.locator('[data-testid="result-bp-check"] summary').first().evaluate((summary: HTMLElement) => summary.click());
  151 |   await page.getByRole('button', { name: /Diagnose/i }).click();
  152 |   await page.getByTestId('diagnosis-option-tension_headache').click();
  153 |   await page.keyboard.press('Escape');
  154 |   const wrapAccessible = page.getByTestId('wrap-for-assessment-accessible');
  155 |   if (await wrapAccessible.isVisible().catch(() => false)) {
  156 |     await wrapAccessible.click();
```