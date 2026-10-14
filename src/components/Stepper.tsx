import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { cx } from './ui';

export type Step = { label: string; detail?: string; state: 'done' | 'now' | 'todo' };

// Progress steps: completed segments fill navy left to right, the current
// one pulses gold.
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-x-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.label} className="min-w-0" aria-current={s.state === 'now' ? 'step' : undefined}>
          <div className="relative h-[3px] overflow-hidden rounded-full bg-rule">
            {s.state !== 'todo' && (
              <motion.div
                className={cx('absolute inset-y-0 left-0', s.state === 'done' ? 'bg-navy' : 'bg-gold')}
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: i * 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            {s.state === 'now' && (
              <motion.div
                className="absolute inset-0 bg-gold"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
          <div className="pr-1 pt-2">
            <span className="num flex items-center gap-1 text-[11.5px] text-ink-3">
              {s.state === 'done' ? (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.12 + 0.3, type: 'spring' }}>
                  <Check className="size-3 text-navy" strokeWidth={3} />
                </motion.span>
              ) : (
                i + 1
              )}
            </span>
            <span className={cx('block text-[13px] font-semibold leading-tight sm:text-[13.5px]', s.state === 'todo' ? 'text-ink-3' : 'text-ink')}>
              {s.label}
            </span>
            <span className="num block min-h-[1.2em] text-[11px] text-ink-2 sm:text-xs">{s.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
