import type { Product, ShiftSummary } from '../api/types';
import type {
  CashReport,
  GiftCardReport,
  ProductRow,
  PurchasingReport,
  ShrinkReport,
  StaffReport,
} from '../api/reports';
import type { Dashboard } from '../api/types';
import { formatDate, formatDateTime } from './dates';
import { Doc, money, pct } from './pdf';

export async function closeoutPdf(s: ShiftSummary) {
  const d = await Doc.create(`Shift #${s.number} closeout`, `${s.cashier_name}  ${formatDateTime(s.opened_at)} to ${formatDateTime(s.closed_at)}`);
  d.heading('Drawer');
  d.kv([
    ['Opening cash', money(s.opening_cash_cents)],
    ['Cash taken in', money(s.cash_in_cents)],
    ['Cash refunds', money(-s.cash_refunds_cents)],
    ['Handoffs', money(-s.handoffs_cents)],
    ['Expected cash', money(s.expected_cash_cents)],
    ['Counted cash', money(s.counted_cash_cents)],
    ['Over / short', money(s.over_short_cents)],
    ['Approved by', s.close_officer_name ?? '-'],
  ]);
  if (s.note) d.text(`Note: ${s.note}`);
  d.heading('Activity');
  d.kv([
    ['Sales', String(s.sales_count)],
    ['Sales total', money(s.sales_total_cents)],
    ['Voids', String(s.voids_count)],
    ['Refunds', String(s.refunds_count)],
    ['Gift card loads (cash)', money(s.cash_loads_cents)],
    ['Training sales (not counted)', String(s.training_count)],
  ]);
  const methods = Object.entries(s.by_method ?? {});
  if (methods.length) {
    d.heading('By payment method');
    d.table(
      [
        { label: 'Method', width: 300 },
        { label: 'Amount', width: 216, align: 'right' },
      ],
      methods.map(([m, c]) => [m.replace('_', ' '), money(c)]),
    );
  }
  if (s.handoffs.length) {
    d.heading('Cash handoffs');
    d.table(
      [
        { label: 'Time', width: 140 },
        { label: 'From', width: 140 },
        { label: 'To', width: 140 },
        { label: 'Amount', width: 96, align: 'right' },
      ],
      s.handoffs.map((h) => [formatDateTime(h.at), h.from_name, h.to_name, money(h.amount_cents)]),
    );
  }
  d.heading('Signatures');
  d.box(48, 'Cashier');
  d.box(48, 'Officer receiving the cash');
  return d.blob();
}

// Paper backup for when the Wi-Fi is down: tally marks by item.
export async function tallySheetPdf(products: Product[]) {
  const d = await Doc.create('Outage Tally Sheet', 'Sell on paper, then enter the totals in the app with a photo of this sheet.');
  d.kv([
    ['Date', '____________'],
    ['Cashier', '____________________'],
  ]);
  d.table(
    [
      { label: 'Item', width: 220 },
      { label: 'Price', width: 60, align: 'right' },
      { label: 'Tally', width: 176 },
      { label: 'Total sold', width: 60, align: 'right' },
    ],
    products.map((p) => [p.name, money(p.price_cents), '', '']),
    { size: 10 },
  );
  d.kv([
    ['Cash collected', '$__________'],
    ['Officer verifying (not the cashier)', '____________________'],
  ]);
  return d.blob();
}

export type TreasurerData = {
  label: string;
  dash: Dashboard;
  products: ProductRow[];
  cash: CashReport;
  gift: GiftCardReport;
  shrink: ShrinkReport;
  purchasing: PurchasingReport;
  staff: StaffReport;
};

function summaryBlock(d: Doc, data: TreasurerData) {
  const c = data.dash.current;
  const ly = data.dash.last_year;
  d.heading('Summary');
  d.kv(
    [
      ['Revenue', money(c.revenue_cents)],
      ['Same period last year', money(ly.combined_revenue_cents)],
      ['Cost of goods', money(c.cogs_cents)],
      ['Profit', money(c.profit_cents)],
      ['Margin (known-cost items)', pct(c.margin)],
      ['Sales', String(c.sales_count)],
      ['Average sale', money(c.avg_sale_cents)],
      ['Open days', String(c.open_days)],
      ['Revenue per open day', money(c.revenue_per_open_day_cents)],
      ['Promo card cost', money(c.promo_cost_cents)],
    ],
    2,
  );
  if (c.revenue_cost_missing_cents > 0) d.text(`${money(c.revenue_cost_missing_cents)} of revenue is from items with no cost on file and is left out of the margin.`, 8.5);
}

