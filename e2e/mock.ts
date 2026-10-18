// A pretend backend for end-to-end tests: Playwright answers the app's
// Supabase (auth, REST, RPC) and /api function requests from fixtures, so the
// UI can be driven without a database. The database rules themselves are
// tested by pgTAP in the backend repo.
import type { Page, Route } from '@playwright/test';

export const SUPABASE = 'http://127.0.0.1:54321';
const STORAGE_KEY = 'sb-127-auth-token';

function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function fakeSession(email: string, userId = '00000000-0000-4000-8000-000000000001') {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return {
    access_token: `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: userId, email, role: 'authenticated', exp })}.sig`,
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user,
  };
}

export type Me = {
  id: string;
  email: string;
  display_name: string;
  grade: number | null;
  role: string | null;
  is_super_admin: boolean;
  active: boolean;
  has_pin: boolean;
  linked: boolean;
  approved?: boolean;
  permissions: string[];
};

export const ALL_PERMS = [
  'ring_sales', 'sell_gift_cards', 'void_refund', 'issue_promo', 'edit_products', 'stock', 'preauth_view', 'preauth_request',
  'preauth_purchase', 'receiving', 'verify_outage', 'view_reports', 'view_log',
];

export const treasurer: Me = {
  id: 'm-treasurer',
  email: 'treasurer@example.com',
  display_name: 'Taylor Treasurer (test)',
  grade: 11,
  role: 'treasurer',
  is_super_admin: false,
  active: true,
  has_pin: true,
  linked: true,
  permissions: ALL_PERMS,
};

export const register: Me = {
  id: 'm-register',
  email: 'register@example.com',
  display_name: 'Store Register',
  grade: null,
  role: 'register',
  is_super_admin: false,
  active: true,
  has_pin: false,
  linked: true,
  permissions: ['ring_sales', 'sell_gift_cards'],
};

export const directory = [
  { id: 'm-cashier', display_name: 'Casey Cashier (test)', role: 'cashier', is_super_admin: false, has_pin: true },
  { id: 'm-treasurer', display_name: 'Taylor Treasurer (test)', role: 'treasurer', is_super_admin: false, has_pin: true },
  { id: 'm-advisor', display_name: 'Avery Advisor (test)', role: 'advisor', is_super_admin: false, has_pin: true },
  { id: 'm-register', display_name: 'Store Register', role: 'register', is_super_admin: false, has_pin: false },
];

export const categories = [
  { id: 'c-drinks', name: 'Drinks', sort_order: 1, active: true },
  { id: 'c-snacks', name: 'Snacks', sort_order: 2, active: true },
  { id: 'c-supplies', name: 'School Supplies', sort_order: 3, active: true },
];

const product = (id: string, name: string, cat: string, price: number, cost: number | null, onHand: number, upc: string | null = null, smart = false) => ({
  id,
  sku: `FBLA-${id.padStart(4, '0')}`,
  upc,
  name,
  description: null,
  category_id: cat,
  price_cents: price,
  avg_cost_cents: cost,
  cost_status: cost === null ? 'missing' : 'known',
  low_stock_alert: 5,
  image_path: null,
  smart_snack: smart,
  status: 'active',
  on_hand: onHand,
});

export const products = [
  product('1', 'Water Bottle 16.9 oz', 'c-drinks', 100, 25, 48, '012345678905'),
  product('2', 'Sports Drink 20 oz', 'c-drinks', 175, 85, 24, '012345678912'),
  product('3', 'Nacho Chips 1 oz', 'c-snacks', 100, 45, 40, '012345678929'),
  product('4', 'Crispy Rice Treat', 'c-snacks', 100, 30, 36, null, true),
  product('5', 'Fruit Snacks', 'c-snacks', 75, 22, 60, null, true),
  product('6', 'Granola Bar', 'c-snacks', 100, 35, 3, null, true),
  product('7', 'Hot Cocoa Packet', 'c-drinks', 100, null, 20),
  product('8', 'Pencils, 2-pack', 'c-supplies', 50, 15, 0),
];

export const settings = {
  id: 1,
  store_name: 'CPPHS FBLA Store',
  float_cents: 5000,
  over_short_tolerance_cents: 100,
  preauth_limit_cents: 30000,
  preauth_warn_cents: 2000,
  receipt_due_days: 5,
  school_year_start: '2026-09-01',
  open_days: [],
  sams_daily_limit: 30,
  sams_cache_days: 7,
};

type Handler = (body: Record<string, unknown>) => unknown;

export type Mock = {
  calls: Array<{ fn: string; body: Record<string, unknown> }>;
  rpc: Record<string, Handler>;
  tables: Record<string, unknown[]>;
  offline: boolean;
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? null) });

export async function mockBackend(page: Page, me: Me | null, rpc: Record<string, Handler> = {}, tables: Record<string, unknown[]> = {}): Promise<Mock> {
  const mock: Mock = {
    calls: [],
    offline: false,
    rpc: {
      whoami: () => me,
      // Open sign-up: the app calls this only when whoami finds nobody.
      ensure_member: () => ({ ok: true, joined: false, me }),
      record_sign_in: () => null,
      catalog: () => products,
      member_directory: () => directory,
      my_open_shifts: () => [],
      pending_outage_sales: () => [],
      gift_card_totals: () => ({ paid_outstanding_cents: 0, promo_outstanding_cents: 0, cards_with_balance: 0 }),
      ...rpc,
    },
    tables: { settings: [settings], categories, preauths: [], log_entries: [], ...tables },
  };

  if (me) {
    const session = fakeSession(me.email);
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(session)]);
  }

  await page.route(`${SUPABASE}/auth/v1/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) return json(route, me ? fakeSession(me.email).user : null, me ? 200 : 401);
    if (url.pathname.endsWith('/otp')) return json(route, {});
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return json(route, me ? fakeSession(me.email) : {});
  });

  await page.route(`${SUPABASE}/rest/v1/rpc/*`, async (route) => {
    if (mock.offline) return route.abort('internetdisconnected');
    const fn = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    mock.calls.push({ fn, body });
    const handler = mock.rpc[fn];
    if (!handler) return json(route, { message: `No mock for ${fn}`, code: 'PGRST202' }, 404);
    try {
      return json(route, handler(body));
    } catch (err) {
      // A handler can throw an error with a status to act like the gateway
      // (502/503/504 without a Postgres code).
      const status = (err as { status?: number }).status;
      if (status) return json(route, { message: (err as Error).message }, status);
      return json(route, { message: (err as Error).message, code: 'P0001' }, 400);
    }
  });

  await page.route(`${SUPABASE}/rest/v1/*`, (route) => {
    if (mock.offline) return route.abort('internetdisconnected');
    const table = new URL(route.request().url()).pathname.split('/').pop()!;
    const rows = mock.tables[table] ?? [];
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return json(route, single ? rows[0] : rows);
  });

  await page.route(`${SUPABASE}/storage/v1/**`, (route) => json(route, { Key: 'mock/path', signedURL: '/mock' }));

  await page.route('**/api/health', (route) =>
    json(route, { ok: true, service: 'fbla-store-functions', configured: { supabase: true, anthropic: true, resend: false } }),
  );

  return mock;
}
