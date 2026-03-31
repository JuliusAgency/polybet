const encoder = new TextEncoder();

interface PdfObject {
  id: number;
  body: string;
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function splitIntoPages(lines: string[], linesPerPage: number): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  return pages.length > 0 ? pages : [['(empty report)']];
}

function buildContentStream(lines: string[]): string {
  const header = ['BT', '/F1 10 Tf', '50 792 Td', '14 TL'];
  const stream = [...header];

  lines.forEach((line, index) => {
    stream.push(`(${escapePdfText(line)}) Tj`);
    if (index < lines.length - 1) {
      stream.push('T*');
    }
  });

  stream.push('ET');

  return stream.join('\n');
}

export function renderTextPdf(lines: string[]): Uint8Array {
  const normalizedLines = lines.length > 0 ? lines : ['(empty report)'];
  const pages = splitIntoPages(normalizedLines, 48);
  const objects: PdfObject[] = [];

  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  const pageIds = pages.map(() => nextId++);
  const contentIds = pages.map(() => nextId++);

  objects.push({
    id: fontId,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  });

  pages.forEach((pageLines, index) => {
    const content = buildContentStream(pageLines);
    objects.push({
      id: contentIds[index],
      body: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    });
  });

  pages.forEach((_, index) => {
    objects.push({
      id: pageIds[index],
      body: [
        '<<',
        '/Type /Page',
        `/Parent ${pagesId} 0 R`,
        '/MediaBox [0 0 612 792]',
        ` /Resources << /Font << /F1 ${fontId} 0 R >> >>`,
        `/Contents ${contentIds[index]} 0 R`,
        '>>',
      ].join('\n'),
    });
  });

  objects.push({
    id: pagesId,
    body: `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
  });

  objects.push({
    id: catalogId,
    body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
  });

  objects.sort((left, right) => left.id - right.id);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets[object.id] = pdf.length;
    pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let objectId = 1; objectId <= objects.length; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += [
    'trailer',
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    'startxref',
    String(xrefStart),
    '%%EOF',
  ].join('\n');

  return encoder.encode(pdf);
}
