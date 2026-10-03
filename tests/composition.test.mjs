import assert from "node:assert/strict";
import test from "node:test";
import { PDF, LayoutError, StandardFonts, rgb } from "sanpdf";
import { withPDF } from "./helpers/reader.mjs";

async function readPages(bytes) {
  return withPDF(bytes, async reader => {
    const pages = [];
    for (let number = 1; number <= reader.numPages; number++) {
      const page = await reader.getPage(number);
      const { items } = await page.getTextContent();
      pages.push({ text: items.map(item => item.str).join(" "), items, height: page.view[3] });
    }
    return pages;
  });
}

test("composición: tabla multipágina repite encabezados sin perder ni duplicar filas", async () => {
  const document = PDF.create({ title: "Inventario" }).page(page => {
    page.size([360, 300]).margin(24);
    page.header().text("Inventario SanPDF").bold();
    page.content().table(table => {
      table.columns(["*", 80]).header(["Producto", "Cantidad"]);
      for (let i = 1; i <= 40; i++) table.row([`Producto-${i.toString().padStart(3, "0")}`, `${i}`]);
    });
    page.footer().pageNumber().fontSize(9).alignRight();
  });
  const pages = await readPages(document.toBytes());
  assert.ok(pages.length > 2);
  pages.forEach((page, index) => {
    assert.match(page.text, /Inventario SanPDF/);
    assert.match(page.text, /Producto\s+Cantidad/);
    assert.match(page.text, new RegExp(`Página ${index + 1} de ${pages.length}`));
    for (const item of page.items.filter(item => item.str)) {
      assert.ok(item.transform[4] >= 24 - 1e-5);
      assert.ok(item.transform[4] + item.width <= 336 + 1e-5);
      assert.ok(item.transform[5] >= 24 && item.transform[5] <= 276);
    }
  });
  const text = pages.map(page => page.text).join(" ");
  for (let i = 1; i <= 40; i++) assert.equal(text.split(`Producto-${i.toString().padStart(3, "0")}`).length - 1, 1);
});

test("composición: un párrafo largo se divide conservando todas sus líneas y su orden", async () => {
  const lines = Array.from({ length: 70 }, (_, index) => `Línea-${String(index).padStart(3, "0")}`);
  const document = PDF.create().page(page => {
    page.size([240, 240]).margin(20);
    page.content().text(lines.join("\n")).padding(8).background(rgb(0.9, 0.95, 1));
  });
  const pages = await readPages(document.toBytes());
  assert.ok(pages.length > 1);
  assert.deepEqual(pages.flatMap(page => page.text.match(/Línea-\d+/g) ?? []), lines);
});

test("composición: filas anidadas, anchos relativos y estilos heredados", async () => {
  const document = PDF.create().page(page => {
    page.size([400, 300]).margin(20);
    page.defaultTextStyle({ font: StandardFonts.TimesRoman, fontSize: 10 });
    page.content().row(row => {
      row.gap(10);
      row.item(100).column(column => {
        column.style({ bold: true });
        column.text("Cliente");
        column.text("María López");
      });
      row.item({ weight: 2 }).text("Dirección");
      row.item("*").text("TOTAL").alignRight();
    });
  });
  const [page] = await readPages(document.toBytes());
  const client = page.items.find(item => item.str === "Cliente");
  const address = page.items.find(item => item.str === "Dirección");
  const total = page.items.find(item => item.str === "TOTAL");
  assert.ok(client.transform[4] >= 20 && client.transform[4] < 21);
  assert.ok(address.transform[4] >= 130 && address.transform[4] < 131);
  assert.ok(total.transform[4] > 290);
  assert.equal(client.height, 10);
  assert.notEqual(client.fontName, address.fontName);
});

test("composición: keepTogether desplaza el bloque completo a la siguiente página", async () => {
  const document = PDF.create().page(page => {
    page.size([260, 200]).margin(20);
    page.content().column(column => {
      column.text(Array(8).fill("Contenido previo").join("\n"));
      column.text("Bloque unido A\nBloque unido B\nBloque unido C").keepTogether();
    });
  });
  const pages = await readPages(document.toBytes());
  assert.equal(pages.length, 2);
  assert.doesNotMatch(pages[0].text, /Bloque unido/);
  assert.match(pages[1].text, /Bloque unido A.*Bloque unido B.*Bloque unido C/);
});

