// The register's cart, as plain data with pure updates (unit-tested).
// Prices shown here are for the cashier; the database recomputes every
// total from the product table when the sale is saved.

import type { Product, SaleType } from '../../api/types';
import type { CartLineInput, PaymentInput } from '../../api/register';

export type ProductLine = { key: string; kind: 'product'; product: Product; qty: number };
export type LoadLine = { key: string; kind: 'gift_card_load'; code: string | null; amount_cents: number };
export type CartLine = ProductLine | LoadLine;

export type Cart = { lines: CartLine[]; type: SaleType; note: string; reason: string };

export const emptyCart = (type: SaleType = 'regular'): Cart => ({ lines: [], type, note: '', reason: '' });

export function qtyInCart(cart: Cart, productId: string): number {
  return cart.lines.reduce((n, l) => n + (l.kind === 'product' && l.product.id === productId ? l.qty : 0), 0);
}

// Adds one of a product. Returns null when it would sell more than is on
// hand (training sales never touch stock, so they skip the check).
export function addProduct(cart: Cart, product: Product, qty = 1): Cart | null {
  if (cart.type !== 'training' && qtyInCart(cart, product.id) + qty > product.on_hand) return null;
  const existing = cart.lines.find((l): l is ProductLine => l.kind === 'product' && l.product.id === product.id);
  if (existing) {
    return { ...cart, lines: cart.lines.map((l) => (l === existing ? { ...existing, qty: existing.qty + qty } : l)) };
  }
  return { ...cart, lines: [...cart.lines, { key: `p-${product.id}`, kind: 'product', product, qty }] };
}

export function setQty(cart: Cart, key: string, qty: number): Cart {
  if (qty <= 0) return { ...cart, lines: cart.lines.filter((l) => l.key !== key) };
  return { ...cart, lines: cart.lines.map((l) => (l.key === key && l.kind === 'product' ? { ...l, qty } : l)) };
}

export function addLoad(cart: Cart, amountCents: number, code: string | null): Cart {
  return {
    ...cart,
    lines: [...cart.lines, { key: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: 'gift_card_load', code, amount_cents: amountCents }],
  };
}

export function removeLine(cart: Cart, key: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.key !== key) };
}

export function unitPrice(cart: Cart, line: ProductLine): number {
  return cart.type === 'comp' ? 0 : line.product.price_cents;
}

export function totals(cart: Cart) {
  let subtotal = 0;
  let loads = 0;
  let items = 0;
  for (const l of cart.lines) {
    if (l.kind === 'product') {
      subtotal += l.qty * unitPrice(cart, l);
      items += l.qty;
    } else {
      loads += l.amount_cents;
    }
  }
  return { subtotal, loads, total: subtotal + loads, items };
}

export function toLinesInput(cart: Cart): CartLineInput[] {
  return cart.lines.map((l) =>
    l.kind === 'product'
      ? { kind: 'product', product_id: l.product.id, qty: l.qty }
      : { kind: 'gift_card_load', amount_cents: l.amount_cents, ...(l.code ? { code: l.code } : {}) },
  );
}

export type Tender = { key: string; method: 'cash' | 'gift_card' | 'promo_card'; amount_cents: number; code?: string; balance_cents?: number };

export function paid(tenders: Tender[]): number {
  return tenders.reduce((s, t) => s + t.amount_cents, 0);
}

// Cash is what the drawer keeps (never more than what is still due after
// cards); anything handed over beyond that is change.
export function settle(totalCents: number, tenders: Tender[], cashGivenCents: number | null) {
  const cards = tenders.filter((t) => t.method !== 'cash').reduce((s, t) => s + t.amount_cents, 0);
  const cashDue = Math.max(0, totalCents - cards);
  const cashGiven = cashGivenCents ?? 0;
  const remaining = Math.max(0, cashDue - cashGiven);
  const change = cashGiven > cashDue ? cashGiven - cashDue : 0;
  const payments: PaymentInput[] = [
    ...tenders.filter((t) => t.method !== 'cash').map((t) => ({ method: t.method as 'gift_card' | 'promo_card', code: t.code ?? '', amount_cents: t.amount_cents })),
    ...(cashDue > 0 ? [{ method: 'cash' as const, amount_cents: cashDue }] : []),
  ];
  return { cards, cashDue, remaining, change, payments, ready: remaining === 0 && cards <= totalCents };
}
