import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import type { ReportDocument, KpiRow } from './reportBuilders.ts';

import { NOTO_SANS_HEBREW_B64 } from './hebrewFontB64.ts';

// Module-level cache: reused across requests within same Deno instance
let _fontCache: ArrayBuffer | null = null;

function loadHebrewFont(): ArrayBuffer {
  if (_fontCache) return _fontCache;
  const binary = atob(NOTO_SANS_HEBREW_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  _fontCache = bytes.buffer as ArrayBuffer;
  return _fontCache;
}

// Hebrew text is stored in logical (RTL) Unicode order.
// Modern PDF viewers (Chrome, Firefox, Preview, Adobe Reader) apply the
// Unicode Bidirectional Algorithm automatically, so we must NOT reverse
// Hebrew strings — doing so causes double-reversal and backwards text.
// We only need to position text right-aligned, which the RTL draw
// functions already handle via (rightEdge - textWidth).

// Wrap text into lines fitting maxWidth. Wraps at character level (handles long words).
function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

  const lines: string[] = [];
  let current = '';
  for (const char of [...text]) {
    const test = current + char;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

// Layout constants (PDF points: 1pt = 1/72 inch)
const LANDSCAPE_W = 842;
const LANDSCAPE_H = 595;
const PORTRAIT_W  = 595;
const PORTRAIT_H  = 842;
const MARGIN      = 40;
const TITLE_SIZE  = 14;
const LABEL_SIZE  = 10;
const CELL_SIZE   = 9;
const LINE_H      = 13;
const ROW_PAD     = 6;
const HEADER_H    = 22;
const CELL_PAD    = 4;

const COLOR_BLACK  = rgb(0,    0,    0);
const COLOR_HEADER = rgb(0.15, 0.15, 0.20);
const COLOR_WHITE  = rgb(1,    1,    1);
const COLOR_GRAY   = rgb(0.45, 0.45, 0.45);
const COLOR_ALT    = rgb(0.96, 0.96, 0.97);

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR_BLACK,
) {
  page.drawText(text, { x, y, size, font, color });
}

function fillRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x, y, width, height, color, borderWidth: 0 });
}

function calcColWidths(colCount: number, tableWidth: number): number[] {
  const w = Math.floor(tableWidth / colCount);
  return Array(colCount).fill(w);
}

// ─── RTL (Hebrew) table drawing ──────────────────────────────────────────────

