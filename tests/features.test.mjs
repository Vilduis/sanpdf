import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { PDF, PDFDocument, LayoutError, StandardFonts, hex, loadImage, mm, cm, inch, rgb } from "sanpdf";
import { deflate, inflate } from "../dist/compression/zlib.js";
import { encodeQR } from "../dist/barcodes/QRCode.js";
import { encodePNG } from "./helpers/png.mjs";
import { decodeMatrix } from "./helpers/qr.mjs";
import { renderPage, withPDF } from "./helpers/reader.mjs";

const jpeg = new Uint8Array(readFileSync(new URL("./fixtures/rojo-azul.jpg", import.meta.url)));
const latin1 = bytes => Buffer.from(bytes).toString("latin1");
const near = (actual, expected, tolerance = 40) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

async function textItems(bytes, number = 1) {
  return withPDF(bytes, async reader => {
    const content = await (await reader.getPage(number)).getTextContent();
    return content.items.filter(item => item.str);
  });
}

// ---------------------------------------------------------------- Compresión

test("compresión: deflate/inflate propios son compatibles con zlib en ambos sentidos", () => {
  let seed = 7;
  const random = Uint8Array.from({ length: 70000 }, () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
  const text = new TextEncoder().encode("BT /F1 12 Tf 1 0 0 1 40 700 Tm <48656C6C6F> Tj ET\n".repeat(2000));
  for (const input of [new Uint8Array(0), new Uint8Array([42]), text, random, new Uint8Array(100000).fill(9)]) {
    const compressed = deflate(input);
    assert.deepEqual(new Uint8Array(inflateSync(compressed)), input);
    assert.deepEqual(deflate(input), compressed, "salida determinista");
    for (const level of [0, 1, 9]) assert.deepEqual(inflate(new Uint8Array(deflateSync(input, { level }))), input);
  }
  assert.ok(deflate(text).length < text.length / 20);
  const damaged = deflate(text);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => inflate(damaged), /Suma de verificación/);
});

test("compresión: activada por defecto, desactivable y legible", async () => {
  const build = compress => {
    const doc = new PDFDocument({ compress });
    doc.addPage().drawText("Texto comprimido ".repeat(20), { x: 20, y: 40, size: 6 });
    return doc.toBytes();
  };
  const compressed = build(undefined);
  const plain = build(false);
  assert.match(latin1(compressed), /\/Filter \/FlateDecode/);
  assert.doesNotMatch(latin1(plain), /FlateDecode/);
  assert.ok(compressed.length < plain.length);
  assert.match((await textItems(compressed)).map(item => item.str).join(""), /Texto comprimido/);
});

// ---------------------------------------------------------------- Colores y unidades

test("colores hexadecimales y unidades", async () => {
  assert.deepEqual(hex("#ff0000"), rgb(1, 0, 0));
  assert.deepEqual(hex("#0F0"), rgb(0, 1, 0));
  assert.deepEqual(hex("0000ff"), rgb(0, 0, 1));
  for (const invalid of ["#12", "#gggggg", "rojo", "#12345"]) assert.throws(() => hex(invalid), /hexadecimal inválido/);
  assert.equal(mm(25.4), 72);
  assert.equal(cm(2.54), 72);
  assert.equal(inch(2), 144);
  const doc = new PDFDocument();
  doc.addPage([200, 200]).drawRectangle({ x: mm(10), y: 20, width: 100, height: 100, fillColor: "#1F4788" });
  const { pixel } = await renderPage(doc.toBytes());
  assert.ok(near(pixel(80, 70), [31, 71, 136], 3), `color ${pixel(80, 70)}`);
  const invalid = PDF.create().page(page => page.content().text("x").color("#zz0000"));
  assert.throws(() => invalid.toBytes(), error => error instanceof LayoutError && /hexadecimal/.test(error.message));
});

// ---------------------------------------------------------------- Texto enriquecido

