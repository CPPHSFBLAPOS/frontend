// Shapes the database returns. Money is always integer cents.

export type Role = 'advisor' | 'president' | 'treasurer' | 'cashier' | 'register';

export type Permission =
  | 'ring_sales'
  | 'sell_gift_cards'
  | 'void_refund'
  | 'issue_promo'
  | 'edit_products'
  | 'stock'
  | 'preauth_view'
  | 'preauth_request'
  | 'preauth_approve'
  | 'preauth_purchase'
  | 'preauth_close'
  | 'receiving'
  | 'verify_outage'
  | 'view_reports'
  | 'view_log'
  | 'manage_members'
  | 'change_settings';

export type Me = {
  id: string;
  email: string;
  display_name: string;
  grade: number | null;
  role: Role | null;
  is_super_admin: boolean;
  active: boolean;
  has_pin: boolean;
  linked: boolean;
  permissions: Permission[];
};

export type MemberRow = Omit<Me, 'permissions'>;

export type DirectoryEntry = { id: string; display_name: string; role: Role | null; is_super_admin: boolean; has_pin: boolean };

export type Settings = {
  id: number;
  store_name: string;
  float_cents: number;
  over_short_tolerance_cents: number;
  preauth_limit_cents: number;
  preauth_warn_cents: number;
  receipt_due_days: number;
  school_year_start: string;
  open_days: string[];
  sams_daily_limit: number;
  sams_cache_days: number;
};

export type Category = { id: string; name: string; sort_order: number; active: boolean };

export type Product = {
  id: string;
  sku: string;
  upc: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  price_cents: number;
  avg_cost_cents: number | null;
  cost_status: 'known' | 'missing';
  low_stock_alert: number;
  image_path: string | null;
  smart_snack: boolean;
  status: 'active' | 'archived';
  on_hand: number;
};

export type MovementType =
  | 'sale'
  | 'refund_to_shelf'
  | 'void'
  | 'receiving'
  | 'opening_balance'
  | 'count_adjustment'
  | 'damaged'
  | 'expired'
  | 'missing'
  | 'found'
  | 'import_adjustment';

export type StockMovement = {
  id: number;
  product_id: string;
  qty: number;
  type: MovementType;
  unit_cost_cents: number | null;
  source_type: string | null;
  source_id: string | null;
  reason: string | null;
  by: string | null;
  at: string;
};

export type PriceChange = { id: number; product_id: string; old_cents: number | null; new_cents: number; by: string | null; at: string };

export type StockCount = {
  id: string;
  kind: 'quick' | 'full';
  status: 'open' | 'approved' | 'cancelled';
  started_by: string;
  started_at: string;
  approved_at: string | null;
  note: string | null;
};
export type StockCountLine = { count_id: string; product_id: string; expected: number; counted: number | null };

// ---------- Pre-auth ----------

export type PreauthStatus = 'draft' | 'awaiting_advisor' | 'approved' | 'purchased' | 'received' | 'closed' | 'rejected';
export type Purpose = 'competition' | 'event' | 'fundraiser' | 'supplies' | 'other';

export type VendorItem = {
  id: string;
  item_number: string | null;
  url: string | null;
  name: string;
  units_per_pack: number;
  price_cents: number;
  sale_price_cents: number | null;
  checked_at: string;
  product_id: string | null;
  source: 'search' | 'paste';
};

export type PreauthLine = {
  id: string;
  line_no: number;
  vendor_item_id: string | null;
  product_id: string | null;
  new_name: string | null;
  item_number: string | null;
  url: string | null;
  units_per_pack: number;
  packs: number;
  est_pack_price_cents: number;
  sell_price_cents: number;
  packs_bought: number | null;
  actual_pack_price_cents: number | null;
  units_received: number | null;
  substitute_product_id: string | null;
  received_unit_cost_cents: number | null;
  product_name: string | null;
  product_price_cents: number | null;
  on_hand: number;
  vendor_checked_at: string | null;
};

export type SignatureRow = {
  id: string;
  role: 'student' | 'advisor' | 'overage';
  member_id: string;
  typed_name: string;
  strokes: Stroke[];
  image_path: string | null;
  signed_at: string;
  doc_hash: string | null;
  voided_at: string | null;
  matches_form: boolean;
};

export type Stroke = { points: Array<{ x: number; y: number; time?: number; pressure?: number }>; [k: string]: unknown };

export type Receipt = { id: string; file_path: string; total_cents: number; tax_cents: number; uploaded_by: string; uploaded_at: string };

export type PreauthSummary = {
  id: string;
  number: number;
  status: PreauthStatus;
  requester_id: string;
  student_name: string;
  request_date: string;
  vendor: string;
  grand_total_cents: number;
  approved_total_cents: number | null;
  purchase_date: string | null;
  receipt_due_date: string | null;
  overdue: boolean;
  updated_at: string;
};

