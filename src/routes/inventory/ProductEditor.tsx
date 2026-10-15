import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ImagePlus, Save, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { adjustStock, archiveProduct, productHistory, saveProduct, setProductCost } from '../../api/catalog';
import { imageCrossOrigin, productImageUrl, uploadFile } from '../../api/storage';
import type { Category, MovementType, Product } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button, ErrorNote, Field, Input, MoneyInput, Pill, Select, Textarea, cx } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../lib/dates';
import { MOVEMENT_LABEL } from '../../lib/labels';
import { centsToInput, formatCents, parseDollars } from '../../lib/money';


// A drawer that slides in from the right: details, price, cost, stock
// adjustments and history for one product.
export function ProductEditor({ product, categories, onClose }: { product: Product | 'new' | null; categories: Category[]; onClose: () => void }) {
  return createPortal(
    <AnimatePresence>
      {product && (
        <motion.div className="fixed inset-0 z-50" initial="closed" animate="open" exit="closed">
          <motion.div className="absolute inset-0 bg-scrim" variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-rule bg-paper shadow-lift"
            variants={{ open: { x: 0, transition: { type: 'spring', stiffness: 360, damping: 36 } }, closed: { x: '100%', transition: { duration: 0.2 } } }}
          >
            <Editor key={product === 'new' ? 'new' : product.id} product={product === 'new' ? null : product} categories={categories} onClose={onClose} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Editor({ product, categories, onClose }: { product: Product | null; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [price, setPrice] = useState(centsToInput(product?.price_cents ?? null));
  const [upc, setUpc] = useState(product?.upc ?? '');
  const [low, setLow] = useState(String(product?.low_stock_alert ?? 5));
  const [smart, setSmart] = useState(product?.smart_snack ?? false);
  const [description, setDescription] = useState(product?.description ?? '');
  const [image, setImage] = useState<string | null>(product?.image_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [adjType, setAdjType] = useState<MovementType>('damaged');
  const [adjQty, setAdjQty] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [cost, setCost] = useState('');
  const [costReason, setCostReason] = useState('');
  const history = useQuery({ queryKey: ['product-history', product?.id], queryFn: () => productHistory(product!.id), enabled: Boolean(product) && can('stock') });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['product-history', product?.id] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveProduct({
        id: product?.id ?? null,
        name,
        category_id: categoryId || null,
        price_cents: parseDollars(price) ?? 0,
        upc: upc || null,
        low_stock_alert: Number(low) || 0,
        smart_snack: smart,
        image_path: image,
        description: description || null,
      }),
    onSuccess: () => {
      toast.good(product ? 'Product saved' : 'Product added', product ? undefined : 'Its SKU was assigned automatically.');
      invalidate();
      onClose();
    },
  });
  const adjust = useMutation({
    mutationFn: () => adjustStock(product!.id, Number(adjQty), adjType, adjReason || null),
    onSuccess: (onHand) => {
      toast.good(`Stock is now ${onHand}`);
      setAdjQty('');
      setAdjReason('');
      invalidate();
    },
    onError: toast.error,
  });
  const archive = useMutation({
    mutationFn: () => archiveProduct(product!.id, product!.status === 'active'),
    onSuccess: () => {
      toast.good(product!.status === 'active' ? 'Archived. It stays in history and reports.' : 'Back on sale');
      invalidate();
      onClose();
    },
    onError: toast.error,
  });
  const setCostM = useMutation({
    mutationFn: () => setProductCost(product!.id, parseDollars(cost) ?? 0, costReason),
    onSuccess: () => {
      toast.good('Cost saved');
      invalidate();
    },
    onError: toast.error,
  });

  const img = productImageUrl(image);

  return (
    <>
      <div className="flex items-center justify-between border-b border-rule px-5 py-4">
        <div>
          <p className="eyebrow">{product ? product.sku : 'New product'}</p>
          <h2 className="display text-xl font-bold">{product ? product.name : 'Add a product'}</h2>
        </div>
        <motion.button whileTap={{ scale: 0.9, rotate: 90 }} onClick={onClose} className="grid size-9 place-items-center rounded-lg hover:bg-field" aria-label="Close">
          <X className="size-5" />
        </motion.button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-4">
          <div className="flex gap-4">
            <label className="group relative grid size-28 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-rule-2 bg-field">
              {img ? <img src={img} crossOrigin={imageCrossOrigin(img)} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="size-6 text-ink-3" />}
              <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-center text-[11px] font-semibold text-paper opacity-0 transition-opacity group-hover:opacity-100">
                {uploading ? 'Uploading…' : 'Change photo'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    setImage(await uploadFile('product-images', 'products', file));
                  } catch (err) {
                    toast.error(err);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            <div className="grid flex-1 gap-3">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price">
                  <MoneyInput value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
                <Field label="Category">
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">None</option>
                    {categories.filter((c) => c.active || c.id === categoryId).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="UPC (scan into this box)" hint="Lets the register find it by barcode">
              <Input value={upc} onChange={(e) => setUpc(e.target.value.trim())} className="num" />
            </Field>
            <Field label="Low-stock alert at">
              <Input inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value.replace(/\D/g, ''))} className="num" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} className="size-4 accent-[var(--good)]" />
            Meets Smart Snacks standards
          </label>
          <Field label="Description">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <ErrorNote error={save.error} />
        </div>

        {product && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Stat label="On hand" value={String(product.on_hand)} tone={product.on_hand <= product.low_stock_alert ? 'warn' : undefined} />
              <Stat label="Avg cost" value={product.avg_cost_cents === null ? 'Missing' : formatCents(product.avg_cost_cents)} tone={product.avg_cost_cents === null ? 'warn' : undefined} />
              <Stat
                label="Margin"
                value={product.avg_cost_cents === null || product.price_cents === 0 ? '—' : `${Math.round(((product.price_cents - product.avg_cost_cents) / product.price_cents) * 100)}%`}
              />
            </div>

            {product.avg_cost_cents === null && (
              <div className="mt-4 grid gap-2 rounded-lg border border-warn/40 bg-warn-soft p-3">
                <p className="text-sm font-semibold text-warn">Cost missing: this item is left out of margin until it has a cost.</p>
                <div className="grid grid-cols-[8rem_1fr_auto] gap-2">
                  <MoneyInput value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" aria-label="Unit cost" />
                  <Input value={costReason} onChange={(e) => setCostReason(e.target.value)} placeholder="Where the cost came from" aria-label="Reason" />
                  <Button size="sm" loading={setCostM.isPending} disabled={!cost || !costReason.trim()} onClick={() => setCostM.mutate()}>
                    Set
                  </Button>
                </div>
              </div>
            )}

            {can('stock') && (
              <div className="mt-6">
                <div className="section-h">
                  <h2>Adjust stock</h2>
                </div>
                <div className="grid grid-cols-[10rem_5rem_1fr] gap-2">
                  <Select value={adjType} onChange={(e) => setAdjType(e.target.value as MovementType)} aria-label="Reason">
                    <option value="damaged">Damaged</option>
                    <option value="expired">Expired</option>
                    <option value="missing">Missing</option>
                    <option value="found">Found</option>
                    <option value="count_adjustment">Count correction (±)</option>
                  </Select>
                  <Input value={adjQty} onChange={(e) => setAdjQty(e.target.value.replace(/[^\d-]/g, ''))} placeholder="Qty" className="num" aria-label="Quantity" />
                  <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Note" aria-label="Note" />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button size="sm" loading={adjust.isPending} disabled={!Number(adjQty)} onClick={() => adjust.mutate()}>
                    Post adjustment
                  </Button>
                </div>
                <p className="text-xs text-ink-3">Stock is never typed in: every change is a logged movement.</p>
              </div>
            )}

            {history.data && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="eyebrow mb-2">Price history</p>
                  <ul className="grid gap-1 text-sm">
                    {history.data.prices.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="text-ink-3">{formatDateTime(p.at)}</span>
                        <span className="num">
                          {p.old_cents === null ? '' : `${formatCents(p.old_cents)} → `}
                          {formatCents(p.new_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow mb-2">Recent movements</p>
                  <ul className="grid gap-1 text-sm">
                    {history.data.movements.slice(0, 12).map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="truncate text-ink-3">{MOVEMENT_LABEL[m.type]}</span>
                        <span className={cx('num font-semibold', m.qty > 0 ? 'text-good' : 'text-bad')}>
                          {m.qty > 0 ? '+' : ''}
                          {m.qty}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-rule bg-field/60 px-5 py-3">
        {product ? (
          <Button
            variant="ghost"
            icon={product.status === 'active' ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
            loading={archive.isPending}
            onClick={() => archive.mutate()}
          >
            {product.status === 'active' ? 'Archive' : 'Restore'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {product?.status === 'archived' && <Pill tone="neutral">Archived</Pill>}
          <Button variant="primary" icon={<Save className="size-4" />} loading={save.isPending} disabled={!name.trim() || parseDollars(price) === null} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className={cx('rounded-lg px-3 py-2', tone === 'warn' ? 'bg-warn-soft' : 'bg-field')}>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
      <p className={cx('num text-lg font-semibold', tone === 'warn' && 'text-warn')}>{value}</p>
    </div>
  );
}
