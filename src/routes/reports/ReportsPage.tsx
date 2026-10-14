import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, ClipboardSignature, FileDown, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { DraftLine } from '../../api/preauth';
import {
  cashReport,
  dashboard,
  giftCardReport,
  inventoryValue,
  productsReport,
  purchasingReport,
  restockReport,
  shrinkReport,
  staffReport,
} from '../../api/reports';
import type { Dashboard } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { DataTable } from '../../components/DataTable';
import { Bars } from '../../components/Meter';
import { Segmented, Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { Button, Card, Input, PageHeader, Pill, Skeleton, cx } from '../../components/ui';
import { downloadBlob } from '../../lib/csv';
import { formatDate, formatDateTime, localISODate, monthRange, schoolYear } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { treasurerPdf, yearEndPdf, type TreasurerData } from '../../lib/pdfDocs';
import { percent } from '../../lib/roi';

type Tab = 'products' | 'restock' | 'cash' | 'gift' | 'shrink' | 'purchasing' | 'staff';
type Preset = 'year' | 'month' | 'last' | 'custom';

function presetRange(p: Preset, custom: { from: string; to: string }) {
  const today = localISODate();
  if (p === 'year') return schoolYear(today);
  if (p === 'month') return monthRange(today.slice(0, 7));
  if (p === 'last') {
    const [y, m] = today.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    return monthRange(prev);
  }
  return custom;
}

export default function ReportsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'products';
  const [preset, setPreset] = useState<Preset>('year');
  const [custom, setCustom] = useState(schoolYear());
  const range = presetRange(preset, custom);
  const [month, setMonth] = useState(localISODate().slice(0, 7));
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const dash = useQuery({ queryKey: ['dash', range.from, range.to], queryFn: () => dashboard(range.from, range.to) });

  const gather = async (from: string, to: string, label: string): Promise<TreasurerData> => {
    const [d, products, cash, gift, shrink, purchasing, staff] = await Promise.all([
      dashboard(from, to),
      productsReport(from, to),
      cashReport(from, to),
      giftCardReport(from, to),
      shrinkReport(from, to),
      purchasingReport(from, to),
      staffReport(from, to),
    ]);
    return { label, dash: d, products, cash, gift, shrink, purchasing, staff };
  };

  const monthly = async () => {
    setPdfBusy('month');
    try {
      const r = monthRange(month);
      const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      downloadBlob(`treasurer-report-${month}.pdf`, await treasurerPdf(await gather(r.from, r.to, label)));
    } catch (err) {
      toast.error(err);
    } finally {
      setPdfBusy(null);
    }
  };
  const yearEnd = async () => {
    setPdfBusy('year');
    try {
      const sy = schoolYear();
      const data = await gather(sy.from, sy.to, `School year ${sy.label}`);
      downloadBlob(`year-end-${sy.label}.pdf`, await yearEndPdf({ ...data, inventory: await inventoryValue() }));
    } catch (err) {
      toast.error(err);
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="How the store is doing"
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" aria-label="Report month" />
            <Button icon={<FileDown className="size-4" />} loading={pdfBusy === 'month'} onClick={() => void monthly()}>
              Treasurer Report
            </Button>
            <Button icon={<FileDown className="size-4" />} loading={pdfBusy === 'year'} onClick={() => void yearEnd()}>
              Year-end
            </Button>
          </>
        }
      >
        Completed sales minus refunds. Training sales, pending outage entries and gift card loads are left out.
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { id: 'year', label: 'School year' },
            { id: 'month', label: 'This month' },
            { id: 'last', label: 'Last month' },
            { id: 'custom', label: 'Custom' },
          ]}
          value={preset}
          onChange={setPreset}
        />
        <AnimatePresence>
          {preset === 'custom' && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" aria-label="From" />
              <span className="text-ink-3">to</span>
              <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" aria-label="To" />
            </motion.div>
          )}
        </AnimatePresence>
        <span className="num text-sm text-ink-3">
          {formatDate(range.from, 'long')} – {formatDate(range.to, 'long')}
        </span>
      </div>

      {dash.data ? <DashboardCards d={dash.data} /> : <Skeleton className="h-64" />}

      <Tabs
        className="mb-5 mt-8"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'products', label: 'Products' },
          { id: 'restock', label: 'Restock' },
          { id: 'cash', label: 'Cash' },
          { id: 'gift', label: 'Gift cards' },
          { id: 'shrink', label: 'Shrink' },
          { id: 'purchasing', label: 'Purchasing' },
          { id: 'staff', label: 'Staff and comps' },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab + range.from + range.to} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'products' && <ProductsTab from={range.from} to={range.to} />}
          {tab === 'restock' && <RestockTab />}
          {tab === 'cash' && <CashTab from={range.from} to={range.to} />}
          {tab === 'gift' && <GiftTab from={range.from} to={range.to} />}
          {tab === 'shrink' && <ShrinkTab from={range.from} to={range.to} />}
          {tab === 'purchasing' && <PurchasingTab from={range.from} to={range.to} />}
          {tab === 'staff' && <StaffTab from={range.from} to={range.to} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-xs text-ink-3">no history</span>;
  const change = (now - before) / Math.abs(before);
  const up = change >= 0;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold', up ? 'text-good' : 'text-bad')}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {percent(Math.abs(change))} vs last year
    </span>
  );
}

