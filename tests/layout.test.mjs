import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PageLayout, StandardFonts, layoutText, layoutTextBox, measureText } from "sanpdf";
import { withPDF } from "./helpers/reader.mjs";

test("avances AFM coinciden con PDF.js para todos los caracteres WinAnsi y las doce fuentes", async () => {
  const text = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)).join("")
    + "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"
    + Array.from({ length: 96 }, (_, i) => String.fromCharCode(i + 160)).join("");
  const doc = new PDFDocument();
  const fonts = Object.values(StandardFonts);
  fonts.forEach((font) => doc.addPage().drawText(text, { x: 20, y: 30, size: 2, font }));
  await withPDF(doc.toBytes(), async (reader) => {
    for (let index = 0; index < fonts.length; index++) {
      const content = await (await reader.getPage(index + 1)).getTextContent();
      const items = content.items.filter((item) => item.str);
      const start = Math.min(...items.map((item) => item.transform[4]));
      const end = Math.max(...items.map((item) => item.transform[4] + item.width));
      const measured = measureText(text, { font: fonts[index], size: 2 });
      assert.ok(Math.abs(end - start - measured.width) < 1e-5, `${fonts[index]}: lector=${end - start}, motor=${measured.width}`);
    }
  });
  assert.ok(measureText("WWW").width > measureText("iii").width * 3);
  assert.equal(measureText("Cafe\u0301").width, measureText("Café").width);
});

test("ajuste de líneas: límite exacto, palabras extensas, saltos explícitos y vacíos", () => {
  const style = { font: StandardFonts.Helvetica, size: 12 };
  const measured = measureText("Hola mundo", style);
  const width = measured.width + measured.leftOverhang + measured.rightOverhang;
  assert.equal(layoutText("Hola mundo", { ...style, width }).lines.length, 1);
  assert.deepEqual(layoutText("Hola mundo", { ...style, width: width - 0.001 }).lines.map((line) => line.text), ["Hola", "mundo"]);
  const long = "Supercalifragilisticoespialidoso";
  const wrapped = layoutText(long, { ...style, width: 30 });
  assert.equal(wrapped.lines.map((line) => line.text).join(""), long);
  assert.ok(wrapped.lines.every((line) => line.width <= 30 - measured.leftOverhang - measured.rightOverhang + 1e-8));
  assert.throws(() => layoutText(long, { ...style, width: 30, breakWords: false }), /palabra no cabe/);
  assert.deepEqual(layoutText("\r\nCafé\r\n\r\nfin\r", { width: 100 }).lines.map((line) => line.text), ["", "Café", "", "fin", ""]);
  assert.equal(layoutText("", { width: 100 }).height, 0);
  assert.equal(layoutText("\n", { width: 100 }).lines.length, 2);
  assert.deepEqual(layoutText("  uno   dos  ", { width: 200 }).lines.map((line) => line.text), ["uno dos"]);
  assert.equal(layoutText("uno\u00a0dos", { width: 200 }).lines[0].text, "uno\u00a0dos");
});

test("cajas alineadas: posiciones y ancho contrastados con un lector independiente", async () => {
  const doc = new PDFDocument();
  const page = doc.addPage();
  const results = ["left", "center", "right"].map((align, index) => page.drawTextBox("Árbol y pingüino", {
    x: 50, y: 50 + index * 100, width: 200, height: 70,
    padding: { left: 10, right: 15, top: 8, bottom: 12 }, align, verticalAlign: "middle", size: 12,
  }));
  await withPDF(doc.toBytes(), async (reader) => {
    const content = await (await reader.getPage(1)).getTextContent();
    const items = content.items.filter((item) => item.str.trim());
    assert.equal(items.length, 3);
    items.forEach((item, index) => {
      const box = results[index];
      const line = box.lines[0];
      assert.ok(Math.abs(item.transform[4] - line.x) < 1e-6);
      assert.ok(Math.abs(page.height - item.transform[5] - line.baseline) < 1e-6);
      assert.ok(Math.abs(item.width - line.width) < 1e-6);
      assert.ok(line.x >= box.x + 10);
      assert.ok(line.x + line.width <= box.x + box.width - 15);
      assert.ok(line.baseline - box.ascent >= box.y + 8);
      assert.ok(line.baseline + box.descent <= box.nextY - 12);
    });
    assert.ok(items[0].transform[4] < items[1].transform[4]);
    assert.ok(items[1].transform[4] < items[2].transform[4]);
  });
});

