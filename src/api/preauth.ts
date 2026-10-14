import { z } from 'zod';
import { callFunction, rpc, rpcResult } from './rpc';
import { supabase } from './supabase';
import type { Preauth, PreauthSummary, Purpose, SalesHistory, Stroke, VendorItem } from './types';

export async function listPreauths(): Promise<PreauthSummary[]> {
  const { data, error } = await supabase
    .from('preauths')
    .select('id, number, status, requester_id, student_name, request_date, vendor, grand_total_cents, approved_total_cents, purchase_date, receipt_due_date, overdue, updated_at')
    .order('number', { ascending: false });
  if (error) throw new Error(error.message);
  return data as PreauthSummary[];
}

export const getPreauth = (id: string) => rpc<Preauth>('get_preauth', { p_id: id });

export type PreauthForm = {
  vendor: string;
  website: string;
  purposes: Purpose[];
  purpose_other: string;
  justification: string;
  shipping_cents: number;
  notes: string;
};

export type DraftLine = {
  key: string;
  vendor_item_id: string | null;
  product_id: string | null;
  new_name: string | null;
  item_number: string | null;
  url: string | null;
  units_per_pack: number;
  packs: number;
  est_pack_price_cents: number;
  sell_price_cents: number;
  label: string;
};

export function savePreauth(id: string | null, form: PreauthForm, lines: DraftLine[]): Promise<string> {
  return rpc<string>('save_preauth', {
    p_id: id,
    p_form: form,
    p_lines: lines.map(({ key: _key, label: _label, ...l }) => l),
  });
}

export type SignatureInput = { typed_name: string; strokes: Stroke[]; image_path: string | null };

export const signPreauth = (id: string, role: 'student' | 'advisor', s: SignatureInput) =>
  rpcResult<{ ok: boolean; status: string }>('sign_preauth', {
    p_id: id,
    p_role: role,
    p_typed_name: s.typed_name,
    p_strokes: s.strokes,
    p_image_path: s.image_path,
  });

export const rejectPreauth = (id: string, comment: string) => rpc<void>('reject_preauth', { p_id: id, p_comment: comment });
export const recordPurchase = (id: string, date: string) =>
  rpcResult<{ ok: boolean; receipt_due_date: string }>('record_purchase', { p_id: id, p_purchase_date: date });
export const addReceipt = (id: string, path: string, totalCents: number, taxCents: number) =>
  rpcResult<{ ok: boolean; needs_overage: boolean }>('add_receipt', {
    p_id: id,
    p_file_path: path,
    p_total_cents: totalCents,
    p_tax_cents: taxCents,
  });
export const approveOverage = (id: string, s: SignatureInput) =>
  rpc<void>('approve_overage', { p_id: id, p_typed_name: s.typed_name, p_strokes: s.strokes, p_image_path: s.image_path });
export const recordReimbursement = (id: string, amountCents: number, paidTo: string) =>
  rpc<void>('record_reimbursement', { p_id: id, p_amount_cents: amountCents, p_paid_to: paidTo });
export const receivePreauth = (
  id: string,
  lines: Array<{ line_id: string; packs_bought: number; actual_pack_price_cents: number; units_received: number; substitute_product_id: string | null }>,
) => rpcResult<{ ok: boolean; units: number }>('receive_preauth', { p_id: id, p_lines: lines });
export const closePreauth = (id: string) => rpc<void>('close_preauth', { p_id: id });

export const salesHistory = (productIds: string[]) =>
  productIds.length ? rpc<SalesHistory>('product_sales_history', { p_product_ids: productIds }) : Promise.resolve({} as SalesHistory);

// ---- Functions ----

const vendorItemSchema = z.object({
  id: z.string(),
  item_number: z.string().nullable(),
  url: z.string().nullable(),
  name: z.string(),
  units_per_pack: z.number().int().positive(),
  price_cents: z.number().int().nonnegative(),
  sale_price_cents: z.number().int().nullable(),
  checked_at: z.string(),
  product_id: z.string().nullable(),
  source: z.enum(['search', 'paste']),
});

const lookupSchema = z.object({
  item: vendorItemSchema,
  cached: z.boolean(),
  remaining: z.number().optional(),
  model: z.string().optional(),
});

export type LookupResult = { item: VendorItem; cached: boolean; remaining?: number };

// Function responses are checked with zod before the form trusts them.
export async function samsLookup(input: { mode: 'search'; url?: string; query?: string } | { mode: 'paste'; page_text: string; url?: string }) {
  const raw = await callFunction<unknown>('sams-lookup', input);
  return lookupSchema.parse(raw) as LookupResult;
}

export function notify(preauthId: string, event: 'submitted' | 'approved' | 'rejected') {
  return callFunction<{ ok: boolean; sent: boolean }>('notify', { preauth_id: preauthId, event });
}

export function makePdf(preauthId: string, stage: 'approved' | 'closed') {
  return callFunction<{ ok: boolean; path: string; emailed: boolean }>('preauth-pdf', { preauth_id: preauthId, stage });
}

export async function preauthActivity(id: string) {
  const { data, error } = await supabase
    .from('log_entries')
    .select('seq, at, actor_id, role, action, amount_cents, reason, after')
    .eq('record_type', 'preauth')
    .eq('record_id', id)
    .order('seq', { ascending: true });
  if (error) throw new Error(error.message);
  return data as Array<{ seq: number; at: string; actor_id: string | null; role: string | null; action: string; amount_cents: number | null; reason: string | null }>;
}
