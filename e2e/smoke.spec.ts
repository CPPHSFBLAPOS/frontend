import { expect, test, type Page } from '@playwright/test';
import { mockBackend, products, register, treasurer } from './mock';

const shot = async (page: Page, name: string) => {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
};

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

test('sign-in asks for a school email, then the code', async ({ page }) => {
  await mockBackend(page, null);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await shot(page, 'sign-in');
  await page.getByLabel('School email').fill('treasurer@example.com');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByLabel('Digit 1')).toBeVisible();
});

test('home shows the system checks and the officer actions', async ({ page }) => {
  await mockBackend(page, treasurer);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CPPHS FBLA Store' })).toBeVisible();
  await expect(page.getByText('Database (Supabase)')).toBeVisible();
  await expect(page.getByText('Granola Bar · 3')).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, 'home');
});

test('a cashier opens a shift, rings a sale and sees the change due', async ({ page }) => {
  let opened = false;
  const mock = await mockBackend(page, register, {
    my_open_shifts: () => (opened ? [shift] : []),
    open_shift: (b) => {
      if (b.p_pin !== '3333') return { ok: false, error: 'pin_wrong', message: 'Wrong PIN.' };
      opened = true;
      return { ok: true, shift_id: 'shift-1', number: 12 };
    },
    shift_summary: () => ({ ...shift, expected_cash_cents: 5000, cash_in_cents: 0, cash_loads_cents: 0, cash_refunds_cents: 0, handoffs_cents: 0, sales: [], handoffs: [], by_method: {} }),
    complete_sale: (b) => ({
      ok: true,
      duplicate: false,
      change_cents: (b.p_cash_tendered_cents as number) - 275,
      new_cards: [],
      sale: { id: 's1', number: 101, total_cents: 275, lines: [], payments: [], refunds: [] },
    }),
  });

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Start a shift' })).toBeVisible();
  await page.getByRole('button', { name: /Casey Cashier/ }).click();
  for (const d of '9999') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('radio', { name: 'Total only' }).click();
  await page.getByRole('button', { name: /Open shift with \$50\.00/ }).click();
  await expect(page.getByText('Wrong PIN.')).toBeVisible();
  for (const d of '3333') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('radio', { name: 'Total only' }).click();
  await page.getByRole('button', { name: /Open shift with \$50\.00/ }).click();

  await expect(page.getByRole('heading', { name: 'Casey Cashier (test)' })).toBeVisible();
  await page.getByRole('button', { name: /Water Bottle 16.9 oz/ }).click();
  await page.getByRole('button', { name: /Sports Drink 20 oz/ }).click();
  await expect(page.getByRole('button', { name: /Pencils, 2-pack.*sold out/ })).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'register');

  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: '$5.00' }).click();
  await expect(page.getByText('Change')).toBeVisible();
  await shot(page, 'checkout');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByText('Sale #101 done')).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, 'sale-done');

  const sale = mock.calls.find((c) => c.fn === 'complete_sale')!.body;
  expect(sale.p_lines).toEqual([
    { kind: 'product', product_id: products[0].id, qty: 1 },
    { kind: 'product', product_id: products[1].id, qty: 1 },
  ]);
  expect(sale.p_payments).toEqual([{ method: 'cash', amount_cents: 275 }]);
  expect(sale.p_cash_tendered_cents).toBe(500);
});

test('a barcode scan adds the item with that UPC', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'USB scanners plug into the store laptop');
  await mockBackend(page, register, { my_open_shifts: () => [shift], shift_summary: () => ({ ...shift, sales: [], handoffs: [], by_method: {} }) });
  await page.goto('/register');
  await expect(page.getByRole('button', { name: /Nacho Chips 1 oz/ })).toBeVisible();
  // A scanner types fast and ends with Enter.
  await page.keyboard.type('012345678929', { delay: 5 });
  await page.keyboard.press('Enter');
  await expect(page.locator('li').filter({ hasText: 'Nacho Chips 1 oz' })).toBeVisible();
});