test("texto mezclado: fragmentos con negrita, cursiva y color en una misma línea", async () => {
  const document = PDF.create().page(page => {
    page.size([400, 200]).margin(20);
    page.content().column(column => {
      column.text(["El ", { text: "total", style: { bold: true } }, " es ", { text: "S/ 118.00", style: { color: "#C00000", italic: true } }, "."]);
      column.text("Nota en cursiva").italic();
      column.text("Negrita y cursiva").bold().italic().font(StandardFonts.TimesRoman);
    });
  });
  const items = await textItems(document.toBytes());
  const first = items.filter(item => Math.abs(item.transform[5] - items[0].transform[5]) < 0.01);
  assert.equal(first.map(item => item.str).join(""), "El total es S/ 118.00.");
  assert.equal(new Set(first.map(item => item.fontName)).size, 3, "normal, negrita y cursiva");
  for (let i = 1; i < first.length; i++) {
    assert.ok(Math.abs(first[i - 1].transform[4] + first[i - 1].width - first[i].transform[4]) < 0.01, "fragmentos contiguos");
  }
  const source = latin1(document.toBytes());
  for (const font of ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Times-BoldItalic"]) {
    assert.ok(source.includes(`/BaseFont /${font}\n`), `usa ${font}`);
  }
});

test("texto mezclado: una palabra con dos estilos no se corta al ajustar líneas", async () => {
  const document = PDF.create().page(page => {
    page.size([150, 300]).margin(10);
    page.content().text(["uno dos tres cuatro ", "super", { text: "negrita", style: { bold: true } }, " cinco seis siete"]);
  });
  const items = await textItems(document.toBytes());
  const superItem = items.find(item => item.str.endsWith("super"));
  const bold = items.find(item => item.str.startsWith("negrita"));
  assert.equal(superItem.transform[5], bold.transform[5]);
  assert.ok(Math.abs(superItem.transform[4] + superItem.width - bold.transform[4]) < 0.01);
});

test("texto mezclado: el tamaño se define por párrafo y los errores lo explican", () => {
  const document = PDF.create().page(page => page.content().text(["a", { text: "b", style: { fontSize: 30 } }]));
  assert.throws(() => document.toBytes(), error => error instanceof LayoutError && /fragmentos solo cambian/.test(error.message));
  const cells = PDF.create().page(page => page.content().table(table => {
    table.columns(["*"]).row([{ text: ["Precio ", { text: "final", style: { bold: true } }] }]);
  }));
  assert.equal(cells.toDocument().pageCount, 1);
});

// ---------------------------------------------------------------- Enlaces y marcadores

test("enlaces: bloques, fragmentos y enlaces de bajo nivel", async () => {
  const document = PDF.create().page(page => {
    page.size([300, 200]).margin(20);
    page.content().column(column => {
      column.text("Sitio web").link("https://example.com/tienda");
      column.text(["Escríbenos a ", { text: "ventas@example.com", link: "mailto:ventas@example.com" }]);
    });
  });
  await withPDF(document.toBytes(), async reader => {
    const annotations = await (await reader.getPage(1)).getAnnotations();
    const links = annotations.filter(annotation => annotation.subtype === "Link");
    assert.equal(links.length, 2);
    assert.equal(links[0].url, "https://example.com/tienda");
    assert.match(links[1].url ?? links[1].unsafeUrl, /^mailto:ventas@example\.com/);
    const [x1, y1, x2, y2] = links[0].rect;
    assert.ok(x1 >= 20 && x2 <= 280 && y1 >= 0 && y2 <= 200 && x2 > x1 && y2 > y1);
  });
  const doc = new PDFDocument();
  doc.addPage().addLink({ x: 10, y: 10, width: 50, height: 20, url: "https://example.com/año" });
  assert.match(latin1(doc.toBytes()), /\/URI </);
  await withPDF(doc.toBytes(), async reader => {
    const [link] = await (await reader.getPage(1)).getAnnotations();
    assert.equal(link.url, "https://example.com/a%C3%B1o");
  });
  assert.throws(() => doc.addPage().addLink({ x: 0, y: 0, width: 1, height: 1, url: "example.com" }), /esquema/);
  const invalid = PDF.create().page(page => page.content().text("x").link("sin-esquema"));
  assert.throws(() => invalid.toBytes(), error => error instanceof LayoutError && /esquema/.test(error.message));
});

