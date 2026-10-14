import { rpc } from './rpc';
import type { Dashboard } from './types';

export const dashboard = (from: string, to: string) => rpc<Dashboard>('report_dashboard', { p_from: from, p_to: to });

export type ProductRow = {
  product_id: string;
  sku: string;
  name: string;
  category: string | null;
  status: string;
  price_cents: number;
  avg_cost_cents: number | null;
  cost_status: string;
  on_hand: number;
  qty: number;
  revenue_cents: number;
  cogs_cents: number;
  profit_cents: number;
  margin: number | null;
};
export const productsReport = (from: string, to: string) => rpc<ProductRow[]>('report_products', { p_from: from, p_to: to });

export type RestockRow = {
  product_id: string;
  sku: string;
  name: string;
  on_hand: number;
  low_stock_alert: number;
  low: boolean;
  weekly_sales: number;
  weeks_of_supply: number | null;
  units_per_pack: number | null;
  suggested_packs: number | null;
  listing: { vendor_item_id: string; name: string; url: string | null; price_cents: number } | null;
  price_cents: number;
};
export const restockReport = () => rpc<RestockRow[]>('report_restock');

export type CashReport = {
  shifts: Array<{
    id: string;
    number: number;
    cashier_name: string;
    opened_at: string;
    closed_at: string | null;
    opening_cash_cents: number;
    expected_cash_cents: number;
    counted_cash_cents: number | null;
    over_short_cents: number | null;
    handoffs_cents: number;
    note: string | null;
  }>;
  total_over_short_cents: number;
  handoffs: Array<{ at: string; amount_cents: number; from_name: string; to_name: string; note: string | null }>;
};
export const cashReport = (from: string, to: string) => rpc<CashReport>('report_cash', { p_from: from, p_to: to });

export type GiftCardReport = {
  outstanding_paid_cents: number;
  outstanding_promo_cents: number;
  issued_paid_cents: number;
  issued_promo_cents: number;
  redeemed_paid_cents: number;
  redeemed_promo_cents: number;
  returned_cents: number;
  promo_cost_cents: number;
  cards_with_balance: Array<{ id: string; code: string; type: string; balance_cents: number; created_at: string }>;
};
export const giftCardReport = (from: string, to: string) => rpc<GiftCardReport>('report_gift_cards', { p_from: from, p_to: to });

export type ShrinkReport = {
  total_value_cents: number;
  by_type: Record<string, { qty: number; value_cents: number }>;
  rows: Array<{ at: string; product_id: string; name: string; sku: string; type: string; qty: number; value_cents: number | null; reason: string | null }>;
};
export const shrinkReport = (from: string, to: string) => rpc<ShrinkReport>('report_shrink', { p_from: from, p_to: to });

export type PurchasingReport = {
  count: number;
  approved_cents: number;
  spent_cents: number;
  overdue: number;
  by_status: Record<string, number>;
  rows: Array<{
    id: string;
    number: number;
    student_name: string;
    status: string;
    request_date: string;
    grand_total_cents: number;
    approved_total_cents: number | null;
    receipts_total_cents: number;
    purchase_date: string | null;
    receipt_due_date: string | null;
    overdue: boolean;
  }>;
};
export const purchasingReport = (from: string, to: string) => rpc<PurchasingReport>('report_purchasing', { p_from: from, p_to: to });

export type StaffReport = {
  by_cashier: Array<{ cashier_id: string; name: string; sales: number; revenue_cents: number }>;
  staff_and_comps: Array<{
    sale_id: string;
    number: number;
    type: string;
    at: string;
    cashier_name: string;
    reason: string | null;
    note: string | null;
    list_value_cents: number;
    charged_cents: number;
    cost_cents: number | null;
  }>;
  comp_cost_cents: number;
  comp_list_value_cents: number;
};
export const staffReport = (from: string, to: string) => rpc<StaffReport>('report_staff_comps', { p_from: from, p_to: to });

export const inventoryValue = () => rpc<{ value_cents: number; units: number; cost_missing_products: number }>('report_inventory_value');
