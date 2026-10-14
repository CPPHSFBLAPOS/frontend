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

export async function listGiftCards(): Promise<GiftCard[]> {
  const { data, error } = await supabase
    .from('gift_card_balance')
    .select('card_id, code, type, status, created_at, note, balance_cents')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, id: r.card_id, replaced_by_code: null })) as GiftCard[];
}

export async function cardHistory(cardId: string): Promise<GiftCardTxn[]> {
  const { data, error } = await supabase.from('gift_card_txns').select('*').eq('card_id', cardId).order('at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as GiftCardTxn[];
}
