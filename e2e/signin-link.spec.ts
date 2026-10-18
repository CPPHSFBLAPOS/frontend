// Supabase's own emails (no custom SMTP) carry a sign-in link instead of a
// code. The link comes back to the app with ?code=, and the browser that asked
// for the email trades it for a session (PKCE).
import { expect, test } from '@playwright/test';
import { SUPABASE, fakeSession, mockBackend, treasurer } from './mock';

const TOKEN_EXCHANGE = /\/auth\/v1\/token\?grant_type=pkce/;

test('the link in the email signs in the browser that asked for it', async ({ page }) => {
  let signedIn = false;
  await mockBackend(page, null, {
    whoami: () => (signedIn ? treasurer : null),
    ensure_member: () => ({ ok: true, joined: false, me: treasurer }),
  });

  await page.goto('/');
  await page.getByLabel('School email').fill(treasurer.email);
  const otp = page.waitForRequest(`${SUPABASE}/auth/v1/otp**`);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  const request = await otp;
  // The link comes back to this app, and only this browser holds the verifier.
  expect(new URL(request.url()).searchParams.get('redirect_to')).toBe(new URL(page.url()).origin);
  expect(request.postDataJSON()?.code_challenge).toBeTruthy();
  await expect(page.getByText('Open its sign-in link in this browser, or type its code here.')).toBeVisible();

  let exchange: Record<string, unknown> | null = null;
  await page.route(TOKEN_EXCHANGE, (route) => {
    exchange = route.request().postDataJSON();
    signedIn = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession(treasurer.email)) });
  });
  // Clicking the link: Supabase checks it, then redirects here with a code.
  await page.goto('/?code=code-from-the-link');

  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(exchange).toMatchObject({ auth_code: 'code-from-the-link', code_verifier: expect.any(String) });
  expect(new URL(page.url()).search).toBe('');
});

test('an expired or used link says so and asks for a new email', async ({ page }) => {
  await mockBackend(page, null);
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByRole('alert').filter({ hasText: 'That sign-in link expired or was already used. Ask for a new email.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('a link opened in a different browser points back to the one that asked', async ({ page }) => {
  await mockBackend(page, null);
  let exchanged = false;
  await page.route(TOKEN_EXCHANGE, (route) => {
    exchanged = true;
    return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/?code=code-from-the-link');
  await expect(
    page.getByRole('alert').filter({ hasText: 'That sign-in link opened in a different browser. Open it in the browser where you asked for it' }),
  ).toBeVisible();
  expect(exchanged).toBe(false);
  expect(new URL(page.url()).search).toBe('');
});

test('a link carrying someone else’s tokens does not sign this browser in', async ({ page }) => {
  await mockBackend(page, null);
  const session = fakeSession('someone@example.com');
  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=refresh&expires_in=3600&expires_at=${session.expires_at}&token_type=bearer&type=magiclink`,
  );
  await expect(page.getByRole('alert').filter({ hasText: 'That sign-in link did not work. Ask for a new email.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});
