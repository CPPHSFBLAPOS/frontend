// ROI on every pre-auth line, from the spec:
//   Units = packs x units per pack. Cost = packs x pack price.
//   Revenue = units x selling price. Profit = revenue - cost.
//   ROI = profit / cost. Margin = profit / revenue. Break-even = cost / revenue.
//   Weekly sales = last school year's units / weeks with at least one sale.
//   Weeks of supply = (on hand + new units) / weekly sales (warn above 10).
//   Suggest packs = (weekly sales x 6 weeks - on hand) / units per pack, rounded up.

export type RoiLine = { units_per_pack: number; packs: number; pack_price_cents: number; sell_price_cents: number };

export type Roi = {
  units: number;
  cost_cents: number;
  revenue_cents: number;
  profit_cents: number;
  roi: number | null;
  margin: number | null;
  break_even: number | null;
};

export const SLOW_WEEKS = 10;
export const TARGET_WEEKS = 6;

export function lineRoi(l: RoiLine): Roi {
  const units = l.packs * l.units_per_pack;
  const cost = l.packs * l.pack_price_cents;
  const revenue = units * l.sell_price_cents;
  const profit = revenue - cost;
  return {
    units,
    cost_cents: cost,
    revenue_cents: revenue,
    profit_cents: profit,
    roi: cost > 0 ? profit / cost : null,
    margin: revenue > 0 ? profit / revenue : null,
    break_even: revenue > 0 ? cost / revenue : null,
  };
}

export function totalRoi(lines: RoiLine[]): Roi {
  let units = 0;
  let cost = 0;
  let revenue = 0;
  for (const l of lines) {
    const r = lineRoi(l);
    units += r.units;
    cost += r.cost_cents;
    revenue += r.revenue_cents;
  }
  const profit = revenue - cost;
  return {
    units,
    cost_cents: cost,
    revenue_cents: revenue,
    profit_cents: profit,
    roi: cost > 0 ? profit / cost : null,
    margin: revenue > 0 ? profit / revenue : null,
    break_even: revenue > 0 ? cost / revenue : null,
  };
}

export function weeksOfSupply(onHand: number, newUnits: number, weeklySales: number): number | null {
  if (!(weeklySales > 0)) return null;
  return (Math.max(onHand, 0) + newUnits) / weeklySales;
}

export function suggestPacks(weeklySales: number, onHand: number, unitsPerPack: number, targetWeeks = TARGET_WEEKS): number | null {
  if (!(weeklySales > 0) || !(unitsPerPack > 0)) return null;
  const need = weeklySales * targetWeeks - Math.max(onHand, 0);
  return need <= 0 ? 0 : Math.ceil(need / unitsPerPack);
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
