import { describe, expect, it } from 'vitest';
import type { Product } from '../../api/types';
import { addLoad, addProduct, emptyCart, setQty, settle, toLinesInput, totals, type Cart } from './cart';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'water',
  sku: 'FBLA-0001',
  upc: '012345678905',
  name: 'Water',
  description: null,
  category_id: null,
  price_cents: 100,
  avg_cost_cents: 25,
  cost_status: 'known',
  low_stock_alert: 5,
  image_path: null,
  smart_snack: false,
  status: 'active',
  on_hand: 2,
  ...over,
});

describe('cart', () => {
  it('adds, merges and totals lines', () => {
    let c: Cart = emptyCart();
    c = addProduct(c, product())!;
    c = addProduct(c, product())!;
    c = addProduct(c, product({ id: 'chips', name: 'Chips', price_cents: 175, on_hand: 9 }))!;
    expect(c.lines).toHaveLength(2);
    expect(totals(c)).toEqual({ subtotal: 375, loads: 0, total: 375, items: 3 });
  });

  it('will not sell more than is on hand', () => {
    let c: Cart = emptyCart();
    c = addProduct(c, product())!;
    c = addProduct(c, product())!;
    expect(addProduct(c, product())).toBeNull();
  });

  it('lets training mode ignore stock', () => {
    const c = addProduct(addProduct(addProduct(emptyCart('training'), product())!, product())!, product());
    expect(c).not.toBeNull();
  });

  it('prices comps at $0', () => {
    const c = addProduct({ ...emptyCart(), type: 'comp' }, product())!;
    expect(totals(c).total).toBe(0);
  });

  it('keeps gift card loads out of the product subtotal', () => {
    const c = addLoad(addProduct(emptyCart(), product())!, 2000, null);
    expect(totals(c)).toMatchObject({ subtotal: 100, loads: 2000, total: 2100 });
    expect(toLinesInput(c)[1]).toEqual({ kind: 'gift_card_load', amount_cents: 2000 });
  });

  it('removes a line when its quantity hits zero', () => {
    const c = addProduct(emptyCart(), product())!;
    expect(setQty(c, c.lines[0].key, 0).lines).toHaveLength(0);
  });
});

describe('settling payment', () => {
  it('takes exact cash', () => {
    expect(settle(375, [], 375)).toMatchObject({ cashDue: 375, remaining: 0, change: 0, ready: true });
  });

  it('works out change from a $5 bill', () => {
    const s = settle(375, [], 500);
    expect(s.change).toBe(125);
    expect(s.payments).toEqual([{ method: 'cash', amount_cents: 375 }]);
  });

  it('splits a gift card and cash', () => {
    const s = settle(375, [{ key: 'a', method: 'gift_card', code: 'ABCDEFGHJK', amount_cents: 300 }], 100);
    expect(s).toMatchObject({ cards: 300, cashDue: 75, change: 25, ready: true });
    expect(s.payments).toEqual([
      { method: 'gift_card', code: 'ABCDEFGHJK', amount_cents: 300 },
      { method: 'cash', amount_cents: 75 },
    ]);
  });

  it('is not ready while money is still owed', () => {
    expect(settle(375, [], 200)).toMatchObject({ remaining: 175, ready: false });
  });
});
