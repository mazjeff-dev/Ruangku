import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { csvCell, toCsv, wibText } from "./csv";
import { buildSimplePdf } from "./pdf";
import { buildIcs, escapeIcsText } from "./ics";
import { isValidVerificationCode, makeVerificationCode, parseVerificationCode } from "./booking-verification";

describe("csv", () => {
  it("menetralkan formula injection dan mengutip sel khusus", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+62")).toBe("'+62");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('x"y')).toBe('"x""y"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("menghasilkan CSV ber-BOM dengan pemisah CRLF", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], [null, "x,y"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["\uFEFFa,b", "1,2", ',"x,y"']);
  });

  it("memformat waktu WIB", () => {
    expect(wibText(new Date("2026-11-20T04:00:00Z"))).toBe("2026-11-20 11:00");
    expect(wibText(null)).toBe("");
  });
});

describe("pdf", () => {
  it("membuat PDF valid dengan xref yang tepat", () => {
    const pdf = buildSimplePdf(
      [{ text: "Judul (uji) \\ “kutip” é", size: 20, bold: true }, { rule: true }, { text: "isi ".repeat(200) }],
      { title: "Uji" }
    );
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = text.slice(startxref).split("\n").slice(3, 10);
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("keluar dari tanda kurung agar teks tidak merusak struktur", () => {
    const text = buildSimplePdf([{ text: "a (b) c" }], { title: "t" }).toString("latin1");
    expect(text).toContain("(a \\(b\\) c) Tj");
  });
});

describe("ics", () => {
  it("meloloskan karakter khusus dan melipat baris panjang", () => {
    expect(escapeIcsText("a,b;c\nd")).toBe("a\\,b\\;c\\nd");
    const ics = buildIcs({
      uid: "b1@ruangku",
      title: "Rapat",
      description: "x".repeat(200),
      location: "Gedung A",
      start: new Date("2026-11-20T04:00:00Z"),
      end: new Date("2026-11-20T06:00:00Z"),
      stamp: new Date("2026-11-11T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261120T040000Z");
    expect(ics).toContain("DTEND:20261120T060000Z");
    expect(ics).toContain("BEGIN:VALARM");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});

describe("kode verifikasi", () => {
  const original = process.env.JWT_SECRET;
  beforeEach(() => { process.env.JWT_SECRET = "rahasia-uji-yang-cukup-panjang-1234567890"; });
  afterEach(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });

  it("valid untuk data asli dan gagal bila waktu mulai atau tanda tangan diubah", () => {
    const start = new Date("2026-11-20T04:00:00Z");
    const code = makeVerificationCode(12, start);
    const parsed = parseVerificationCode(code)!;
    expect(parsed.bookingId).toBe(12);
    expect(isValidVerificationCode(12, start, parsed.sig)).toBe(true);
    expect(isValidVerificationCode(12, new Date("2026-11-20T05:00:00Z"), parsed.sig)).toBe(false);
    expect(isValidVerificationCode(13, start, parsed.sig)).toBe(false);
    expect(isValidVerificationCode(12, start, "00000000")).toBe(false);
  });

  it("menolak format yang salah", () => {
    expect(parseVerificationCode("abc")).toBeNull();
    expect(parseVerificationCode("RK-1-XYZ")).toBeNull();
    expect(parseVerificationCode(" rk-5-abcdef12 ")).toEqual({ bookingId: 5, sig: "ABCDEF12" });
  });
});
