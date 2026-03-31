import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import type { ReportDocument, KpiRow } from './reportBuilders.ts';

// NotoSansHebrew Regular TTF — supports Hebrew Unicode glyphs
const HEBREW_FONT_URL =
  'https://github.com/google/fonts/raw/main/ofl/notosanshebrew/static/NotoSansHebrew-Regular.ttf';

// Module-level cache: reused across requests within same Deno instance
let _fontCache: ArrayBuffer | null = null;

async function loadHebrewFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;
  const res = await fetch(HEBREW_FONT_URL);
  if (!res.ok) throw new Error(`Failed to fetch Hebrew font: HTTP ${res.status}`);
  _fontCache = await res.arrayBuffer();
  return _fontCache;
}

// Hebrew Unicode strings are in logical (RTL) order.
// Reverse characters so they render correctly when drawn LTR by pdf-lib.
function reverseForPdf(text: string): string {
  return [...text].reverse().join('');
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
const ROW_H       = 18;
const HEADER_H    = 22;

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

function drawTableHeader(
  page: PDFPage,
  columns: string[],
  colWidths: number[],
  x: number,
  y: number,
  font: PDFFont,
) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  fillRect(page, x, y - HEADER_H + 4, totalW, HEADER_H, COLOR_HEADER);
  let cx = x;
  for (let i = 0; i < columns.length; i++) {
    drawText(page, columns[i], cx + 4, y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
    cx += colWidths[i];
  }
}

interface DrawCtx {
  pages:      PDFPage[];
  font:       PDFFont;
  pageWidth:  number;
  pageHeight: number;
  addPage:    () => PDFPage;
}

function drawTableRows(
  ctx: DrawCtx,
  rows: string[][],
  colWidths: number[],
  startX: number,
  startY: number,
  columns: string[],
) {
  let page = ctx.pages[ctx.pages.length - 1];
  let y = startY - HEADER_H;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  for (let ri = 0; ri < rows.length; ri++) {
    if (y < MARGIN + ROW_H) {
      page = ctx.addPage();
      y = ctx.pageHeight - MARGIN - HEADER_H;
      drawTableHeader(page, columns, colWidths, startX, ctx.pageHeight - MARGIN, ctx.font);
    }

    if (ri % 2 === 1) {
      fillRect(page, startX, y - ROW_H + 4, totalW, ROW_H, COLOR_ALT);
    }

    let cx = startX;
    for (let ci = 0; ci < rows[ri].length; ci++) {
      drawText(page, String(rows[ri][ci] ?? '—'), cx + 4, y - ROW_H + 6, ctx.font, CELL_SIZE);
      cx += colWidths[ci];
    }
    y -= ROW_H;
  }
}

function drawKpis(
  page: PDFPage,
  kpis: KpiRow[],
  x: number,
  startY: number,
  font: PDFFont,
): number {
  const labelW = 220;
  const valueW = 140;
  let y = startY;

  fillRect(page, x, y - HEADER_H + 4, labelW + valueW, HEADER_H, COLOR_HEADER);
  drawText(page, 'Indicator', x + 4,          y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  drawText(page, 'Value',     x + labelW + 4, y - HEADER_H + 8, font, LABEL_SIZE, COLOR_WHITE);
  y -= HEADER_H;

  for (let i = 0; i < kpis.length; i++) {
    if (i % 2 === 1) fillRect(page, x, y - ROW_H + 4, labelW + valueW, ROW_H, COLOR_ALT);
    drawText(page, reverseForPdf(kpis[i].label), x + 4,          y - ROW_H + 6, font, CELL_SIZE);
    drawText(page, kpis[i].value,                x + labelW + 4, y - ROW_H + 6, font, CELL_SIZE);
    y -= ROW_H;
  }

  return y;
}

export async function renderTablePdf(doc: ReportDocument): Promise<Uint8Array> {
  const isLandscape = doc.type === 'bets_log';
  const pageWidth   = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const pageHeight  = isLandscape ? LANDSCAPE_H : PORTRAIT_H;

  const pdfDoc = await PDFDocument.create();
  // deno-lint-ignore no-explicit-any
  pdfDoc.registerFontkit(fontkit as any);

  const fontBytes = await loadHebrewFont();
  const font      = await pdfDoc.embedFont(fontBytes);

  const pages: PDFPage[] = [];
  function addPage(): PDFPage {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    pages.push(page);
    return page;
  }

  const firstPage = addPage();
  const tableWidth = pageWidth - MARGIN * 2;
  let y = pageHeight - MARGIN;

  // Title (Hebrew reversed for LTR rendering)
  drawText(firstPage, reverseForPdf(doc.title), MARGIN, y, font, TITLE_SIZE);
  y -= 22;

  // Period
  drawText(firstPage, `Period: ${doc.period}`, MARGIN, y, font, LABEL_SIZE, COLOR_GRAY);
  y -= 20;

  // Generated at
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  drawText(firstPage, `Generated: ${generatedAt}`, MARGIN, y, font, CELL_SIZE, COLOR_GRAY);
  y -= 28;

  const ctx: DrawCtx = { pages, font, pageWidth, pageHeight, addPage };

  if (doc.kpis && doc.kpis.length > 0) {
    y = drawKpis(firstPage, doc.kpis, MARGIN, y, font);
    y -= 24;
  }

  if (doc.table) {
    const { columns, rows } = doc.table;
    const colWidths = calcColWidths(columns.length, tableWidth);
    drawTableHeader(firstPage, columns, colWidths, MARGIN, y, font);
    drawTableRows(ctx, rows, colWidths, MARGIN, y, columns);
  }

  return pdfDoc.save();
}