function DashboardCards({ d }: { d: Dashboard }) {
  const c = d.current;
  const ly = d.last_year;
  const kpis: Array<{ label: string; value: number | null; format?: (n: number) => string; delta?: [number, number]; hint?: string }> = [
    { label: 'Revenue', value: c.revenue_cents, delta: [c.revenue_cents, ly.combined_revenue_cents] },
    { label: 'Cost of goods', value: c.cogs_cents },
    { label: 'Profit', value: c.profit_cents, delta: [c.profit_cents, ly.profit_cents] },
    { label: 'Margin', value: c.margin === null ? null : Math.round(c.margin * 1000), format: (n) => `${(n / 10).toFixed(1)}%`, hint: c.revenue_cost_missing_cents ? `${formatCents(c.revenue_cost_missing_cents)} of sales have no cost` : 'Known-cost items' },
    { label: 'Sales', value: c.sales_count, format: (n) => n.toLocaleString(), delta: [c.sales_count, ly.sales_count] },
    { label: 'Average sale', value: c.avg_sale_cents },
    { label: 'Open days', value: c.open_days, format: (n) => String(n) },
    { label: 'Per open day', value: c.revenue_per_open_day_cents },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-4">
        <motion.div
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
          initial="initial"
          animate="animate"
          variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
        >
          {kpis.map((k) => (
            <motion.div
              key={k.label}
              variants={{ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }}
              whileHover={{ y: -2 }}
              className="rounded-xl border border-rule bg-paper p-4 shadow-card"
            >
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{k.label}</p>
              <AnimatedNumber value={k.value} format={k.format} duration={0.9} className="num mt-1 block text-2xl font-semibold" />
              <div className="mt-1 min-h-4">{k.delta ? <Delta now={k.delta[0]} before={k.delta[1]} /> : k.hint ? <span className="text-xs text-ink-3">{k.hint}</span> : null}</div>
            </motion.div>
          ))}
        </motion.div>
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">Revenue by day</p>
            <span className="text-xs text-ink-3">
              Last year: {formatCents(ly.combined_revenue_cents)}
              {ly.legacy_revenue_cents > 0 && ` (incl. ${formatCents(ly.legacy_revenue_cents)} from Base44)`}
            </span>
          </div>
          <RevenueChart series={d.series} />
        </Card>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col justify-between gap-4 rounded-xl border border-band bg-band p-5 text-band-ink shadow-card"
      >
        <div>
          <p className="eyebrow text-band-ink-2">Forecast</p>
          <h3 className="display text-xl font-bold">Rest of the year</h3>
        </div>
        {d.forecast.message ? (
          <div>
            <p className="display text-2xl font-bold">{d.forecast.message}</p>
            <p className="mt-1 text-sm text-band-ink-2">A forecast needs at least 10 open days of sales in the range.</p>
          </div>
        ) : (
          <div>
            <TrendingUp className="mb-2 size-6 text-gold" />
            <AnimatedNumber value={d.forecast.revenue_cents ?? 0} duration={1.2} className="num block text-4xl font-semibold" />
            <p className="mt-1 text-sm text-band-ink-2">
              {formatCents(d.forecast.revenue_per_open_day_cents)} per open day × {d.forecast.planned_open_days} planned open days left
            </p>
          </div>
        )}
        <p className="text-xs text-band-ink-2">Promo card cost this period: {formatCents(c.promo_cost_cents)}</p>
      </motion.div>
    </div>
  );
}

