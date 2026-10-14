import { expect, test } from '@playwright/test';
import { ALL_PERMS, mockBackend, products, register, treasurer } from './mock';

const advisorAdmin = {
  ...treasurer,
  id: 'm-advisor',
  email: 'advisor@example.com',
  display_name: 'Avery Advisor (test)',
  role: 'advisor',
  is_super_admin: true,
  permissions: [...ALL_PERMS, 'preauth_approve', 'preauth_close', 'manage_members', 'change_settings'],
};

const card = { id: 'g1', code: 'ABCDEFGHJK', type: 'paid', status: 'active', note: null, created_at: '2026-10-01T15:00:00Z', balance_cents: 1250, replaced_by_code: null };

const preauth = {
  id: 'p1',
  number: 7,
  status: 'awaiting_advisor',
  requester_id: 'm-treasurer',
  student_name: 'Taylor Treasurer (test)',
  grade: 11,
  fbla_role: 'Treasurer',
  request_date: '2026-10-06',
  vendor: "Sam's Club",
  website: 'https://www.samsclub.com',
  purposes: ['fundraiser'],
  purpose_other: null,
  justification: 'Restock drinks for the fall.',
  shipping_cents: 0,
  lines_total_cents: 1278,
  grand_total_cents: 1278,
  approved_total_cents: null,
  purchase_date: null,
  receipt_due_date: null,
  overdue: false,
  notes: null,
  reject_comment: null,
  overage_approved_at: null,
  reimbursed_cents: null,
  reimbursed_to: null,
  reimbursed_at: null,
  pdf_path: null,
  closed_at: null,
  created_at: '2026-10-06T15:00:00Z',
  updated_at: '2026-10-06T15:00:00Z',
  hash: 'a'.repeat(64),
  receipts_total_cents: 0,
  needs_overage: false,
  receipts: [],
  lines: [
    {
      id: 'l1',
      line_no: 1,
      vendor_item_id: null,
      product_id: '2',
      new_name: null,
      item_number: '13585769379',
      url: 'https://www.samsclub.com/ip/x/13585769379',
      units_per_pack: 24,
      packs: 1,
      est_pack_price_cents: 1278,
      sell_price_cents: 175,
      packs_bought: null,
      actual_pack_price_cents: null,
      units_received: null,
      substitute_product_id: null,
      received_unit_cost_cents: null,
      product_name: 'Sports Drink 20 oz',
      product_price_cents: 175,
      on_hand: 24,
      vendor_checked_at: '2026-10-09T12:00:00Z',
    },
  ],
  signatures: [
    {
      id: 's1',
      role: 'student',
      member_id: 'm-treasurer',
      typed_name: 'Taylor Treasurer',
      strokes: [{ points: [{ x: 0, y: 20 }, { x: 20, y: 0 }, { x: 40, y: 25 }, { x: 70, y: 5 }, { x: 100, y: 22 }] }],
      image_path: null,
      signed_at: '2026-10-06T16:00:00Z',
      doc_hash: 'a'.repeat(64),
      voided_at: null,
      matches_form: true,
    },
  ],
};

const screens: Array<{ path: string; heading: string | RegExp }> = [
  { path: '/inventory', heading: 'Products and stock' },
  { path: '/preauth', heading: 'Pre-auth purchases' },
  { path: '/preauth/p1', heading: 'Preauthorization Purchase Order' },
  { path: '/gift-cards', heading: 'Gift and promo cards' },
  { path: '/log', heading: 'Every action, in order' },
  { path: '/members', heading: 'People and roles' },
  { path: '/settings', heading: 'Store rules' },
];