export type Preauth = PreauthSummary & {
  grade: number | null;
  fbla_role: string | null;
  website: string | null;
  purposes: Purpose[];
  purpose_other: string | null;
  justification: string | null;
  shipping_cents: number;
  lines_total_cents: number;
  notes: string | null;
  reject_comment: string | null;
  overage_approved_at: string | null;
  reimbursed_cents: number | null;
  reimbursed_to: string | null;
  reimbursed_at: string | null;
  pdf_path: string | null;
  closed_at: string | null;
  created_at: string;
  hash: string;
  receipts_total_cents: number;
  needs_overage: boolean;
  lines: PreauthLine[];
  signatures: SignatureRow[];
  receipts: Receipt[];
};

export type SalesHistory = Record<
  string,
  { units: number; weeks_with_sales: number; weekly_sales: number; on_hand: number; source: string; window_from: string; window_to: string }
>;

// ---------- Register ----------

export type SaleType = 'regular' | 'staff' | 'comp' | 'outage' | 'training';

export type Shift = {
  id: string;
  number: number;
  cashier_id: string;
  cashier_name: string;
  cashier_role: Role | null;
  opened_by: string;
  opened_at: string;
  opening_cash_cents: number;
  expected_cash_cents: number;
  closed_at: string | null;
};

export type SaleLine = {
  id: string;
  line_no: number;
  kind: 'product' | 'gift_card_load';
  product_id: string | null;
  product_name: string | null;
  gift_card_id: string | null;
  card_code: string | null;
  qty: number;
  unit_price_cents: number;
  list_price_cents: number;
  unit_cost_cents: number | null;
  refunded_qty: number;
};

export type Sale = {
  id: string;
  number: number;
  client_uuid: string;
  shift_id: string | null;
  cashier_id: string;
  cashier_name: string;
  type: SaleType;
  status: 'completed' | 'voided' | 'pending' | 'rejected';
  subtotal_cents: number;
  load_cents: number;
  total_cents: number;
  promo_cents: number;
  cash_tendered_cents: number | null;
  change_cents: number | null;
  note: string | null;
  reason: string | null;
  occurred_on: string | null;
  outage_photo_path: string | null;
  created_at: string;
  lines: SaleLine[];
  payments: Array<{ id: string; method: 'cash' | 'gift_card' | 'promo_card'; amount_cents: number; card_code: string | null }>;
  refunds: Array<{ id: string; amount_cents: number; cash_cents: number; gift_card_cents: number; promo_cents: number; at: string; reason: string }>;
};

export type ShiftSummary = {
  id: string;
  number: number;
  cashier_id: string;
  cashier_name: string;
  close_officer_name: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash_cents: number;
  counted_cash_cents: number | null;
  expected_cash_cents: number;
  over_short_cents: number | null;
  note: string | null;
  cash_in_cents: number;
  cash_loads_cents: number;
  cash_refunds_cents: number;
  handoffs_cents: number;
  sales_count: number;
  training_count: number;
  voids_count: number;
  refunds_count: number;
  sales_total_cents: number;
  by_method: Record<string, number>;
  sales: Array<{ id: string; number: number; type: SaleType; status: string; total_cents: number; created_at: string }>;
  handoffs: Array<{ id: string; amount_cents: number; at: string; from_name: string; to_name: string }>;
};

// ---------- Gift cards ----------

export type GiftCard = {
  id: string;
  code: string;
  type: 'paid' | 'promo';
  status: 'active' | 'deactivated';
  note: string | null;
  created_at: string;
  balance_cents: number;
  replaced_by_code: string | null;
};

export type GiftCardTxn = { id: number; card_id: string; type: string; amount_cents: number; sale_id: string | null; at: string; note: string | null };

// ---------- Log ----------

export type LogEntry = {
  seq: number;
  at: string;
  actor_id: string | null;
  role: string | null;
  device: string | null;
  action: string;
  record_type: string | null;
  record_id: string | null;
  amount_cents: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  hash: string;
};

// ---------- Reports ----------

export type Summary = {
  from: string;
  to: string;
  revenue_cents: number;
  cogs_cents: number;
  profit_cents: number;
  margin: number | null;
  revenue_cost_missing_cents: number;
  promo_cost_cents: number;
  sales_count: number;
  avg_sale_cents: number | null;
  open_days: number;
  revenue_per_open_day_cents: number | null;
};

export type Dashboard = {
  current: Summary;
  last_year: Summary & { legacy_revenue_cents: number; legacy_open_days: number; combined_revenue_cents: number };
  forecast: { message?: string; revenue_cents?: number; planned_open_days: number; revenue_per_open_day_cents?: number };
  series: Array<{ d: string; revenue_cents: number }>;
};
