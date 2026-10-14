import type { DraftLine, PreauthForm } from '../../api/preauth';
import type { Preauth, PreauthStatus, Purpose } from '../../api/types';

export const PURPOSES: Array<{ id: Purpose; label: string }> = [
  { id: 'competition', label: 'Competition' },
  { id: 'event', label: 'Event' },
  { id: 'fundraiser', label: 'Fundraiser' },
  { id: 'supplies', label: 'Supplies' },
  { id: 'other', label: 'Other' },
];

export const STATUS_LABEL: Record<PreauthStatus, string> = {
  draft: 'Draft',
  awaiting_advisor: 'Waiting for Advisor',
  approved: 'Approved',
  purchased: 'Purchased',
  received: 'Received',
  closed: 'Closed',
  rejected: 'Sent back',
};

export const STATUS_TONE: Record<PreauthStatus, 'neutral' | 'gold' | 'good' | 'warn' | 'navy' | 'bad'> = {
  draft: 'neutral',
  awaiting_advisor: 'gold',
  approved: 'good',
  purchased: 'warn',
  received: 'good',
  closed: 'navy',
  rejected: 'bad',
};

export const emptyForm = (): PreauthForm => ({
  vendor: "Sam's Club",
  website: 'https://www.samsclub.com',
  purposes: [],
  purpose_other: '',
  justification: '',
  shipping_cents: 0,
  notes: '',
});

export function formFrom(p: Preauth): PreauthForm {
  return {
    vendor: p.vendor,
    website: p.website ?? '',
    purposes: p.purposes,
    purpose_other: p.purpose_other ?? '',
    justification: p.justification ?? '',
    shipping_cents: p.shipping_cents,
    notes: p.notes ?? '',
  };
}

export function linesFrom(p: Preauth): DraftLine[] {
  return p.lines.map((l) => ({
    key: l.id,
    vendor_item_id: l.vendor_item_id,
    product_id: l.product_id,
    new_name: l.new_name,
    item_number: l.item_number,
    url: l.url,
    units_per_pack: l.units_per_pack,
    packs: l.packs,
    est_pack_price_cents: l.est_pack_price_cents,
    sell_price_cents: l.sell_price_cents,
    label: l.product_name ?? l.new_name ?? 'Item',
  }));
}

export function linesTotal(lines: DraftLine[]) {
  return lines.reduce((s, l) => s + l.packs * l.est_pack_price_cents, 0);
}

// What still stops the student from signing.
export function problems(form: PreauthForm, lines: DraftLine[], limit: number): string[] {
  const p: string[] = [];
  if (form.purposes.length === 0) p.push('Check at least one purpose');
  if (form.purposes.includes('other') && !form.purpose_other.trim()) p.push('Describe the Other purpose');
  if (!form.justification.trim()) p.push('Write a justification');
  if (lines.length === 0) p.push('Add at least one item');
  if (lines.some((l) => !(l.est_pack_price_cents > 0))) p.push('Every item needs a pack price');
  if (lines.some((l) => !(l.sell_price_cents >= 0) || !(l.units_per_pack > 0) || !(l.packs > 0))) p.push('Check pack sizes and quantities');
  const grand = linesTotal(lines) + form.shipping_cents;
  if (grand > limit) p.push('Bring the grand total under the limit');
  return p;
}

export function snapshot(form: PreauthForm, lines: DraftLine[]) {
  return JSON.stringify({ form, lines: lines.map(({ key: _k, label: _l, ...rest }) => rest) });
}
