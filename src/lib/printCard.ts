import QRCode from 'qrcode';
import { formatCode } from './giftcode';
import { formatCents } from './money';

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Opens a print-ready gift card (credit-card size, two per row) with the
// code as text and as a QR code the register can scan.
export async function printGiftCards(cards: Array<{ code: string; type: string; balance_cents?: number }>) {
  const items = await Promise.all(
    cards.map(async (c) => ({
      ...c,
      qr: await QRCode.toString(c.code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#17295a', light: '#ffffff' } }),
    })),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gift cards</title>
<style>
  @page { margin: 12mm; }
  body { font-family: 'Public Sans', system-ui, sans-serif; color: #121a2b; margin: 0; }
  .sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 8mm; }
  .card { width: 85.6mm; height: 54mm; border-radius: 4mm; border: 0.3mm solid #a8b3c5; overflow: hidden; display: grid; grid-template-rows: 9mm 1fr; break-inside: avoid; }
  .band { background: #17295a; color: #f4f6fb; border-bottom: 1mm solid #d99e1c; padding: 2mm 3.5mm; font-weight: 700; font-size: 9pt; letter-spacing: .04em; }
  .body { display: grid; grid-template-columns: 1fr 24mm; gap: 3mm; padding: 3mm 3.5mm; align-items: center; }
  .kind { font: 600 7pt ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #69758b; }
  .code { font: 600 14pt 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .06em; margin-top: 1mm; }
  .amt { font: 600 10pt ui-monospace, monospace; margin-top: 1.5mm; }
  .fine { font-size: 6pt; color: #465369; margin-top: 2mm; }
  svg { width: 24mm; height: 24mm; }
</style></head><body><div class="sheet">
${items
  .map(
    (c) => `<div class="card"><div class="band">CPPHS FBLA STORE</div><div class="body"><div>
  <div class="kind">${c.type === 'promo' ? 'Promo card' : 'Gift card'}</div>
  <div class="code">${escape(formatCode(c.code))}</div>
  ${c.balance_cents !== undefined ? `<div class="amt">${escape(formatCents(c.balance_cents))}</div>` : ''}
  <div class="fine">Not tied to a name. Does not expire. Ask at the store for your balance.</div>
</div>${c.qr}</div></div>`,
  )
  .join('')}
</div><script>window.onload = () => setTimeout(() => window.print(), 200)</script></body></html>`;
  const w = window.open('', '_blank', 'width=760,height=600');
  if (!w) throw new Error('Allow pop-ups to print gift cards.');
  w.document.write(html);
  w.document.close();
}
