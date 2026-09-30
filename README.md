# SanPDF

Genera documentos PDF desde JavaScript y TypeScript con un motor propio y **sin
dependencias de ejecución**. Crea pedidos, cartas e informes con tablas, imágenes,
códigos QR y paginación automática.

## Instalación

```sh
npm install sanpdf
```

También puedes usar `pnpm add sanpdf`. Paquete **ESM** (`import`) con tipos
TypeScript incluidos, para Node.js y aplicaciones de navegador compatibles con ESM.

## Inicio rápido — Node.js

```js
import { writeFile } from "node:fs/promises";
import { PDF } from "sanpdf";

const pdf = PDF.create({ title: "Mi pedido" });

pdf.page(page => {
  page.size("A4").margin(40);
  page.header().text("Pedido de venta").fontSize(24).bold();

  page.content().column(column => {
    column.gap(12);
    column.text("Cliente: María López");

    column.table(table => {
      table.columns(["*", 70, 100]);
      table.header(["Producto", "Cantidad", "Importe"]);
      table.row(["Cable HDMI", "2", "S/ 40.00"]);
    });

    column.text("Total: S/ 40.00").bold().alignRight();
  });

  page.footer().pageNumber().alignCenter();
});

await writeFile("pedido.pdf", pdf.toBytes());
```

Guárdalo como `pedido.mjs` y ejecuta `node pedido.mjs`. SanPDF ajusta el texto,
distribuye las tablas y repite encabezados y pies cuando el contenido ocupa varias
páginas. `toBytes()` devuelve un `Uint8Array`; tu aplicación decide cómo guardarlo
o descargarlo.

## Funciones principales

- `PDF.create()` y `page()`: crear el documento y configurar sus páginas.
- `text()`, `column()` y `row()`: añadir texto y organizar el contenido.
- `table()`: crear tablas con cabeceras repetidas y paginación automática.
- `image()` y `qrCode()`: insertar imágenes JPEG/PNG y códigos QR.
- `header()`, `footer()` y `pageNumber()`: añadir encabezados, pies y numeración.
- `toBytes()`: obtener el PDF para guardarlo o descargarlo.

## Documentación y ejemplos

- [Crear documentos con texto, tablas, imágenes y QR](https://github.com/Vilduis/sanpdf/blob/main/docs/composicion.md)
- [Dibujar por coordenadas y medir texto](https://github.com/Vilduis/sanpdf/blob/main/docs/api-bajo-nivel.md)
- [Generar y descargar un PDF en el navegador](https://github.com/Vilduis/sanpdf/blob/main/docs/navegador.md)
- [Formatos admitidos y límites](https://github.com/Vilduis/sanpdf/blob/main/docs/limites.md)
- Ejemplos completos: [pedido](https://github.com/Vilduis/sanpdf/blob/main/examples/api.mjs) y [carta](https://github.com/Vilduis/sanpdf/blob/main/examples/carta.mjs).

## Alcance actual

SanPDF crea documentos nuevos. Usa las doce variantes estándar de Helvetica,
Times y Courier, con texto WinAnsi: admite español y otros caracteres occidentales,
pero no emojis ni escrituras fuera de esa codificación.

Todavía no incluye fuentes incrustadas, celdas combinadas (`rowSpan`/`colSpan`),
lectura o edición de PDF existentes, cifrado ni firmas digitales.

## Licencia

[MIT](https://github.com/Vilduis/sanpdf/blob/main/LICENSE) © 2026 Vilduis