test("composición: errores identifican el contenedor y los límites disponibles", () => {
  // Las filas altas se dividen; solo falla si la cabecera no deja sitio ni para una línea.
  const tooTall = PDF.create().page(page => {
    page.size([240, 200]).margin(20);
    page.content().table(table => {
      table.columns(["*"]).header(["Cabecera\n".repeat(9)]).row(["Una línea\n".repeat(30)]);
    });
  });
  assert.throws(() => tooTall.toBytes(), error => error instanceof LayoutError
    && error.path.includes("row[1]") && /necesita .*disponibles/.test(error.message));
  const mismatched = PDF.create().page(page => page.content().table(table => {
    table.columns(["*", "*"]).row(["Solo una celda"]);
  }));
  assert.throws(() => mismatched.toBytes(), /row\[1\].*2 celdas.*1/);
  const invalidWidth = PDF.create().page(page => {
    page.size([200, 200]);
    page.content().row(row => row.item(200).text("Muy ancho"));
  });
  assert.throws(() => invalidWidth.toBytes(), /más ancho del disponible/);
  const invalidMargins = PDF.create().page(page => page.margin(500));
  assert.throws(() => invalidMargins.toBytes(), /márgenes/);
  const invalidNumber = PDF.create().page(page => page.content().pageNumber());
  assert.throws(() => invalidNumber.toBytes(), /solo se admite en el encabezado o pie/);
});

test("composición: snapshot independiente y exportaciones deterministas", () => {
  const style = { fontSize: 12, color: { r: 0, g: 0, b: 0 } };
  let retained;
  const document = PDF.create().page(page => {
    page.defaultTextStyle(style);
    retained = page.content().text("Original");
  });
  const before = document.toBytes();
  style.color.r = 1;
  style.fontSize = 99;
  retained.fontSize(200);
  assert.deepEqual(document.toBytes(), before);
  const lowLevel = document.toDocument();
  lowLevel.addPage();
  assert.deepEqual(document.toBytes(), before);
  assert.notDeepEqual(lowLevel.toBytes(), before);
});

test("composición: slots únicos y callbacks fallidos no añaden páginas parciales", () => {
  const document = PDF.create();
  assert.throws(() => document.page(page => {
    page.content().text("Uno");
    page.content().text("Dos");
  }), /Usa column/);
  assert.throws(() => document.toBytes(), /al menos una página/);
  document.page(page => page.content().text("Correcto"));
  assert.equal(document.toDocument().pageCount, 1);
});

test("composición: páginas vacías y numeración global entre tamaños diferentes", async () => {
  const blank = PDF.create().page(() => {});
  assert.equal(blank.toDocument().pageCount, 1);
  const document = PDF.create()
    .page(page => { page.size("A5"); page.footer().pageNumber(); })
    .page(page => { page.size("Letter"); page.footer().pageNumber(); });
  const pages = await readPages(document.toBytes());
  assert.match(pages[0].text, /Página 1 de 2/);
  assert.match(pages[1].text, /Página 2 de 2/);
  assert.notEqual(pages[0].height, pages[1].height);
});

test("composición: valores no finitos y colores inválidos se rechazan con contexto", () => {
  for (const style of [{ fontSize: NaN }, { color: { r: 2, g: 0, b: 0 } }, { lineHeight: 1 }]) {
    const document = PDF.create().page(page => page.content().text("Texto").style(style));
    assert.throws(() => document.toBytes(), error => error instanceof LayoutError && error.path === "page[1].content");
  }
});

test("composición: filas de altura variable no se superponen ni separan sus celdas", async () => {
  const document = PDF.create().page(page => {
    page.size([350, 360]).margin(20);
    page.content().table(table => {
      table.columns(["*", 60]);
      for (let index = 1; index <= 12; index++) {
        const id = String(index).padStart(2, "0");
        table.row([`Inicio${id} ${"contenido variable ".repeat(index % 4 * 3)} Fin${id}`, `ID${id}`]);
      }
    });
  });
  const pages = await readPages(document.toBytes());
  assert.ok(pages.length > 1);
  for (let index = 1; index <= 12; index++) {
    const id = String(index).padStart(2, "0");
    const matches = pages.filter(page => page.text.includes(`Inicio${id}`));
    assert.equal(matches.length, 1);
    const page = matches[0];
    assert.ok(page.text.includes(`Fin${id}`));
    assert.ok(page.text.includes(`ID${id}`));
    const end = page.items.find(item => item.str.includes(`Fin${id}`));
    const next = page.items.find(item => item.str.includes(`Inicio${String(index + 1).padStart(2, "0")}`));
    if (next) assert.ok(end.transform[5] - next.transform[5] > 12, "separación vertical de filas");
  }
});

test("composición: tabla comienza con su primera fila y encabezado juntos", async () => {
  const document = PDF.create().page(page => {
    page.size([260, 200]).margin(20);
    page.content().column(column => {
      column.text(Array(7).fill("Texto previo").join("\n"));
      column.table(table => table.columns(["*"]).header(["Cabecera única"]).row(["Primera fila"]));
    });
  });
  const pages = await readPages(document.toBytes());
  assert.equal(pages.length, 2);
  assert.doesNotMatch(pages[0].text, /Cabecera única/);
  assert.match(pages[1].text, /Cabecera única.*Primera fila/);
});

