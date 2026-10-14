import { AlertTriangle, ArrowRightLeft, RotateCw, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Product, Shift } from '../../api/types';
import { item, list } from '../../components/motion';
import { Button, Card } from '../../components/ui';
import { formatTime } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { describeQueuedSale, isClosedShiftError, type QueuedSale } from '../../lib/offline';

type Actions = {
  onRetry: (sale: QueuedSale) => Promise<void>;
  onMoveHere: (sale: QueuedSale) => Promise<void>;
  onDismiss: (sale: QueuedSale) => Promise<void>;
};

// Offline sales the server turned down (sold out by the time they arrived,
// shift already closed, ...). Each one shows what was sold and how it was
// paid, so the cashier can fix the cause and retry, move it onto the open
// shift, or (after a second tap) drop it.
export function FailedSales({ sales, products, shift, blocksClose, ...actions }: { sales: QueuedSale[]; products: Product[]; shift: Shift; blocksClose: boolean } & Actions) {
  const name = (id: string) => products.find((p) => p.id === id)?.name;
  return (
    <Card initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }} className="mb-4 border-bad/50 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
        <div>
          <p className="font-semibold text-bad">Offline sales the server would not take</p>
          <p className="text-sm text-ink-2">
            They are not saved yet. Fix the cause and retry, or dismiss one that should not count.
            {blocksClose && ' Close shift stays locked until they are sent or dismissed.'}
          </p>
        </div>
      </div>
      <motion.ul variants={list} initial="initial" animate="animate" className="mt-3 grid gap-3">
        <AnimatePresence initial={false}>
          {sales.map((s) => (
            <FailedSale key={s.client_uuid} sale={s} name={name} shift={shift} {...actions} />
          ))}
        </AnimatePresence>
      </motion.ul>
    </Card>
  );
}

function FailedSale({ sale, name, shift, onRetry, onMoveHere, onDismiss }: { sale: QueuedSale; name: (id: string) => string | undefined; shift: Shift } & Actions) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'retry' | 'move' | 'dismiss' | null>(null);
  const detail = describeQueuedSale(sale.payload, name);
  const canMove = isClosedShiftError(sale.error) && sale.payload.p_shift_id !== shift.id && !shift.closed_at;

  const run = async (kind: 'retry' | 'move' | 'dismiss', fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.li layout variants={item} exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }} className="overflow-hidden rounded-lg border border-rule bg-paper p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold">
          <span className="num">{formatCents(sale.summary.total_cents)}</span>
          <span className="font-normal text-ink-2"> · rung up at {formatTime(sale.queued_at)}</span>
        </p>
        <p className="num text-xs text-ink-3">#{sale.client_uuid.slice(0, 8)}</p>
      </div>
      <p className="mt-1 text-sm font-medium text-bad">{sale.error}</p>

      <div className="mt-2 grid max-w-2xl gap-3 text-sm sm:grid-cols-2 sm:gap-8">
        <div>
          <p className="eyebrow mb-1">Items</p>
          <ul className="grid gap-0.5">
            {detail.lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-2">
                <span>
                  {l.qty !== null && <span className="num font-semibold">{l.qty} × </span>}
                  {l.label}
                </span>
                {l.amount_cents !== null && <span className="num">{formatCents(l.amount_cents)}</span>}
              </li>
            ))}
            {detail.lines.length === 0 && <li className="text-ink-3">No lines saved.</li>}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-1">Paid with</p>
          <ul className="grid gap-0.5">
            {detail.payments.map((p) => (
              <li key={p.key} className="flex justify-between gap-2">
                <span>{p.label}</span>
                <span className="num">{formatCents(p.amount_cents)}</span>
              </li>
            ))}
            {detail.payments.length === 0 && <li className="text-ink-3">Nothing to pay (comp or $0 sale).</li>}
          </ul>
        </div>
      </div>

      {canMove && (
        <p className="mt-2 text-xs text-ink-2">
          Its shift closed before it arrived. Sending it on shift #{shift.number} adds it to this drawer's expected cash.
        </p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-3 grid gap-2 rounded-lg bg-bad-soft p-3"
          >
            <p className="text-sm font-medium">Dismiss this sale for good? It was never saved, so it will not count in the drawer, stock or reports, and it cannot be brought back.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" className="min-h-11" icon={<Trash2 className="size-4" />} loading={busy === 'dismiss'} onClick={() => void run('dismiss', () => onDismiss(sale))}>
                Yes, dismiss it
              </Button>
              <Button className="min-h-11" autoFocus onClick={() => setConfirming(false)} disabled={busy !== null}>
                Keep it
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-3 flex flex-wrap gap-2"
          >
            <Button variant="primary" className="min-h-11" icon={<RotateCw className="size-4" />} loading={busy === 'retry'} disabled={busy !== null} onClick={() => void run('retry', () => onRetry(sale))}>
              Retry
            </Button>
            {canMove && (
              <Button className="min-h-11" icon={<ArrowRightLeft className="size-4" />} loading={busy === 'move'} disabled={busy !== null} onClick={() => void run('move', () => onMoveHere(sale))}>
                Send on this shift
              </Button>
            )}
            <Button variant="ghost" className="min-h-11" disabled={busy !== null} onClick={() => setConfirming(true)}>
              Dismiss
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
