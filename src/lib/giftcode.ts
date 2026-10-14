// Gift card codes: 10 characters without 0, O, 1 or I. The database makes
// them; the app only cleans up what people type or scan.

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID = /^[A-HJ-NP-Z2-9]{10}$/;

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(input: string): boolean {
  return VALID.test(normalizeCode(input));
}

// "ABCDEFGHJK" -> "ABCDE-FGHJK", easier to read aloud.
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}