test("marcadores: apuntan a la página donde termina cada título", async () => {
  const document = PDF.create().page(page => {
    page.size([300, 300]).margin(20);
    page.content().column(column => {
      column.text("Introducción").bold().bookmark();
      column.text("Texto largo\n".repeat(30));
      column.text("Capítulo 2").bold().bookmark("Capítulo 2: Resultados");
      column.text("Fin");
    });
  });
  await withPDF(document.toBytes(), async reader => {
    const outline = await reader.getOutline();
    assert.deepEqual(outline.map(item => item.title), ["Introducción", "Capítulo 2: Resultados"]);
    const pages = await Promise.all(outline.map(item => reader.getPageIndex(item.dest[0])));
    assert.equal(pages[0], 0);
    assert.ok(pages[1] >= 1);
    const { items } = await (await reader.getPage(pages[1] + 1)).getTextContent();
    assert.ok(items.some(item => item.str === "Capítulo 2"));
  });
  const header = PDF.create().page(page => page.header().text("Título").bookmark());
  assert.throws(() => header.toBytes(), /bookmark\(\) no se admite/);
});

// ---------------------------------------------------------------- Imágenes

test("imágenes: JPEG con proporción, alineación y datos sin recomprimir", async () => {
  const image = loadImage(jpeg);
  assert.equal(image.width, 32);
  assert.equal(image.height, 16);
  const document = PDF.create().page(page => {
    page.size([300, 300]).margin(20);
    page.content().column(column => {
      column.image(jpeg).width(200).alignCenter();
      column.image(image).height(20).alignRight();
      column.image(image);
    });
  });
  const bytes = document.toBytes();
  assert.match(latin1(bytes), /\/Filter \/DCTDecode/);
  assert.equal(latin1(bytes).split("/Subtype /Image").length - 1, 2, "misma PDFImage reutilizada, bytes directos aparte");
  const { pixel } = await renderPage(bytes);
  // Primera imagen: 200 × 100 centrada en x = 50–250, y = 20–120.
  assert.ok(near(pixel(90, 70), [230, 20, 20]), `rojo ${pixel(90, 70)}`);
  assert.ok(near(pixel(210, 70), [20, 20, 230]), `azul ${pixel(210, 70)}`);
  assert.ok(near(pixel(40, 70), [255, 255, 255], 2), "margen blanco a la izquierda");
  // Segunda: 40 × 20 alineada a la derecha, tras 12 pt de separación.
  assert.ok(near(pixel(275, 142), [20, 20, 230]));
  assert.ok(near(pixel(230, 142), [255, 255, 255], 2));
});

