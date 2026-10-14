import { rpc, rpcResult } from './rpc';
import type { Sale, SaleType, Shift, ShiftSummary, Stroke } from './types';

export const myOpenShifts = () => rpc<Shift[]>('my_open_shifts');
export const shiftSummary = (id: string) => rpc<ShiftSummary>('shift_summary', { p_shift_id: id });

export const openShift = (cashierId: string, pin: string, openingCents: number, breakdown: unknown, device: string) =>
  rpcResult<{ ok: boolean; shift_id: string; number: number }>('open_shift', {
    p_cashier_id: cashierId,
    p_pin: pin,
    p_opening_cash_cents: openingCents,
    p_breakdown: breakdown,
    p_device: device,
  });

export const verifyPin = (memberId: string, pin: string) => rpcResult<{ ok: boolean }>('verify_member_pin', { p_member_id: memberId, p_pin: pin });

export type CartLineInput = { kind: 'product'; product_id: string; qty: number } | { kind: 'gift_card_load'; code?: string; amount_cents: number };
export type PaymentInput = { method: 'cash'; amount_cents: number } | { method: 'gift_card' | 'promo_card'; code: string; amount_cents: number };

export type SalePayload = {
  p_client_uuid: string;
  p_shift_id: string;
  p_type: SaleType;
  p_lines: CartLineInput[];
  p_payments: PaymentInput[];
  p_cash_tendered_cents: number | null;
  p_note: string | null;
  p_reason: string | null;
};

export type SaleResult = { ok: boolean; duplicate: boolean; change_cents: number | null; new_cards: Array<{ code: string; amount_cents: number }>; sale: Sale };

export const completeSale = (payload: SalePayload) => rpcResult<SaleResult>('complete_sale', payload);

export const findSale = (number: number) => rpc<Sale>('find_sale', { p_number: number });

export const voidSale = (saleId: string, shiftId: string, reason: string, officerId: string | null, officerPin: string | null) =>
  rpcResult<{ ok: boolean; sale: Sale }>('void_sale', {
    p_sale_id: saleId,
    p_shift_id: shiftId,
    p_reason: reason,
    p_officer_id: officerId,
    p_officer_pin: officerPin,
  });

export const refundSale = (
  saleId: string,
  shiftId: string,
  lines: Array<{ sale_line_id: string; qty: number }>,
  returnToShelf: boolean,
  reason: string,
  officerId: string | null,
  officerPin: string | null,
) =>
  rpcResult<{ ok: boolean; amount_cents: number; cash_cents: number; gift_card_cents: number; promo_cents: number }>('refund_sale', {
    p_sale_id: saleId,
    p_shift_id: shiftId,
    p_lines: lines,
    p_return_to_shelf: returnToShelf,
    p_reason: reason,
    p_officer_id: officerId,
    p_officer_pin: officerPin,
  });

export type HandoffSignature = { typed_name: string; strokes: Stroke[]; image_path: string | null };

export const recordHandoff = (
  shiftId: string,
  amountCents: number,
  fromId: string,
  fromPin: string,
  toId: string,
  toPin: string,
  fromSig: HandoffSignature,
  toSig: HandoffSignature,
  note: string | null,
) =>
  rpcResult<{ ok: boolean; expected_cash_cents: number }>('record_handoff', {
    p_shift_id: shiftId,
    p_amount_cents: amountCents,
    p_from_id: fromId,
    p_from_pin: fromPin,
    p_to_id: toId,
    p_to_pin: toPin,
    p_from_signature: fromSig,
    p_to_signature: toSig,
    p_note: note,
  });

export type CloseResult = { ok: boolean; expected_cash_cents: number; counted_cash_cents: number; over_short_cents: number };

export const closeShift = (shiftId: string, breakdown: unknown, note: string | null, officerId: string | null, officerPin: string | null) =>
  rpcResult<CloseResult>('close_shift', {
    p_shift_id: shiftId,
    p_breakdown: breakdown,
    p_note: note,
    p_officer_id: officerId,
    p_officer_pin: officerPin,
  });

export const logOutageSale = (
  clientUuid: string,
  shiftId: string | null,
  occurredOn: string,
  lines: Array<{ product_id: string; qty: number }>,
  photoPath: string,
  note: string | null,
) =>
  rpcResult<{ ok: boolean; sale: Sale }>('log_outage_sale', {
    p_client_uuid: clientUuid,
    p_shift_id: shiftId,
    p_occurred_on: occurredOn,
    p_lines: lines,
    p_photo_path: photoPath,
    p_note: note,
  });

export const pendingOutageSales = () => rpc<Sale[]>('pending_outage_sales');
export const verifyOutageSale = (saleId: string, approve: boolean, note: string | null) =>
  rpcResult<{ ok: boolean }>('verify_outage_sale', { p_sale_id: saleId, p_approve: approve, p_note: note });
