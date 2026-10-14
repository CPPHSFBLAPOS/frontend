// Full-stack helpers: these talk to the real local Supabase started by
// `supabase start` in the backend repo (with its seed loaded).
import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Signs in through the real sign-in screen. The code (6 to 10 digits,
// whatever the project sends) comes from the local admin API instead of an
// inbox.
export async function signIn(page: Page, email: string) {
  if (!serviceKey) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY (printed by `supabase start`).');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  await page.goto('/');
  await page.getByLabel('School email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const code = page.getByLabel('Code from your email');
  await code.fill(data.properties.email_otp);
  await code.press('Enter');
  await expect(page.getByRole('heading', { name: 'CPPHS FBLA Store' })).toBeVisible({ timeout: 15_000 });
}

export async function drawSignature(page: Page) {
  const pad = page.getByLabel('Signature pad');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 18, box.y + box.height * (0.6 - Math.sin(i / 2) * 0.25));
  await page.mouse.up();
}

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
