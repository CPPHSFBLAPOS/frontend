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

export class NetworkError extends Error {}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
}

// Sends queued sales oldest first. Stops at the first network error (still
// offline). A sale the server rejects (for example, sold out by the time it
// arrived) stays in the queue with its error so someone can deal with it.
export async function flushQueue(send: (payload: Record<string, unknown>) => Promise<unknown>) {
  let sent = 0;
  let failed = 0;
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
    }
  }
  return { sent, failed, waiting: (await queuedSales()).length };
}
