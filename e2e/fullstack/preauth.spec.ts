import { expect, test } from '@playwright/test';
import { TINY_PNG, drawSignature, signIn } from './helpers';

// A pre-auth from draft to closed, with the student and the Advisor in
// separate browsers.
test('a pre-auth goes from draft to closed', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage();
  await signIn(student, 'treasurer@example.com');
  await student.goto('/preauth/new');

  await student.getByRole('button', { name: 'Type it in' }).click();
  await student.getByLabel('Store item').selectOption({ label: 'Water Bottle 16.9 oz' });
  await student.getByLabel('Units per pack').fill('24');
  await student.getByLabel('Pack price').fill('6.00');
  await student.getByRole('button', { name: 'Add to request' }).click();
  await student.getByLabel('Fundraiser').check();
  await student.getByLabel('Justification').fill('Water sells out every week.');
  await student.getByRole('button', { name: 'Sign and submit' }).click();
  await drawSignature(student);
  await student.getByRole('dialog').getByRole('button', { name: 'Sign and submit' }).click();
  await expect(student.getByText('Waiting for Advisor')).toBeVisible({ timeout: 15_000 });
  const formUrl = student.url();

  const advisor = await (await browser.newContext()).newPage();
  await signIn(advisor, 'advisor@example.com');
  await advisor.goto(formUrl);
  await advisor.getByRole('button', { name: 'Approve and sign' }).click();
  await drawSignature(advisor);
  await advisor.getByRole('dialog').getByRole('button', { name: 'Sign' }).click();
  await expect(advisor.getByText('Approved').first()).toBeVisible({ timeout: 15_000 });

  await student.reload();
  await student.getByRole('button', { name: 'Record purchase' }).click();
  await expect(student.getByText('Turn in the receipt')).toBeVisible();
  await student.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: TINY_PNG });
  await student.getByLabel('Receipt total').fill('6.00');
  await student.getByLabel('Tax on it').fill('0.36');
  await student.getByRole('button', { name: 'Save receipt' }).click();
  await student.getByRole('button', { name: 'Receive the items' }).click();
  await student.getByRole('button', { name: 'Post to stock' }).click();
  await expect(student.getByText('Received').first()).toBeVisible({ timeout: 15_000 });

  await advisor.reload();
  await advisor.getByRole('button', { name: 'Close the form' }).click();
  await expect(advisor.getByText('Closed').first()).toBeVisible({ timeout: 15_000 });
});
