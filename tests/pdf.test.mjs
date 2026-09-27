import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PageSizes, StandardFonts, rgb } from "sanpdf";

const require = createRequire(import.meta.url);
const standardFontDataUrl = join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts").replaceAll("\\", "/") + "/";

async function readPDF(bytes, callback) {
  const task = getDocument({ data: bytes.slice(), standardFontDataUrl, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    return await callback(pdf);
  } finally {
    await task.destroy();
  }
}

test("lector independiente: páginas, fuentes, acentos, metadatos y coordenadas", async () => {
  const doc = new PDFDocument({ title: "Informe español 📄", author: "José Muñoz" });
  const page = doc.addPage();
  const text = "¡Hola! ¿Qué tal? áéíóú ü ñ Ñ € — “PDF” (texto) \\";
  page.drawText(text, { x: 40, y: 60, size: 16 });
  page.drawText("Cafe\u0301\r\nSegunda línea", {
    x: 40, y: 100, size: 12, lineHeight: 20, font: StandardFonts.HelveticaBold,
  });
  doc.addPage(PageSizes.Letter).drawText("Página dos", {
    x: 30, y: 50, font: StandardFonts.Courier,
  });
  await readPDF(doc.toBytes(), async (pdf) => {
    assert.equal(pdf.numPages, 2);
    const metadata = await pdf.getMetadata();
    assert.equal(metadata.info.Title, "Informe español 📄");
    assert.equal(metadata.info.Author, "José Muñoz");
    assert.equal(metadata.info.PDFFormatVersion, "1.7");
    const first = await pdf.getPage(1);
    assert.deepEqual(first.view, [0, 0, ...PageSizes.A4]);
    const content = await first.getTextContent();
    const items = content.items.filter((item) => "str" in item && item.str.length);
    assert.deepEqual(items.map((item) => item.str), [text, "Café", "Segunda línea"]);
    assert.equal(items[0].transform[4], 40);
    assert.ok(Math.abs(items[0].transform[5] - (PageSizes.A4[1] - 60)) < 0.000001);
    assert.ok(Math.abs(items[1].transform[5] - items[2].transform[5] - 20) < 0.000001);
    const second = await pdf.getPage(2);
    assert.deepEqual(second.view, [0, 0, 612, 792]);
    assert.equal((await second.getTextContent()).items.map((item) => item.str ?? "").join(""), "Página dos");
  });
});

test("xref y longitudes de streams apuntan a bytes exactos", () => {
  const doc = new PDFDocument({ title: "ñ漢字" });
  for (let index = 0; index < 12; index++) {
    doc.addPage().drawText(`Página ${index + 1}: acción`, { x: 20, y: 30 });
  }
  const bytes = doc.toBytes();
  const source = Buffer.from(bytes).toString("latin1");
  assert.equal(source.slice(0, 9), "%PDF-1.7\n");
  assert.ok(source.endsWith("%%EOF\n"));
  const xrefOffset = Number(/startxref\n(\d+)\n%%EOF/.exec(source)[1]);
  assert.equal(source.slice(xrefOffset, xrefOffset + 5), "xref\n");
  const xref = /^xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(source.slice(xrefOffset));
  const entries = xref[2].trimEnd().split("\n");
  assert.equal(entries.length, Number(xref[1]));
  assert.equal(entries[0], "0000000000 65535 f ");
  for (let index = 1; index < entries.length; index++) {
    const offset = Number(entries[index].slice(0, 10));
    assert.ok(source.slice(offset).startsWith(`${index} 0 obj\n`));
  }
  let streamCount = 0;
  for (const match of source.matchAll(/\/Length (\d+)\n>>\nstream\n/g)) {
    const start = match.index + match[0].length;
    const length = Number(match[1]);
    assert.equal(source.slice(start + length, start + length + 10), "\nendstream");
    streamCount++;
  }
  assert.equal(streamCount, 12);
  assert.equal((source.match(/\/BaseFont \/Helvetica\n/g) ?? []).length, 1);
});

test("gráficos interpretables: relleno, borde, línea y estado aislado", async () => {
  const doc = new PDFDocument();
  doc.addPage([300, 400])
    .drawRectangle({ x: 20, y: 30, width: 100, height: 50, fillColor: rgb(1, 0, 0) })
    .drawRectangle({ x: 140, y: 30, width: 100, height: 50, borderColor: rgb(0, 0, 1) })
    .drawRectangle({ x: 20, y: 100, width: 100, height: 50, fillColor: rgb(0, 1, 0), borderColor: rgb(0, 0, 0) })
    .drawLine({ start: { x: 20, y: 170 }, end: { x: 240, y: 170 }, width: 2 });
  await readPDF(doc.toBytes(), async (pdf) => {
    const page = await pdf.getPage(1);
    const operators = await page.getOperatorList();
    assert.equal(operators.fnArray.filter((op) => op === OPS.save).length, 4);
    assert.equal(operators.fnArray.filter((op) => op === OPS.restore).length, 4);
    assert.ok(operators.fnArray.includes(OPS.constructPath));
    assert.equal((await page.getTextContent()).items.length, 0);
  });
});

test("las doce variantes estándar admiten texto español", async () => {
  const doc = new PDFDocument();
  const page = doc.addPage();
  Object.values(StandardFonts).forEach((font, index) => {
    page.drawText(`España ${font}`, { x: 30, y: 30 + 25 * index, font });
  });
  await readPDF(doc.toBytes(), async (pdf) => {
    const content = await (await pdf.getPage(1)).getTextContent();
    // Un lector puede fragmentar una línea en varios elementos, especialmente con Courier.
    const lines = new Map();
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const baseline = item.transform[5];
      lines.set(baseline, (lines.get(baseline) ?? "") + item.str);
    }
    assert.deepEqual([...lines.values()], Object.values(StandardFonts).map((font) => `España ${font}`));
  });
});