function RevenueChart({ series }: { series: Array<{ d: string; revenue_cents: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) return <p className="py-10 text-center text-sm text-ink-3">No sales in this range yet.</p>;
  const max = Math.max(1, ...series.map((s) => s.revenue_cents));
  const shown = hover === null ? null : series[hover];
  return (
    <div>
      <div className="flex h-44 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {series.map((s, i) => (
          <motion.div
            key={s.d}
            className={cx('min-w-[3px] flex-1 origin-bottom rounded-t', hover === i ? 'bg-gold' : 'bg-navy')}
            style={{ height: `${Math.max(2, (s.revenue_cents / max) * 100)}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: Math.min(i * 0.012, 0.8), type: 'spring', stiffness: 160, damping: 20 }}
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </div>
      <div className="mt-2 flex h-5 items-center justify-between text-xs text-ink-3">
        <span>{formatDate(series[0].d)}</span>
        <AnimatePresence mode="wait">
          {shown && (
            <motion.span key={shown.d} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="num font-semibold text-ink">
              {formatDate(shown.d, 'long')}: {formatCents(shown.revenue_cents)}
            </motion.span>
          )}
        </AnimatePresence>
        <span>{formatDate(series[series.length - 1].d)}</span>
      </div>
    </div>
  );
}

function ProductsTab({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['r-products', from, to], queryFn: () => productsReport(from, to) });
  if (!q.data) return <Skeleton className="h-80" />;
  const top = q.data.filter((p) => p.qty > 0).slice(0, 8);
  return (
    <div className="grid gap-4">
      {top.length > 0 && (
        <Card className="p-5">
          <p className="eyebrow mb-3">Top sellers by revenue</p>
          <Bars rows={top.map((p) => ({ label: p.name, value: p.revenue_cents }))} />
        </Card>
      )}
      <DataTable
        rows={q.data}
        rowKey={(p) => p.product_id}
        csvName={`products-${from}-${to}`}
        initialSort={{ key: 'revenue', dir: 'desc' }}
        columns={[
          { key: 'name', label: 'Item', render: (p) => <span className="font-semibold">{p.name}</span> },
          { key: 'qty', label: 'Sold', align: 'right', value: (p) => p.qty },
          { key: 'revenue', label: 'Revenue', align: 'right', value: (p) => p.revenue_cents, render: (p) => formatCents(p.revenue_cents) },
          // Lines sold with no cost on file have no cost of goods to show.
          { key: 'cogs', label: 'Cost', align: 'right', value: (p) => p.cogs_cents, render: (p) => (p.margin === null && p.cogs_cents === 0 && p.qty ? '—' : formatCents(p.cogs_cents)) },
          { key: 'profit', label: 'Profit', align: 'right', value: (p) => p.profit_cents, render: (p) => (p.margin === null && p.cogs_cents === 0 && p.qty ? '—' : formatCents(p.profit_cents)) },
          {
            key: 'margin',
            label: 'Margin',
            align: 'right',
            value: (p) => p.margin,
            render: (p) => (p.cost_status === 'missing' ? <Pill tone="warn">Cost missing</Pill> : percent(p.margin)),
          },
          { key: 'on_hand', label: 'On hand', align: 'right', value: (p) => p.on_hand },
        ]}
      />
    </div>
  );
}

function RestockTab() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['r-restock'], queryFn: restockReport });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const start = () => {
    const lines: DraftLine[] = rows
      .filter((r) => picked.has(r.product_id))
      .map((r) => ({
        key: crypto.randomUUID(),
        vendor_item_id: r.listing?.vendor_item_id ?? null,
        product_id: r.product_id,
        new_name: null,
        item_number: null,
        url: r.listing?.url ?? null,
        units_per_pack: r.units_per_pack ?? 1,
        packs: Math.max(1, r.suggested_packs ?? 1),
        est_pack_price_cents: r.listing?.price_cents ?? 0,
        sell_price_cents: r.price_cents,
        label: r.name,
      }));
    navigate('/preauth/new', { state: { lines } });
  };
  if (!q.data) return <Skeleton className="h-80" />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Suggested packs cover about 6 weeks of sales, counting what is on hand.</p>
        <Button variant="primary" icon={<ClipboardSignature className="size-4" />} disabled={picked.size === 0} onClick={start}>
          Start pre-auth with {picked.size || ''} item{picked.size === 1 ? '' : 's'}
        </Button>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.product_id}
        csvName="restock"
        columns={[
          {
            key: 'pick',
            label: '',
            render: (r) => (
              <input
                type="checkbox"
                className="size-4 accent-[var(--navy)]"
                checked={picked.has(r.product_id)}
                onChange={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (n.has(r.product_id)) n.delete(r.product_id);
                    else n.add(r.product_id);
                    return n;
                  })
                }
                aria-label={`Pick ${r.name}`}
              />
            ),
          },
          { key: 'name', label: 'Item', render: (r) => <span className="font-semibold">{r.name}</span> },
          {
            key: 'on_hand',
            label: 'On hand',
            align: 'right',
            value: (r) => r.on_hand,
            render: (r) => <span className={cx(r.low && 'font-semibold text-warn')}>{r.on_hand}</span>,
          },
          { key: 'weekly', label: 'Per week', align: 'right', value: (r) => r.weekly_sales },
          {
            key: 'weeks',
            label: 'Weeks left',
            align: 'right',
            value: (r) => r.weeks_of_supply,
            render: (r) => (r.weeks_of_supply === null ? '—' : <span className={cx(r.weeks_of_supply > 10 && 'text-warn', r.weeks_of_supply < 2 && 'text-bad')}>{r.weeks_of_supply}</span>),
          },
          { key: 'pack', label: 'Per pack', align: 'right', value: (r) => r.units_per_pack },
          { key: 'suggest', label: 'Suggest', align: 'right', value: (r) => r.suggested_packs, render: (r) => (r.suggested_packs ? <b>{r.suggested_packs}</b> : '—') },
        ]}
      />
    </div>
  );
}

function CashTab({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['r-cash', from, to], queryFn: () => cashReport(from, to) });
  if (!q.data) return <Skeleton className="h-80" />;
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Total over/short: <b className={cx('num', q.data.total_over_short_cents < 0 ? 'text-bad' : 'text-good')}>{formatCents(q.data.total_over_short_cents, { sign: true })}</b>
      </p>
      <DataTable
        rows={q.data.shifts}
        rowKey={(s) => s.id}
        csvName={`cash-${from}-${to}`}
        columns={[
          { key: 'number', label: 'Shift', render: (s) => `#${s.number}` },
          { key: 'cashier_name', label: 'Cashier' },
          { key: 'opened', label: 'Opened', value: (s) => s.opened_at, render: (s) => formatDateTime(s.opened_at) },
          { key: 'expected', label: 'Expected', align: 'right', value: (s) => s.expected_cash_cents, render: (s) => formatCents(s.expected_cash_cents) },
          { key: 'counted', label: 'Counted', align: 'right', value: (s) => s.counted_cash_cents, render: (s) => (s.closed_at ? formatCents(s.counted_cash_cents) : <Pill tone="gold">Open</Pill>) },
          {
            key: 'os',
            label: 'Over/short',
            align: 'right',
            value: (s) => s.over_short_cents,
            render: (s) => <span className={cx(s.over_short_cents && Math.abs(s.over_short_cents) > 100 ? 'font-semibold text-bad' : '')}>{formatCents(s.over_short_cents, { sign: true })}</span>,
          },
          { key: 'note', label: 'Note', value: (s) => s.note ?? '' },
        ]}
      />
    </div>
  );
}

function GiftTab({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['r-gift', from, to], queryFn: () => giftCardReport(from, to) });
  if (!q.data) return <Skeleton className="h-80" />;
  const g = q.data;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ['Owed on paid cards', g.outstanding_paid_cents],
            ['Promo balances', g.outstanding_promo_cents],
            ['Paid cards sold/loaded', g.issued_paid_cents],
            ['Paid cards spent', g.redeemed_paid_cents],
            ['Promo issued', g.issued_promo_cents],
            ['Promo spent', g.redeemed_promo_cents],
            ['Promo cost of goods', g.promo_cost_cents],
            ['Returned to cards', g.returned_cents],
          ] as const
        ).map(([label, v]) => (
          <Card key={label} className="p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
            <AnimatedNumber value={v} className="num text-xl font-semibold" />
          </Card>
        ))}
      </div>
      <DataTable
        rows={g.cards_with_balance}
        rowKey={(c) => c.id}
        csvName="gift-card-balances"
        columns={[
          { key: 'code', label: 'Code', render: (c) => <span className="num">{c.code}</span> },
          { key: 'type', label: 'Type' },
          { key: 'created_at', label: 'Issued', render: (c) => formatDate(c.created_at, 'long') },
          { key: 'balance', label: 'Balance', align: 'right', value: (c) => c.balance_cents, render: (c) => formatCents(c.balance_cents) },
        ]}
      />
    </div>
  );
}

