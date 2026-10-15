import { HelpCircle, RotateCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { SalePayload } from '../../api/register';
import type { Product } from '../../api/types';
import { Button, Card } from '../../components/ui';
import { formatCents } from '../../lib/money';
import { describeQueuedSale } from '../../lib/offline';

// A gift card sale whose answer never came back. It may already be saved, so
// it is held exactly as it was sent: Send again repeats it with the same id,
// and the server either returns the saved sale (with any new card's code) or
// saves it now. Checkout stays locked meanwhile, so it can't be rung twice.
export function UnconfirmedSale({
  payload,
  products,
  busy,
  onSend,
  onCancel,
}: {
  payload: SalePayload;
  products: Product[];
  busy: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const detail = describeQueuedSale(payload, (id) => products.find((p) => p.id === id)?.name);
  const total = detail.payments.reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <Card
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      className="mb-4 border-warn/60 p-4"
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <HelpCircle className="mt-0.5 size-5 shrink-0 text-warn" />
        <div>
          <p className="font-semibold">
            Sale not confirmed · <span className="num">{formatCents(total)}</span>
          </p>
          <p className="text-sm text-ink-2">
            The server did not answer, so this sale may already be saved. Keep the customer here and press Send again: it
            sends the same sale, so it is never rung twice. Checkout and Close shift wait until it is confirmed.
          </p>
        </div>
      </div>

      <div className="mt-3 grid max-w-2xl gap-3 text-sm sm:grid-cols-2 sm:gap-8">
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
          </ul>
        </div>
      </div>

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
            <p className="text-sm font-medium">
              Cancel only if the customer has their money and cards back. If the sale did save, an officer has to void it
              (Void / refund), or the drawer and the card balances will be off.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" className="min-h-11" icon={<X className="size-4" />} onClick={onCancel} disabled={busy}>
                Yes, cancel it
              </Button>
              <Button className="min-h-11" autoFocus onClick={() => setConfirming(false)}>
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
            <Button variant="primary" className="min-h-11" icon={<RotateCw className="size-4" />} loading={busy} onClick={onSend}>
              Send again
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirming(true)} disabled={busy}>
              Cancel sale…
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
