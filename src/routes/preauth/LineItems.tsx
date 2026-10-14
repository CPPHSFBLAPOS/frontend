import { ExternalLink, Minus, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DraftLine } from '../../api/preauth';
import type { SalesHistory } from '../../api/types';
import { cx } from '../../components/ui';
import { centsToInput, formatCents, parseDollars } from '../../lib/money';
import { SLOW_WEEKS, lineRoi, percent, suggestPacks, weeksOfSupply } from '../../lib/roi';

// Each requested item with its payoff worked out underline: units, cost,
// revenue, profit, ROI, and weeks of supply (amber when it would take more
// than 10 weeks to sell).
export function LineItems({
  lines,
  history,
  editable,
  onChange,
}: {
  lines: DraftLine[];
  history: SalesHistory | undefined;
  editable: boolean;
  onChange: (lines: DraftLine[]) => void;
}) {
  const update = (key: string, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  if (lines.length === 0) return <p className="py-3 text-sm text-ink-3">No items yet.</p>;

  return (
    <div className="grid gap-2.5">
      <AnimatePresence initial={false}>
        {lines.map((l) => {
          const r = lineRoi({ units_per_pack: l.units_per_pack, packs: l.packs, pack_price_cents: l.est_pack_price_cents, sell_price_cents: l.sell_price_cents });
          const h = l.product_id ? history?.[l.product_id] : undefined;
          const supply = h ? weeksOfSupply(h.on_hand, r.units, h.weekly_sales) : null;
          const suggestion = h ? suggestPacks(h.weekly_sales, h.on_hand, l.units_per_pack) : null;
          return (
            <motion.div
              key={l.key}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, height: 0, marginBottom: -10 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="grid gap-2.5 rounded-lg border border-rule bg-paper px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{l.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">
                    {l.units_per_pack} per pack{l.item_number && ` · item ${l.item_number}`}
                    {h && ` · ${h.on_hand} on hand · ${h.weekly_sales} sold a week`}
                    {!l.product_id && ' · new to the store'}
                    {l.url && (
                      <a href={l.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-navy">
                        link <ExternalLink className="size-3" />
                      </a>
                    )}
                  </p>
                </div>
                {editable && (
                  <motion.button whileTap={{ scale: 0.85 }} className="p-1 text-ink-3 hover:text-bad" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.label}`}>
                    <Trash2 className="size-4" />
                  </motion.button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <label className="grid gap-1">
                  <span className="label">Packs</span>
                  <span className="inline-flex overflow-hidden rounded-md border border-rule-2 bg-field">
                    {editable && (
                      <button className="px-2.5 hover:bg-navy-soft" onClick={() => update(l.key, { packs: Math.max(1, l.packs - 1) })} aria-label="One less pack">
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    <input
                      className="num w-12 border-x border-rule bg-paper py-1 text-center disabled:border-0 disabled:bg-transparent"
                      value={l.packs}
                      disabled={!editable}
                      inputMode="numeric"
                      onChange={(e) => update(l.key, { packs: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
                      aria-label="Packs"
                    />
                    {editable && (
                      <button className="px-2.5 hover:bg-navy-soft" onClick={() => update(l.key, { packs: l.packs + 1 })} aria-label="One more pack">
                        <Plus className="size-3.5" />
                      </button>
                    )}
                  </span>
                </label>
                <MoneyField label="Pack price" value={l.est_pack_price_cents} disabled={!editable} onChange={(c) => update(l.key, { est_pack_price_cents: c })} />
                <MoneyField label="Sell each" value={l.sell_price_cents} disabled={!editable} onChange={(c) => update(l.key, { sell_price_cents: c })} />
                {editable && suggestion !== null && suggestion > 0 && suggestion !== l.packs && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => update(l.key, { packs: suggestion })}
                    className="rounded-full border border-navy/40 bg-navy-soft px-3 py-1 text-xs font-semibold text-navy"
                  >
                    Suggest {suggestion} pack{suggestion === 1 ? '' : 's'}
                  </motion.button>
                )}
              </div>
              <dl className="flex flex-wrap gap-1.5">
                <Chip label="Units" value={String(r.units)} />
                <Chip label="Cost" value={formatCents(r.cost_cents)} />
                <Chip label="Revenue" value={formatCents(r.revenue_cents)} />
                <Chip label="Profit" value={formatCents(r.profit_cents)} tone={r.profit_cents >= 0 ? 'pos' : 'neg'} />
                <Chip label="ROI" value={percent(r.roi)} tone={(r.roi ?? 0) >= 0 ? 'pos' : 'neg'} />
                {supply !== null && <Chip label="Weeks of supply" value={supply.toFixed(1)} tone={supply > SLOW_WEEKS ? 'slow' : undefined} />}
              </dl>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' | 'slow' }) {
  return (
    <motion.div layout className={cx('flex min-w-[4.6rem] flex-col rounded px-2 py-1', tone === 'slow' ? 'bg-warn-soft' : 'bg-field')}>
      <dt className={cx('text-[10.5px] font-semibold uppercase tracking-wider', tone === 'slow' ? 'text-warn' : 'text-ink-3')}>{label}</dt>
      <motion.dd
        key={value}
        initial={{ opacity: 0.4, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        className={cx('num whitespace-nowrap text-[13.5px]', tone === 'pos' && 'text-good', tone === 'neg' && 'text-bad', tone === 'slow' && 'text-warn')}
      >
        {value}
      </motion.dd>
    </motion.div>
  );
}

function MoneyField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (c: number) => void; disabled?: boolean }) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      <span className="relative flex items-center">
        <span className="num pointer-events-none absolute left-2 text-ink-3">$</span>
        <input
          key={value}
          className="input num w-28 py-1 pl-5 disabled:border-transparent disabled:bg-transparent"
          defaultValue={centsToInput(value)}
          disabled={disabled}
          inputMode="decimal"
          onBlur={(e) => {
            const c = parseDollars(e.target.value);
            if (c !== null && c >= 0 && c !== value) onChange(c);
          }}
          aria-label={label}
        />
      </span>
    </label>
  );
}
