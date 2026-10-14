import { expect, test } from '@playwright/test';
import { ALL_PERMS, mockBackend, products, treasurer } from './mock';

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
