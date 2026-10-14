import { ExternalLink, FileText, PenLine, Search, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { samsLookup, type DraftLine } from '../../api/preauth';
import type { Product, VendorItem } from '../../api/types';
import { Button, Field, Input, MoneyInput, Select, Textarea, cx } from '../../components/ui';
import { formatDate } from '../../lib/dates';
import { formatCents, parseDollars } from '../../lib/money';

function guessProduct(products: Product[], name: string): Product | undefined {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  let best: Product | undefined;
  let score = 0;
  for (const p of products) {
    const hay = p.name.toLowerCase();
    const s = words.filter((w) => hay.includes(w)).length;
    if (s > score) {
      score = s;
      best = p;
    }
  }
  return score >= 1 ? best : undefined;
}

// Find an item on Sam's Club and add it as a line. Only product text goes to
// the lookup: a link, an item name, or the page text pasted in.
export function SamsLookup({ products, onAdd }: { products: Product[]; onAdd: (l: DraftLine) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ item: VendorItem; cached: boolean; remaining?: number } | null>(null);
  const [mode, setMode] = useState<'none' | 'paste' | 'manual'>('none');
  const [paste, setPaste] = useState('');

  const run = async (input: Parameters<typeof samsLookup>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const r = await samsLookup(input);
      setFound(r);
      setMode('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const search = () => {
    const text = q.trim();
    if (!text) return;
    if (/^https?:\/\//i.test(text)) void run({ mode: 'search', url: text });
    else void run({ mode: 'search', query: text });
  };

  return (
    <div className="grid gap-3 rounded-xl border border-rule bg-navy-soft/70 p-3">
      <label className="label" htmlFor="sams-q">
        Find it on Sam's Club
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            id="sams-q"
            className="input bg-paper pl-9"
            placeholder="Search an item or paste a samsclub.com link"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
          />
        </div>
        <Button variant="primary" loading={busy} onClick={search} icon={<Sparkles className="size-4" />}>
          Look up
        </Button>
      </div>
      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2 text-sm text-ink-2">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="size-1.5 rounded-full bg-navy" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />
                ))}
              </span>
              Reading samsclub.com… this can take up to a minute.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="text-sm font-medium text-bad">{error}</p>}
      <AnimatePresence mode="wait">
        {found && <FoundItem key={found.item.id} found={found} products={products} onAdd={(l) => (onAdd(l), setFound(null), setQ(''))} onCancel={() => setFound(null)} />}
      </AnimatePresence>
      <p className="text-[12.5px] text-ink-2">
        Online and in-club prices can differ, so the receipt records the real price. A listing checked in the last week is reused without a new search.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === 'paste' ? 'primary' : 'ghost'} icon={<FileText className="size-3.5" />} onClick={() => setMode(mode === 'paste' ? 'none' : 'paste')}>
          Paste the page text
        </Button>
        <Button size="sm" variant={mode === 'manual' ? 'primary' : 'ghost'} icon={<PenLine className="size-3.5" />} onClick={() => setMode(mode === 'manual' ? 'none' : 'manual')}>
          Type it in
        </Button>
      </div>
      <AnimatePresence mode="wait">
        {mode === 'paste' && (
          <motion.div key="paste" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid gap-2 overflow-hidden">
            <Textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the product title, pack size and price from the Sam's Club page and paste them here" className="bg-paper" />
            <div>
              <Button size="sm" loading={busy} disabled={!paste.trim()} onClick={() => void run({ mode: 'paste', page_text: paste, url: /^https?:\/\//i.test(q) ? q.trim() : undefined })}>
                Read it with Claude
              </Button>
            </div>
          </motion.div>
        )}
        {mode === 'manual' && <ManualItem key="manual" products={products} onAdd={(l) => (onAdd(l), setMode('none'))} />}
      </AnimatePresence>
    </div>
  );
}

function FoundItem({
  found,
  products,
  onAdd,
  onCancel,
}: {
  found: { item: VendorItem; cached: boolean; remaining?: number };
  products: Product[];
  onAdd: (l: DraftLine) => void;
  onCancel: () => void;
}) {
  const v = found.item;
  const guess = (v.product_id && products.find((p) => p.id === v.product_id)) || guessProduct(products, v.name);
  const [productId, setProductId] = useState(guess?.id ?? '');
  const [packs, setPacks] = useState(1);
  const [sell, setSell] = useState(guess ? (guess.price_cents / 100).toFixed(2) : '');
  const price = v.sale_price_cents ?? v.price_cents;
  const product = products.find((p) => p.id === productId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="grid gap-3 rounded-lg border border-rule bg-paper p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{v.name}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {v.units_per_pack} per pack · {formatCents(v.price_cents)}
            {v.sale_price_cents !== null && (
              <>
                {' '}
                <span className="font-semibold text-good">now {formatCents(v.sale_price_cents)}</span>
              </>
            )}
            {' · '}
            {found.cached ? 'saved listing' : 'checked'} {formatDate(v.checked_at)}
            {v.item_number && ` · item ${v.item_number}`}
          </p>
        </div>
        {v.url && (
          <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-navy">
            samsclub.com <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_5rem_7rem]">
        <Field label="In the store as">
          <Select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              if (p) setSell((p.price_cents / 100).toFixed(2));
            }}
          >
            <option value="">A new item</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Packs">
          <Input type="number" min={1} value={packs} onChange={(e) => setPacks(Math.max(1, Number(e.target.value) || 1))} className="num" />
        </Field>
        <Field label="Sell each">
          <MoneyInput value={sell} onChange={(e) => setSell(e.target.value)} placeholder="1.00" />
        </Field>
      </div>
      {product && <p className="text-[13px] text-ink-2">{product.on_hand} on hand now.</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={parseDollars(sell) === null}
          onClick={() =>
            onAdd({
              key: crypto.randomUUID(),
              vendor_item_id: v.id,
              product_id: productId || null,
              new_name: productId ? null : v.name,
              item_number: v.item_number,
              url: v.url,
              units_per_pack: v.units_per_pack,
              packs,
              est_pack_price_cents: price,
              sell_price_cents: parseDollars(sell) ?? 0,
              label: product?.name ?? v.name,
            })
          }
        >
          Add to request
        </Button>
      </div>
    </motion.div>
  );
}

function ManualItem({ products, onAdd }: { products: Product[]; onAdd: (l: DraftLine) => void }) {
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [sell, setSell] = useState('');
  const [url, setUrl] = useState('');
  const product = products.find((p) => p.id === productId);
  const ok = (productId || name.trim()) && Number(units) > 0 && (parseDollars(price) ?? 0) > 0 && parseDollars(sell) !== null;

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="grid gap-3 rounded-lg border border-rule bg-paper p-3 sm:grid-cols-3">
        <Field label="Store item" className="sm:col-span-2">
          <Select value={productId} onChange={(e) => (setProductId(e.target.value), setSell(products.find((p) => p.id === e.target.value) ? ((products.find((p) => p.id === e.target.value)!.price_cents / 100).toFixed(2)) : sell))}>
            <option value="">A new item</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Units per pack">
          <Input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ''))} placeholder="24" className="num" />
        </Field>
        {!productId && (
          <Field label="Item name and pack size" className="sm:col-span-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Pack price">
          <MoneyInput value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Sell each">
          <MoneyInput value={sell} onChange={(e) => setSell(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Link (optional)">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.samsclub.com/…" />
        </Field>
        <div className="flex justify-end sm:col-span-3">
          <Button
            size="sm"
            variant="primary"
            disabled={!ok}
            className={cx(!ok && 'pointer-events-none')}
            onClick={() =>
              onAdd({
                key: crypto.randomUUID(),
                vendor_item_id: null,
                product_id: productId || null,
                new_name: productId ? null : name.trim(),
                item_number: null,
                url: url.trim() || null,
                units_per_pack: Number(units),
                packs: 1,
                est_pack_price_cents: parseDollars(price) ?? 0,
                sell_price_cents: parseDollars(sell) ?? 0,
                label: product?.name ?? name.trim(),
              })
            }
          >
            Add to request
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
