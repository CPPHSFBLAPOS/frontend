// Open sign-up: anyone who signs in with an email code becomes a Cashier,
// only Super Admins manage members, and turning a member's Active off blocks
// them (the block list).
import { expect, test } from '@playwright/test';
import { ALL_PERMS, SUPABASE, directory, fakeSession, mockBackend, treasurer, type Me } from './mock';

const BLOCKED = 'Your access to the store app was removed. Talk to a Super Admin.';

const newCashier: Me = {
  id: 'm-new',
  email: 'newkid@example.com',
  display_name: 'newkid',
  grade: null,
  role: 'cashier',
  is_super_admin: false,
  active: true,
  has_pin: false,
  linked: true,
  approved: false,
  permissions: [],
};

// The same person after a Super Admin sets their PIN.
const approvedCashier: Me = { ...newCashier, has_pin: true, approved: true, permissions: ['ring_sales', 'sell_gift_cards'] };

// The Advisor no longer manages members unless they are also a Super Admin.
const advisor: Me = {
  ...treasurer,
  id: 'm-advisor',
  email: 'advisor@example.com',
  display_name: 'Avery Advisor (test)',
  role: 'advisor',
  permissions: [...ALL_PERMS, 'preauth_approve', 'preauth_close', 'change_settings'],
};

const superAdmin: Me = {
  ...treasurer,
  id: 'm-super',
  email: 'super@example.com',
  display_name: 'Sam Super (test)',
  role: null,
  is_super_admin: true,
  permissions: [...ALL_PERMS, 'manage_members', 'change_settings'],
};

test('a brand-new email joins as a Cashier and waits for a Super Admin to set the PIN', async ({ page }) => {
  let joined = false;
  let approved = false;
  const mock = await mockBackend(page, null, {
    whoami: () => (approved ? approvedCashier : joined ? newCashier : null),
    ensure_member: () => {
      joined = true;
      return { ok: true, joined: true, me: newCashier };
    },
  });
  // The code check answers with a session for the new person.
  await page.route(`${SUPABASE}/auth/v1/verify`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession(newCashier.email, '00000000-0000-4000-8000-0000000000aa')) }),
  );

  await page.goto('/');
  await page.getByLabel('School email').fill(newCashier.email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const code = page.getByLabel('Code from your email');
  await code.fill('123456');
  await code.press('Enter');

  // Signed up, but nothing opens until a Super Admin sets the PIN.
  await expect(page.getByRole('heading', { name: "You're signed up!" })).toBeVisible();
  await expect(page.getByText('A Super Admin needs to set your 4-digit PIN')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  // ensure_member ran once, and the sign-in was logged after the member existed.
  await expect.poll(() => mock.calls.filter((c) => c.fn === 'record_sign_in').length).toBe(1);
  const fns = mock.calls.map((c) => c.fn);
  expect(fns.filter((f) => f === 'ensure_member')).toHaveLength(1);
  expect(fns.indexOf('ensure_member')).toBeLessThan(fns.indexOf('record_sign_in'));

  // A Super Admin sets the PIN; Check again opens the app as a Cashier.
  approved = true;
  await page.getByRole('button', { name: 'Check again' }).click();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Members' })).toHaveCount(0);
});

