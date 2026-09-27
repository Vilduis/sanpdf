import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDF, mm } from "sanpdf";

// Cambia los datos: el motor ajusta las alturas y resuelve los saltos de página.
const articulos = Array.from({ length: 42 }, (_, index) => ({
  descripcion: `Artículo ${String(index + 1).padStart(2, "0")} - Material de oficina`,
  cantidad: index % 3 + 1,
  precioCentimos: 1250 + index * 100,
}));
const dinero = centimos => `S/ ${(centimos / 100).toFixed(2)}`;
const azul = "#1F4788";
const suave = "#F0F5FA";
const titulo = { fontSize: 16, bold: true, color: azul };

export function createExample() {
  return PDF.create({
    title: "Ejemplo de la API de SanPDF",
    author: "SanPDF",
    subject: "Documento compuesto con filas, columnas, tablas y paginación",
  }).page(page => {
    page.size("A4").margin(mm(15)).defaultTextStyle({ fontSize: 11 });

    // El encabezado se repite en todas las páginas de esta sección.
    page.header().row(row => {
      row.item().text("SanPDF").fontSize(24).bold().color(azul);
      row.item().text("PEDIDO DE EJEMPLO\nN.º 0001").alignRight();
    });

    page.content().column(column => {
      column.gap(16);
      column.text("Resumen del pedido").style(titulo).bookmark();

      column.row(row => {
        row.item().column(details => {
          details.gap(4);
          details.text("CLIENTE").bold().color(azul);
          details.text("María López\nAv. Los Álamos 123, Lima");
        });
        row.item().column(details => {
          details.gap(4);
          details.text("FECHA Y MONEDA").bold().color(azul);
          details.text("26/09/2026\nSoles peruanos");
        });
      });

      column.text("Documento de demostración con datos ficticios. Puedes cambiar los textos "
        + "y agregar artículos: SanPDF ajusta el contenido automáticamente.")
        .padding(12).background(suave);

      // * recibe el ancho restante; las cantidades e importes usan anchos fijos.
      // La cabecera se repite cuando la tabla continúa en otra página.
      column.table(table => {
        table.columns(["*", 60, 90]).header(["Descripción", "Cant.", "Importe"]);
        for (const articulo of articulos) {
          table.row([
            articulo.descripcion,
            { text: String(articulo.cantidad), style: { align: "center" } },
            { text: dinero(articulo.cantidad * articulo.precioCentimos), style: { align: "right" } },
          ]);
        }
      });

      const total = articulos.reduce((sum, articulo) => sum + articulo.cantidad * articulo.precioCentimos, 0);
      // Un párrafo puede mezclar estilos: el tamaño y la alineación son del párrafo.
      column.text(["Total a pagar: ", { text: dinero(total), style: { bold: true, color: azul } }])
        .fontSize(16).alignRight().padding(12).background(suave).keepTogether();

      column.divider();
      column.text("Observaciones").style(titulo).bookmark();
      column.row(row => {
        row.gap(16);
        row.item().column(notas => {
          notas.gap(8);
          notas.text(["Este ejemplo usa ", { text: "únicamente", style: { italic: true } },
            " la API pública de SanPDF. Las posiciones, alturas y saltos de página los calcula el motor. "
            + "Los párrafos largos continúan en la siguiente página y las filas de la tabla se dividen solo si no caben en una página."]);
          notas.text(["Consulta tu pedido en ", { text: "example.com/pedidos/0001", link: "https://example.com/pedidos/0001", style: { color: azul } }]);
        });
        // El QR se dibuja con vectores: nítido a cualquier escala y sin imágenes.
        row.item(90).qrCode("https://example.com/pedidos/0001").size(90).alignRight();
      });
      column.text("¡Gracias por tu pedido!").bold().alignCenter();
    });

    page.footer().pageNumber("Página {page} de {pages}").fontSize(9).alignCenter();
  });
}

// Las operaciones de disco pertenecen a la aplicación, no al motor de SanPDF.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const document = createExample().toDocument();
  const directory = new URL("../output/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("ejemplo-api.pdf", directory), document.toBytes());
  console.log(`Generado output/ejemplo-api.pdf (${document.pageCount} páginas).`);
}
