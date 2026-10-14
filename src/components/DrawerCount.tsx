import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { DENOMINATIONS, countTotal, type Counts } from '../lib/cash';
import { formatCents } from '../lib/money';
import { AnimatedNumber } from './AnimatedNumber';

// Count a drawer by bill and coin. Each row shows its subtotal; the total
// counts up as you go.
export function DrawerCount({ counts, onChange }: { counts: Counts; onChange: (c: Counts) => void }) {
  const set = (key: string, n: number) => onChange({ ...counts, [key]: Math.max(0, Math.floor(n || 0)) });
  return (
    <div>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {(['bill', 'coin'] as const).map((kind) => (
          <div key={kind} className="grid content-start gap-1.5">
            <p className="eyebrow">{kind === 'bill' ? 'Bills' : 'Coins'}</p>
            {DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
              const n = counts[d.key] ?? 0;
              return (
                <div key={d.key} className="grid grid-cols-[4.5rem_auto_1fr] items-center gap-2">
                  <span className="num text-sm font-medium">{d.label}</span>
                  <div className="flex items-stretch overflow-hidden rounded-md border border-rule-2 bg-field">
                    <motion.button whileTap={{ scale: 0.85 }} type="button" className="px-2 hover:bg-navy-soft" onClick={() => set(d.key, n - 1)} aria-label={`One less ${d.label}`}>
                      <Minus className="size-3.5" />
                    </motion.button>
                    <input
                      className="num w-12 border-x border-rule bg-paper py-1 text-center text-sm"
                      inputMode="numeric"
                      value={n || ''}
                      placeholder="0"
                      onChange={(e) => set(d.key, Number(e.target.value.replace(/\D/g, '')))}
                      aria-label={`${d.label} count`}
                    />
                    <motion.button whileTap={{ scale: 0.85 }} type="button" className="px-2 hover:bg-navy-soft" onClick={() => set(d.key, n + 1)} aria-label={`One more ${d.label}`}>
                      <Plus className="size-3.5" />
                    </motion.button>
                  </div>
                  <span className="num text-right text-sm text-ink-2">{n ? formatCents(n * d.cents) : ''}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t-[3px] border-double border-ink pt-2">
        <span className="font-semibold">Counted</span>
        <AnimatedNumber value={countTotal(counts)} duration={0.35} className="num text-2xl font-semibold" />
      </div>
    </div>
  );
}