test('sales made offline wait in the queue and go out when the connection is back', async ({ page, context }) => {
  const mock = await mockBackend(page, register, {
    my_open_shifts: () => [shift],
    shift_summary: () => ({ ...shift, sales: [], handoffs: [], by_method: {} }),
    complete_sale: () => ({ ok: true, duplicate: false, change_cents: 0, new_cards: [], sale: { id: 's2', number: 102, total_cents: 100 } }),
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
  await expect(page.getByText(/Offline, 1 sale waiting/)).toBeVisible();
  await shot(page, 'offline');

  mock.offline = false;
  await context.setOffline(false);
  await expect(page.getByText(/Sent 1 offline sale/)).toBeVisible({ timeout: 10_000 });
  expect(mock.calls.filter((c) => c.fn === 'complete_sale')).toHaveLength(1);
});

test('the pre-auth form works out the payoff and blocks totals over $300', async ({ page }) => {
  await mockBackend(page, treasurer, { product_sales_history: () => ({}) });
  await page.goto('/preauth/new');
  await expect(page.getByRole('heading', { name: 'Preauthorization Purchase Order' })).toBeVisible();
  await page.getByRole('button', { name: 'Type it in' }).click();
  await page.getByLabel('Store item').selectOption({ label: 'Water Bottle 16.9 oz' });
  await page.getByLabel('Units per pack').fill('24');
  await page.getByLabel('Pack price').fill('6.00');
  await page.getByRole('button', { name: 'Add to request' }).click();
  await expect(page.getByText('$24.00').first()).toBeVisible();
  await page.getByLabel('Fundraiser').check();
  await page.getByLabel('Justification').fill('Water sells out every week.');
  await expect(page.getByRole('button', { name: 'Sign and submit' })).toBeEnabled();
  await page.waitForTimeout(800);
  await shot(page, 'preauth');

  await page.getByLabel('Pack price').last().fill('400.00');
  await page.getByLabel('Pack price').last().blur();
  await expect(page.getByText(/Over the limit by/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign and submit' })).toBeDisabled();
});

test('reports show the dashboard and tabs', async ({ page }) => {
  const summary = {
    from: '2026-09-01',
    to: '2027-06-30',
    revenue_cents: 184250,
    cogs_cents: 79310,
    profit_cents: 104940,
    margin: 0.5712,
    revenue_cost_missing_cents: 1200,
    promo_cost_cents: 640,
    sales_count: 1290,
    avg_sale_cents: 143,
    open_days: 28,
    revenue_per_open_day_cents: 6580,
  };
  await mockBackend(page, treasurer, {
    report_dashboard: () => ({
      current: summary,
      last_year: { ...summary, revenue_cents: 0, legacy_revenue_cents: 151200, legacy_open_days: 25, combined_revenue_cents: 151200 },
      forecast: { revenue_cents: 6580 * 140, planned_open_days: 140, revenue_per_open_day_cents: 6580 },
      series: Array.from({ length: 28 }, (_, i) => ({ d: `2026-09-${String(i + 1).padStart(2, '0')}`, revenue_cents: 4000 + ((i * 1733) % 5000) })),
    }),
    report_products: () =>
      products.map((p, i) => ({
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        category: null,
        status: 'active',
        price_cents: p.price_cents,
        avg_cost_cents: p.avg_cost_cents,
        cost_status: p.cost_status,
        on_hand: p.on_hand,
        qty: 300 - i * 30,
        revenue_cents: (300 - i * 30) * p.price_cents,
        cogs_cents: (300 - i * 30) * (p.avg_cost_cents ?? 0),
        profit_cents: (300 - i * 30) * (p.price_cents - (p.avg_cost_cents ?? 0)),
        margin: p.avg_cost_cents === null ? null : (p.price_cents - p.avg_cost_cents) / p.price_cents,
      })),
  });
  await page.goto('/reports');
  await expect(page.getByText('Revenue', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$1,842.50')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(1200);
  await shot(page, 'reports');
});
