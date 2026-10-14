import { CreditCard, Gift, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { SaleType } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Segmented } from '../../components/Tabs';
import { Button, Input, cx } from '../../components/ui';
import { formatCode } from '../../lib/giftcode';
import { formatCents } from '../../lib/money';
import { setQty, removeLine, totals, unitPrice, type Cart } from './cart';

export function CartPanel({
  cart,
  onChange,
  onPay,
  onAddLoad,
  online,
}: {
  cart: Cart;
  onChange: (c: Cart) => void;
  onPay: () => void;
  onAddLoad: () => void;
  online: boolean;
}) {
  const t = totals(cart);
  const training = cart.type === 'training';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="size-4 text-ink-3" />
          <span className="font-semibold">Cart</span>
          <motion.span key={t.items} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="num rounded-full bg-navy-soft px-2 text-xs font-bold text-navy">
            {t.items}
          </motion.span>
        </div>
        {cart.lines.length > 0 && (
          <button className="text-xs font-semibold text-ink-3 hover:text-bad" onClick={() => onChange({ ...cart, lines: [] })}>
            Clear
          </button>
        )}
      </div>

      <div className="px-4 pt-3">
        <Segmented
          size="sm"
          options={[
            { id: 'regular', label: 'Regular' },
            { id: 'staff', label: 'Staff' },
            { id: 'comp', label: 'Comp' },
            { id: 'training', label: 'Training' },
          ]}
          value={cart.type === 'outage' ? 'regular' : cart.type}
          onChange={(type: SaleType) =>
            onChange({ ...cart, type, lines: type === 'training' || type === 'comp' ? cart.lines.filter((l) => l.kind === 'product') : cart.lines })
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {cart.lines.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-full place-items-center py-10 text-center text-sm text-ink-3">
            <div>
              <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
                <ShoppingBag className="mx-auto mb-2 size-8 opacity-40" />
              </motion.div>
              Tap an item or scan a barcode.
            </div>
          </motion.div>
        ) : (
          <ul className="grid gap-2">
            <AnimatePresence initial={false}>
              {cart.lines.map((l) => (
                <motion.li
                  key={l.key}
                  layout
                  initial={{ opacity: 0, x: 30, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -30, height: 0, marginBottom: -8 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="flex items-center gap-2 rounded-lg border border-rule bg-paper p-2.5"
                >
                  {l.kind === 'product' ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{l.product.name}</p>
                        <p className="num text-xs text-ink-3">
                          {formatCents(unitPrice(cart, l))} each{cart.type === 'comp' && ` (list ${formatCents(l.product.price_cents)})`}
                        </p>
                      </div>
                      <div className="flex items-center rounded-md border border-rule-2 bg-field">
                        <motion.button whileTap={{ scale: 0.8 }} className="p-1.5" onClick={() => onChange(setQty(cart, l.key, l.qty - 1))} aria-label="One less">
                          <Minus className="size-3.5" />
                        </motion.button>
                        <motion.span key={l.qty} initial={{ scale: 1.4, color: 'var(--navy)' }} animate={{ scale: 1, color: 'var(--ink)' }} className="num w-7 text-center text-sm font-semibold">
                          {l.qty}
                        </motion.span>
                        <motion.button
                          whileTap={{ scale: 0.8 }}
                          className="p-1.5 disabled:opacity-30"
                          disabled={!training && l.qty >= l.product.on_hand}
                          onClick={() => onChange(setQty(cart, l.key, l.qty + 1))}
                          aria-label="One more"
                        >
                          <Plus className="size-3.5" />
                        </motion.button>
                      </div>
                      <span className="num w-16 text-right text-sm font-semibold">{formatCents(l.qty * unitPrice(cart, l))}</span>
                    </>
                  ) : (
                    <>
                      <span className="grid size-8 place-items-center rounded-md bg-gold-soft text-warn">
                        <Gift className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{l.code ? 'Reload gift card' : 'New gift card'}</p>
                        <p className="num text-xs text-ink-3">{l.code ? formatCode(l.code) : 'Code printed after the sale'}</p>
                      </div>
                      <span className="num w-16 text-right text-sm font-semibold">{formatCents(l.amount_cents)}</span>
                      <button className="p-1 text-ink-3 hover:text-bad" onClick={() => onChange(removeLine(cart, l.key))} aria-label="Remove">
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="grid gap-2 border-t border-rule px-4 py-3">
        <AnimatePresence>
          {cart.type === 'comp' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <Input placeholder="Comp reason (required)" value={cart.reason} onChange={(e) => onChange({ ...cart, reason: e.target.value })} aria-label="Comp reason" />
            </motion.div>
          )}
        </AnimatePresence>
        <Input placeholder="Note (optional, never a buyer's name)" value={cart.note} onChange={(e) => onChange({ ...cart, note: e.target.value })} aria-label="Note" className="text-sm" />
        {cart.type !== 'training' && cart.type !== 'comp' && (
          <Button variant="ghost" size="sm" icon={<Gift className="size-3.5" />} onClick={onAddLoad} disabled={!online} className="justify-start">
            Sell or reload a gift card
          </Button>
        )}
        {t.loads > 0 && (
          <div className="num flex justify-between text-sm text-ink-2">
            <span>Gift card loads</span>
            <span>{formatCents(t.loads)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Total</span>
          <AnimatedNumber value={t.total} duration={0.35} className="num text-3xl font-semibold" />
        </div>
        <motion.div animate={cart.lines.length ? { scale: [1, 1.015, 1] } : {}} transition={{ duration: 0.4 }} key={t.total}>
          <Button
            variant={training ? 'gold' : 'primary'}
            size="lg"
            className={cx('w-full')}
            icon={<CreditCard className="size-5" />}
            disabled={cart.lines.length === 0 || (cart.type === 'comp' && !cart.reason.trim())}
            onClick={onPay}
          >
            {cart.type === 'comp' ? 'Record comp' : training ? 'Practice checkout' : 'Checkout'}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