for (const s of screens) {
  test(`${s.path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockBackend(
      page,
      advisorAdmin,
      {
        get_preauth: () => preauth,
        product_sales_history: () => ({ '2': { units: 400, weeks_with_sales: 20, weekly_sales: 20, on_hand: 24, source: 'last_school_year', window_from: '2025-09-01', window_to: '2026-06-30' } }),
        list_members: () => [{ ...advisorAdmin, has_pin: true, linked: true }],
        lookup_gift_card: () => card,
        verify_log: () => ({ ok: true, checked: 2, first_bad_seq: null, problem: null }),
      },
      {
        preauths: [preauth],
        gift_card_balance: [{ ...card, card_id: card.id }],
        gift_card_txns: [{ id: 1, card_id: 'g1', type: 'load', amount_cents: 1250, sale_id: null, at: '2026-10-01T15:00:00Z', note: null }],
        log_entries: [
          { seq: 2, at: '2026-10-06T16:00:00Z', actor_id: 'm-treasurer', role: 'treasurer', device: 'Store laptop', action: 'preauth_signed_student', record_type: 'preauth', record_id: 'p1', amount_cents: 1278, before: null, after: { hash: 'aaa' }, reason: null, hash: 'b'.repeat(64) },
          { seq: 1, at: '2026-10-06T15:00:00Z', actor_id: 'm-treasurer', role: 'treasurer', device: 'Store laptop', action: 'preauth_created', record_type: 'preauth', record_id: 'p1', amount_cents: 1278, before: null, after: null, reason: null, hash: 'c'.repeat(64) },
        ],
        stock_counts: [],
        stock_movements: [{ id: 1, product_id: products[0].id, qty: 48, type: 'opening_balance', unit_cost_cents: 25, source_type: 'import', source_id: null, reason: null, by: null, at: '2026-10-01T15:00:00Z' }],
      },
    );
    await page.goto(s.path);
    await expect(page.getByRole('heading', { name: s.heading, level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/screen${s.path.replace(/\//g, '-')}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('the Advisor sees the signed student signature and can approve', async ({ page }) => {
  await mockBackend(page, advisorAdmin, { get_preauth: () => preauth, product_sales_history: () => ({}) }, { log_entries: [] });
  await page.goto('/preauth/p1');
  await expect(page.getByRole('button', { name: 'Approve and sign' })).toBeVisible();
  await expect(page.getByText('matches the form')).toBeVisible();
});

test('Check Log reports an intact chain', async ({ page }) => {
  await mockBackend(page, advisorAdmin, { verify_log: () => ({ ok: true, checked: 1834, first_bad_seq: null, problem: null }) });
  await page.goto('/log');
  await page.getByRole('button', { name: 'Check Log' }).click();
  await expect(page.getByText('The log is intact')).toBeVisible();
  await expect(page.getByText('1,834 entries checked')).toBeVisible();
});

test('gift cards are for officers: the register account sees no Gift cards link or tile', async ({ page }) => {
  await mockBackend(page, register);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open the register/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Gift cards' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Gift cards/ })).toHaveCount(0);
  await page.goto('/gift-cards');
  await expect(page.getByText('This screen is not part of your role.')).toBeVisible();
});

test('All cards shows what the store owes from the database total and filters on the server', async ({ page }) => {
  const lists: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/gift_card_balance')) lists.push(decodeURIComponent(r.url()));
  });
  await mockBackend(
    page,
    advisorAdmin,
    { gift_card_totals: () => ({ paid_outstanding_cents: 123456, promo_outstanding_cents: 500, cards_with_balance: 87 }) },
    { gift_card_balance: [{ ...card, card_id: card.id }] },
  );
  await page.goto('/gift-cards');
  await page.getByRole('tab', { name: 'All cards' }).click();
  // The headline is the database's total over every card, not the sum of
  // the (at most 500) rows on screen.
  await expect(page.getByText('$1,234.56')).toBeVisible();
  await expect(page.getByText('87 cards with money')).toBeVisible();
  await expect(page.getByText('ABCDE-FGHJK').or(page.getByText('ABCDEFGHJK')).first()).toBeVisible();
  expect(lists.at(-1)).toContain('balance_cents=gt.0');
  await page.getByLabel('Only cards with money on them').uncheck();
  await expect.poll(() => lists.length).toBeGreaterThan(1);
  expect(lists.at(-1)).not.toContain('balance_cents=gt');
});

const shift = {
  id: 'shift-1',
  number: 12,
  cashier_id: 'm-cashier',
  cashier_name: 'Casey Cashier (test)',
  cashier_role: 'cashier',
  opened_by: 'm-register',
  opened_at: new Date().toISOString(),
  opening_cash_cents: 5000,
  expected_cash_cents: 5000,
  closed_at: null,
};
const shiftSummary = () => ({ ...shift, cash_in_cents: 0, cash_loads_cents: 0, cash_refunds_cents: 0, handoffs_cents: 0, sales: [], handoffs: [], by_method: {} });
const saleOk = (number: number) => ({ ok: true, duplicate: false, change_cents: 0, new_cards: [], sale: { id: `s${number}`, number, total_cents: 100 } });

test('an offline sale the server turns down shows what was sold, blocks closing, and can be retried', async ({ page, context }) => {
  let reject = true;
  const mock = await mockBackend(page, register, {
    my_open_shifts: () => [shift],
    shift_summary: shiftSummary,
    complete_sale: () => {
      if (reject) throw new Error('Water Bottle 16.9 oz is out of stock (0 left).');
      return saleOk(103);
    },
  });
  await page.goto('/register');
  await expect(page.getByRole('button', { name: /Water Bottle 16.9 oz/ })).toBeVisible();

  mock.offline = true;
  await context.setOffline(true);
  await page.getByRole('button', { name: /Water Bottle 16.9 oz/ }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: /Exact cash/ }).click();
  await expect(page.getByText('Saved offline')).toBeVisible();
  await page.getByRole('button', { name: 'Next sale' }).click();

  mock.offline = false;
  await context.setOffline(false);
  await expect(page.getByText('Offline sales the server would not take')).toBeVisible({ timeout: 10_000 });
  const failed = page.getByRole('listitem').filter({ hasText: 'out of stock (0 left)' });
  await expect(failed).toContainText('1 × Water Bottle 16.9 oz');
  await expect(failed).toContainText('Cash$1.00');
  await expect(failed.getByRole('button', { name: 'Send on this shift' })).toHaveCount(0);

  // Close shift waits until the sale is sent or dismissed.
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  await expect(page.getByRole('button', { name: /Close shift/ })).toBeDisabled();
  await expect(page.getByText('1 sale on this shift could not be saved. Retry or dismiss it first.')).toBeVisible();
  await page.getByRole('button', { name: 'Shift', exact: true }).click();

  // Dismiss asks first; keeping it changes nothing.
  await failed.getByRole('button', { name: 'Dismiss' }).click();
  await expect(failed.getByRole('button', { name: 'Yes, dismiss it' })).toBeVisible();
  await failed.getByRole('button', { name: 'Keep it' }).click();
  await expect(failed.getByRole('button', { name: 'Retry' })).toBeVisible();

  // Restocked: retry sends the same sale (same client_uuid).
  reject = false;
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(/Sent 1 offline sale/)).toBeVisible();
  await expect(page.getByText('Offline sales the server would not take')).toHaveCount(0);
  const sales = mock.calls.filter((c) => c.fn === 'complete_sale');
  expect(new Set(sales.map((c) => c.body.p_client_uuid)).size).toBe(1);
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  await expect(page.getByRole('button', { name: /Close shift/ })).toBeEnabled();
});

test('a queued sale whose shift closed can be sent on the open shift', async ({ page }) => {
  const mock = await mockBackend(page, register, { my_open_shifts: () => [shift], shift_summary: shiftSummary, complete_sale: () => saleOk(104) });
  await page.goto('/register');
  await expect(page.getByRole('button', { name: /Water Bottle 16.9 oz/ })).toBeVisible();
  await page.evaluate(
    (sale) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('fbla-store', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('sale-queue', { keyPath: 'client_uuid' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('sale-queue', 'readwrite');
          tx.objectStore('sale-queue').put(sale);
          tx.oncomplete = () => (req.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    {
      client_uuid: 'old-sale-1',
      queued_at: new Date().toISOString(),
      payload: {
        p_client_uuid: 'old-sale-1',
        p_shift_id: 'shift-old',
        p_type: 'regular',
        p_lines: [{ kind: 'product', product_id: products[1].id, qty: 2 }],
        p_payments: [{ method: 'cash', amount_cents: 350 }],
        p_cash_tendered_cents: 500,
        p_note: null,
        p_reason: null,
      },
      summary: { total_cents: 350, items: 2 },
      error: 'Shift #11 is closed. Open a new shift.',
    },
  );
  await page.reload();
  const failed = page.getByRole('listitem').filter({ hasText: 'Shift #11 is closed' });
  await expect(failed).toContainText('2 × Sports Drink 20 oz');
  await expect(failed).toContainText('Cash$3.50');
  // It belongs to the old shift, so it does not hold this one open.
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  await expect(page.getByRole('button', { name: /Close shift/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Shift', exact: true }).click();

  await failed.getByRole('button', { name: 'Send on this shift' }).click();
  await expect(page.getByText(/Sent 1 offline sale/)).toBeVisible();
  const sent = mock.calls.filter((c) => c.fn === 'complete_sale');
  expect(sent).toHaveLength(1);
  expect(sent[0].body.p_shift_id).toBe('shift-1');
  expect(sent[0].body.p_client_uuid).toBe('old-sale-1');
});
