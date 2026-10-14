import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, ShieldCheck, ShieldX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { getPreauth, makePdf, preauthActivity, salesHistory, savePreauth, type DraftLine, type PreauthForm } from '../../api/preauth';
import { signedUrl } from '../../api/storage';
import type { Preauth, SignatureRow } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Bars } from '../../components/Meter';
import { SignatureView } from '../../components/Signature';
import { Stepper, type Step } from '../../components/Stepper';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { Button, Card, EmptyState, Field, Input, MoneyInput, Pill, Skeleton, Textarea, cx } from '../../components/ui';
import { nameOf, useDirectory, useProducts, useSettings } from '../../hooks/queries';
import { useAuth } from '../../hooks/useAuth';
import { formatDate, formatDateTime, localISODate } from '../../lib/dates';
import { centsToInput, formatCents, parseDollars } from '../../lib/money';
import { percent, totalRoi } from '../../lib/roi';
import { LineItems } from './LineItems';
import { PURPOSES, STATUS_LABEL, STATUS_TONE, emptyForm, formFrom, linesFrom, linesTotal, problems, snapshot } from './model';
import { NextStep } from './NextStep';
import { Receiving } from './Receiving';
import { SamsLookup } from './SamsLookup';

export default function PreauthDetail() {
  const { id: routeId } = useParams();
  const isNew = routeId === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { me, can } = useAuth();
  const settings = useSettings();
  const products = useProducts();
  const directory = useDirectory();
  const q = useQuery({ queryKey: ['preauth', routeId], queryFn: () => getPreauth(routeId!), enabled: !isNew && Boolean(routeId) });
  const f = q.data ?? null;

  const [form, setForm] = useState<PreauthForm>(emptyForm());
  const location = useLocation();
  // The Restock report can start a request with its picks.
  const [lines, setLines] = useState<DraftLine[]>(() => (isNew ? ((location.state as { lines?: DraftLine[] } | null)?.lines ?? []) : []));
  const [base, setBase] = useState(snapshot(emptyForm(), []));
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'request' | 'paper' | 'activity'>('request');
  const [receiving, setReceiving] = useState(false);

  // Load the saved form into the editor whenever the server copy changes.
  useEffect(() => {
    if (!f) return;
    const nextForm = formFrom(f);
    const nextLines = linesFrom(f);
    // Syncing the editable copy from the server is this effect's job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(nextForm);
    setLines(nextLines);
    setBase(snapshot(nextForm, nextLines));
    setEditing(false);
    setReceiving(false);
  }, [f]);

  const status = f?.status ?? 'draft';
  const mine = isNew || f?.requester_id === me?.id;
  const editable = Boolean(mine && can('preauth_request') && (status === 'draft' || status === 'rejected' || editing));
  const dirty = snapshot(form, lines) !== base;
  const limit = settings.data?.preauth_limit_cents ?? 30000;
  const warn = settings.data?.preauth_warn_cents ?? 2000;
  const subtotal = linesTotal(lines);
  const grand = subtotal + form.shipping_cents;
  const missing = problems(form, lines, limit);
  const productIds = useMemo(() => [...new Set(lines.map((l) => l.product_id).filter(Boolean) as string[])], [lines]);
  const history = useQuery({ queryKey: ['history', productIds], queryFn: () => salesHistory(productIds), enabled: productIds.length > 0 });

  const save = useMutation({
    mutationFn: () => savePreauth(isNew ? null : f!.id, form, lines),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['preauths'] });
      if (isNew) navigate(`/preauth/${id}`, { replace: true });
      else void qc.invalidateQueries({ queryKey: ['preauth', id] });
      toast.good('Saved');
    },
    onError: toast.error,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['preauth', routeId] });
    void qc.invalidateQueries({ queryKey: ['preauths'] });
    void qc.invalidateQueries({ queryKey: ['activity', routeId] });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  if (!isNew && q.isLoading) {
    return (
      <div className="grid gap-4 pt-8">
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-6" />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (!isNew && !f) return <EmptyState title="That form was not found." />;
  if (isNew && !can('preauth_request')) return <EmptyState title="Only the President or Treasurer starts a request." />;

  const sig = (role: SignatureRow['role']) => f?.signatures.find((s) => s.role === role && !s.voided_at) ?? null;
  const steps: Step[] = (() => {
    const order = ['draft', 'awaiting_advisor', 'approved', 'purchased', 'received', 'closed'];
    const idx = status === 'rejected' ? 0 : order.indexOf(status);
    const labels = [
      ['Draft', isNew ? 'Now' : formatDate(f?.request_date)],
      ['Student signed', sig('student') ? formatDate(sig('student')!.signed_at) : ''],
      ['Advisor approved', sig('advisor') ? formatDate(sig('advisor')!.signed_at) : ''],
      ['Purchased', f?.purchase_date ? formatDate(f.purchase_date) : ''],
      ['Received', status === 'received' || status === 'closed' ? 'Stock updated' : f?.receipt_due_date ? `Receipt due ${formatDate(f.receipt_due_date)}` : ''],
      ['Closed', f?.closed_at ? formatDate(f.closed_at) : ''],
    ];
    return labels.map(([label, detail], i) => ({ label, detail, state: i < idx || (i === idx && status === 'closed') ? 'done' : i === idx ? 'now' : 'todo' }));
  })();

  const roi = totalRoi(lines.map((l) => ({ units_per_pack: l.units_per_pack, packs: l.packs, pack_price_cents: l.est_pack_price_cents, sell_price_cents: l.sell_price_cents })));
  const studentName = f?.student_name ?? me?.display_name ?? '';
  const role = f?.fbla_role ?? (me?.role ? me.role[0].toUpperCase() + me.role.slice(1) : '');

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-4 pt-6">
        <div className="min-w-0">
          <Link to="/preauth" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" /> All requests
          </Link>
          <p className="eyebrow mb-1.5">Request {f ? `PA-${f.request_date.slice(0, 4)}-${String(f.number).padStart(3, '0')}` : '(new)'}</p>
          <h1 className="display text-[clamp(28px,4.2vw,42px)] font-extrabold leading-[1.03]">Preauthorization Purchase Order</h1>
          <p className="mt-2 text-ink-2">
            {studentName}
            {role && `, ${role}`} · {form.vendor || 'Vendor'} · Requested {formatDate(f?.request_date ?? localISODate(), 'long')}
          </p>
        </div>
        <motion.div key={status + String(f?.overdue)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
          {f?.overdue ? <Pill tone="bad">Receipt overdue</Pill> : <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>}
        </motion.div>
      </div>

      <div className="mb-5">
        <Stepper steps={steps} />
      </div>

      <AnimatePresence>
        {status === 'rejected' && f?.reject_comment && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-lg border border-bad bg-bad-soft px-4 py-3">
            <b className="text-bad">Sent back by the Advisor.</b> “{f.reject_comment}” {mine && 'Fix the request, then sign and submit again.'}
          </motion.div>
        )}
        {f?.overdue && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-lg border border-bad bg-bad-soft px-4 py-3">
            <b className="text-bad">The receipt was due {formatDate(f.receipt_due_date, 'long')}.</b> Reimbursement stays locked until it is turned in.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-1 min-w-0">
          <Tabs
            className="mb-4"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'request', label: 'Request' },
              { id: 'paper', label: 'Paper form' },
              { id: 'activity', label: 'Activity' },
            ]}
          />
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {tab === 'request' && (
                <div className="grid gap-5">
                  {receiving && f && <Receiving form={f} products={products.data ?? []} onDone={() => (toast.good('Received. Stock and costs are updated.'), refresh())} />}
                  <Card className="px-6 pb-6 pt-1">
                    {!editable && f && (
                      <p className="mt-4 rounded border border-dashed border-rule-2 px-3 py-2 text-[13.5px] text-ink-2">
                        {mine && status === 'awaiting_advisor'
                          ? 'Locked after your signature. Use Edit request to change it; that clears your signature.'
                          : mine
                            ? 'Locked after the Advisor approved it. The approved items and totals can no longer change.'
                            : 'Only the student who started this form can edit it.'}
                      </p>
                    )}
                    <Section title="Student Information">
                      <div className="grid gap-3 sm:grid-cols-[1.6fr_0.7fr_1.4fr]">
                        <ReadField label="Name" value={studentName} />
                        <ReadField label="Grade" value={String(f?.grade ?? me?.grade ?? '')} />
                        <ReadField label="FBLA Role" value={role} />
                      </div>
                    </Section>
                    <Section title="Purchase Details">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <ReadField label="Date of Request" value={formatDate(f?.request_date ?? localISODate(), 'long')} />
                        <Field label="Vendor/Store">
                          <Input value={form.vendor} disabled={!editable} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                        </Field>
                        <Field label="Website">
                          <Input value={form.website} disabled={!editable} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <span className="label">Purpose</span>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-2">
                          {PURPOSES.map((p) => {
                            const on = form.purposes.includes(p.id);
                            return (
                              <label key={p.id} className={cx('inline-flex items-center gap-2 text-[14.5px]', editable && 'cursor-pointer')}>
                                <input
                                  type="checkbox"
                                  className="size-[18px] accent-[var(--navy)]"
                                  checked={on}
                                  disabled={!editable}
                                  onChange={() => setForm({ ...form, purposes: on ? form.purposes.filter((x) => x !== p.id) : [...form.purposes, p.id] })}
                                />
                                {p.label}
                              </label>
                            );
                          })}
                          <AnimatePresence>
                            {form.purposes.includes('other') && (
                              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 220 }} exit={{ opacity: 0, width: 0 }}>
                                <Input value={form.purpose_other} disabled={!editable} placeholder="Describe the purpose" onChange={(e) => setForm({ ...form, purpose_other: e.target.value })} aria-label="Other purpose" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      <Field label="Justification" className="mt-4">
                        <Textarea rows={2} value={form.justification} disabled={!editable} onChange={(e) => setForm({ ...form, justification: e.target.value })} />
                      </Field>
                      {lines.length > 0 && (
                        <p className="mt-2 text-[13px] text-ink-2">
                          Payoff: cost {formatCents(roi.cost_cents)}, revenue {formatCents(roi.revenue_cents)}, profit {formatCents(roi.profit_cents)}, ROI {percent(roi.roi)}.
                        </p>
                      )}
                    </Section>
                    <Section title="Item(s) to be Purchased" aside={`${lines.length} item${lines.length === 1 ? '' : 's'}`}>
                      {editable && (
                        <div className="mb-3">
                          <SamsLookup products={products.data ?? []} onAdd={(l) => setLines((x) => [...x, l])} />
                        </div>
                      )}
                      <LineItems lines={lines} history={history.data} editable={editable} onChange={setLines} />
                    </Section>
                    <Section title="Cost Information">
                      <div className="grid grid-cols-2 items-end gap-x-5 gap-y-4 sm:grid-cols-3">
                        <Kv label="Estimated Cost" value={subtotal} />
                        <Kv label="Qty (packs)" value={lines.reduce((s, l) => s + l.packs, 0)} plain />
                        <Kv label="Total" value={subtotal} />
                        <Field label="Shipping">
                          <MoneyInput
                            key={form.shipping_cents}
                            defaultValue={centsToInput(form.shipping_cents)}
                            disabled={!editable}
                            onBlur={(e) => setForm({ ...form, shipping_cents: Math.max(0, parseDollars(e.target.value) ?? 0) })}
                          />
                        </Field>
                        <div className="col-span-2 flex flex-col gap-1">
                          <span className="label">Grand Total</span>
                          <AnimatedNumber value={grand} duration={0.35} className={cx('num border-b-[3px] border-double border-ink pb-1 text-xl font-semibold', grand > limit && 'text-bad')} />
                        </div>
                      </div>
                    </Section>
                    <Section title="Approvals">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <SigBox label="Student" s={sig('student')} hash={f?.hash} />
                        <SigBox label="Advisor" s={sig('advisor')} hash={f?.hash} />
                        {sig('overage') && <SigBox label="Overage approved by the Advisor" s={sig('overage')} hash={undefined} />}
                      </div>
                    </Section>
                    <Section title="Notes">
                      <Textarea rows={2} value={form.notes} disabled={!editable} placeholder="Optional" onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label="Notes" />
                    </Section>
                  </Card>
                </div>
              )}
              {tab === 'paper' && <PaperTab form={f} />}
              {tab === 'activity' && f && <ActivityTab id={f.id} directory={directory.data} />}
              {tab === 'activity' && !f && <EmptyState title="Nothing has happened yet." />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="order-first grid gap-4 lg:sticky lg:top-24 lg:order-2">
          {me && (
            <NextStep
              form={f}
              me={me}
              can={can}
              grandTotal={grand}
              limit={limit}
              warn={warn}
              missing={missing}
              dirty={dirty || isNew}
              editing={editing}
              saving={save.isPending}
              onSave={async () => {
                try {
                  return await save.mutateAsync();
                } catch {
                  return null;
                }
              }}
              onEdit={() => setEditing(true)}
              onChanged={refresh}
              onReceive={() => {
                setTab('request');
                setReceiving(true);
              }}
            />
          )}
          {editing && dirty && (
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save changes (clears signatures)
            </Button>
          )}
          <Card className="p-5">
            <p className="eyebrow">Payoff</p>
            <h2 className="display mb-3 text-xl font-bold">If it all sells</h2>
            <dl className="grid grid-cols-2 gap-2">
              <Big label="Cost" value={roi.cost_cents} />
              <Big label="Revenue" value={roi.revenue_cents} />
              <Big label="Profit" value={roi.profit_cents} tone={roi.profit_cents >= 0 ? 'good' : 'bad'} />
              <div className="rounded-lg bg-field px-3 py-2">
                <dt className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">ROI</dt>
                <dd className="num text-xl font-semibold">{percent(roi.roi)}</dd>
              </div>
            </dl>
            {roi.break_even !== null && <p className="mt-3 text-[13.5px] text-ink-2">Money back after selling {percent(roi.break_even)} of it.</p>}
            {lines.length > 0 && (
              <>
                <p className="eyebrow mb-2 mt-4">Profit by item</p>
                <Bars
                  rows={lines.map((l) => ({
                    label: l.label,
                    value: l.packs * l.units_per_pack * l.sell_price_cents - l.packs * l.est_pack_price_cents,
                  }))}
                />
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="pt-5">
      <div className="section-h">
        <h2>{title}</h2>
        {aside && <small className="text-[12.5px] text-ink-3">{aside}</small>}
      </div>
      {children}
    </section>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="label">{label}</span>
      <span className="truncate border-b border-dashed border-rule-2 pb-1.5">{value || '—'}</span>
    </div>
  );
}

function Kv({ label, value, plain }: { label: string; value: number; plain?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <AnimatedNumber value={value} format={plain ? (n) => String(n) : undefined} duration={0.3} className="num border-b border-rule-2 pb-1 text-[17px]" />
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-field px-3 py-2">
      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd>
        <AnimatedNumber value={value} className={cx('num text-xl font-semibold', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')} />
      </dd>
    </div>
  );
}

function SigBox({ label, s, hash }: { label: string; s: SignatureRow | null; hash: string | undefined }) {
  return (
    <div className="grid gap-1">
      <p className="label">{label}</p>
      <div className="relative flex h-24 items-end overflow-hidden border-b-[1.5px] border-ink pl-6">
        <span className="display absolute bottom-1.5 left-1 font-bold text-ink-3">X</span>
        {s ? <SignatureView strokes={s.strokes} className="h-20 w-auto max-w-full" /> : <span className="pb-2 text-sm text-ink-3">Not signed yet</span>}
      </div>
      {s && (
        <>
          <p className="text-[13px] text-ink-2">
            {s.typed_name} · {formatDateTime(s.signed_at)}
          </p>
          {hash && (
            <p className={cx('flex items-center gap-1 text-xs', s.matches_form ? 'text-good' : 'text-bad')}>
              {s.matches_form ? <ShieldCheck className="size-3.5" /> : <ShieldX className="size-3.5" />}
              <code className="num">{s.doc_hash?.slice(0, 12)}</code> {s.matches_form ? 'matches the form' : 'does not match the form'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PaperTab({ form }: { form: Preauth | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!form) return <EmptyState icon={<FileText className="size-6" />} title="Save the form to see it on paper." />;
  const signed = ['approved', 'purchased', 'received', 'closed'].includes(form.status);
  return (
    <Card className="p-6">
      <p className="max-w-[62ch] text-[13.5px] text-ink-2">
        Every signed form renders as a PDF laid out like the paper Preauthorization Purchase Order Form, with Attachment A listing the items and the payoff. It is
        stored with the form and emailed to both signers.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={<Download className="size-4" />}
          loading={busy}
          disabled={!signed}
          onClick={async () => {
            setBusy(true);
            try {
              const path = form.pdf_path ?? (await makePdf(form.id, form.status === 'closed' ? 'closed' : 'approved')).path;
              window.open(await signedUrl('preauth-pdfs', path), '_blank');
            } catch (err) {
              toast.error(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {signed ? 'Open the signed PDF' : 'Available once the Advisor signs'}
        </Button>
      </div>
      <p className="mt-6 text-xs text-ink-3">
        Form fingerprint (SHA-256): <code className="num break-all">{form.hash}</code>
      </p>
    </Card>
  );
}

function ActivityTab({ id, directory }: { id: string; directory: Array<{ id: string; display_name: string }> | undefined }) {
  const q = useQuery({ queryKey: ['activity', id], queryFn: () => preauthActivity(id) });
  if (q.isLoading) return <Skeleton className="h-40" />;
  return (
    <Card className="p-5">
      <ol className="relative grid gap-0 border-l-2 border-rule pl-5">
        {(q.data ?? []).map((e, i) => (
          <motion.li key={e.seq} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.04 } }} className="relative py-2.5">
            <span className="absolute -left-[27px] top-4 size-3 rounded-full border-2 border-paper bg-navy" />
            <p className="font-semibold">{e.action.replace(/^preauth_/, '').replace(/_/g, ' ')}</p>
            <p className="text-[13px] text-ink-2">
              {nameOf(directory, e.actor_id)} · <span className="num">{formatDateTime(e.at)}</span>
              {e.amount_cents !== null && ` · ${formatCents(e.amount_cents)}`}
            </p>
            {e.reason && <p className="text-[13px] text-ink-3">“{e.reason}”</p>}
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}