test("errores claros y operaciones fallidas sin contenido parcial", () => {
  const doc = new PDFDocument();
  assert.throws(() => doc.toBytes(), /al menos una página/);
  for (const size of [[0, 100], [-1, 100], [Infinity, 100], [100, NaN], [15000, 100]]) {
    assert.throws(() => doc.addPage(size), RangeError);
  }
  assert.equal(doc.pageCount, 0);
  const page = doc.addPage();
  const before = doc.toBytes();
  assert.throws(() => page.drawText("Correcto\n😀", { x: 10, y: 20 }), /U\+1F600/);
  assert.throws(() => page.drawText("字", { x: 10, y: 20 }), /WinAnsi/);
  assert.throws(() => page.drawText("a\tb", { x: 10, y: 20 }), /U\+0009/);
  assert.throws(() => page.drawText("hola", { x: NaN, y: 20 }), RangeError);
  assert.throws(() => page.drawText("hola", { x: 10, y: 20, size: 0 }), RangeError);
  assert.throws(() => page.drawText("hola", { x: 10, y: 20, font: "Inventada" }), /Fuente/);
  assert.throws(() => page.drawLine({ start: { x: 0, y: 0 }, end: { x: Infinity, y: 10 } }), RangeError);
  assert.throws(() => page.drawRectangle({ x: 0, y: 0, width: -1, height: 10 }), RangeError);
  assert.throws(() => rgb(256, 0, 0), RangeError);
  assert.throws(() => page.drawText("hola", { x: 0, y: 0, color: { r: 2, g: 0, b: 0 } }), RangeError);
  assert.deepEqual(doc.toBytes(), before);
  const invalidMetadata = new PDFDocument({ title: "\ud800" });
  invalidMetadata.addPage();
  assert.throws(() => invalidMetadata.toBytes(), /Unicode inválido/);
});

test("exportación determinista, snapshots independientes y páginas vacías válidas", async () => {
  const doc = new PDFDocument();
  const page = doc.addPage();
  const empty = doc.toBytes();
  assert.deepEqual(doc.toBytes(), empty);
  await readPDF(empty, async (pdf) => {
    assert.equal(pdf.numPages, 1);
    assert.deepEqual((await (await pdf.getPage(1)).getTextContent()).items, []);
  });
  page.drawText("Después", { x: 20, y: 30 });
  const populated = doc.toBytes();
  assert.notDeepEqual(populated, empty);
  assert.deepEqual(doc.toBytes(), populated);
  populated.fill(0);
  assert.notEqual(doc.toBytes()[0], 0);
  doc.addPage();
  await readPDF(doc.toBytes(), async (pdf) => assert.equal(pdf.numPages, 2));
});
