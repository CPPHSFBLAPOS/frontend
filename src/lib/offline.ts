// Offline sales. When the register loses its connection, each sale is kept
// in IndexedDB with its client_uuid and sent when the connection comes back.
// complete_sale is idempotent on client_uuid, so a sale that did reach the
// server before the connection dropped is never saved twice.

export type QueuedSale = {
  client_uuid: string;
  queued_at: string;
  payload: Record<string, unknown>;
  summary: { total_cents: number; items: number };
  error?: string;
};

const DB = 'fbla-store';
const STORE = 'sale-queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'client_uuid' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export function enqueueSale(sale: QueuedSale) {
  return tx('readwrite', (s) => s.put(sale));
}

export async function queuedSales(): Promise<QueuedSale[]> {
  const all = await tx<QueuedSale[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedSale[]>);
  return all.sort((a, b) => a.queued_at.localeCompare(b.queued_at));
}

export function removeSale(clientUuid: string) {
  return tx('readwrite', (s) => s.delete(clientUuid));
}

// Puts a sale the server rejected back in line, unchanged but for its error,
// so the next flush sends it again.
export function retrySale(item: QueuedSale) {
  const { error: _error, ...rest } = item;
  return enqueueSale(rest);
}

// Re-files a sale whose shift was closed before it arrived onto another
// (open) shift. The client_uuid stays the same: complete_sale dedupes on
// it, so the sale can never be saved twice.
export function moveSaleToShift(item: QueuedSale, shiftId: string) {
  const { error: _error, ...rest } = item;
  return enqueueSale({ ...rest, payload: { ...rest.payload, p_shift_id: shiftId } });
}

// complete_sale raises "Shift #12 is closed. Open a new shift." when the
// sale's shift closed before the queued sale reached the server.
export function isClosedShiftError(error: string | null | undefined): boolean {
  return Boolean(error && /Shift #\d+ is closed/.test(error));
}

// Queued sales (waiting or rejected) that belong to a shift. While there are
// any, that shift's drawer count would be wrong, so it cannot close.
export function queuedForShift(queue: QueuedSale[], shiftId: string): QueuedSale[] {
  return queue.filter((q) => q.payload.p_shift_id === shiftId);
}

export type QueuedSaleDetail = {
  lines: Array<{ key: string; label: string; qty: number | null; amount_cents: number | null }>;
  payments: Array<{ key: string; label: string; amount_cents: number }>;
};

const lastFour = (code: unknown) => (typeof code === 'string' && code ? `••••${code.slice(-4)}` : '');
const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// What a queued sale was, read back from its complete_sale payload (p_lines
// and p_payments), so a rejected one can be checked against the receipt or
// the drawer before anyone retries or dismisses it. Card codes show only
// their last four characters.
export function describeQueuedSale(payload: Record<string, unknown>, productName: (id: string) => string | undefined): QueuedSaleDetail {
  const rawLines = Array.isArray(payload.p_lines) ? (payload.p_lines as Array<Record<string, unknown>>) : [];
  const rawPayments = Array.isArray(payload.p_payments) ? (payload.p_payments as Array<Record<string, unknown>>) : [];
  return {
    lines: rawLines.map((l, i) => {
      if (l.kind === 'gift_card_load') {
        return {
          key: `l${i}`,
          label: l.code ? `Load gift card ${lastFour(l.code)}` : 'New gift card',
          qty: null,
          amount_cents: cents(l.amount_cents),
        };
      }
      const id = String(l.product_id ?? '');
      return { key: `l${i}`, label: productName(id) ?? 'An item no longer in the catalog', qty: cents(l.qty), amount_cents: null };
    }),
    payments: rawPayments.map((p, i) => ({
      key: `p${i}`,
      label: p.method === 'cash' ? 'Cash' : `${p.method === 'promo_card' ? 'Promo card' : 'Gift card'} ${lastFour(p.code)}`.trim(),
      amount_cents: cents(p.amount_cents),
    })),
  };
}

export class NetworkError extends Error {}

// Is a failed database call worth trying again later (the register queues
// the sale) rather than showing as a refusal? Yes when the request never got
// an answer (status 0), timed out (408), was rate limited (429), or the
// server or the gateway in front of it failed (5xx), and when PostgREST
// could not reach Postgres (PGRST000-002). JWT errors (PGRST301, PGRST303)
// are not transient: signing in again fixes them, retrying does not.
// A 500 that carries a Postgres SQLSTATE is a database error; only the
// classes that pass on their own count (connection 08, deadlock and
// serialization 40, resources 53, lock not available 55P03, canceled or
// shutting down 57, system 58). A bug in a function (P0002, XX000, ...) will
// fail the same way every time, so it is shown, not queued.
export function isTransientFailure(status: number | undefined, code?: string | null): boolean {
  if (code && /^PGRST00[012]$/.test(code)) return true;
  if (status === undefined) return false;
  if (status === 0 || status === 408 || status === 429) return true;
  if (status < 500) return false;
  if (status === 500 && code && /^[0-9A-Z]{5}$/.test(code)) return /^(08|40|53|57|58)|^55P03$/.test(code);
  return true;
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
}

// Sends queued sales oldest first. Stops at the first network error (still
// offline). A sale the server rejects (for example, sold out by the time it
// arrived) stays in the queue with its error so someone can deal with it.
// failed counts every rejected sale still in the queue; rejected only the
// ones turned down by this flush (so the register warns once, not every 30
// seconds).
export async function flushQueue(send: (payload: Record<string, unknown>) => Promise<unknown>) {
  let sent = 0;
  let failed = 0;
  let rejected = 0;
  for (const item of await queuedSales()) {
    if (item.error) {
      failed++;
      continue;
    }
    try {
      await send(item.payload);
      await removeSale(item.client_uuid);
      sent++;
    } catch (err) {
      if (isNetworkError(err)) break;
      await enqueueSale({ ...item, error: err instanceof Error ? err.message : String(err) });
      failed++;
      rejected++;
    }
  }
  return { sent, failed, rejected, waiting: (await queuedSales()).length };
}
