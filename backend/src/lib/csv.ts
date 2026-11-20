/** Utilitas CSV bersama (laporan admin, riwayat mahasiswa, ekspor pimpinan). */

/** Cegah CSV/formula injection di Excel: sel yang diawali = + - @ diberi tanda petik. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // BOM agar Excel membaca UTF-8 dengan benar
  return "\uFEFF" + lines.join("\r\n");
}

/** Format tanggal WIB: "YYYY-MM-DD HH:mm". */
export function wibText(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}
