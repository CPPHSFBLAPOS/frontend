import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Gift, Search, Undo2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { lookupGiftCard } from '../../api/giftCards';
import { ApiError } from '../../api/rpc';
import { closeShift, findSale, recordHandoff, refundSale, shiftSummary, voidSale, type CloseResult } from '../../api/register';
import { uploadFile } from '../../api/storage';
import type { DirectoryEntry, Sale, Shift } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { DrawerCount } from '../../components/DrawerCount';
import { Modal } from '../../components/Modal';
import { SignatureModal, type CapturedSignature } from '../../components/Signature';
import { useToast } from '../../components/Toast';
import { Button, ErrorNote, Field, Input, MoneyInput, Pill, Select, Textarea, cx } from '../../components/ui';
import { useSettings } from '../../hooks/queries';
import { countTotal, needsApproval, toBreakdown, type Counts } from '../../lib/cash';
import { downloadBlob } from '../../lib/csv';
import { formatDateTime } from '../../lib/dates';
import { isValidCode, normalizeCode } from '../../lib/giftcode';
import { formatCents, parseDollars } from '../../lib/money';
import { closeoutPdf } from '../../lib/pdfDocs';
import { OfficerPin, isOfficer, type OfficerApproval } from './OfficerPin';

// ---------- Gift card load ----------

