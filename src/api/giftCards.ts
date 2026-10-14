import { z } from 'zod';
import { rpc } from './rpc';
import { supabase } from './supabase';
import type { GiftCard, GiftCardTxn } from './types';

export const lookupGiftCard = (code: string) => rpc<GiftCard>('lookup_gift_card', { p_code: code });
export const issueGiftCard = (type: 'paid' | 'promo', amountCents: number, note: string | null) =>
  rpc<GiftCard>('issue_gift_card', { p_type: type, p_amount_cents: amountCents, p_note: note });
export const reloadGiftCard = (cardId: string, amountCents: number, note: string | null) =>
  rpc<GiftCard>('reload_gift_card', { p_card_id: cardId, p_amount_cents: amountCents, p_note: note });
export const deactivateAndTransfer = (cardId: string, reason: string) =>
  rpc<{ old_code: string; moved_cents: number; card: GiftCard }>('deactivate_and_transfer', { p_card_id: cardId, p_reason: reason });
export const importGiftCards = (rows: unknown[]) =>
  rpc<{ added: number; skipped: number; cards: Array<{ legacy_code: string; code: string }> }>('import_gift_cards', { p_rows: rows });

// The newest cards, for the list. It stops at GIFT_CARD_LIST_LIMIT, so it is
// never the source for totals: giftCardTotals() sums every active card in
// the database.
export const GIFT_CARD_LIST_LIMIT = 500;

export async function listGiftCards({ onlyWithMoney = false }: { onlyWithMoney?: boolean } = {}): Promise<GiftCard[]> {
  let query = supabase.from('gift_card_balance').select('card_id, code, type, status, created_at, note, balance_cents');
  // Filter on the server, before the limit, so cards with money on them are
  // never pushed off the list by newer empty ones.
  if (onlyWithMoney) query = query.gt('balance_cents', 0);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(GIFT_CARD_LIST_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, id: r.card_id, replaced_by_code: null })) as GiftCard[];
}

const totalsSchema = z.object({
  paid_outstanding_cents: z.number().int(),
  promo_outstanding_cents: z.number().int(),
  cards_with_balance: z.number().int().nonnegative(),
});

export type GiftCardTotals = z.infer<typeof totalsSchema>;

// What the store owes on active cards, summed by the database across every
// card (officers only: needs issue_promo).
export async function giftCardTotals(): Promise<GiftCardTotals> {
  return totalsSchema.parse(await rpc<unknown>('gift_card_totals'));
}

export async function cardHistory(cardId: string): Promise<GiftCardTxn[]> {
  const { data, error } = await supabase.from('gift_card_txns').select('*').eq('card_id', cardId).order('at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as GiftCardTxn[];
}
