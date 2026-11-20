/**
 * Pembuat PDF minimal (tanpa dependensi) untuk dokumen satu halaman berisi teks dan garis.
 * Font standar Helvetica (WinAnsi); karakter di luar Latin-1 diganti '?'.
 * Cukup untuk bukti booking; bukan pustaka PDF serbaguna.
 */

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  /** Jarak kosong (pt) sebelum baris ini. */
  gapBefore?: number;
}

export interface PdfRule {
  rule: true;
  gapBefore?: number;
}

export type PdfItem = PdfLine | PdfRule;

function latin1Safe(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    out += code >= 32 && code <= 255 ? ch : code === 0x2013 || code === 0x2014 ? "-" : code === 0x2019 || code === 0x2018 ? "'" : code === 0x201C || code === 0x201D ? "\"" : "?";
  }
  return out;
}

function escapePdfText(s: string): string {
  return latin1Safe(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Perkiraan lebar teks Helvetica (rata-rata 0.5em) untuk pembungkusan baris. */
function wrap(text: string, size: number, maxWidth: number): string[] {
  const maxChars = Math.max(10, Math.floor(maxWidth / (size * 0.5)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > maxChars) {
      if (cur) { lines.push(cur); cur = ""; }
      for (let i = 0; i < w.length; i += maxChars) lines.push(w.slice(i, i + maxChars));
      continue;
    }
    if ((cur + " " + w).trim().length > maxChars) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function buildSimplePdf(items: PdfItem[], meta: { title: string }): Buffer {
  const pageW = 595.28, pageH = 841.89, margin = 56;
  const maxWidth = pageW - margin * 2;
  let y = pageH - margin;
  const ops: string[] = [];

  for (const item of items) {
    if ("rule" in item) {
      y -= item.gapBefore ?? 8;
      ops.push(`0.78 0.65 0.42 RG 1 w ${margin} ${y.toFixed(2)} m ${(pageW - margin).toFixed(2)} ${y.toFixed(2)} l S`);
      y -= 6;
      continue;
    }
    const size = item.size ?? 11;
    y -= item.gapBefore ?? 0;
    for (const line of wrap(item.text, size, maxWidth)) {
      y -= size * 1.35;
      if (y < margin) break; // satu halaman saja
      ops.push(`BT /${item.bold ? "F2" : "F1"} ${size} Tf ${margin} ${y.toFixed(2)} Td (${escapePdfText(line)}) Tj ET`);
    }
  }

  const content = ops.join("\n");
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  objects.push(`<< /Title (${escapePdfText(meta.title)}) /Producer (RuangKu) >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
