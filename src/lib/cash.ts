// Drawer math for opening and closing a shift.

export type Denomination = { key: string; cents: number; label: string; kind: 'bill' | 'coin' };

export const DENOMINATIONS: Denomination[] = [
  { key: 'b100', cents: 10000, label: '$100', kind: 'bill' },
  { key: 'b50', cents: 5000, label: '$50', kind: 'bill' },
  { key: 'b20', cents: 2000, label: '$20', kind: 'bill' },
  { key: 'b10', cents: 1000, label: '$10', kind: 'bill' },
  { key: 'b5', cents: 500, label: '$5', kind: 'bill' },
  { key: 'b2', cents: 200, label: '$2', kind: 'bill' },
  { key: 'b1', cents: 100, label: '$1', kind: 'bill' },
  { key: 'c100', cents: 100, label: '$1 coin', kind: 'coin' },
  { key: 'c50', cents: 50, label: '50¢', kind: 'coin' },
  { key: 'c25', cents: 25, label: '25¢', kind: 'coin' },
  { key: 'c10', cents: 10, label: '10¢', kind: 'coin' },
  { key: 'c5', cents: 5, label: '5¢', kind: 'coin' },
  { key: 'c1', cents: 1, label: '1¢', kind: 'coin' },
];

export type Counts = Record<string, number>;

export function countTotal(counts: Counts): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d.cents * Math.max(0, Math.floor(counts[d.key] ?? 0)), 0);
}

// The shape close_shift and open_shift store: [{denom_cents, count}].
export function toBreakdown(counts: Counts): Array<{ denom_cents: number; count: number }> {
  return DENOMINATIONS.filter((d) => (counts[d.key] ?? 0) > 0).map((d) => ({
    denom_cents: d.cents,
    count: Math.floor(counts[d.key] ?? 0),
  }));
}

export function changeDue(tenderedCents: number, dueCents: number): number | null {
  if (tenderedCents < dueCents) return null;
  return tenderedCents - dueCents;
}

// Expected cash = opening + cash sales + cash gift card loads - cash refunds - handoffs.
export function expectedCash(parts: {
  opening: number;
  cashSales: number;
  cashLoads: number;
  cashRefunds: number;
  handoffs: number;
}): number {
  return parts.opening + parts.cashSales + parts.cashLoads - parts.cashRefunds - parts.handoffs;
}

export function overShort(counted: number, expected: number): number {
  return counted - expected;
}

export function needsApproval(overShortCents: number, toleranceCents: number): boolean {
  return Math.abs(overShortCents) > toleranceCents;
}

// Quick cash buttons: exact, then the next bills up.
export function quickTenders(dueCents: number): number[] {
  if (dueCents <= 0) return [];
  const options = new Set<number>([dueCents]);
  for (const bill of [100, 500, 1000, 2000, 5000]) {
    const rounded = Math.ceil(dueCents / bill) * bill;
    if (rounded > dueCents) options.add(rounded);
  }
  return [...options].sort((a, b) => a - b).slice(0, 4);
}
