import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Opens a shift, sells, voids, refunds and closes at $0.00 over/short,
// against the real database. Drawer: $50.00 opening, a $1.00 sale that is
// voided (no cash), a $2.00 sale, a $1.00 refund: expected $51.00.
test('a shift opens, sells, voids, refunds and closes at $0.00', async ({ page }) => {
  await signIn(page, 'register@example.com');
  await page.getByRole('link', { name: 'Register' }).first().click();

  await page.getByRole('button', { name: /Casey Cashier/ }).click();
  for (const d of '3333') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('radio', { name: 'Total only' }).click();
  await page.getByRole('button', { name: /Open shift with \$50\.00/ }).click();
  await expect(page.getByRole('heading', { name: 'Casey Cashier (test)' })).toBeVisible();

  // Sale A: one water, exact cash. Remember its number for the void.
  await page.getByRole('button', { name: /Water Bottle 16.9 oz/ }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: /Exact cash/ }).click();
  const doneA = await page.getByText(/Sale #\d+ done/).textContent();
  const saleA = Number(/#(\d+)/.exec(doneA ?? '')![1]);
  await page.getByRole('button', { name: 'Next sale' }).click();

  // Sale B: two bags of chips.
  await page.getByRole('button', { name: /Nacho Chips 1 oz/ }).click();
  await page.getByRole('button', { name: /Nacho Chips 1 oz/ }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: /Exact cash/ }).click();
  const doneB = await page.getByText(/Sale #\d+ done/).textContent();
  const saleB = Number(/#(\d+)/.exec(doneB ?? '')![1]);
  await page.getByRole('button', { name: 'Next sale' }).click();

  // Void sale A with an officer's PIN.
  await page.getByRole('button', { name: 'Void / refund' }).click();
  await page.getByLabel('Sale number (on the receipt)').fill(String(saleA));
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByLabel('Reason (required)').fill('Rang it twice');
  await page.getByLabel('Officer', { exact: true }).selectOption({ label: 'Taylor Treasurer (test)' });
  await page.getByLabel('Officer PIN').fill('2222');
  await page.getByRole('button', { name: 'Void whole sale' }).click();
  await expect(page.getByText(/Sale #\d+ voided/)).toBeVisible();

  // Refund one bag from sale B, back to the shelf.
  await page.getByRole('button', { name: 'Void / refund' }).click();
  await page.getByLabel('Sale number (on the receipt)').fill(String(saleB));
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByLabel(/Refund how many Nacho Chips/).selectOption('1');
  await page.getByLabel('Reason (required)').fill('Crushed bag');
  await page.getByLabel('Officer', { exact: true }).selectOption({ label: 'Taylor Treasurer (test)' });
  await page.getByLabel('Officer PIN').fill('2222');
  await page.getByRole('button', { name: /Refund \$1\.00/ }).click();
  await expect(page.getByText(/Refunded \$1\.00/)).toBeVisible();

  // Close: $50 bill + $1 bill = $51.00.
  await page.getByRole('button', { name: 'Shift' }).click();
  await page.getByRole('button', { name: 'Close shift' }).click();
  await page.getByLabel('$50 count').fill('1');
  await page.getByLabel('$1 count').first().fill('1');
  await page.getByRole('dialog').getByRole('button', { name: 'Close shift' }).click();
  await expect(page.getByRole('heading', { name: /Shift #\d+ closed/ })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('$0.00').first()).toBeVisible();
});
