// The store runs on America/New_York dates. The school year is
// September 1 to June 30.

const TZ = 'America/New_York';

export function localISODate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

export function schoolYear(today: string = localISODate()): { from: string; to: string; label: string } {
  const [y, m] = today.split('-').map(Number);
  const start = m >= 9 ? y : y - 1;
  return { from: `${start}-09-01`, to: `${start + 1}-06-30`, label: `${start}–${String(start + 1).slice(2)}` };
}

export function monthRange(yyyyMm: string): { from: string; to: string } {
  const [y, m] = yyyyMm.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${yyyyMm}-01`, to: `${yyyyMm}-${String(last).padStart(2, '0')}` };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000);
}

export function formatDate(iso: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: iso.length === 10 ? 'UTC' : TZ,
    month: 'short',
    day: 'numeric',
    year: style === 'long' ? 'numeric' : undefined,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

// Weekdays between two dates, minus any skipped dates: the planned open days.
export function weekdaysBetween(from: string, to: string, weekdays: number[], skip: string[] = []): string[] {
  const out: string[] = [];
  const skipSet = new Set(skip);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (weekdays.includes(dow) && !skipSet.has(d)) out.push(d);
  }
  return out;
}
