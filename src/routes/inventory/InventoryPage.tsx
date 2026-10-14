import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, FileUp, ImageOff, Leaf, Plus, Search, Tags } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import {
  approveCount,
  cancelCount,
  countLines,
  importLegacySales,
  importProducts,
  listCounts,
  recentMovements,
  saveCategory,
  saveCountLine,
  startCount,
} from '../../api/catalog';
import { productImageUrl } from '../../api/storage';
import type { Product } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { Button, Card, EmptyState, ErrorNote, Input, PageHeader, Pill, Skeleton, cx } from '../../components/ui';
import { useCategories, useProducts } from '../../hooks/queries';
import { mapBase44Product, mapBase44Sale, parseCsv } from '../../lib/csv';
import { formatDate, formatDateTime } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { MOVEMENT_LABEL } from '../../lib/labels';
import { ProductEditor } from './ProductEditor';

type Tab = 'products' | 'counts' | 'movements' | 'categories' | 'import';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('products');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const categories = useCategories();
  const [showArchived, setShowArchived] = useState(false);
  const products = useProducts(showArchived);

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Products and stock"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add product
          </Button>
        }
      >
        Stock comes from a ledger of movements. It is never typed in, and nothing is deleted.
      </PageHeader>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'products', label: 'Products' },
          { id: 'counts', label: 'Counts' },
          { id: 'movements', label: 'Movements' },
          { id: 'categories', label: 'Categories' },
          { id: 'import', label: 'Import' },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'products' && (
            <ProductsTab
              products={products.data}
              loading={products.isLoading}
              categories={categories.data ?? []}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
              onEdit={setEditing}
            />
          )}
          {tab === 'counts' && <CountsTab products={products.data ?? []} />}
          {tab === 'movements' && <MovementsTab products={products.data ?? []} />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'import' && <ImportTab />}
        </motion.div>
      </AnimatePresence>
      <ProductEditor product={editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />
    </div>
  );
}

function ProductsTab({
  products,
  loading,
  categories,
  showArchived,
  setShowArchived,
  onEdit,
}: {
  products: Product[] | undefined;
  loading: boolean;
  categories: Array<{ id: string; name: string }>;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  onEdit: (p: Product) => void;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const n = q.toLowerCase();
    return (products ?? []).filter((p) => !n || p.name.toLowerCase().includes(n) || p.sku.toLowerCase().includes(n) || p.upc?.includes(n));
  }, [products, q]);
  const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';

  if (loading) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU or UPC" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[var(--navy)]" />
          Show archived
        </label>
      </div>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={onEdit}
        csvName="products"
        initialSort={{ key: 'name', dir: 'asc' }}
        columns={[
          {
            key: 'name',
            label: 'Item',
            value: (p) => p.name,
            render: (p) => {
              const img = productImageUrl(p.image_path);
              return (
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-field">
                    {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <ImageOff className="size-4 text-ink-3 opacity-60" />}
                  </span>
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {p.name}
                      {p.smart_snack && <Leaf className="size-3.5 text-good" aria-label="Smart Snack" />}
                      {p.status === 'archived' && <Pill>Archived</Pill>}
                    </span>
                    <span className="num text-xs text-ink-3">
                      {p.sku}
                      {p.upc && ` · ${p.upc}`}
                    </span>
                  </span>
                </span>
              );
            },
          },
          { key: 'category', label: 'Category', value: (p) => cat(p.category_id) },
          { key: 'price', label: 'Price', align: 'right', value: (p) => p.price_cents, render: (p) => formatCents(p.price_cents) },
          {
            key: 'cost',
            label: 'Cost',
            align: 'right',
            value: (p) => p.avg_cost_cents,
            render: (p) => (p.avg_cost_cents === null ? <Pill tone="warn">Cost missing</Pill> : formatCents(p.avg_cost_cents)),
          },
          {
            key: 'on_hand',
            label: 'On hand',
            align: 'right',
            value: (p) => p.on_hand,
            render: (p) => <span className={cx('font-semibold', p.on_hand <= 0 ? 'text-bad' : p.on_hand <= p.low_stock_alert ? 'text-warn' : '')}>{p.on_hand}</span>,
          },
        ]}
      />
    </div>
  );
}

