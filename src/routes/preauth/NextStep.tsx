import { useMutation } from '@tanstack/react-query';
import { CalendarCheck, Camera, CheckCircle2, Download, FileSignature, Lock, PenLine, Send, Undo2, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import {
  addReceipt,
  approveOverage,
  closePreauth,
  makePdf,
  notify,
  recordPurchase,
  recordReimbursement,
  rejectPreauth,
  signPreauth,
} from '../../api/preauth';
import { signedUrl, uploadFile } from '../../api/storage';
import type { Me, Preauth } from '../../api/types';
import { LimitMeter } from '../../components/Meter';
import { SignatureModal, type CapturedSignature } from '../../components/Signature';
import { useToast } from '../../components/Toast';
import { Button, Card, ErrorNote, Field, Input, MoneyInput, Textarea } from '../../components/ui';
import { daysBetween, formatDate, localISODate } from '../../lib/dates';
import { formatCents, parseDollars } from '../../lib/money';

type Props = {
  form: Preauth | null;
  me: Me;
  can: (p: Me['permissions'][number]) => boolean;
  grandTotal: number;
  limit: number;
  warn: number;
  missing: string[];
  dirty: boolean;
  editing: boolean;
  saving: boolean;
  onSave: () => Promise<string | null>;
  onEdit: () => void;
  onChanged: () => void;
  onReceive: () => void;
};

async function storeSignature(id: string, role: string, s: CapturedSignature) {
  return { typed_name: s.typed_name, strokes: s.strokes, image_path: await uploadFile('signatures', `${id}/${role}`, s.png, 'png') };
}

// "What happens next" for whoever is looking at the form, as the demo's
// side card: the $300 meter while drafting, then the one or two actions the
// current status allows for this person.
export function NextStep(p: Props) {
  const toast = useToast();
  const [sign, setSign] = useState<null | 'student' | 'advisor' | 'overage'>(null);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(localISODate());
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptTotal, setReceiptTotal] = useState('');
  const [receiptTax, setReceiptTax] = useState('');
  const [reimb, setReimb] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const f = p.form;
  const status = f?.status ?? 'draft';
  const mine = !f || f.requester_id === p.me.id;
  const today = localISODate();

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => p.onChanged(),
    onError: toast.error,
  });

  const signNow = async (s: CapturedSignature) => {
    let id = f?.id ?? null;
    if (sign === 'student') {
      if (p.dirty || !id) id = await p.onSave();
      if (!id) throw new Error('Save the form first.');
      await signPreauth(id, 'student', await storeSignature(id, 'student', s));
      toast.good('Signed and sent to the Advisor');
      void notify(id, 'submitted').catch(() => toast.info('Signed. The email to the Advisor did not go out; let them know.'));
    } else if (sign === 'advisor' && id) {
      await signPreauth(id, 'advisor', await storeSignature(id, 'advisor', s));
      toast.good('Approved', 'A signed PDF copy goes to both signers.');
      void notify(id, 'approved').catch(() => {});
      void makePdf(id, 'approved').catch(() => toast.info('Approved. The PDF copy will be made at close.'));
    } else if (sign === 'overage' && id) {
      await approveOverage(id, await storeSignature(id, 'overage', s));
      toast.good('Overage approved');
    }
    p.onChanged();
  };

  let body: ReactNode = null;

  if (!f || status === 'draft' || status === 'rejected') {
    body = mine && p.can('preauth_request') ? (
      <>
        <LimitMeter total={p.grandTotal} limit={p.limit} warn={p.warn} />
        <AnimatePresence>
          {p.missing.length > 0 && (
            <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="list-disc overflow-hidden rounded-lg bg-warn-soft py-2 pl-7 pr-3 text-[13.5px]">
              {p.missing.map((m) => (
                <motion.li key={m} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  {m}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void p.onSave()} loading={p.saving} disabled={!p.dirty && Boolean(f)}>
            {p.dirty || !f ? 'Save draft' : 'Saved'}
          </Button>
          <Button variant="primary" className="flex-1" icon={<FileSignature className="size-4" />} disabled={p.missing.length > 0} onClick={() => setSign('student')}>
            Sign and submit
          </Button>
        </div>
      </>
    ) : (
      <p className="text-ink-2">{f?.student_name} is still working on this form.</p>
    );
  } else if (status === 'awaiting_advisor') {
    body = p.can('preauth_approve') ? (
      <>
        <LimitMeter total={f.grand_total_cents} limit={p.limit} warn={p.warn} />
        <p className="text-sm text-ink-2">Review the items and the payoff. Your signature authorizes the purchase.</p>
        <AnimatePresence mode="wait">
          {rejecting ? (
            <motion.div key="rej" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-2">
              <Field label="What needs to change? (required)">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => setRejecting(false)}>Cancel</Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={!comment.trim()}
                  loading={act.isPending}
                  onClick={() =>
                    act.mutate(async () => {
                      await rejectPreauth(f.id, comment);
                      toast.good('Sent back to the student');
                      void notify(f.id, 'rejected').catch(() => {});
                    })
                  }
                >
                  Send back
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="btns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2">
              <Button icon={<Undo2 className="size-4" />} onClick={() => setRejecting(true)}>
                Send back
              </Button>
              <Button variant="primary" className="flex-1" icon={<FileSignature className="size-4" />} onClick={() => setSign('advisor')}>
                Approve and sign
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    ) : (
      <>
        <p className="text-ink-2">Signed and waiting for the Advisor.</p>
        {mine && (
          <Button icon={<PenLine className="size-4" />} onClick={p.onEdit}>
            Edit request
          </Button>
        )}
        {mine && <p className="text-xs text-ink-3">Editing clears your signature; you sign again to resubmit.</p>}
      </>
    );
  } else if (status === 'approved') {
    body = p.can('preauth_purchase') ? (
      <>
        <p className="text-ink-2">Approved for {formatCents(f.approved_total_cents)}. Go shopping, then record the purchase date. The receipt is due 5 days later.</p>
        <Field label="Purchase date">
          <Input type="date" value={purchaseDate} max={today} min={f.request_date} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          icon={<CalendarCheck className="size-4" />}
          loading={act.isPending}
          onClick={() => act.mutate(async () => toast.good(`Receipt due ${formatDate((await recordPurchase(f.id, purchaseDate)).receipt_due_date, 'long')}`))}
        >
          Record purchase
        </Button>
      </>
    ) : (
      <p className="text-ink-2">Approved. Waiting for the purchase.</p>
    );
  } else if (status === 'purchased' || status === 'received') {
    const left = f.receipt_due_date ? daysBetween(today, f.receipt_due_date) : null;
    body = (
      <>
        {status === 'purchased' && f.receipts.length === 0 && left !== null && (
          <div className={f.overdue ? 'rounded-lg bg-bad-soft p-3' : 'rounded-lg bg-warn-soft p-3'}>
            <p className="eyebrow">Receipt</p>
            <p className="display text-2xl font-bold">{f.overdue ? 'Overdue' : left === 0 ? 'Due today' : `Due in ${left} day${left === 1 ? '' : 's'}`}</p>
            <p className="text-xs text-ink-2">Reimbursement stays locked until it is uploaded.</p>
          </div>
        )}
        {f.receipts.length > 0 && (
          <div className="grid gap-1.5">
            {f.receipts.map((r) => (
              <button
                key={r.id}
                className="flex items-center justify-between rounded-lg bg-field px-3 py-2 text-left text-sm hover:bg-navy-soft"
                onClick={async () => window.open(await signedUrl('receipts', r.file_path), '_blank')}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-good" /> Receipt {formatDate(r.uploaded_at)}
                </span>
                <span className="num">{formatCents(r.total_cents)}</span>
              </button>
            ))}
          </div>
        )}
        {p.can('preauth_purchase') && (
          <details className="group rounded-lg border border-rule" open={f.receipts.length === 0}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-navy">Upload a receipt</summary>
            <div className="grid gap-2 px-3 pb-3">
              <label className="input flex cursor-pointer items-center gap-2">
                <Camera className="size-4 text-ink-3" />
                <span className="truncate text-sm">{receipt ? receipt.name : 'Photo or PDF of the receipt'}</span>
                <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Receipt total">
                  <MoneyInput value={receiptTotal} onChange={(e) => setReceiptTotal(e.target.value)} />
                </Field>
                <Field label="Tax on it">
                  <MoneyInput value={receiptTax} onChange={(e) => setReceiptTax(e.target.value)} placeholder="0.00" />
                </Field>
              </div>
              <Button
                icon={<Upload className="size-4" />}
                loading={act.isPending}
                disabled={!receipt || parseDollars(receiptTotal) === null}
                onClick={() =>
                  act.mutate(async () => {
                    const path = await uploadFile('receipts', f.id, receipt!);
                    const r = await addReceipt(f.id, path, parseDollars(receiptTotal)!, parseDollars(receiptTax) ?? 0);
                    setReceipt(null);
                    toast.good('Receipt saved', r.needs_overage ? 'It is over the approved total, so the Advisor has to sign off.' : undefined);
                  })
                }
              >
                Save receipt
              </Button>
            </div>
          </details>
        )}
        {f.needs_overage && (
          <div className="rounded-lg bg-warn-soft p-3 text-sm">
            Receipts total {formatCents(f.receipts_total_cents)}, over the approved {formatCents(f.approved_total_cents)}.
            {p.can('preauth_approve') ? (
              <Button size="sm" className="mt-2 w-full" variant="primary" onClick={() => setSign('overage')}>
                Approve the overage
              </Button>
            ) : (
              ' The Advisor has to sign off before any reimbursement.'
            )}
          </div>
        )}
        {status === 'purchased' && f.receipts.length > 0 && p.can('receiving') && (
          <Button variant="primary" onClick={p.onReceive}>
            Receive the items
          </Button>
        )}
        {f.receipts.length > 0 && !f.needs_overage && !f.reimbursed_at && p.can('preauth_purchase') && (
          <details className="rounded-lg border border-rule">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-navy">Record a reimbursement</summary>
            <div className="grid gap-2 px-3 pb-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount">
                  <MoneyInput value={reimb} onChange={(e) => setReimb(e.target.value)} placeholder={(f.receipts_total_cents / 100).toFixed(2)} />
                </Field>
                <Field label="Paid to">
                  <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} />
                </Field>
              </div>
              <Button
                loading={act.isPending}
                disabled={!paidTo.trim()}
                onClick={() =>
                  act.mutate(async () => {
                    await recordReimbursement(f.id, parseDollars(reimb) ?? f.receipts_total_cents, paidTo);
                    toast.good('Reimbursement recorded');
                  })
                }
              >
                Record
              </Button>
            </div>
          </details>
        )}
        {f.reimbursed_at && (
          <p className="text-sm text-ink-2">
            Reimbursed {formatCents(f.reimbursed_cents)} to {f.reimbursed_to}.
          </p>
        )}
        {status === 'received' &&
          (p.can('preauth_close') ? (
            <Button
              variant="primary"
              icon={<Lock className="size-4" />}
              loading={act.isPending}
              disabled={f.needs_overage}
              onClick={() =>
                act.mutate(async () => {
                  await closePreauth(f.id);
                  toast.good('Form closed', 'The signed PDF is stored and emailed to both signers.');
                  void makePdf(f.id, 'closed').then(p.onChanged, () => toast.info('Closed. The PDF could not be made right now; try Download PDF later.'));
                })
              }
            >
              Close the form
            </Button>
          ) : (
            <p className="text-sm text-ink-2">Received. The Advisor closes the form.</p>
          ))}
      </>
    );
  } else if (status === 'closed') {
    body = (
      <>
        <p className="text-ink-2">Closed {formatDate(f.closed_at, 'long')}. The form is locked with its PDF copy.</p>
        <Button
          icon={<Download className="size-4" />}
          onClick={async () => {
            try {
              const path = f.pdf_path ?? (await makePdf(f.id, 'closed')).path;
              window.open(await signedUrl('preauth-pdfs', path), '_blank');
            } catch (err) {
              toast.error(err);
            }
          }}
        >
          Signed PDF
        </Button>
      </>
    );
  }

  return (
    <>
      <Card layout className="grid gap-3 p-5">
        <div>
          <p className="eyebrow">Next step</p>
          <h2 className="display text-xl font-bold">
            {
              {
                draft: 'Finish and sign',
                rejected: 'Fix and sign again',
                awaiting_advisor: p.can('preauth_approve') ? 'Your approval' : 'Waiting for the Advisor',
                approved: 'Make the purchase',
                purchased: 'Turn in the receipt',
                received: 'Close it out',
                closed: 'All done',
              }[status]
            }
          </h2>
        </div>
        {body}
        {p.editing && status !== 'draft' && status !== 'rejected' && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs">Saving changes clears the signatures and returns the form to Draft.</p>
        )}
        {status === 'approved' && f?.pdf_path && (
          <button className="text-left text-sm font-semibold text-navy" onClick={async () => window.open(await signedUrl('preauth-pdfs', f.pdf_path!), '_blank')}>
            <Send className="mr-1 inline size-3.5" /> Signed copy (PDF)
          </button>
        )}
        <ErrorNote error={act.error} />
      </Card>
      <SignatureModal
        open={sign !== null}
        onClose={() => setSign(null)}
        title={sign === 'advisor' ? 'Approve and sign' : sign === 'overage' ? 'Approve the overage' : 'Sign as the student'}
        subtitle={
          sign === 'advisor'
            ? `Authorizes ${formatCents(f?.grand_total_cents ?? 0)} at ${f?.vendor}.`
            : sign === 'overage'
              ? `Receipts total ${formatCents(f?.receipts_total_cents ?? 0)}.`
              : 'Submits the form to the Advisor. Any edit afterwards clears your signature.'
        }
        defaultName={p.me.display_name}
        confirmLabel={sign === 'student' ? 'Sign and submit' : 'Sign'}
        onSign={signNow}
      />
    </>
  );
}
