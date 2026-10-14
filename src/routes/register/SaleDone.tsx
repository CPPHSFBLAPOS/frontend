import { CloudOff, Printer } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Button } from '../../components/ui';
import { formatCode } from '../../lib/giftcode';
import { formatCents } from '../../lib/money';

export type DoneInfo = {
  number: number | null;
  total: number;
  change: number;
  training: boolean;
  offline: boolean;
  newCards: Array<{ code: string; amount_cents: number }>;
};

// The moment after a sale: a checkmark draws itself, the change due counts
// up big enough to read across the counter, then it gets out of the way.
export function SaleDone({ info, onDismiss, onPrintCard }: { info: DoneInfo | null; onDismiss: () => void; onPrintCard: (code: string) => void }) {
  useEffect(() => {
    if (!info || info.newCards.length > 0) return;
    const t = setTimeout(onDismiss, info.change > 0 ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [info, onDismiss]);

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 22 } }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-rule bg-paper p-8 text-center shadow-lift"
          >
            <svg viewBox="0 0 52 52" className="mx-auto size-24">
              <motion.circle
                cx="26"
                cy="26"
                r="24"
                fill="none"
                stroke={info.offline ? 'var(--warn)' : info.training ? 'var(--gold)' : 'var(--good)'}
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
              <motion.path
                d="M15 27 l7 7 l15 -16"
                fill="none"
                stroke={info.offline ? 'var(--warn)' : info.training ? 'var(--gold)' : 'var(--good)'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.35, duration: 0.35, ease: 'easeOut' }}
              />
            </svg>
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="display mt-3 text-2xl font-bold">
              {info.training ? 'Practice sale done' : info.offline ? 'Saved offline' : `Sale #${info.number} done`}
            </motion.p>
            {info.offline && (
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-warn">
                <CloudOff className="size-4" /> It will be sent when the connection is back.
              </p>
            )}
            <p className="num mt-1 text-ink-2">{formatCents(info.total)}</p>
            {info.change > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45, type: 'spring' }} className="mt-5 rounded-2xl bg-good-soft p-4">
                <p className="eyebrow text-good">Change due</p>
                <AnimatedNumber value={info.change} duration={0.8} className="num text-5xl font-semibold text-good" />
              </motion.div>
            )}
            {info.newCards.map((c) => (
              <motion.div key={c.code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-4 rounded-2xl border-2 border-dashed border-gold bg-gold-soft p-4">
                <p className="eyebrow">New gift card · {formatCents(c.amount_cents)}</p>
                <p className="num mt-1 text-2xl font-semibold tracking-wider">{formatCode(c.code)}</p>
                <Button size="sm" className="mt-2" icon={<Printer className="size-3.5" />} onClick={() => onPrintCard(c.code)}>
                  Print card
                </Button>
              </motion.div>
            ))}
            <Button variant="primary" size="lg" className="mt-6 w-full" onClick={onDismiss} autoFocus>
              Next sale
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