test("errores de cajas se detectan antes de modificar página o flujo", () => {
  const doc = new PDFDocument();
  const flow = new PageLayout(doc);
  const before = doc.toBytes();
  const base = { x: 10, y: 20, width: 100 };
  for (const options of [
    { width: NaN }, { width: 0 }, { width: 1 }, { height: 1 }, { size: 1e-9 },
    { padding: -1 }, { padding: 60 }, { lineHeight: 1 },
    { align: "justify" }, { verticalAlign: "invalid" }, { y: Infinity },
  ]) assert.throws(() => flow.page.drawTextBox("Ágil", { ...base, ...options }));
  assert.throws(() => flow.page.drawTextBox("Bien\n😀", base), /U\+1F600/);
  assert.throws(() => flow.page.drawTextBox("a\tb", base), /U\+0009/);
  assert.throws(() => flow.paragraph("texto", { color: { r: 2, g: 0, b: 0 } }));
  assert.throws(() => flow.paragraph("texto", { spaceAfter: -1 }));
  assert.throws(() => flow.ensureSpace(flow.contentHeight + 1));
  assert.throws(() => new PageLayout(doc, { margins: 1000 }));
  assert.equal(doc.pageCount, 1);
  assert.deepEqual(doc.toBytes(), before);
  assert.equal(flow.y, 40);
  const empty = layoutTextBox("", { ...base, padding: 5 });
  assert.equal(empty.height, 10);
});

test("paginación de un párrafo largo conserva el contenido y respeta márgenes", async () => {
  const doc = new PDFDocument();
  const flow = new PageLayout(doc, { pageSize: [250, 140], margins: { top: 15, bottom: 20, left: 18, right: 22 } });
  const text = Array.from({ length: 160 }, (_, i) => `dato${i}`).join(" ");
  const fragments = flow.paragraph(text, { size: 11, lineHeight: 14 });
  assert.ok(doc.pageCount > 3);
  assert.equal(fragments.flatMap((part) => part.lines.map((line) => line.text)).join(" "), text);
  assert.equal(fragments.length, doc.pageCount);
  for (const fragment of fragments) {
    assert.ok(fragment.y >= 15);
    assert.ok(fragment.nextY <= 120 + 1e-7);
  }
  await withPDF(doc.toBytes(), async (reader) => {
    const words = [];
    for (let i = 1; i <= reader.numPages; i++) {
      const content = await (await reader.getPage(i)).getTextContent();
      for (const item of content.items.filter((item) => item.str.trim())) {
        words.push(item.str);
        assert.ok(item.transform[4] >= 18 - 1e-6);
        assert.ok(item.transform[4] + item.width <= 228 + 1e-6);
        const baseline = 140 - item.transform[5];
        assert.ok(baseline >= 15 && baseline <= 120);
      }
    }
    assert.equal(words.join(" ").replace(/ +/g, " "), text);
  });
});

test("flujo: keepTogether, espacios finales y saltos vacíos sin pérdida", () => {
  const doc = new PDFDocument();
  const flow = new PageLayout(doc, { pageSize: [200, 100], margins: 10 });
  flow.advance(70);
  const fragments = flow.paragraph("Una línea", { keepTogether: true, spaceAfter: 1000 });
  assert.equal(doc.pageCount, 2);
  assert.equal(fragments[0].y, 10);
  assert.ok(Math.abs(flow.remainingHeight) < 1e-6);
  assert.equal(flow.paragraph("").length, 0);
  assert.equal(doc.pageCount, 2);
  const before = doc.toBytes();
  assert.throws(() => flow.paragraph("línea\n".repeat(100), { keepTogether: true }), /no cabe/);
  assert.deepEqual(doc.toBytes(), before);
  const blank = flow.paragraph("\nA\n\nB\n");
  assert.deepEqual(blank.flatMap((part) => part.lines.map((line) => line.text)), ["", "A", "", "B", ""]);
});
