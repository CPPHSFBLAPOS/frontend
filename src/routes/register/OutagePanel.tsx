import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, FileText, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { logOutageSale, pendingOutageSales, verifyOutageSale } from '../../api/register';
import { signedUrl, uploadFile } from '../../api/storage';
import type { Product, Shift } from '../../api/types';
import { item, list } from '../../components/motion';
import { useToast } from '../../components/Toast';
import { Button, Card, ErrorNote, Field, Input, cx } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { downloadBlob } from '../../lib/csv';
import { formatDate, localISODate } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { tallySheetPdf } from '../../lib/pdfDocs';

// Paper backup when the Wi-Fi is down: print the tally sheet, sell on paper,
// then enter the totals here with a photo of the sheet. A different officer
// verifies the entry before it counts.
export function OutagePanel({ products, shift }: { products: Product[]; shift: Shift | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can, me } = useAuth();
  const [day, setDay] = useState(localISODate());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const pending = useQuery({ queryKey: ['pending-outage'], queryFn: pendingOutageSales, enabled: can('verify_outage') });

  const total = products.reduce((s, p) => s + (qty[p.id] ?? 0) * p.price_cents, 0);

  const save = useMutation({
    mutationFn: async () => {
      const path = await uploadFile('outage-sheets', day, photo!);
      return logOutageSale(
        crypto.randomUUID(),
        shift?.id ?? null,
        day,
        Object.entries(qty)
          .filter(([, n]) => n > 0)
          .map(([product_id, n]) => ({ product_id, qty: n })),
        path,
        note || null,
      );
    },
    onSuccess: () => {
      toast.good('Outage entry saved', 'It stays Pending until a different officer verifies it.');
      setQty({});
      setPhoto(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['pending-outage'] });
    },
    onError: toast.error,
  });

  const verify = useMutation({
    mutationFn: ({ id, approve, why }: { id: string; approve: boolean; why: string | null }) => verifyOutageSale(id, approve, why),
    onSuccess: (_r, v) => {
      toast.good(v.approve ? 'Verified. Stock and reports now include it.' : 'Entry rejected.');
      void qc.invalidateQueries({ queryKey: ['pending-outage'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: toast.error,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Outage backup</p>
            <h2 className="display text-xl font-bold">Enter paper sales</h2>
          </div>
          <Button icon={<FileText className="size-4" />} onClick={async () => downloadBlob('outage-tally-sheet.pdf', await tallySheetPdf(products))}>
            Print tally sheet
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day of the outage">
            <Input type="date" value={day} max={localISODate()} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Photo of the tally sheet (required)">
            <label className={cx('input flex cursor-pointer items-center gap-2', photo && 'border-good')}>
              <Camera className="size-4 text-ink-3" />
              <span className="truncate text-sm">{photo ? photo.name : 'Take or choose a photo'}</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </div>
        <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-rule px-3 py-1.5">
              <span className="truncate text-sm">{p.name}</span>
              <input
                inputMode="numeric"
                className="input num w-16 py-1 text-center"
                value={qty[p.id] || ''}
                placeholder="0"
                onChange={(e) => setQty({ ...qty, [p.id]: Number(e.target.value.replace(/\D/g, '')) })}
                aria-label={`${p.name} sold`}
              />
            </div>
          ))}
        </div>
        <Field label="Note" className="mt-3">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
        </Field>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="num text-lg font-semibold">{formatCents(total)}</span>
          <Button variant="primary" loading={save.isPending} disabled={!photo || total === 0} onClick={() => save.mutate()}>
            Save as Pending
          </Button>
        </div>
        {shift && <p className="mt-2 text-xs text-ink-3">The cash goes into shift #{shift.number}'s expected drawer.</p>}
        <ErrorNote error={save.error} />
      </Card>

      {can('verify_outage') && (
        <Card className="p-5">
          <p className="eyebrow">Waiting for a second officer</p>
          <h2 className="display mb-3 text-xl font-bold">Pending entries</h2>
          {(pending.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-3">Nothing waiting.</p>
          ) : (
            <motion.ul variants={list} initial="initial" animate="animate" className="grid gap-3">
              {pending.data!.map((s) => {
                const mine = s.cashier_id === me?.id;
                return (
                  <motion.li key={s.id} variants={item} className="rounded-lg border border-rule p-3">
                    <div className="flex items-center justify-between">
                      <b>#{s.number} · {formatDate(s.occurred_on)}</b>
                      <span className="num font-semibold">{formatCents(s.total_cents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-2">
                      {s.lines.map((l) => `${l.qty} ${l.product_name}`).join(', ')}
                    </p>
                    {s.note && <p className="mt-1 text-xs text-ink-3">“{s.note}”</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.outage_photo_path && (
                        <Button size="sm" variant="ghost" onClick={async () => window.open(await signedUrl('outage-sheets', s.outage_photo_path!), '_blank')}>
                          Photo
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={mine}
                        title={mine ? 'A different officer has to verify your entry' : undefined}
                        icon={<CheckCircle2 className="size-3.5" />}
                        onClick={() => verify.mutate({ id: s.id, approve: true, why: null })}
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mine}
                        icon={<XCircle className="size-3.5" />}
                        onClick={() => {
                          const why = window.prompt('Why is this entry wrong?');
                          if (why) verify.mutate({ id: s.id, approve: false, why });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </Card>
      )}
    </div>
  );
}