function CountsTab({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const counts = useQuery({ queryKey: ['counts'], queryFn: listCounts });
  const open = counts.data?.find((c) => c.status === 'open');
  const lines = useQuery({ queryKey: ['count-lines', open?.id], queryFn: () => countLines(open!.id), enabled: Boolean(open) });
  const [entered, setEntered] = useState<Record<string, string>>({});

  const start = useMutation({
    mutationFn: startCount,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['counts'] }),
    onError: toast.error,
  });
  const approve = useMutation({
    mutationFn: async () => {
      for (const l of lines.data ?? []) {
        const v = entered[l.product_id];
        if (v !== undefined && v !== '') await saveCountLine(open!.id, l.product_id, Number(v));
      }
      return approveCount(open!.id);
    },
    onSuccess: (n) => {
      toast.good(`Count approved. ${n} adjustment${n === 1 ? '' : 's'} posted.`);
      setEntered({});
      void qc.invalidateQueries({ queryKey: ['counts'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: toast.error,
  });
  const cancel = useMutation({ mutationFn: () => cancelCount(open!.id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['counts'] }) });

  const name = (id: string) => products.find((p) => p.id === id)?.name ?? 'Item';

  if (!open) {
    return (
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['quick', 'Weekly quick count', 'The 10 fastest sellers from the last 30 days.'],
              ['full', 'Full count', 'Every active product. Monthly and at year end.'],
            ] as const
          ).map(([kind, title, body]) => (
            <Card key={kind} whileHover={{ y: -3 }} className="p-5">
              <ClipboardCheck className="mb-2 size-6 text-navy" />
              <h3 className="display text-lg font-bold">{title}</h3>
              <p className="mt-1 text-sm text-ink-2">{body}</p>
              <Button className="mt-4" variant="primary" loading={start.isPending && start.variables === kind} onClick={() => start.mutate(kind)}>
                Start
              </Button>
            </Card>
          ))}
        </div>
        <DataTable
          rows={counts.data ?? []}
          rowKey={(c) => c.id}
          empty="No counts yet."
          columns={[
            { key: 'started_at', label: 'Started', render: (c) => formatDateTime(c.started_at) },
            { key: 'kind', label: 'Kind' },
            { key: 'status', label: 'Status', render: (c) => <Pill tone={c.status === 'approved' ? 'good' : 'neutral'}>{c.status}</Pill> },
          ]}
        />
      </div>
    );
  }

  const rows = lines.data ?? [];
  const diffs = rows.filter((l) => entered[l.product_id] !== undefined && entered[l.product_id] !== '' && Number(entered[l.product_id]) !== l.expected);
  const done = rows.filter((l) => (entered[l.product_id] ?? '') !== '' || l.counted !== null).length;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">
            {open.kind} count · started {formatDateTime(open.started_at)}
          </p>
          <h2 className="display text-xl font-bold">Count what is on the shelf</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-field">
            <motion.div className="h-full bg-navy" animate={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          <span className="num text-sm text-ink-2">
            {done}/{rows.length}
          </span>
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {rows.map((l) => {
          const v = entered[l.product_id] ?? (l.counted === null ? '' : String(l.counted));
          const off = v !== '' && Number(v) !== l.expected;
          return (
            <div key={l.product_id} className={cx('flex items-center justify-between gap-3 rounded-lg border px-3 py-2', off ? 'border-warn/50 bg-warn-soft' : 'border-rule')}>
              <span className="truncate">{name(l.product_id)}</span>
              <span className="flex items-center gap-2">
                {off && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="num text-xs font-semibold text-warn">
                    {Number(v) - l.expected > 0 ? '+' : ''}
                    {Number(v) - l.expected}
                  </motion.span>
                )}
                <input
                  className="input num w-20 py-1 text-center"
                  inputMode="numeric"
                  value={v}
                  onChange={(e) => setEntered({ ...entered, [l.product_id]: e.target.value.replace(/\D/g, '') })}
                  aria-label={`${name(l.product_id)} counted`}
                />
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {diffs.length} line{diffs.length === 1 ? '' : 's'} differ from the ledger. Approving posts a Count adjustment for each.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => cancel.mutate()}>
            Cancel count
          </Button>
          <Button variant="primary" loading={approve.isPending} disabled={done < rows.length} onClick={() => approve.mutate()}>
            Approve count
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MovementsTab({ products }: { products: Product[] }) {
  const q = useQuery({ queryKey: ['movements'], queryFn: () => recentMovements(300) });
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? 'Archived item';
  if (q.isLoading) return <Skeleton className="h-96" />;
  return (
    <DataTable
      rows={q.data ?? []}
      rowKey={(m) => m.id}
      csvName="stock-movements"
      dense
      columns={[
        { key: 'at', label: 'When', value: (m) => m.at, render: (m) => formatDateTime(m.at) },
        { key: 'product', label: 'Item', value: (m) => name(m.product_id) },
        { key: 'type', label: 'Type', value: (m) => MOVEMENT_LABEL[m.type] },
        {
          key: 'qty',
          label: 'Qty',
          align: 'right',
          value: (m) => m.qty,
          render: (m) => <span className={m.qty > 0 ? 'text-good' : 'text-bad'}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span>,
        },
        { key: 'cost', label: 'Unit cost', align: 'right', value: (m) => m.unit_cost_cents, render: (m) => formatCents(m.unit_cost_cents) },
        { key: 'reason', label: 'Reason', value: (m) => m.reason ?? '' },
      ]}
    />
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useCategories();
  const [name, setName] = useState('');
  const save = useMutation({
    mutationFn: saveCategory,
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: toast.error,
  });
  return (
    <Card className="max-w-xl p-5">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ id: null, name, sort_order: (categories.data?.length ?? 0) + 1, active: true });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" />
        <Button type="submit" variant="primary" icon={<Tags className="size-4" />} disabled={!name.trim()} loading={save.isPending}>
          Add
        </Button>
      </form>
      <ul className="grid gap-1.5">
        <AnimatePresence initial={false}>
          {(categories.data ?? []).map((c) => (
            <motion.li key={c.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between rounded-lg border border-rule px-3 py-2">
              <span className={cx(!c.active && 'text-ink-3 line-through')}>{c.name}</span>
              <Button size="sm" variant="ghost" onClick={() => save.mutate({ ...c, active: !c.active })}>
                {c.active ? 'Hide' : 'Show'}
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

function ImportTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'products' | 'sales'>('products');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const mapped = kind === 'products' ? rows.map(mapBase44Product).filter((r) => r.name) : rows.map(mapBase44Sale).filter((r) => r.sold_at && r.total_cents !== null);

  const run = useMutation({
    mutationFn: async () => {
      let added = 0;
      let skipped = 0;
      for (let i = 0; i < mapped.length; i += 500) {
        const r = kind === 'products' ? await importProducts(mapped.slice(i, i + 500)) : await importLegacySales(mapped.slice(i, i + 500));
        added += r.added;
        skipped += r.skipped;
      }
      return { added, skipped };
    },
    onSuccess: (r) => {
      toast.good(`Imported ${r.added}`, r.skipped ? `${r.skipped} skipped (already imported or incomplete).` : undefined);
      setRows([]);
      setFileName('');
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <Card className="grid gap-4 p-5">
      <div>
        <h2 className="display text-xl font-bold">Import from Base44</h2>
        <p className="mt-1 text-sm text-ink-2">
          Products come in with an Opening balance movement (SKUs already here are skipped). Sales go into the history used for last-year comparisons and
          ROI; the old customer field is kept only as a short note, never as a name.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['products', 'sales'] as const).map((k) => (
          <Button key={k} variant={kind === k ? 'primary' : 'secondary'} size="sm" onClick={() => (setKind(k), setRows([]), setFileName(''))}>
            {k === 'products' ? 'Products CSV' : 'Sales CSV'}
          </Button>
        ))}
      </div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-rule-2 bg-field px-6 py-10 text-center hover:border-navy">
        <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <FileUp className="size-8 text-navy" />
        </motion.span>
        <span className="font-semibold">{fileName || 'Choose a CSV file'}</span>
        <span className="text-xs text-ink-3">{kind === 'products' ? 'name, sku, category, price, cost, stock, image_url, description' : 'date, product, sku, quantity, price, total, customer'}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            setRows(parseCsv(await f.text()));
          }}
        />
      </label>
      {rows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3">
          <p className="text-sm">
            <b>{mapped.length}</b> of {rows.length} rows are ready.{' '}
            {kind === 'products'
              ? `First: ${mapped[0] && 'name' in mapped[0] ? `${mapped[0].name} at ${formatCents(mapped[0].price_cents)}` : ''}`
              : `From ${formatDate(String((mapped[0] as { sold_at?: string })?.sold_at ?? ''))}`}
          </p>
          <div>
            <Button variant="primary" loading={run.isPending} disabled={mapped.length === 0} onClick={() => run.mutate()}>
              Import {mapped.length} {kind}
            </Button>
          </div>
          <ErrorNote error={run.error} />
        </motion.div>
      )}
      {rows.length === 0 && !fileName && <EmptyState title="Nothing chosen yet." />}
    </Card>
  );
}