export function GiftLoadModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (amountCents: number, code: string | null) => void }) {
  const [mode, setMode] = useState<'new' | 'reload'>('new');
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cents = parseDollars(amount);

  const add = async () => {
    setError(null);
    if (!cents || cents <= 0) return setError('Enter an amount.');
    if (mode === 'reload') {
      if (!isValidCode(code)) return setError('A card code is 10 letters and numbers.');
      setBusy(true);
      try {
        const card = await lookupGiftCard(code);
        if (card.type !== 'paid') throw new Error('Promo cards are reloaded by an officer on the Gift cards screen.');
        if (card.status !== 'active') throw new Error('That card is deactivated.');
      } catch (err) {
        setBusy(false);
        return setError(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
    }
    onAdd(cents, mode === 'reload' ? normalizeCode(code) : null);
    setAmount('');
    setCode('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Sell or reload a gift card"
      subtitle="Paid in cash. The store owes this money until the card is spent."
      footer={
        <Button variant="primary" onClick={() => void add()} loading={busy} icon={<Gift className="size-4" />}>
          Add to cart
        </Button>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          {(['new', 'reload'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx('rounded-lg border px-3 py-2 text-sm font-semibold', mode === m ? 'border-navy bg-navy-soft text-navy' : 'border-rule-2')}
            >
              {m === 'new' ? 'New card' : 'Reload a card'}
            </button>
          ))}
        </div>
        {mode === 'reload' && (
          <Field label="Card code">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="num uppercase tracking-wider" placeholder="Scan or type" />
          </Field>
        )}
        <Field label="Amount">
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" />
        </Field>
        <div className="flex gap-2">
          {[500, 1000, 2000, 2500].map((c) => (
            <Button key={c} size="sm" onClick={() => setAmount((c / 100).toFixed(2))}>
              {formatCents(c)}
            </Button>
          ))}
        </div>
        {error && <p className="text-sm font-medium text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

// ---------- Voids and refunds ----------

export function VoidRefundModal({
  open,
  onClose,
  shift,
  directory,
  initialNumber,
}: {
  open: boolean;
  onClose: () => void;
  shift: Shift;
  directory: DirectoryEntry[];
  initialNumber?: number | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [number, setNumber] = useState(initialNumber ? String(initialNumber) : '');
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [shelf, setShelf] = useState(true);
  const [officer, setOfficer] = useState<OfficerApproval>({ officerId: '', pin: '' });
  const [error, setError] = useState<unknown>(null);
  const cashier = directory.find((d) => d.id === shift.cashier_id);
  const needOfficer = !cashier || !isOfficer(cashier);

  const find = useMutation({
    mutationFn: () => findSale(Number(number)),
    onSuccess: (s) => {
      setSale(s);
      setQty({});
      setError(null);
    },
    onError: (e) => {
      setSale(null);
      setError(e);
    },
  });

  const reset = () => {
    setSale(null);
    setNumber('');
    setReason('');
    setOfficer({ officerId: '', pin: '' });
    setError(null);
  };
  const done = (msg: string) => {
    toast.good(msg);
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['shift', shift.id] });
    reset();
    onClose();
  };
  const officerArgs = (): [string | null, string | null] => (needOfficer ? [officer.officerId || null, officer.pin || null] : [null, null]);

  const doVoid = useMutation({
    mutationFn: () => voidSale(sale!.id, shift.id, reason, ...officerArgs()),
    onSuccess: () => done(`Sale #${sale?.number} voided. Stock is back on the shelf.`),
    onError: setError,
  });
  const doRefund = useMutation({
    mutationFn: () =>
      refundSale(
        sale!.id,
        shift.id,
        Object.entries(qty)
          .filter(([, n]) => n > 0)
          .map(([sale_line_id, n]) => ({ sale_line_id, qty: n })),
        shelf,
        reason,
        ...officerArgs(),
      ),
    onSuccess: (r) =>
      done(
        `Refunded ${formatCents(r.amount_cents)}${r.cash_cents ? `, ${formatCents(r.cash_cents)} in cash` : ''}${r.gift_card_cents + r.promo_cents ? `, ${formatCents(r.gift_card_cents + r.promo_cents)} back on the card` : ''}.`,
      ),
    onError: setError,
  });

  const sameShift = sale?.shift_id === shift.id;
  const refundTotal = (sale?.lines ?? []).reduce((s, l) => s + (qty[l.id] ?? 0) * l.unit_price_cents, 0);
  const canVoid = sale?.status === 'completed' && sameShift && sale.refunds.length === 0 && sale.type !== 'outage';

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title="Void or refund"
      subtitle="A void cancels a whole sale from this shift. A refund comes later, whole or by item."
      footer={
        sale && (
          <>
            {canVoid && (
              <Button variant="danger" loading={doVoid.isPending} disabled={!reason.trim()} onClick={() => doVoid.mutate()}>
                Void whole sale
              </Button>
            )}
            <Button variant="primary" loading={doRefund.isPending} disabled={!reason.trim() || refundTotal === 0 && !Object.values(qty).some(Boolean)} onClick={() => doRefund.mutate()} icon={<Undo2 className="size-4" />}>
              Refund {formatCents(refundTotal)}
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            find.mutate();
          }}
        >
          <Field label="Sale number (on the receipt)" className="flex-1">
            <Input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} className="num" />
          </Field>
          <Button type="submit" loading={find.isPending} icon={<Search className="size-4" />}>
            Find
          </Button>
        </form>
        <AnimatePresence mode="wait">
          {sale && (
            <motion.div key={sale.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-field px-3 py-2 text-sm">
                <b>Sale #{sale.number}</b>
                <span className="text-ink-2">{formatDateTime(sale.created_at)}</span>
                <span className="text-ink-2">· {sale.cashier_name}</span>
                <Pill tone={sale.status === 'completed' ? 'good' : 'bad'}>{sale.status}</Pill>
                {sale.type !== 'regular' && <Pill tone="gold">{sale.type}</Pill>}
                <span className="num ml-auto font-semibold">{formatCents(sale.total_cents)}</span>
              </div>
              <div className="grid gap-2">
                {sale.lines
                  .filter((l) => l.kind === 'product')
                  .map((l) => {
                    const left = l.qty - l.refunded_qty;
                    return (
                      <div key={l.id} className="flex items-center gap-3 rounded-lg border border-rule px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{l.product_name}</p>
                          <p className="num text-xs text-ink-3">
                            {l.qty} × {formatCents(l.unit_price_cents)}
                            {l.refunded_qty > 0 && ` · ${l.refunded_qty} already refunded`}
                          </p>
                        </div>
                        <Select
                          className="w-20"
                          value={qty[l.id] ?? 0}
                          disabled={left === 0}
                          onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })}
                          aria-label={`Refund how many ${l.product_name}`}
                        >
                          {Array.from({ length: left + 1 }, (_, i) => (
                            <option key={i} value={i}>
                              {i}
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  })}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Reason (required)">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong item, damaged, rang twice…" />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm font-medium">
                  <input type="checkbox" checked={shelf} onChange={(e) => setShelf(e.target.checked)} className="size-4 accent-[var(--navy)]" />
                  Return to shelf
                </label>
              </div>
              {needOfficer && <OfficerPin directory={directory} value={officer} onChange={setOfficer} excludeId={shift.cashier_id} />}
              {!sameShift && sale.status === 'completed' && <p className="text-sm text-ink-3">This sale is from another shift, so it can be refunded but not voided.</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}

// ---------- Cash handoff ----------

export function HandoffModal({ open, onClose, shift, directory }: { open: boolean; onClose: () => void; shift: Shift; directory: DirectoryEntry[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [toId, setToId] = useState('');
  const [fromPin, setFromPin] = useState('');
  const [toPin, setToPin] = useState('');
  const [note, setNote] = useState('');
  const [sigs, setSigs] = useState<{ from?: CapturedSignature; to?: CapturedSignature }>({});
  const [signing, setSigning] = useState<'from' | 'to' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const cents = parseDollars(amount) ?? 0;
  const officers = directory.filter((d) => isOfficer(d) && d.has_pin && d.id !== shift.cashier_id);
  const toName = directory.find((d) => d.id === toId)?.display_name;

  const save = useMutation({
    mutationFn: async () => {
      const upload = async (s: CapturedSignature) => ({
        typed_name: s.typed_name,
        strokes: s.strokes,
        image_path: await uploadFile('signatures', `handoff/${shift.id}`, s.png, 'png'),
      });
      return recordHandoff(shift.id, cents, shift.cashier_id, fromPin, toId, toPin, await upload(sigs.from!), await upload(sigs.to!), note || null);
    },
    onSuccess: (r) => {
      toast.good(`Handed off ${formatCents(cents)}`, `The drawer should now hold ${formatCents(r.expected_cash_cents)}.`);
      void qc.invalidateQueries({ queryKey: ['shift', shift.id] });
      setAmount('');
      setSigs({});
      setFromPin('');
      setToPin('');
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError && e.details?.who ? new Error(`${e.details.who === 'from' ? shift.cashier_name : toName}: ${e.message}`) : e),
  });

  return (
    <>
      <Modal
        open={open && !signing}
        onClose={onClose}
        title="Cash handoff"
        subtitle="Cash leaving the drawer, confirmed by both people."
        footer={
          <Button variant="primary" loading={save.isPending} disabled={!cents || !toId || fromPin.length !== 4 || toPin.length !== 4 || !sigs.from || !sigs.to} onClick={() => save.mutate()}>
            Record handoff
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount">
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Handed to">
              <Select value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Choose an officer…</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['from', shift.cashier_name, fromPin, setFromPin],
                ['to', toName ?? 'Officer', toPin, setToPin],
              ] as const
            ).map(([who, name, pin, setPin]) => (
              <div key={who} className="grid gap-2 rounded-lg border border-rule p-3">
                <p className="text-sm font-semibold">{who === 'from' ? 'From' : 'To'}: {name}</p>
                <Input type="password" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="num tracking-[0.4em]" />
                <Button size="sm" variant={sigs[who] ? 'ghost' : 'secondary'} onClick={() => setSigning(who)} disabled={who === 'to' && !toId}>
                  {sigs[who] ? `Signed as ${sigs[who]!.typed_name} ✓` : 'Sign'}
                </Button>
              </div>
            ))}
          </div>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
          <ErrorNote error={error} />
        </div>
      </Modal>
      <SignatureModal
        open={signing !== null}
        onClose={() => setSigning(null)}
        title={signing === 'from' ? `${shift.cashier_name} signs` : `${toName} signs`}
        defaultName={signing === 'from' ? shift.cashier_name : toName}
        onSign={async (s) => setSigs((x) => ({ ...x, [signing!]: s }))}
      />
    </>
  );
}

// ---------- Closing the shift ----------

export function CloseShiftModal({
  open,
  onClose,
  shift,
  directory,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  shift: Shift;
  directory: DirectoryEntry[];
  onClosed: () => void;
}) {
  const toast = useToast();
  const settings = useSettings();
  const summary = useQuery({ queryKey: ['shift', shift.id], queryFn: () => shiftSummary(shift.id), enabled: open });
  const [counts, setCounts] = useState<Counts>({});
  const [note, setNote] = useState('');
  const [officer, setOfficer] = useState<OfficerApproval>({ officerId: '', pin: '' });
  const [result, setResult] = useState<CloseResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const counted = countTotal(counts);
  const expected = summary.data?.expected_cash_cents ?? 0;
  const diff = counted - expected;
  const tolerance = settings.data?.over_short_tolerance_cents ?? 100;
  const approval = needsApproval(diff, tolerance);

  const close = useMutation({
    mutationFn: () => closeShift(shift.id, toBreakdown(counts), note || null, approval ? officer.officerId || null : null, approval ? officer.pin || null : null),
    onSuccess: (r) => {
      setResult(r);
      toast.good(`Shift #${shift.number} closed`, r.over_short_cents === 0 ? 'The drawer matched to the penny.' : `Over/short ${formatCents(r.over_short_cents, { sign: true })}.`);
    },
    onError: setError,
  });

  const downloadCloseout = async () => {
    const s = await shiftSummary(shift.id);
    downloadBlob(`shift-${shift.number}-closeout.pdf`, await closeoutPdf(s));
  };

  return (
    <Modal
      open={open}
      onClose={result ? onClosed : onClose}
      size="lg"
      title={result ? `Shift #${shift.number} closed` : `Close shift #${shift.number}`}
      subtitle={result ? undefined : 'Count the drawer by bill and coin.'}
      footer={
        result ? (
          <>
            <Button icon={<Download className="size-4" />} onClick={() => void downloadCloseout()}>
              Closeout PDF
            </Button>
            <Button variant="primary" onClick={onClosed}>
              Done
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            loading={close.isPending}
            disabled={summary.isLoading || (approval && (!note.trim() || !officer.officerId || officer.pin.length !== 4))}
            onClick={() => close.mutate()}
          >
            Close shift
          </Button>
        )
      }
    >
      {result ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="grid gap-3 py-2 text-center">
          <p className="eyebrow">Over / short</p>
          <AnimatedNumber
            value={result.over_short_cents}
            format={(n) => formatCents(n, { sign: true })}
            className={cx('num text-5xl font-semibold', result.over_short_cents === 0 ? 'text-good' : Math.abs(result.over_short_cents) > tolerance ? 'text-bad' : 'text-warn')}
          />
          <p className="text-ink-2">
            Expected {formatCents(result.expected_cash_cents)} · counted {formatCents(result.counted_cash_cents)}
          </p>
        </motion.div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
          <DrawerCount counts={counts} onChange={setCounts} />
          <div className="grid content-start gap-2 rounded-xl bg-field p-4 text-sm">
            <Line label="Opening" value={summary.data?.opening_cash_cents} />
            <Line label="Cash in" value={summary.data?.cash_in_cents} />
            <Line label="Cash refunds" value={summary.data ? -summary.data.cash_refunds_cents : undefined} />
            <Line label="Handoffs" value={summary.data ? -summary.data.handoffs_cents : undefined} />
            <div className="border-t border-rule pt-2">
              <Line label="Expected" value={expected} strong />
              <Line label="Counted" value={counted} strong />
            </div>
            <motion.div
              key={approval ? 'flag' : 'ok'}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cx('mt-1 rounded-lg px-3 py-2', diff === 0 ? 'bg-good-soft' : approval ? 'bg-bad-soft' : 'bg-warn-soft')}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">Over/short</span>
                <AnimatedNumber value={diff} duration={0.3} format={(n) => formatCents(n, { sign: true })} className={cx('num text-lg font-semibold', diff === 0 ? 'text-good' : approval ? 'text-bad' : 'text-warn')} />
              </div>
            </motion.div>
          </div>
          <AnimatePresence>
            {approval && counted > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid gap-3 overflow-hidden md:col-span-2">
                <Field label={`Off by more than ${formatCents(tolerance)}: what happened?`}>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Field>
                <OfficerPin directory={directory} value={officer} onChange={setOfficer} reason="An officer must approve an over/short drawer." />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="md:col-span-2">
            <ErrorNote error={error} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Line({ label, value, strong }: { label: string; value: number | undefined; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={strong ? 'font-semibold' : 'text-ink-2'}>{label}</span>
      <span className={cx('num', strong && 'font-semibold')}>{value === undefined ? '…' : formatCents(value)}</span>
    </div>
  );
}