test("imágenes: PNG en todas sus variantes de color, profundidad, alfa y entrelazado", async () => {
  const w = 20;
  const h = 10;
  const left = (x) => x < w / 2;
  const variants = {
    rgb8: encodePNG({ width: w, height: h, colorType: 2, sample: x => left(x) ? [255, 0, 0] : [0, 0, 255] }),
    rgb16: encodePNG({ width: w, height: h, colorType: 2, depth: 16, sample: x => left(x) ? [65535, 0, 0] : [0, 0, 65535] }),
    gray1: encodePNG({ width: w, height: h, colorType: 0, depth: 1, sample: x => [left(x) ? 0 : 1] }),
    gray16: encodePNG({ width: w, height: h, colorType: 0, depth: 16, sample: x => [left(x) ? 0 : 65535] }),
    palette4: encodePNG({ width: w, height: h, colorType: 3, depth: 4, palette: [[255, 0, 0], [0, 0, 255]], sample: x => [left(x) ? 0 : 1] }),
    paletteAlpha: encodePNG({ width: w, height: h, colorType: 3, depth: 2, palette: [[255, 0, 0], [0, 0, 255]], transparency: [255, 0], sample: x => [left(x) ? 0 : 1] }),
    grayKey: encodePNG({ width: w, height: h, colorType: 0, depth: 8, transparency: [0, 0], sample: x => [left(x) ? 0 : 128] }),
    rgba8: encodePNG({ width: w, height: h, colorType: 6, sample: x => left(x) ? [255, 0, 0, 255] : [0, 0, 255, 0] }),
    rgba16: encodePNG({ width: w, height: h, colorType: 6, depth: 16, sample: x => left(x) ? [65535, 0, 0, 65535] : [0, 0, 65535, 0] }),
    grayAlpha: encodePNG({ width: w, height: h, colorType: 4, sample: x => left(x) ? [0, 255] : [0, 0] }),
    interlaced: encodePNG({ width: w, height: h, colorType: 2, interlace: true, sample: x => left(x) ? [255, 0, 0] : [0, 0, 255] }),
    interlacedAlpha: encodePNG({ width: 13, height: 7, colorType: 4, interlace: true, depth: 16, sample: x => x < 6 ? [0, 65535] : [65535, 0] }),
  };
  const expected = {
    rgb8: [[255, 0, 0], [0, 0, 255]], rgb16: [[255, 0, 0], [0, 0, 255]], gray1: [[0, 0, 0], [255, 255, 255]],
    gray16: [[0, 0, 0], [255, 255, 255]], palette4: [[255, 0, 0], [0, 0, 255]],
    // Las partes transparentes muestran el fondo verde.
    paletteAlpha: [[255, 0, 0], [0, 255, 0]], grayKey: [[0, 255, 0], [128, 128, 128]],
    rgba8: [[255, 0, 0], [0, 255, 0]], rgba16: [[255, 0, 0], [0, 255, 0]], grayAlpha: [[0, 0, 0], [0, 255, 0]],
    interlaced: [[255, 0, 0], [0, 0, 255]], interlacedAlpha: [[0, 0, 0], [0, 255, 0]],
  };
  const doc = new PDFDocument();
  const page = doc.addPage([200, 60 * Object.keys(variants).length]);
  Object.values(variants).forEach((bytes, index) => {
    page.drawRectangle({ x: 0, y: index * 60, width: 200, height: 60, fillColor: rgb(0, 1, 0) });
    page.drawImage(bytes, { x: 20, y: index * 60 + 5, width: 160 });
  });
  assert.match(latin1(doc.toBytes()), /\/SMask/);
  const { pixel } = await renderPage(doc.toBytes());
  Object.keys(variants).forEach((name, index) => {
    const y = index * 60 + 45;
    assert.ok(near(pixel(50, y), expected[name][0], 6), `${name} izquierda ${pixel(50, y)}`);
    assert.ok(near(pixel(150, y), expected[name][1], 6), `${name} derecha ${pixel(150, y)}`);
  });
});

test("imágenes: errores claros y límites de ancho", () => {
  assert.throws(() => loadImage(new Uint8Array([1, 2, 3])), /JPEG o PNG/);
  const png = encodePNG({ width: 2, height: 2, colorType: 2, sample: () => [1, 2, 3] });
  const damaged = png.slice();
  damaged[20] ^= 1;
  assert.throws(() => loadImage(damaged), /suma de verificación del bloque IHDR/);
  assert.throws(() => loadImage(jpeg.subarray(0, 40)), /JPEG dañado/);
  const wide = PDF.create().page(page => { page.size([200, 200]).margin(20); page.content().image(jpeg).width(500); });
  assert.throws(() => wide.toBytes(), error => error instanceof LayoutError && /necesita 500\.00 pt de ancho/.test(error.message));
  // Sin tamaño, una imagen grande se reduce al ancho disponible.
  const big = encodePNG({ width: 1000, height: 500, colorType: 0, sample: () => [0] });
  const fitted = PDF.create().page(page => { page.size([300, 400]).margin(50); page.content().image(big); });
  assert.equal(fitted.toDocument().pageCount, 1);
});

// ---------------------------------------------------------------- Códigos QR

test("QR: el codificador produce códigos legibles en todas las versiones y niveles", () => {
  for (const level of ["L", "M", "Q", "H"]) {
    for (const text of ["1", "0123456789012345", "HOLA MUNDO $%*+-./:", "https://example.com/pedido?id=128&año=2026",
      "20123456789|01|F001|00000123|18.00|118.00|2026-09-27|6|20100070970|".repeat(3), "Ñ€".repeat(200), "7".repeat(3000)]) {
      let matrix;
      try { matrix = encodeQR(text, level); } catch (error) { assert.match(error.message, /demasiado largo/); continue; }
      assert.equal(decodeMatrix(matrix, matrix.version > 20 ? 3 : 4), text, `${level} v${matrix.version}`);
    }
  }
  assert.equal(encodeQR("HOLA", "M").version, 1);
  assert.equal(encodeQR("7".repeat(7089), "L").version, 40);
  assert.throws(() => encodeQR("7".repeat(7090), "L"), /demasiado largo/);
  assert.throws(() => encodeQR("x", "X"), /corrección QR inválido/);
  assert.throws(() => encodeQR(""), /vacío/);
});

