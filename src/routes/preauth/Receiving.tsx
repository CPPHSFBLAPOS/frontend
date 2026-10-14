import { useMutation } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { receivePreauth } from '../../api/preauth';
import type { Preauth, Product } from '../../api/types';
import { Button, Card, ErrorNote, Select } from '../../components/ui';
import { centsToInput, formatCents, parseDollars } from '../../lib/money';

type Row = { packs: string; price: string; units: string; substitute: string };

// For each line: packs bought, the real pack price from the receipt, units
// received and an optional substitute. Posting this is the only step that
// changes stock, and it updates each product's weighted average cost.
export function Receiving({ form, products, onDone }: { form: Preauth; products: Product[]; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      form.lines.map((l) => [
        l.id,
        { packs: String(l.packs), price: centsToInput(l.est_pack_price_cents), units: String(l.packs * l.units_per_pack), substitute: '' },
      ]),
    ),
  );
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const tax = form.receipts.reduce((s, r) => s + r.tax_cents, 0);
  const base = form.lines.reduce((s, l) => s + Number(rows[l.id].packs || 0) * (parseDollars(rows[l.id].price) ?? 0), 0);

  const post = useMutation({
    mutationFn: () =>
      receivePreauth(
        form.id,
        form.lines.map((l) => ({
          line_id: l.id,
          packs_bought: Number(rows[l.id].packs || 0),
          actual_pack_price_cents: parseDollars(rows[l.id].price) ?? 0,
          units_received: Number(rows[l.id].units || 0),
          substitute_product_id: rows[l.id].substitute || null,
        })),
      ),
    onSuccess: onDone,
  });

  return (
    <Card initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5">
      <div className="section-h">
        <h2>Receiving</h2>
        <small className="text-ink-3">Receipt tax of {formatCents(tax)} is spread across lines by dollar share</small>
      </div>
      <div className="grid gap-2.5">
        {form.lines.map((l, i) => (
          <motion.div
            key={l.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
            className="grid gap-2 rounded-lg border border-rule p-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem]"
          >
            <div className="min-w-0 sm:col-span-4">
              <p className="font-semibold">{l.product_name ?? l.new_name}</p>
              <p className="text-xs text-ink-3">
                Asked for {l.packs} × {l.units_per_pack} at {formatCents(l.est_pack_price_cents)}
              </p>
            </div>
            <Select value={rows[l.id].substitute} onChange={(e) => set(l.id, { substitute: e.target.value })} aria-label="Substitute">
              <option value="">{l.product_id ? 'As requested' : 'Create as a new item'}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  Substitute: {p.name}
                </option>
              ))}
            </Select>
            <label className="grid gap-1">
              <span className="label">Packs</span>
              <input className="input num py-1" inputMode="numeric" value={rows[l.id].packs} onChange={(e) => set(l.id, { packs: e.target.value.replace(/\D/g, '') })} />
            </label>
            <label className="grid gap-1">
              <span className="label">Pack price</span>
              <input className="input num py-1" inputMode="decimal" value={rows[l.id].price} onChange={(e) => set(l.id, { price: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="label">Units in</span>
              <input className="input num py-1" inputMode="numeric" value={rows[l.id].units} onChange={(e) => set(l.id, { units: e.target.value.replace(/\D/g, '') })} />
            </label>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-2">
          Items {formatCents(base)} + tax {formatCents(tax)} = <b className="num text-ink">{formatCents(base + tax)}</b>
        </span>
        <Button variant="primary" loading={post.isPending} icon={<PackageCheck className="size-4" />} onClick={() => post.mutate()}>
          Post to stock
        </Button>
      </div>
      <div className="mt-2">
        <ErrorNote error={post.error} />
      </div>
    </Card>
  );
}