test('a blocked person sees that their access was removed and can sign out', async ({ page }) => {
  const mock = await mockBackend(page, { ...newCashier, active: false }, {
    whoami: () => null,
    ensure_member: () => ({ ok: false, error: 'blocked', message: BLOCKED }),
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your access was removed.' })).toBeVisible();
  await expect(page.getByText('Talk to a Super Admin if you think this is a mistake.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  // Asked once, not in a loop.
  await page.waitForTimeout(500);
  expect(mock.calls.filter((c) => c.fn === 'ensure_member')).toHaveLength(1);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a sign-in that is not an email code is told to sign in again', async ({ page }) => {
  await mockBackend(page, newCashier, {
    whoami: () => null,
    ensure_member: () => ({ ok: false, error: 'not_allowed', message: 'Sign in with the code from your email.' }),
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in again with your email code.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText('Ask the Advisor')).toHaveCount(0);
});

test('the sign-in screen shows the server’s words when access was removed, and a readable rate limit', async ({ page }) => {
  await mockBackend(page, null);
  let answer = { status: 403, body: { code: 403, error_code: 'hook_error', msg: BLOCKED } };
  await page.route(`${SUPABASE}/auth/v1/otp`, (route) =>
    route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) }),
  );
  await page.goto('/');
  await page.getByLabel('School email').fill('blocked@example.com');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('alert').filter({ hasText: BLOCKED })).toBeVisible();
  await expect(page.getByText('Ask the Advisor to add you.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toHaveCount(0);

  answer = { status: 429, body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' } };
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Too many codes were asked for. Wait a few minutes, then try again.' })).toBeVisible();
});

test('only Super Admins manage members: the Advisor sees no Members link or page', async ({ page }) => {
  await mockBackend(page, advisor);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Members' })).toHaveCount(0);
  await page.goto('/members');
  await expect(page.getByText('This screen is not part of your role.')).toBeVisible();
  await expect(page.getByText('Ask a Super Admin if you need it.')).toBeVisible();
});

test('Members puts new sign-ups without a PIN first and can show only them', async ({ page }) => {
  const row = (m: Me) => ({ id: m.id, email: m.email, display_name: m.display_name, grade: m.grade, role: m.role, is_super_admin: m.is_super_admin, active: m.active, has_pin: m.has_pin, linked: m.linked });
  await mockBackend(page, superAdmin, {
    list_members: () => [
      row(advisor),
      row({ ...treasurer, id: 'm-gone', email: 'gone@example.com', display_name: 'Gone Person', role: 'cashier', active: false, has_pin: false }),
      row(newCashier),
      row(superAdmin),
    ],
  });
  await page.goto('/members');
  await expect(page.getByRole('heading', { name: 'People and roles', level: 1 })).toBeVisible();
  await expect(page.getByText('Anyone who signs in becomes a Cashier. Set a PIN before their first shift. Turn Active off to block someone.')).toBeVisible();

  const rows = page.locator('tbody tr');
  await expect(rows.first()).toContainText('newkid');
  await expect(rows.first()).toContainText('Needs PIN');
  await expect(page.locator('tbody tr').filter({ hasText: 'Gone Person' })).toContainText('Blocked');

  await page.getByRole('radio', { name: 'Needs PIN (1)' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('newkid');
  await page.getByRole('radio', { name: 'Blocked (1)' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Gone Person');
  await page.getByRole('radio', { name: 'Everyone' }).click();
  await expect(rows).toHaveCount(4);

  // A Super Admin can give any role and make other Super Admins.
  await rows.filter({ hasText: 'newkid' }).click();
  const dialog = page.getByRole('dialog');
  const roles = await dialog.getByLabel(/^Role/).locator('option').allTextContents();
  expect(roles).toEqual(expect.arrayContaining(['Advisor', 'President', 'Treasurer', 'Cashier']));
  await expect(dialog.getByRole('checkbox', { name: /^Super Admin/ })).toBeVisible();
});

test('an officer with no PIN yet is told who sets it on the start-a-shift screen', async ({ page }) => {
  const officer: Me = { ...treasurer, id: 'm-newofficer', display_name: 'newkid', has_pin: false };
  await mockBackend(page, officer, {
    member_directory: () => [
      { id: officer.id, display_name: officer.display_name, role: 'treasurer', is_super_admin: false, has_pin: false },
      ...directory.filter((d) => d.role === 'advisor'),
    ],
  });
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Start a shift' })).toBeVisible();
  await expect(page.getByText('Ask a Super Admin to set your PIN on the Members page before your first shift.')).toBeVisible();
  await expect(page.getByRole('button', { name: /newkid/ })).toBeDisabled();
});

test('changing your own PIN shows the server’s answer', async ({ page }) => {
  await mockBackend(page, treasurer, {
    set_pin: () => {
      throw new Error('A Super Admin sets your first PIN. After that you can change it here.');
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Change my PIN' }).click();
  await page.getByLabel('New PIN').fill('4321');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('A Super Admin sets your first PIN. After that you can change it here.');
});

test('if loading who you are fails, the app says so and can try again', async ({ page }) => {
  let fail = true;
  await mockBackend(page, treasurer, {
    whoami: () => {
      if (fail) throw Object.assign(new Error('upstream connect error'), { status: 503 });
      return treasurer;
    },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Could not load your account.' })).toBeVisible({ timeout: 15_000 });
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('an email tied to another sign-in shows the server’s words, not a sign-in-again loop', async ({ page }) => {
  await mockBackend(page, newCashier, {
    whoami: () => null,
    ensure_member: () => ({ ok: false, error: 'not_allowed', message: 'This email is tied to another sign-in. Talk to a Super Admin.' }),
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This email is tied to another sign-in. Talk to a Super Admin.' })).toBeVisible();
  await expect(page.getByText('Sign in again with your email code.')).toHaveCount(0);
});