function ShrinkTab({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['r-shrink', from, to], queryFn: () => shrinkReport(from, to) });
  if (!q.data) return <Skeleton className="h-80" />;
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <p className="eyebrow mb-3">Value at cost by reason</p>
        <Bars rows={Object.entries(q.data.by_type).map(([t, v]) => ({ label: t.replace('_', ' '), value: v.value_cents }))} />
        <p className="mt-3 text-sm">
          Net: <b className="num">{formatCents(q.data.total_value_cents)}</b>
        </p>
      </Card>
      <DataTable
        rows={q.data.rows}
        rowKey={(r) => `${r.at}${r.product_id}${r.type}`}
        csvName={`shrink-${from}-${to}`}
        columns={[
          { key: 'at', label: 'When', render: (r) => formatDateTime(r.at) },
          { key: 'name', label: 'Item' },
          { key: 'type', label: 'Reason', value: (r) => r.type.replace('_', ' ') },
          { key: 'qty', label: 'Qty', align: 'right', value: (r) => r.qty },
          { key: 'value', label: 'Value', align: 'right', value: (r) => r.value_cents, render: (r) => formatCents(r.value_cents) },
          { key: 'reason', label: 'Note', value: (r) => r.reason ?? '' },
        ]}
      />
    </div>
  );
}