test("composición: espacios finales no generan páginas fantasma y una fila imposible falla", () => {
  const document = PDF.create().page(page => {
    page.size([240, 200]).margin(20);
    page.content().column(column => {
      column.gap(1000);
      column.text("Único contenido");
      column.column(() => {});
    });
  });
  assert.equal(document.toDocument().pageCount, 1);
  const row = PDF.create().page(page => {
    page.size([240, 200]).margin(20);
    page.content().row(row => row.item().text("Texto\n".repeat(40)));
  });
  assert.throws(() => row.toBytes(), /necesita .*disponibles/);
});

test("composición: celdas combinadas con colSpan y rowSpan", async () => {
  const document = PDF.create().page(page => {
    page.size([400, 400]).margin(20);
    page.content().table(table => {
      table.columns([120, 120, 120]).padding(4);
      table.header([{ text: "Producto", rowSpan: 2 }, { text: "Trimestre", colSpan: 2, style: { align: "center" } }]);
      table.headerRow(["Ene", "Feb"]);
      table.row([{ text: "Zona norte", rowSpan: 2 }, "10", "20"]);
      table.row(["30", "40"]);
      table.row([{ text: "Total", colSpan: 2 }, "100"]);
    });
  });
  const [page] = await readPages(document.toBytes());
  const at = text => page.items.find(item => item.str === text).transform;
  assert.ok(at("Trimestre")[4] > 140 + 60 && at("Trimestre")[4] < 260);
  assert.equal(at("Ene")[5], at("Feb")[5]);
  assert.ok(at("Ene")[5] < at("Trimestre")[5]);
  assert.ok(Math.abs(at("Ene")[4] - (140 + 4)) < 1 && Math.abs(at("Feb")[4] - (260 + 4)) < 1);
  assert.ok(Math.abs(at("30")[4] - (140 + 4)) < 1);
  assert.ok(at("30")[5] < at("10")[5]);
  assert.equal(at("Zona norte")[5], at("10")[5]);
  assert.ok(Math.abs(at("100")[4] - (260 + 4)) < 1);
  assert.ok(at("Total")[5] < at("30")[5]);
});

test("composición: rowSpan reparte la altura y mantiene el grupo en una página", async () => {
  const tall = "Línea\n".repeat(6).trim();
  const document = PDF.create().page(page => {
    page.size([300, 260]).margin(20);
    page.content().table(table => {
      table.columns(["*", "*"]).header(["A", "B"]);
      for (let i = 1; i <= 4; i++) table.row([`Fila ${i}`, `${i}`]);
      table.row([{ text: tall, rowSpan: 2 }, "Arriba"]);
      table.row(["Abajo"]);
    });
  });
  const pages = await readPages(document.toBytes());
  assert.equal(pages.length, 2);
  assert.doesNotMatch(pages[0].text, /Arriba|Abajo|Línea/);
  assert.match(pages[1].text, /^A\s+B\s+Línea.*Arriba.*Abajo/);
  const items = pages[1].items;
  const y = text => items.find(item => item.str === text).transform[5];
  const lines = items.filter(item => item.str === "Línea").map(item => item.transform[5]);
  assert.ok(y("Abajo") < y("Arriba") && y("Abajo") > Math.min(...lines));
});

test("composición: errores de celdas combinadas", () => {
  const fails = (build, pattern) => assert.throws(
    () => PDF.create().page(page => { page.size([300, 200]).margin(20); page.content().table(build); }).toBytes(), pattern);
  fails(table => table.columns(["*", "*"]).row([{ text: "X", colSpan: 3 }]), /row\[1\]\.cell\[1\].*no cabe/);
  fails(table => table.columns(["*", "*"]).row([{ text: "X", colSpan: 0 }]), /colSpan debe ser un entero/);
  fails(table => table.columns(["*", "*"]).row([{ text: "X", rowSpan: 2 }, "Y"]), /rowSpan 2 supera/);
  fails(table => table.columns(["*", "*"]).row([{ text: "X", rowSpan: 2 }, "Y"]).row(["A", "B"]), /row\[2\]\.cell\[2\].*no cabe/);
  fails(table => table.columns(["*", "*", "*"]).row([{ text: "X", colSpan: 2 }]), /row\[1\].*cubren 2 de 3/);
  fails(table => table.columns(["*", "*"]).header([{ text: "X", rowSpan: 2 }, "Y"]).row(["A", "B"]), /header.*rowSpan 2 supera/);
  fails(table => table.columns(["*", "*"]).header(["A", "B"])
    .row([{ text: "Muy alta\n".repeat(20), rowSpan: 2 }, "1"]).row(["2"]),
  error => error instanceof LayoutError && error.path.includes("row[1-2]") && /rowSpan.*necesita/.test(error.message));
});
