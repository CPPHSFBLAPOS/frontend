import { motion } from 'motion/react';
import { formatCents } from '../lib/money';
import { AnimatedNumber } from './AnimatedNumber';
import { cx } from './ui';

// The grand total against the pre-auth limit. The fill springs to the new
// total, turns amber within the warning band and red past the limit.
export function LimitMeter({ total, limit, warn }: { total: number; limit: number; warn: number }) {
  const state = total > limit ? 'over' : total >= limit - warn ? 'warn' : 'ok';
  const pct = Math.min(100, (total / limit) * 100);
  const bandLeft = ((limit - warn) / limit) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <AnimatedNumber value={total} className={cx('num text-[27px] font-semibold', state === 'over' && 'text-bad')} />
        <span className="text-[13px] text-ink-2">of {formatCents(limit)} limit</span>
      </div>
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full border border-rule bg-field">
        <div className="absolute inset-y-0 right-0 bg-warn-soft" style={{ left: `${bandLeft}%` }} />
        <motion.div
          className={cx('absolute inset-y-0 left-0 rounded-full', state === 'over' ? 'bg-bad' : state === 'warn' ? 'bg-warn' : 'bg-navy')}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="num mt-1 flex justify-between text-[11.5px] text-ink-3">
        <span>$0</span>
        <span>{formatCents(limit - warn)}</span>
        <span>{formatCents(limit)}</span>
      </div>
      <motion.p
        key={state}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        className={cx('mt-1.5 text-[12.5px]', state === 'over' ? 'font-semibold text-bad' : state === 'warn' ? 'text-warn' : 'text-ink-2')}
      >
        {state === 'over'
          ? `Over the limit by ${formatCents(total - limit)}. Submitting is blocked.`
          : state === 'warn'
            ? `Within ${formatCents(warn)} of the limit. Tax at checkout can push it over.`
            : `${formatCents(limit - total)} left under the limit.`}
      </motion.p>
    </div>
  );
}

// Horizontal bars that grow in, one after another.
export function Bars({ rows, format = formatCents }: { rows: Array<{ label: string; value: number }>; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7.5em)_minmax(0,1fr)_5em] items-center gap-2 text-[13px]">
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded bg-field">
            <motion.span
              className={cx('block h-full rounded', r.value < 0 ? 'bg-bad' : 'bg-navy')}
              initial={{ width: 0 }}
              animate={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 140, damping: 22 }}
            />
          </span>
          <span className="num text-right">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