function drawTableHeaderRTL(
  page: PDFPage,
  columns: string[],
  colWidths: number[],
  rightEdge: number,
  y: number,
  font: PDFFont,
) {
  const totalW   = colWidths.reduce((a, b) => a + b, 0);
  const leftEdge = rightEdge - totalW;
  fillRect(page, leftEdge, y - HEADER_H + 4, totalW, HEADER_H, COLOR_HEADER);

  let cx = rightEdge;
  for (let i = 0; i < columns.length; i++) {
    cx -= colWidths[i];
    const text  = columns[i];
    const textW = font.widthOfTextAtSize(text, LABEL_SIZE);
    drawText(page, text, cx + colWidths[i] - CELL_PAD - textW, y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  }
}

interface DrawCtx {
  pages:      PDFPage[];
  font:       PDFFont;
  pageWidth:  number;
  pageHeight: number;
  addPage:    () => PDFPage;
}

function drawTableRowsRTL(
  ctx: DrawCtx,
  rows: string[][],
  colWidths: number[],
  rightEdge: number,
  startY: number,
  columns: string[],
) {
  let page = ctx.pages[ctx.pages.length - 1];
  let y = startY - HEADER_H;
  const totalW   = colWidths.reduce((a, b) => a + b, 0);
  const leftEdge = rightEdge - totalW;

  for (let ri = 0; ri < rows.length; ri++) {
    const cellLines: string[][] = rows[ri].map((cell, ci) =>
      wrapText(String(cell ?? '—'), colWidths[ci] - CELL_PAD * 2, ctx.font, CELL_SIZE),
    );
    const maxLines = Math.max(...cellLines.map((l) => l.length));
    const rowH     = maxLines * LINE_H + ROW_PAD;

    if (y - rowH < MARGIN) {
      page = ctx.addPage();
      y = ctx.pageHeight - MARGIN - HEADER_H;
      drawTableHeaderRTL(page, columns, colWidths, rightEdge, ctx.pageHeight - MARGIN, ctx.font);
    }

    if (ri % 2 === 1) fillRect(page, leftEdge, y - rowH, totalW, rowH, COLOR_ALT);

    let cx = rightEdge;
    for (let ci = 0; ci < cellLines.length; ci++) {
      cx -= colWidths[ci];
      const cellRight = cx + colWidths[ci];
      for (let li = 0; li < cellLines[ci].length; li++) {
        const textW = ctx.font.widthOfTextAtSize(cellLines[ci][li], CELL_SIZE);
        drawText(page, cellLines[ci][li], cellRight - CELL_PAD - textW, y - ROW_PAD / 2 - (li + 1) * LINE_H + 4, ctx.font, CELL_SIZE);
      }
    }
    y -= rowH;
  }
}

function drawKpisRTL(
  page: PDFPage,
  kpis: KpiRow[],
  rightEdge: number,
  startY: number,
  font: PDFFont,
): number {
  const labelW = 220;
  const valueW = 140;
  let y = startY;
  const leftEdge = rightEdge - labelW - valueW;
  const rowH = LINE_H + ROW_PAD;

  fillRect(page, leftEdge, y - HEADER_H + 4, labelW + valueW, HEADER_H, COLOR_HEADER);
  const indText    = 'מדד';
  const valueText  = 'ערך';
  drawText(page, indText,   rightEdge - CELL_PAD - font.widthOfTextAtSize(indText, LABEL_SIZE),                y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  drawText(page, valueText, rightEdge - labelW - CELL_PAD - font.widthOfTextAtSize(valueText, LABEL_SIZE),     y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  y -= HEADER_H;

  for (let i = 0; i < kpis.length; i++) {
    if (i % 2 === 1) fillRect(page, leftEdge, y - rowH, labelW + valueW, rowH, COLOR_ALT);
    const labelText = kpis[i].label;
    drawText(page, labelText,      rightEdge - CELL_PAD - font.widthOfTextAtSize(labelText, CELL_SIZE),               y - rowH + ROW_PAD / 2, font, CELL_SIZE);
    drawText(page, kpis[i].value,  rightEdge - labelW - CELL_PAD - font.widthOfTextAtSize(kpis[i].value, CELL_SIZE),  y - rowH + ROW_PAD / 2, font, CELL_SIZE);
    y -= rowH;
  }
  return y;
}

// ─── LTR (English) table drawing ─────────────────────────────────────────────

function drawTableHeaderLTR(
  page: PDFPage,
  columns: string[],
  colWidths: number[],
  leftEdge: number,
  y: number,
  font: PDFFont,
) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  fillRect(page, leftEdge, y - HEADER_H + 4, totalW, HEADER_H, COLOR_HEADER);

  let cx = leftEdge;
  for (let i = 0; i < columns.length; i++) {
    drawText(page, columns[i], cx + CELL_PAD, y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
    cx += colWidths[i];
  }
}

function drawTableRowsLTR(
  ctx: DrawCtx,
  rows: string[][],
  colWidths: number[],
  leftEdge: number,
  startY: number,
  columns: string[],
) {
  let page = ctx.pages[ctx.pages.length - 1];
  let y = startY - HEADER_H;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  for (let ri = 0; ri < rows.length; ri++) {
    const cellLines: string[][] = rows[ri].map((cell, ci) =>
      wrapText(String(cell ?? '—'), colWidths[ci] - CELL_PAD * 2, ctx.font, CELL_SIZE),
    );
    const maxLines = Math.max(...cellLines.map((l) => l.length));
    const rowH     = maxLines * LINE_H + ROW_PAD;

    if (y - rowH < MARGIN) {
      page = ctx.addPage();
      y = ctx.pageHeight - MARGIN - HEADER_H;
      drawTableHeaderLTR(page, columns, colWidths, leftEdge, ctx.pageHeight - MARGIN, ctx.font);
    }

    if (ri % 2 === 1) fillRect(page, leftEdge, y - rowH, totalW, rowH, COLOR_ALT);

    let cx = leftEdge;
    for (let ci = 0; ci < cellLines.length; ci++) {
      for (let li = 0; li < cellLines[ci].length; li++) {
        drawText(page, cellLines[ci][li], cx + CELL_PAD, y - ROW_PAD / 2 - (li + 1) * LINE_H + 4, ctx.font, CELL_SIZE);
      }
      cx += colWidths[ci];
    }
    y -= rowH;
  }
}

function drawKpisLTR(
  page: PDFPage,
  kpis: KpiRow[],
  leftEdge: number,
  startY: number,
  font: PDFFont,
): number {
  const labelW = 220;
  const valueW = 140;
  let y = startY;
  const rowH = LINE_H + ROW_PAD;

  fillRect(page, leftEdge, y - HEADER_H + 4, labelW + valueW, HEADER_H, COLOR_HEADER);
  drawText(page, 'Indicator', leftEdge + CELL_PAD,           y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  drawText(page, 'Value',     leftEdge + labelW + CELL_PAD,  y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  y -= HEADER_H;

  for (let i = 0; i < kpis.length; i++) {
    if (i % 2 === 1) fillRect(page, leftEdge, y - rowH, labelW + valueW, rowH, COLOR_ALT);
    drawText(page, kpis[i].label, leftEdge + CELL_PAD,          y - rowH + ROW_PAD / 2, font, CELL_SIZE);
    drawText(page, kpis[i].value, leftEdge + labelW + CELL_PAD, y - rowH + ROW_PAD / 2, font, CELL_SIZE);
    y -= rowH;
  }
  return y;
}

// ─── Main render ─────────────────────────────────────────────────────────────

export async function renderTablePdf(doc: ReportDocument): Promise<Uint8Array> {
  const isLandscape = doc.type === 'bets_log';
  const pageWidth   = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const pageHeight  = isLandscape ? LANDSCAPE_H : PORTRAIT_H;
  const isRTL       = doc.locale === 'he';

  const pdfDoc = await PDFDocument.create();
  // deno-lint-ignore no-explicit-any
  pdfDoc.registerFontkit(fontkit as any);

  const fontBytes = loadHebrewFont();
  const font      = await pdfDoc.embedFont(fontBytes);

  const pages: PDFPage[] = [];
  function addPage(): PDFPage {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    pages.push(page);
    return page;
  }

  const firstPage  = addPage();
  const tableWidth = pageWidth - MARGIN * 2;
  const rightEdge  = pageWidth - MARGIN;
  const leftEdge   = MARGIN;
  let y = pageHeight - MARGIN;

  const ctx: DrawCtx = { pages, font, pageWidth, pageHeight, addPage };

  if (isRTL) {
    // Title – right-aligned
    const titleText = doc.title;
    const titleW    = font.widthOfTextAtSize(titleText, TITLE_SIZE);
    drawText(firstPage, titleText, rightEdge - titleW, y, font, TITLE_SIZE);
    y -= 22;

    // Period
    const periodLabel  = 'תקופה' + ':';
    const periodLabelW = font.widthOfTextAtSize(periodLabel, LABEL_SIZE);
    const periodValue  = ` ${doc.period}`;
    const periodValueW = font.widthOfTextAtSize(periodValue, LABEL_SIZE);
    drawText(firstPage, periodLabel, rightEdge - periodLabelW, y, font, LABEL_SIZE, COLOR_GRAY);
    drawText(firstPage, periodValue, rightEdge - periodLabelW - periodValueW, y, font, LABEL_SIZE, COLOR_GRAY);
    y -= 20;

    // Generated at
    const genLabel  = 'נוצר' + ':';
    const genLabelW = font.widthOfTextAtSize(genLabel, CELL_SIZE);
    const genValue  = ` ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
    const genValueW = font.widthOfTextAtSize(genValue, CELL_SIZE);
    drawText(firstPage, genLabel, rightEdge - genLabelW, y, font, CELL_SIZE, COLOR_GRAY);
    drawText(firstPage, genValue, rightEdge - genLabelW - genValueW, y, font, CELL_SIZE, COLOR_GRAY);
    y -= 28;

    if (doc.kpis && doc.kpis.length > 0) {
      y = drawKpisRTL(firstPage, doc.kpis, rightEdge, y, font);
      y -= 24;
    }

    if (doc.table) {
      const { columns, rows } = doc.table;
      const colWidths = calcColWidths(columns.length, tableWidth);
      drawTableHeaderRTL(firstPage, columns, colWidths, rightEdge, y, font);
      drawTableRowsRTL(ctx, rows, colWidths, rightEdge, y, columns);
    }
  } else {
    // Title – left-aligned
    drawText(firstPage, doc.title, leftEdge, y, font, TITLE_SIZE);
    y -= 22;

    // Period
    drawText(firstPage, `Period: ${doc.period}`, leftEdge, y, font, LABEL_SIZE, COLOR_GRAY);
    y -= 20;

    // Generated at
    drawText(firstPage, `Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`, leftEdge, y, font, CELL_SIZE, COLOR_GRAY);
    y -= 28;

    if (doc.kpis && doc.kpis.length > 0) {
      y = drawKpisLTR(firstPage, doc.kpis, leftEdge, y, font);
      y -= 24;
    }

    if (doc.table) {
      const { columns, rows } = doc.table;
      const colWidths = calcColWidths(columns.length, tableWidth);
      drawTableHeaderLTR(firstPage, columns, colWidths, leftEdge, y, font);
      drawTableRowsLTR(ctx, rows, colWidths, leftEdge, y, columns);
    }
  }

  return pdfDoc.save();
}
