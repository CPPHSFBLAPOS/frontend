// Money is whole cents everywhere. Components never do math on dollars:
// they show cents through formatCents and read input through parseDollars.

export function formatCents(cents: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  const n = Math.round(cents);
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const body = `$${dollars}.${String(abs % 100).padStart(2, '0')}`;
  if (n < 0) return `-${body}`;
  return opts.sign && n > 0 ? `+${body}` : body;
}

// "12.5" -> 1250, "$1,299.99" -> 129999. Returns null for anything that is
// not a plain amount. Never goes through a float.
export function parseDollars(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim().replace(/[$,\s]/g, '');
  if (text === '' || !/^-?\d*(\.\d*)?$/.test(text) || text === '.' || text === '-') return null;
  const negative = text.startsWith('-');
  const [whole = '', frac = ''] = text.replace('-', '').split('.');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

// For prefilling an input: 1250 -> "12.50".
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((a, v) => a + (v ?? 0), 0);
}
