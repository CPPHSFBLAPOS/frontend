import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, FileUp, Gift, Printer, Search, Sparkles } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useState, type PointerEvent } from 'react';
import { cardHistory, deactivateAndTransfer, importGiftCards, issueGiftCard, listGiftCards, lookupGiftCard, reloadGiftCard } from '../../api/giftCards';
import type { GiftCard } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { DataTable } from '../../components/DataTable';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { Button, Card, ErrorNote, Field, Input, MoneyInput, PageHeader, Pill, cx } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { parseCsv } from '../../lib/csv';
import { formatDate, formatDateTime } from '../../lib/dates';
import { formatCode, isValidCode } from '../../lib/giftcode';
import { formatCents, parseDollars } from '../../lib/money';
import { printGiftCards } from '../../lib/printCard';

type Tab = 'lookup' | 'issue' | 'all';

export default function GiftCardsPage() {
  const [tab, setTab] = useState<Tab>('lookup');
  const [card, setCard] = useState<GiftCard | null>(null);
  return (
    <div>
      <PageHeader eyebrow="Gift cards" title="Gift and promo cards">
        Paid cards are money the store owes until they are spent. Promo cards record cost of goods with $0 revenue. Cards are not tied to a name and do not
        expire.
      </PageHeader>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'lookup', label: 'Look up' },
          { id: 'issue', label: 'Issue' },
          { id: 'all', label: 'All cards' },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'lookup' && <Lookup card={card} setCard={setCard} />}
          {tab === 'issue' && (
            <Issue
              onIssued={(c) => {
                setCard(c);
                setTab('lookup');
              }}
            />
          )}
          {tab === 'all' && (
            <AllCards
              onOpen={(c) => {
                setCard(c);
                setTab('lookup');
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// A card face that tilts toward the pointer.
export function CardFace({ card }: { card: GiftCard }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-14, 14]), { stiffness: 200, damping: 18 });
  const glare = useTransform(x, [-0.5, 0.5], ['0%', '100%']);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };
  const promo = card.type === 'promo';
  return (
    <div style={{ perspective: 900 }} className="w-full max-w-sm">
      <motion.div
        onPointerMove={move}
        onPointerLeave={() => (x.set(0), y.set(0))}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        initial={{ opacity: 0, y: 20, rotateX: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className={cx(
          'relative aspect-[1.586] overflow-hidden rounded-2xl p-5 text-white shadow-lift',
          promo ? 'bg-gradient-to-br from-[#7a4f00] via-[#c58b14] to-[#e9b949]' : 'bg-gradient-to-br from-[#0d1b3f] via-[#17295a] to-[#2f4fa8]',
          card.status !== 'active' && 'grayscale',
        )}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: useTransform(glare, (g) => `radial-gradient(circle at ${g} 30%, rgba(255,255,255,.45), transparent 55%)`) }}
        />
        <div className="absolute inset-x-0 top-12 h-1.5 bg-[#d99e1c]" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="display text-sm font-bold tracking-wider">CPPHS FBLA STORE</span>
            <span className="eyebrow text-white/70">{promo ? 'Promo' : 'Gift card'}</span>
          </div>
          <div>
            <p className="num text-2xl font-semibold tracking-[0.12em]">{formatCode(card.code)}</p>
            <div className="mt-1 flex items-end justify-between">
              <span className="text-xs text-white/70">Since {formatDate(card.created_at, 'long')}</span>
              <AnimatedNumber value={card.balance_cents} className="num text-xl font-semibold" />
            </div>
          </div>
        </div>
        {card.status !== 'active' && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded border-2 border-white/80 px-3 py-1 text-lg font-black tracking-widest">DEACTIVATED</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Lookup({ card, setCard }: { card: GiftCard | null; setCard: (c: GiftCard | null) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [code, setCode] = useState('');
  const [reload, setReload] = useState('');
  const [reason, setReason] = useState('');
  const find = useMutation({ mutationFn: () => lookupGiftCard(code), onSuccess: setCard });
  const history = useQuery({ queryKey: ['card-history', card?.id], queryFn: () => cardHistory(card!.id), enabled: Boolean(card) });
  const refresh = async () => {
    if (!card) return;
    setCard(await lookupGiftCard(card.code));
    void qc.invalidateQueries({ queryKey: ['card-history', card.id] });
  };
  const reloadM = useMutation({
    mutationFn: () => reloadGiftCard(card!.id, parseDollars(reload) ?? 0, null),
    onSuccess: async () => {
      toast.good('Promo card reloaded');
      setReload('');
      await refresh();
    },
    onError: toast.error,
  });
  const transfer = useMutation({
    mutationFn: () => deactivateAndTransfer(card!.id, reason),
    onSuccess: (r) => {
      toast.good(`Moved ${formatCents(r.moved_cents)} to ${formatCode(r.card.code)}`, 'Print the new card for the customer.');
      setReason('');
      setCard(r.card);
    },
    onError: toast.error,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid content-start gap-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            find.mutate();
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Scan or type a card code" className="num h-11 text-lg uppercase tracking-wider" aria-label="Card code" />
          <Button type="submit" variant="primary" icon={<Search className="size-4" />} loading={find.isPending} disabled={!isValidCode(code)}>
            Look up
          </Button>
        </form>
        <ErrorNote error={find.error} />
        <AnimatePresence mode="wait">
          {card && (
            <motion.div key={card.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
              <CardFace card={card} />
              <div className="flex flex-wrap gap-2">
                <Pill tone={card.type === 'promo' ? 'gold' : 'navy'}>{card.type}</Pill>
                <Pill tone={card.status === 'active' ? 'good' : 'bad'}>{card.status}</Pill>
                {card.replaced_by_code && <Pill tone="neutral">Moved to {formatCode(card.replaced_by_code)}</Pill>}
                <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => void printGiftCards([card]).catch(toast.error)}>
                  Print
                </Button>
              </div>
              {card.status === 'active' && card.type === 'promo' && can('issue_promo') && (
                <div className="flex max-w-md gap-2">
                  <MoneyInput value={reload} onChange={(e) => setReload(e.target.value)} placeholder="Add to promo card" aria-label="Reload amount" />
                  <Button loading={reloadM.isPending} disabled={!parseDollars(reload)} onClick={() => reloadM.mutate()}>
                    Reload
                  </Button>
                </div>
              )}
              {card.status === 'active' && card.type === 'paid' && <p className="text-sm text-ink-3">Reload paid cards at the register so the cash is counted.</p>}
              {card.status === 'active' && can('void_refund') && (
                <details className="max-w-md rounded-lg border border-rule">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-navy">Lost card: deactivate and move the balance</summary>
                  <div className="grid gap-2 px-3 pb-3">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
                    <Button icon={<ArrowRightLeft className="size-4" />} variant="danger" loading={transfer.isPending} disabled={!reason.trim()} onClick={() => transfer.mutate()}>
                      Deactivate and move {formatCents(card.balance_cents)}
                    </Button>
                  </div>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {card && (
        <Card className="p-5">
          <p className="eyebrow mb-2">History</p>
          <ul className="grid gap-0 divide-y divide-rule">
            {(history.data ?? []).map((t, i) => (
              <motion.li key={t.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.03 } }} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <b className="capitalize">{t.type.replace('_', ' ')}</b>
                  <span className="block text-xs text-ink-3">{formatDateTime(t.at)}</span>
                </span>
                <span className={cx('num font-semibold', t.amount_cents > 0 ? 'text-good' : 'text-bad')}>{formatCents(t.amount_cents, { sign: true })}</span>
              </motion.li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Issue({ onIssued }: { onIssued: (c: GiftCard) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const issue = useMutation({
    mutationFn: (type: 'paid' | 'promo') => issueGiftCard(type, type === 'promo' ? (parseDollars(amount) ?? 0) : 0, note || null),
    onSuccess: (c) => {
      toast.good(`Card ${formatCode(c.code)} issued`);
      setAmount('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['gift-cards'] });
      onIssued(c);
    },
    onError: toast.error,
  });
  const imp = useMutation({
    mutationFn: () =>
      importGiftCards(
        rows.map((r) => ({
          code: r.code || r.card_code || r.number || null,
          type: /promo/i.test(r.type ?? '') ? 'promo' : 'paid',
          balance_cents: parseDollars(r.balance ?? r.remaining_balance ?? r.amount ?? '') ?? 0,
          note: r.note || null,
        })),
      ),
    onSuccess: (r) => {
      toast.good(`Imported ${r.added} card${r.added === 1 ? '' : 's'}`, r.skipped ? `${r.skipped} skipped` : undefined);
      setRows([]);
      void qc.invalidateQueries({ queryKey: ['gift-cards'] });
    },
    onError: toast.error,
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {can('issue_promo') && (
        <Card className="grid content-start gap-3 p-5">
          <Sparkles className="size-6 text-warn" />
          <h2 className="display text-xl font-bold">Promo card</h2>
          <p className="text-sm text-ink-2">For prizes and thank-yous. Spending it records the cost of goods with $0 revenue.</p>
          <Field label="Value">
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5.00" />
          </Field>
          <Field label="What it's for">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Volunteer thank-you" />
          </Field>
          <Button variant="gold" loading={issue.isPending && issue.variables === 'promo'} disabled={!parseDollars(amount)} onClick={() => issue.mutate('promo')}>
            Issue promo card
          </Button>
        </Card>
      )}
      <Card className="grid content-start gap-3 p-5">
        <Gift className="size-6 text-navy" />
        <h2 className="display text-xl font-bold">Blank paid card</h2>
        <p className="text-sm text-ink-2">Print it now and load it at the register when someone buys it. The register can also make a new card as part of a sale.</p>
        <Button variant="primary" loading={issue.isPending && issue.variables === 'paid'} onClick={() => issue.mutate('paid')}>
          Make a blank card
        </Button>
      </Card>
      {can('change_settings') && (
        <Card className="grid content-start gap-3 p-5 md:col-span-2">
          <h2 className="display text-xl font-bold">Bring over Base44 balances</h2>
          <p className="text-sm text-ink-2">A CSV with code, balance and type. Cards with money left come over as Import transactions dated today.</p>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-rule-2 bg-field px-4 py-3">
            <FileUp className="size-5 text-navy" />
            <span className="text-sm">{rows.length ? `${rows.length} rows ready` : 'Choose the Base44 gift card CSV'}</span>
            <input type="file" accept=".csv" className="sr-only" onChange={async (e) => setRows(parseCsv((await e.target.files?.[0]?.text()) ?? ''))} />
          </label>
          {rows.length > 0 && (
            <div>
              <Button loading={imp.isPending} onClick={() => imp.mutate()}>
                Import {rows.length} cards
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function AllCards({ onOpen }: { onOpen: (c: GiftCard) => void }) {
  const q = useQuery({ queryKey: ['gift-cards'], queryFn: listGiftCards });
  const [onlyBalance, setOnlyBalance] = useState(true);
  const rows = (q.data ?? []).filter((c) => !onlyBalance || c.balance_cents > 0);
  const owed = rows.filter((c) => c.type === 'paid').reduce((s, c) => s + c.balance_cents, 0);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyBalance} onChange={(e) => setOnlyBalance(e.target.checked)} className="size-4 accent-[var(--navy)]" /> Only cards with money on them
        </label>
        <span className="text-sm text-ink-2">
          The store owes <AnimatedNumber value={owed} className="num font-semibold text-ink" /> on paid cards
        </span>
      </div>
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        csvName="gift-cards"
        onRowClick={(c) => void lookupGiftCard(c.code).then(onOpen)}
        initialSort={{ key: 'balance', dir: 'desc' }}
        columns={[
          { key: 'code', label: 'Code', value: (c) => c.code, render: (c) => <span className="num font-semibold">{formatCode(c.code)}</span> },
          { key: 'type', label: 'Type', render: (c) => <Pill tone={c.type === 'promo' ? 'gold' : 'navy'}>{c.type}</Pill> },
          { key: 'status', label: 'Status' },
          { key: 'created', label: 'Issued', value: (c) => c.created_at, render: (c) => formatDate(c.created_at, 'long') },
          { key: 'balance', label: 'Balance', align: 'right', value: (c) => c.balance_cents, render: (c) => formatCents(c.balance_cents) },
        ]}
      />
    </div>
  );
}
