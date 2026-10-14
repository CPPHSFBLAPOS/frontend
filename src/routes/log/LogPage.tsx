import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, Filter, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { listLog, verifyLog, type LogFilter } from '../../api/admin';
import type { LogEntry } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Button, Card, Field, Input, MoneyInput, PageHeader, Select, Skeleton, cx } from '../../components/ui';
import { nameOf, useDirectory } from '../../hooks/queries';
import { useAuth } from '../../hooks/useAuth';
import { downloadBlob } from '../../lib/csv';
import { addDays, formatDateTime, localISODate } from '../../lib/dates';
import { formatCents, parseDollars } from '../../lib/money';
import { Doc } from '../../lib/pdf';

const RECORD_TYPES = ['sale', 'shift', 'product', 'preauth', 'gift_card', 'member', 'settings', 'stock_count', 'cash_handoff', 'category', 'import', 'log', 'vendor_item'];

function recordLink(e: LogEntry) {
  if (!e.record_id) return null;
  if (e.record_type === 'preauth') return `/preauth/${e.record_id}`;
  return null;
}

export default function LogPage() {
  const toast = useToast();
  const { can } = useAuth();
  const directory = useDirectory();
  const [draft, setDraft] = useState({ from: addDays(localISODate(), -30), to: localISODate(), actorId: '', action: '', recordType: '', min: '', max: '' });
  const [filter, setFilter] = useState<LogFilter>({ from: draft.from, to: draft.to });
  const [open, setOpen] = useState<LogEntry | null>(null);
  const q = useQuery({ queryKey: ['log', filter], queryFn: () => listLog(filter) });
  const check = useMutation({ mutationFn: verifyLog });

  const apply = () =>
    setFilter({
      from: draft.from || undefined,
      to: draft.to || undefined,
      actorId: draft.actorId || undefined,
      action: draft.action || undefined,
      recordType: draft.recordType || undefined,
      minCents: draft.min ? parseDollars(draft.min) : null,
      maxCents: draft.max ? parseDollars(draft.max) : null,
    });

  const pdf = async () => {
    try {
      const d = await Doc.create('Transaction log', `${filter.from ?? 'start'} to ${filter.to ?? 'today'}`);
      d.table(
        [
          { label: '#', width: 40 },
          { label: 'When', width: 92 },
          { label: 'Person', width: 100 },
          { label: 'Action', width: 130 },
          { label: 'Amount', width: 60, align: 'right' },
          { label: 'Reason', width: 94 },
        ],
        (q.data ?? []).map((e) => [e.seq, formatDateTime(e.at), nameOf(directory.data, e.actor_id), e.action, e.amount_cents === null ? '' : formatCents(e.amount_cents), e.reason ?? '']),
        { size: 7.5 },
      );
      downloadBlob('transaction-log.pdf', await d.blob());
    } catch (err) {
      toast.error(err);
    }
  };

  const result = check.data;
  return (
    <div>
      <PageHeader
        eyebrow="Transaction log"
        title="Every action, in order"
        actions={
          <Button icon={<FileDown className="size-4" />} onClick={() => void pdf()} disabled={!q.data?.length}>
            PDF
          </Button>
        }
      >
        Append-only and hash-chained: each entry includes the fingerprint of the one before it, so any change after the fact breaks the chain.
        {!can('view_log') && ' You see the entries from your own shifts.'}
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-start gap-4">
          <Card className="grid gap-3 p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="From">
                <Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </Field>
              <Field label="To">
                <Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </Field>
              <Field label="Person">
                <Select value={draft.actorId} onChange={(e) => setDraft({ ...draft, actorId: e.target.value })}>
                  <option value="">Anyone</option>
                  {(directory.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Record">
                <Select value={draft.recordType} onChange={(e) => setDraft({ ...draft, recordType: e.target.value })}>
                  <option value="">Any</option>
                  {RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Action contains" className="col-span-2">
                <Input value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="refund, price, sign…" />
              </Field>
              <Field label="Amount from">
                <MoneyInput value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} />
              </Field>
              <Field label="to">
                <MoneyInput value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" icon={<Filter className="size-4" />} onClick={apply}>
                Apply
              </Button>
            </div>
          </Card>
          {q.isLoading ? (
            <Skeleton className="h-96" />
          ) : (
            <DataTable
              rows={q.data ?? []}
              rowKey={(e) => e.seq}
              csvName="transaction-log"
              dense
              onRowClick={setOpen}
              initialSort={{ key: 'seq', dir: 'desc' }}
              columns={[
                { key: 'seq', label: '#', align: 'right', value: (e) => e.seq },
                { key: 'at', label: 'When', value: (e) => e.at, render: (e) => formatDateTime(e.at) },
                { key: 'actor', label: 'Person', value: (e) => nameOf(directory.data, e.actor_id) },
                { key: 'role', label: 'Role', value: (e) => e.role ?? '' },
                { key: 'action', label: 'Action', value: (e) => e.action, render: (e) => <span className="font-medium">{e.action.replace(/_/g, ' ')}</span> },
                {
                  key: 'record',
                  label: 'Record',
                  value: (e) => `${e.record_type ?? ''} ${e.record_id ?? ''}`,
                  render: (e) => {
                    const href = recordLink(e);
                    const label = e.record_type ? e.record_type.replace('_', ' ') : '';
                    return href ? (
                      <Link to={href} onClick={(ev) => ev.stopPropagation()} className="font-semibold text-navy">
                        {label}
                      </Link>
                    ) : (
                      label
                    );
                  },
                },
                { key: 'amount', label: 'Amount', align: 'right', value: (e) => e.amount_cents, render: (e) => (e.amount_cents === null ? '' : formatCents(e.amount_cents)) },
                { key: 'device', label: 'Device', value: (e) => e.device ?? '' },
              ]}
            />
          )}
        </div>

        {can('view_log') && (
          <Card className="grid content-start justify-items-center gap-4 p-6 text-center lg:sticky lg:top-24">
            <motion.div
              key={check.isPending ? 'busy' : result ? String(result.ok) : 'idle'}
              initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14 }}
              className={cx(
                'grid size-20 place-items-center rounded-3xl',
                check.isPending ? 'bg-navy-soft text-navy' : !result ? 'bg-field text-ink-3' : result.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad',
              )}
            >
              {check.isPending ? (
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
                  <ShieldQuestion className="size-9" />
                </motion.span>
              ) : !result ? (
                <ShieldQuestion className="size-9" />
              ) : result.ok ? (
                <ShieldCheck className="size-9" />
              ) : (
                <ShieldAlert className="size-9" />
              )}
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.div key={result ? String(result.ok) : 'idle'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <h2 className="display text-xl font-bold">{!result ? 'Check the log' : result.ok ? 'The log is intact' : 'The log is broken'}</h2>
                <p className="mt-1 text-sm text-ink-2">
                  {!result
                    ? 'Rechecks the numbering and every hash from the first entry.'
                    : result.ok
                      ? `${result.checked.toLocaleString()} entries checked. Nothing was changed or removed.`
                      : `${result.problem} Tell the Advisor right away.`}
                </p>
              </motion.div>
            </AnimatePresence>
            <Button variant="primary" loading={check.isPending} onClick={() => check.mutate()}>
              Check Log
            </Button>
          </Card>
        )}
      </div>

      <Modal open={open !== null} onClose={() => setOpen(null)} size="lg" title={open ? `#${open.seq} · ${open.action.replace(/_/g, ' ')}` : ''} subtitle={open ? `${nameOf(directory.data, open.actor_id)} · ${formatDateTime(open.at)}` : undefined}>
        {open && (
          <div className="grid gap-3 text-sm">
            {open.reason && <p>Reason: “{open.reason}”</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <JsonBox title="Before" value={open.before} />
              <JsonBox title="After" value={open.after} />
            </div>
            <p className="num break-all text-xs text-ink-3">hash {open.hash}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function JsonBox({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="eyebrow mb-1">{title}</p>
      <pre className="num max-h-72 overflow-auto rounded-lg bg-field p-3 text-xs">{value ? JSON.stringify(value, null, 2) : '—'}</pre>
    </div>
  );
}
