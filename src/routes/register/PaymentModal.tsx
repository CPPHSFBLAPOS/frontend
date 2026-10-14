import { Banknote, CreditCard, Gift, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { lookupGiftCard } from '../../api/giftCards';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Modal } from '../../components/Modal';
import { Button, Field, Input, MoneyInput, cx } from '../../components/ui';
import { quickTenders } from '../../lib/cash';
import { formatCode, isValidCode, normalizeCode } from '../../lib/giftcode';
import { centsToInput, formatCents, parseDollars } from '../../lib/money';
import { settle, totals, type Cart, type Tender } from './cart';

export function PaymentModal({
  open,
  onClose,
  cart,
  online,
  busy,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  cart: Cart;
  online: boolean;
  busy: boolean;
  onComplete: (s: ReturnType<typeof settle>, cashGiven: number | null) => void;
}) {
  const { total, subtotal } = totals(cart);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [cash, setCash] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const cashGiven = cash.trim() === '' ? null : parseDollars(cash);
  const s = settle(total, tenders, cashGiven);
  const cardsAllowed = cart.type === 'regular' || cart.type === 'staff';

  const addCard = async () => {
    const code = normalizeCode(cardCode);
    if (!isValidCode(code)) return setCardError('A card code is 10 letters and numbers.');
    setChecking(true);
    setCardError(null);
    try {
      const card = await lookupGiftCard(code);
      if (card.status !== 'active') throw new Error(`Card ${formatCode(card.code)} is deactivated.`);
      if (card.balance_cents <= 0) throw new Error('That card is empty.');
      const used = tenders.reduce((n, t) => n + t.amount_cents, 0);
      const room = Math.max(0, subtotal - used);
      if (room <= 0) throw new Error('Gift cards cannot pay for gift card loads.');
      const amount = Math.min(card.balance_cents, room, total - used);
      setTenders((t) => [
        ...t.filter((x) => x.code !== card.code),
        { key: card.code, method: card.type === 'promo' ? 'promo_card' : 'gift_card', code: card.code, amount_cents: amount, balance_cents: card.balance_cents },
      ]);
      setCardCode('');
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const done = () => onComplete(s, s.cashDue > 0 ? (cashGiven ?? s.cashDue) : null);
  const exact = s.cashDue > 0 && cashGiven === null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={cart.type === 'comp' ? 'Record comp' : cart.type === 'training' ? 'Practice checkout' : 'Checkout'}
      subtitle={cart.type === 'training' ? 'Training mode: nothing here touches stock, cash or reports.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Back to cart</Button>
          <Button variant="primary" size="lg" loading={busy} disabled={!(s.ready || exact)} onClick={done}>
            {total === 0 ? 'Finish' : exact ? `Exact cash ${formatCents(s.cashDue)}` : 'Complete sale'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
        <div className="grid content-start gap-4">
          {total > 0 && (
            <>
              <div>
                <p className="label mb-2 flex items-center gap-1.5">
                  <Banknote className="size-4" /> Cash given
                </p>
                <div className="flex flex-wrap gap-2">
                  {quickTenders(s.cashDue).map((c, i) => (
                    <motion.button
                      key={c}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setCash(centsToInput(c))}
                      className={cx(
                        'num rounded-xl border px-4 py-3 text-lg font-semibold',
                        cashGiven === c ? 'border-navy bg-navy text-on-navy' : 'border-rule-2 bg-paper hover:border-navy',
                      )}
                    >
                      {i === 0 ? 'Exact' : formatCents(c)}
                    </motion.button>
                  ))}
                </div>
                <div className="mt-2 max-w-48">
                  <MoneyInput value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Other amount" aria-label="Cash given" />
                </div>
              </div>

              {cardsAllowed && (
                <div>
                  <p className="label mb-2 flex items-center gap-1.5">
                    <Gift className="size-4" /> Gift or promo card
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={cardCode}
                      onChange={(e) => setCardCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && void addCard()}
                      placeholder={online ? 'Scan or type the code' : 'Cards need a connection'}
                      disabled={!online}
                      className="num uppercase tracking-wider"
                      aria-label="Gift card code"
                    />
                    <Button onClick={() => void addCard()} loading={checking} disabled={!online || !cardCode} icon={<CreditCard className="size-4" />}>
                      Apply
                    </Button>
                  </div>
                  {cardError && <p className="mt-1.5 text-sm font-medium text-bad">{cardError}</p>}
                </div>
              )}

              <AnimatePresence initial={false}>
                {tenders.map((t) => (
                  <motion.div
                    key={t.key}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 overflow-hidden rounded-lg border border-rule bg-field px-3 py-2"
                  >
                    <Gift className={cx('size-4', t.method === 'promo_card' ? 'text-warn' : 'text-navy')} />
                    <div className="min-w-0 flex-1">
                      <p className="num text-sm font-semibold">{formatCode(t.code ?? '')}</p>
                      <p className="text-xs text-ink-3">
                        {t.method === 'promo_card' ? 'Promo' : 'Gift'} card · balance {formatCents(t.balance_cents)} → {formatCents((t.balance_cents ?? 0) - t.amount_cents)}
                      </p>
                    </div>
                    <Field label="" className="w-28">
                      <MoneyInput
                        defaultValue={centsToInput(t.amount_cents)}
                        onBlur={(e) => {
                          const v = parseDollars(e.target.value) ?? 0;
                          const clamped = Math.max(0, Math.min(v, t.balance_cents ?? 0));
                          setTenders((list) => list.map((x) => (x.key === t.key ? { ...x, amount_cents: clamped } : x)));
                        }}
                        aria-label="Amount from card"
                      />
                    </Field>
                    <button className="text-ink-3 hover:text-bad" onClick={() => setTenders((list) => list.filter((x) => x.key !== t.key))} aria-label="Remove card">
                      <Trash2 className="size-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </>
          )}
          {total === 0 && <p className="text-ink-2">Nothing to collect. {cart.type === 'comp' ? 'The items are recorded at their cost, with the reason.' : ''}</p>}
        </div>

        <div className="grid content-start gap-2 rounded-xl bg-field p-4">
          <Row label="Total" value={total} big />
          {s.cards > 0 && <Row label="On cards" value={-s.cards} />}
          {total > 0 && <Row label="Cash due" value={s.cashDue} />}
          <div className="my-1 border-t border-rule" />
          <AnimatePresence mode="wait">
            {s.remaining > 0 && cashGiven !== null ? (
              <motion.div key="owed" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Row label="Still owed" value={s.remaining} tone="bad" big />
              </motion.div>
            ) : (
              <motion.div key="change" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Row label="Change" value={s.change} tone="good" big />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, big, tone }: { label: string; value: number; big?: boolean; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={cx('text-sm', big ? 'font-semibold' : 'text-ink-2')}>{label}</span>
      <AnimatedNumber value={value} duration={0.3} className={cx('num', big ? 'text-2xl font-semibold' : '', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')} />
    </div>
  );
}