function detailBlocks(d: Doc, data: TreasurerData, topProducts: number) {
  d.heading('Products');
  const rows = data.products.filter((p) => p.qty !== 0).slice(0, topProducts);
  d.table(
    [
      { label: 'Item', width: 196 },
      { label: 'Sold', width: 50, align: 'right' },
      { label: 'Revenue', width: 70, align: 'right' },
      { label: 'Cost', width: 70, align: 'right' },
      { label: 'Profit', width: 70, align: 'right' },
      { label: 'Margin', width: 60, align: 'right' },
    ],
    rows.map((p) => [p.name, p.qty, money(p.revenue_cents), money(p.cogs_cents), money(p.profit_cents), pct(p.margin)]),
  );

  d.heading('Cash');
  d.table(
    [
      { label: 'Shift', width: 50 },
      { label: 'Cashier', width: 150 },
      { label: 'Opened', width: 110 },
      { label: 'Expected', width: 70, align: 'right' },
      { label: 'Counted', width: 70, align: 'right' },
      { label: 'Over/short', width: 66, align: 'right' },
    ],
    data.cash.shifts.map((s) => [`#${s.number}`, s.cashier_name, formatDateTime(s.opened_at), money(s.expected_cash_cents), money(s.counted_cash_cents), money(s.over_short_cents)]),
    { totals: ['', 'Total over/short', '', '', '', money(data.cash.total_over_short_cents)] },
  );

  d.heading('Gift cards');
  d.kv([
    ['Owed on paid cards', money(data.gift.outstanding_paid_cents)],
    ['Promo balances', money(data.gift.outstanding_promo_cents)],
    ['Paid cards sold/loaded', money(data.gift.issued_paid_cents)],
    ['Paid cards spent', money(data.gift.redeemed_paid_cents)],
    ['Promo issued', money(data.gift.issued_promo_cents)],
    ['Promo cost of goods', money(data.gift.promo_cost_cents)],
  ]);

  d.heading('Shrink');
  d.kv(
    Object.entries(data.shrink.by_type).map(([t, v]) => [t.replace('_', ' '), `${v.qty} units, ${money(v.value_cents)}`] as [string, string]),
  );
  d.text(`Net shrink at cost: ${money(data.shrink.total_value_cents)}`, 10, d.bold);

  d.heading('Purchasing');
  d.kv([
    ['Pre-auth forms', String(data.purchasing.count)],
    ['Approved', money(data.purchasing.approved_cents)],
    ['Spent (receipts)', money(data.purchasing.spent_cents)],
    ['Overdue receipts', String(data.purchasing.overdue)],
  ]);

  d.heading('Staff and comps');
  d.kv([
    ['Comp cost', money(data.staff.comp_cost_cents)],
    ['Comp retail value', money(data.staff.comp_list_value_cents)],
  ]);
}

export async function treasurerPdf(data: TreasurerData) {
  const d = await Doc.create('Monthly Treasurer Report', data.label);
  summaryBlock(d, data);
  detailBlocks(d, data, 25);
  d.heading('Reviewed');
  d.box(44, 'Treasurer signature and date');
  d.box(44, 'Advisor signature and date');
  return d.blob();
}

export async function yearEndPdf(data: TreasurerData & { inventory: { value_cents: number; units: number; cost_missing_products: number } }) {
  const d = await Doc.create('Year-End Report', data.label);
  summaryBlock(d, data);
  d.heading('Inventory on hand');
  d.kv([
    ['Units', String(data.inventory.units)],
    ['Value at average cost', money(data.inventory.value_cents)],
    ['Products with no cost on file', String(data.inventory.cost_missing_products)],
  ]);
  d.heading('Gift cards still holding money');
  d.text('These balances carry into next year.', 8.5);
  d.table(
    [
      { label: 'Code', width: 160 },
      { label: 'Type', width: 80 },
      { label: 'Issued', width: 140 },
      { label: 'Balance', width: 136, align: 'right' },
    ],
    data.gift.cards_with_balance.map((c) => [c.code, c.type, formatDate(c.created_at, 'long'), money(c.balance_cents)]),
    { totals: ['', '', 'Total', money(data.gift.cards_with_balance.reduce((s, c) => s + c.balance_cents, 0))] },
  );
  detailBlocks(d, data, 60);
  return d.blob();
}