function PurchasingTab({ from, to }: { from: string; to: string }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['r-purch', from, to], queryFn: () => purchasingReport(from, to) });
  if (!q.data) return <Skeleton className="h-80" />;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-2">
        {q.data.count} forms · approved {formatCents(q.data.approved_cents)} · spent {formatCents(q.data.spent_cents)}
        {q.data.overdue > 0 && <b className="text-bad"> · {q.data.overdue} overdue</b>}
      </p>
      <DataTable
        rows={q.data.rows}
        rowKey={(r) => r.id}
        csvName={`purchasing-${from}-${to}`}
        onRowClick={(r) => navigate(`/preauth/${r.id}`)}
        columns={[
          { key: 'number', label: '#', value: (r) => r.number },
          { key: 'student_name', label: 'Student' },
          { key: 'status', label: 'Status', render: (r) => (r.overdue ? <Pill tone="bad">overdue</Pill> : <Pill>{r.status.replace('_', ' ')}</Pill>) },
          { key: 'request_date', label: 'Requested', render: (r) => formatDate(r.request_date, 'long') },
          { key: 'approved', label: 'Approved', align: 'right', value: (r) => r.approved_total_cents, render: (r) => formatCents(r.approved_total_cents) },
          { key: 'receipts', label: 'Receipts', align: 'right', value: (r) => r.receipts_total_cents, render: (r) => formatCents(r.receipts_total_cents) },
        ]}
      />
    </div>
  );
}

function StaffTab({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['r-staff', from, to], queryFn: () => staffReport(from, to) });
  if (!q.data) return <Skeleton className="h-80" />;
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <p className="eyebrow mb-3">Revenue by cashier</p>
        <Bars rows={q.data.by_cashier.map((c) => ({ label: c.name, value: c.revenue_cents }))} />
        <p className="mt-3 text-sm text-ink-2">
          Comps cost {formatCents(q.data.comp_cost_cents)} (retail value {formatCents(q.data.comp_list_value_cents)}).
        </p>
      </Card>
      <DataTable
        rows={q.data.staff_and_comps}
        rowKey={(r) => r.sale_id}
        csvName={`staff-comps-${from}-${to}`}
        empty="No staff sales or comps in this range."
        columns={[
          { key: 'number', label: 'Sale', render: (r) => `#${r.number}` },
          { key: 'type', label: 'Type', render: (r) => <Pill tone={r.type === 'comp' ? 'gold' : 'navy'}>{r.type}</Pill> },
          { key: 'at', label: 'When', render: (r) => formatDateTime(r.at) },
          { key: 'cashier_name', label: 'Cashier' },
          { key: 'reason', label: 'Reason', value: (r) => r.reason ?? r.note ?? '' },
          { key: 'list', label: 'Retail', align: 'right', value: (r) => r.list_value_cents, render: (r) => formatCents(r.list_value_cents) },
          { key: 'cost', label: 'Cost', align: 'right', value: (r) => r.cost_cents, render: (r) => formatCents(r.cost_cents) },
        ]}
      />
    </div>
  );
}
