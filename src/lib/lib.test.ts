import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeDue, countTotal, expectedCash, needsApproval, overShort, quickTenders, toBreakdown } from './cash';
import { mapBase44Product, mapBase44Sale, parseCsv, toCsv } from './csv';
import { addDays, daysBetween, monthRange, schoolYear, weekdaysBetween } from './dates';
import { formatCode, isValidCode, normalizeCode } from './giftcode';
import { centsToInput, formatCents, parseDollars } from './money';
import { NetworkError, enqueueSale, flushQueue, queuedSales, removeSale } from './offline';
import { lineRoi, percent, suggestPacks, totalRoi, weeksOfSupply } from './roi';
import { createScanDetector } from './scanner';

describe('money', () => {
  it('formats cents', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-200)).toBe('-$2.00');
    expect(formatCents(300, { sign: true })).toBe('+$3.00');
    expect(formatCents(null)).toBe('—');
  });

  it('parses what people type without floats', () => {
    expect(parseDollars('12.5')).toBe(1250);
    expect(parseDollars('$1,299.99')).toBe(129999);
    expect(parseDollars('.75')).toBe(75);
    expect(parseDollars('3')).toBe(300);
    expect(parseDollars('0.105')).toBe(11);
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('')).toBeNull();
    expect(parseDollars('1.2.3')).toBeNull();
  });

  it('round-trips through an input', () => {
    for (const c of [0, 5, 99, 100, 1250, 129999]) expect(parseDollars(centsToInput(c))).toBe(c);
  });
});

describe('cash', () => {
  it('totals a drawer count', () => {
    const counts = { b20: 2, b1: 3, c100: 1, c25: 4, c1: 7 };
    expect(countTotal(counts)).toBe(4000 + 300 + 100 + 100 + 7);
    expect(toBreakdown(counts)).toEqual([
      { denom_cents: 2000, count: 2 },
      { denom_cents: 100, count: 3 },
      { denom_cents: 100, count: 1 },
      { denom_cents: 25, count: 4 },
      { denom_cents: 1, count: 7 },
    ]);
  });

  it('works out change due', () => {
    expect(changeDue(500, 175)).toBe(325);
    expect(changeDue(175, 175)).toBe(0);
    expect(changeDue(100, 175)).toBeNull();
  });

  it('follows the expected cash formula and over/short', () => {
    const expected = expectedCash({ opening: 5000, cashSales: 500, cashLoads: 1000, cashRefunds: 100, handoffs: 1000 });
    expect(expected).toBe(5400);
    expect(overShort(5400, expected)).toBe(0);
    expect(overShort(5200, expected)).toBe(-200);
    expect(needsApproval(-200, 100)).toBe(true);
    expect(needsApproval(100, 100)).toBe(false);
  });

  it('offers sensible quick tenders', () => {
    expect(quickTenders(175)).toEqual([175, 200, 500, 1000]);
    expect(quickTenders(0)).toEqual([]);
  });
});

describe('ROI', () => {
  it('matches the spec formulas', () => {
    const r = lineRoi({ units_per_pack: 24, packs: 2, pack_price_cents: 600, sell_price_cents: 100 });
    expect(r).toEqual({ units: 48, cost_cents: 1200, revenue_cents: 4800, profit_cents: 3600, roi: 3, margin: 0.75, break_even: 0.25 });
    expect(percent(r.break_even)).toBe('25%');
    expect(totalRoi([]).roi).toBeNull();
  });

  it('suggests packs for about 6 weeks of sales', () => {
    // 10 a week, 12 on hand: need 60 - 12 = 48 units = 2 packs of 24.
    expect(suggestPacks(10, 12, 24)).toBe(2);
    expect(suggestPacks(10, 100, 24)).toBe(0);
    expect(suggestPacks(0, 0, 24)).toBeNull();
  });

  it('works out weeks of supply', () => {
    expect(weeksOfSupply(12, 48, 6)).toBe(10);
    expect(weeksOfSupply(0, 48, 0)).toBeNull();
  });
});