test("QR: se dibuja en el PDF y se lee desde la página renderizada", async () => {
  const content = "20123456789|01|F001|00000123|18.00|118.00|2026-09-27|6|20100070970|";
  const document = PDF.create().page(page => {
    page.size([300, 300]).margin(20);
    page.content().column(column => {
      column.text("Representación impresa").alignCenter();
      column.qrCode(content).size(150).alignCenter().errorCorrection("Q");
    });
  });
  const image = await renderPage(document.toBytes(), 1, 3);
  assert.equal(jsQR(image.data, image.width, image.height)?.data, content);
  const tooBig = PDF.create().page(page => { page.size([200, 200]); page.content().qrCode("x").size(300); });
  assert.throws(() => tooBig.toBytes(), /código QR necesita/);
  const doc = new PDFDocument();
  doc.addPage([120, 120]).drawQRCode("https://example.com", { x: 10, y: 10, size: 100, color: "#003366" });
  const lowLevel = await renderPage(doc.toBytes(), 1, 4);
  assert.equal(jsQR(lowLevel.data, lowLevel.width, lowLevel.height)?.data, "https://example.com");
});

// ---------------------------------------------------------------- Separadores y espacios

test("separador y espacio: ocupan su altura y el espacio se omite al inicio de página", async () => {
  const document = PDF.create({ compress: false }).page(page => {
    page.size([300, 300]).margin(20);
    page.content().column(column => {
      column.gap(0);
      column.text("Arriba");
      column.space(50);
      column.divider().color("#FF0000").thickness(4);
      column.text("Abajo");
    });
  });
  const bytes = document.toBytes();
  assert.match(latin1(bytes), /1 0 0 RG\n4 w\n20 [\d.]+ m\n280 [\d.]+ l\nS/);
  const items = await textItems(bytes);
  const [top, bottom] = ["Arriba", "Abajo"].map(text => items.find(item => item.str === text).transform[5]);
  // Primera línea (ascenso + descenso de Helvetica 12) + espacio + separador.
  assert.ok(Math.abs(top - bottom - (13.872 + 50 + 4)) < 0.01, `separación ${top - bottom}`);
  const { pixel } = await renderPage(bytes);
  const lineY = 20 + 13.872 + 50 + 2;
  assert.ok(near(pixel(150, lineY), [255, 0, 0], 10), `línea ${pixel(150, lineY)}`);
  const leading = PDF.create().page(page => {
    page.size([300, 300]).margin(20);
    page.content().column(column => { column.space(80); column.text("Primero"); });
  });
  const [first] = await textItems(leading.toBytes());
  assert.ok(first.transform[5] > 300 - 20 - 20, "al inicio de página el espacio se omite");
});

// ---------------------------------------------------------------- Tablas

test("tablas: una fila más alta que la página se divide y repite la cabecera", async () => {
  const lines = Array.from({ length: 40 }, (_, index) => `Detalle-${String(index + 1).padStart(2, "0")}`);
  const document = PDF.create().page(page => {
    page.size([300, 260]).margin(20);
    page.content().column(column => {
      column.text("Informe");
      column.table(table => {
        table.columns(["*", 80]).header(["Descripción", "Importe"]);
        table.row(["Fila corta", "S/ 1.00"]);
        table.row([lines.join("\n"), "S/ 2.00"]);
        table.row(["Última", "S/ 3.00"]);
      });
    });
  });
  const pages = [];
  await withPDF(document.toBytes(), async reader => {
    for (let number = 1; number <= reader.numPages; number++) {
      const { items } = await (await reader.getPage(number)).getTextContent();
      pages.push(items.map(item => item.str).join(" "));
    }
  });
  assert.ok(pages.length >= 3);
  pages.forEach(text => assert.match(text, /Descripción\s+Importe/));
  assert.deepEqual(pages.flatMap(text => text.match(/Detalle-\d+/g) ?? []), lines);
  assert.match(pages[0], /Fila corta.*S\/ 1\.00.*Detalle-01/);
  assert.equal(pages.join(" ").split("S/ 2.00").length - 1, 1);
  assert.match(pages.at(-1), /Última/);
});
