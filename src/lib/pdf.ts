// PDFs made in the browser with pdf-lib: the shift closeout, the outage
// tally sheet, the Monthly Treasurer Report and the year-end report.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatCents } from './money';

const INK = rgb(0.07, 0.1, 0.17);
const MUTED = rgb(0.41, 0.46, 0.55);
const RULE = rgb(0.84, 0.86, 0.9);
const NAVY = rgb(0.12, 0.25, 0.56);
const GOLD = rgb(0.85, 0.62, 0.11);
const BAND = rgb(0.09, 0.16, 0.35);

export function safe(text: unknown): string {
  return String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

export type Cell = string | number | null | undefined;
export type TableCol = { label: string; width: number; align?: 'left' | 'right' };

export class Doc {
  doc!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;
  readonly left = 48;
  readonly right = 564;
  private title = '';

  static async create(title: string, subtitle: string) {
    const d = new Doc();
    d.doc = await PDFDocument.create();
    d.doc.setTitle(title);
    d.doc.setAuthor('CPPHS FBLA Store');
    d.font = await d.doc.embedFont(StandardFonts.Helvetica);
    d.bold = await d.doc.embedFont(StandardFonts.HelveticaBold);
    d.title = title;
    d.newPage(subtitle);
    return d;
  }

  newPage(subtitle?: string) {
    this.page = this.doc.addPage([612, 792]);
    this.page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: BAND });
    this.page.drawRectangle({ x: 0, y: 749, width: 612, height: 3, color: GOLD });
    this.page.drawText('CPPHS FBLA Store', { x: this.left, y: 766, size: 12, font: this.bold, color: rgb(0.96, 0.97, 0.98) });
    this.y = 718;
    this.text(this.title, 20, this.bold);
    if (subtitle) {
      this.y -= 4;
      this.text(subtitle, 10, this.font, MUTED);
    }
    this.y -= 8;
  }

  ensure(space: number) {
    if (this.y - space < 48) this.newPage();
  }

  text(t: string, size = 10, f: PDFFont = this.font, color = INK, x = this.left) {
    this.ensure(size + 4);
    this.page.drawText(safe(t), { x, y: this.y - size, size, font: f, color });
    this.y -= size + 5;
  }

  heading(t: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawText(safe(t.toUpperCase()), { x: this.left, y: this.y - 11, size: 10, font: this.bold, color: NAVY });
    this.y -= 15;
    this.page.drawLine({ start: { x: this.left, y: this.y }, end: { x: this.right, y: this.y }, thickness: 1.5, color: INK });
    this.y -= 8;
  }

  kv(rows: Array<[string, string]>, cols = 2) {
    const w = (this.right - this.left) / cols;
    for (let i = 0; i < rows.length; i += cols) {
      this.ensure(30);
      rows.slice(i, i + cols).forEach(([k, v], j) => {
        const x = this.left + j * w;
        this.page.drawText(safe(k), { x, y: this.y - 8, size: 8, font: this.font, color: MUTED });
        this.page.drawText(safe(v), { x, y: this.y - 22, size: 12, font: this.bold, color: INK });
      });
      this.y -= 32;
    }
  }

  table(cols: TableCol[], rows: Cell[][], opts: { size?: number; totals?: Cell[] } = {}) {
    const size = opts.size ?? 8.5;
    const drawRow = (cells: Cell[], f: PDFFont, color = INK) => {
      this.ensure(size + 8);
      let x = this.left;
      cells.forEach((c, i) => {
        const col = cols[i];
        let t = safe(c ?? '');
        while (t.length > 1 && f.widthOfTextAtSize(t, size) > col.width - 6) t = t.slice(0, -1);
        const tx = col.align === 'right' ? x + col.width - 6 - f.widthOfTextAtSize(t, size) : x;
        this.page.drawText(t, { x: tx, y: this.y - size, size, font: f, color });
        x += col.width;
      });
      this.y -= size + 6;
    };
    drawRow(cols.map((c) => c.label), this.bold, MUTED);
    this.page.drawLine({ start: { x: this.left, y: this.y + 2 }, end: { x: this.right, y: this.y + 2 }, thickness: 0.5, color: RULE });
    for (const r of rows) drawRow(r, this.font);
    if (opts.totals) {
      this.page.drawLine({ start: { x: this.left, y: this.y + 2 }, end: { x: this.right, y: this.y + 2 }, thickness: 0.75, color: INK });
      drawRow(opts.totals, this.bold);
    }
    this.y -= 4;
  }

  box(height: number, label: string) {
    this.ensure(height + 16);
    this.page.drawRectangle({ x: this.left, y: this.y - height, width: this.right - this.left, height, borderColor: RULE, borderWidth: 0.75 });
    this.page.drawText(safe(label), { x: this.left + 6, y: this.y - 12, size: 8, font: this.font, color: MUTED });
    this.y -= height + 10;
  }

  async bytes() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) =>
      p.drawText(`Page ${i + 1} of ${pages.length}  -  printed ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`, {
        x: this.left,
        y: 28,
        size: 7,
        font: this.font,
        color: MUTED,
      }),
    );
    return this.doc.save();
  }

  async blob() {
    return new Blob([(await this.bytes()) as BlobPart], { type: 'application/pdf' });
  }
}

export const money = (c: number | null | undefined) => formatCents(c);
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(1)}%`);