describe('gift card codes', () => {
  it('cleans up typed codes', () => {
    expect(normalizeCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(isValidCode('abcde-fghjk')).toBe(true);
    expect(isValidCode('ABCDEFGHI0')).toBe(false); // I and 0 are never used
    expect(formatCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
  });
});

describe('scanner', () => {
  it('catches a fast burst ending in Enter', () => {
    const onScan = vi.fn();
    const d = createScanDetector({ onScan });
    let t = 1000;
    for (const ch of '012345678905') d.key(ch, (t += 8));
    expect(d.key('Enter', t + 8)).toBe(true);
    expect(onScan).toHaveBeenCalledWith('012345678905');
  });

  it('ignores normal typing', () => {
    const onScan = vi.fn();
    const d = createScanDetector({ onScan });
    let t = 0;
    for (const ch of 'water') d.key(ch, (t += 180));
    expect(d.key('Enter', t + 150)).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
  });
});

describe('dates', () => {
  it('knows the school year', () => {
    expect(schoolYear('2026-10-14')).toEqual({ from: '2026-09-01', to: '2027-06-30', label: '2026–27' });
    expect(schoolYear('2027-03-02').from).toBe('2026-09-01');
    expect(schoolYear('2027-09-01').from).toBe('2027-09-01');
  });

  it('does date math on calendar days', () => {
    expect(addDays('2026-10-30', 5)).toBe('2026-11-04');
    expect(daysBetween('2026-10-01', '2026-10-06')).toBe(5);
    expect(monthRange('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });

  it('lists planned open days', () => {
    expect(weekdaysBetween('2026-10-12', '2026-10-18', [1, 2, 3, 4, 5], ['2026-10-14'])).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-15',
      '2026-10-16',
    ]);
  });
});

describe('CSV', () => {
  it('parses and writes CSV', () => {
    const rows = parseCsv('Name,Price\r\n"Chips, Nacho",1.00\r\n');
    expect(rows).toEqual([{ name: 'Chips, Nacho', price: '1.00' }]);
    expect(toCsv([{ a: 'x,y', b: 'say "hi"' }])).toBe('a,b\r\n"x,y","say ""hi"""\r\n');
  });

  it('maps Base44 rows', () => {
    expect(mapBase44Product({ name: 'Water', price: '1.00', cost: '0.25', stock: '48' })).toMatchObject({
      price_cents: 100,
      cost_cents: 25,
      stock: 48,
    });
    const s = mapBase44Sale({ date: '2025-10-01', product: 'Water', qty: '2', price: '1', customer: 'A Person' }, 0);
    expect(s.total_cents).toBe(200);
    expect(s.note).toBe('Old customer field: A Person');
  });
});

describe('offline queue', () => {
  beforeEach(async () => {
    for (const s of await queuedSales()) await removeSale(s.client_uuid);
  });

  const sale = (id: string, at: string) => ({
    client_uuid: id,
    queued_at: at,
    payload: { p_client_uuid: id },
    summary: { total_cents: 100, items: 1 },
  });

  it('sends queued sales oldest first and keeps them while offline', async () => {
    await enqueueSale(sale('b', '2026-10-14T10:01:00Z'));
    await enqueueSale(sale('a', '2026-10-14T10:00:00Z'));
    const sent: string[] = [];
    const offline = await flushQueue(async () => {
      throw new NetworkError('offline');
    });
    expect(offline).toEqual({ sent: 0, failed: 0, waiting: 2 });

    const online = await flushQueue(async (p) => {
      sent.push(String(p.p_client_uuid));
    });
    expect(sent).toEqual(['a', 'b']);
    expect(online).toEqual({ sent: 2, failed: 0, waiting: 0 });
  });

  it('keeps a sale the server rejects, with its error', async () => {
    await enqueueSale(sale('c', '2026-10-14T10:00:00Z'));
    const result = await flushQueue(async () => {
      throw new Error('Water is out of stock (0 left).');
    });
    expect(result.failed).toBe(1);
    expect((await queuedSales())[0].error).toMatch(/out of stock/);
  });
});
