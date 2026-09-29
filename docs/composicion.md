# Componer documentos con SanPDF

Usa `PDF.create()` para crear un documento y añadir texto, tablas, imágenes y QR
sin calcular coordenadas. SanPDF ajusta el contenido y crea páginas cuando hace falta.

## Páginas y secciones

```ts
import { PDF, rgb } from "sanpdf";

const documento = PDF.create({ title: "Informe", author: "Mi aplicación" });
documento.page(page => {
  page.size("A4").margin({ top: 48, bottom: 48, left: 40, right: 40 });
  page.defaultTextStyle({ fontSize: 11, color: rgb(0.15, 0.15, 0.15) });
  page.sectionGap(16);
  page.header().text("Informe mensual").fontSize(20).bold();
  page.content().text("Contenido del informe.");
  page.footer().pageNumber("Página {page} de {pages}").fontSize(9).alignCenter();
});

const bytes = documento.toBytes();
```

- Tamaños: `A4`, `A5`, `Letter`, `Legal` o `[ancho, alto]` en puntos.
- Valores predeterminados: A4, márgenes de 40 pt, Helvetica de 12 pt y separación
  de 12 pt entre encabezado/contenido/pie.
- `header()`, `content()` y `footer()` admiten un único elemento raíz. Para varios,
  usa `column()` o `row()`. Reemplazar accidentalmente un elemento produce un error.
- Una sección puede paginar. Su encabezado y pie se repiten y reservan espacio real.
- Otra llamada a `page()` inicia una sección nueva, con sus propias opciones.
- `pageNumber()` solo se admite en encabezados y pies. Se calcula con el total real
  de páginas del documento; la reserva de ancho contempla hasta seis dígitos y debe
  caber en una línea. También admite texto fijo junto a `{page}` y `{pages}`.
- `toDocument()` devuelve un `PDFDocument` independiente para integraciones de bajo nivel.
  `toBytes()` produce los bytes directamente. Cada exportación vuelve a calcular el diseño.
- Al terminar el callback de `page()`, se copia el modelo: modificar después los
  estilos o builders conservados por la aplicación no modifica esa sección.
- Los callbacks de construcción son síncronos. Carga los datos antes de llamar a `page()`.

## Texto y estilos

```ts
const titulo = { fontSize: 18, bold: true, color: rgb(0.1, 0.25, 0.45) };

documento.page(page => {
  page.content().column(column => {
    column.style({ fontSize: 11 });
    column.text("Resumen").style(titulo);
    column.text("Texto que se ajusta al ancho automáticamente.")
      .padding(12)
      .background(rgb(0.94, 0.96, 0.98))
      .border(rgb(0.7, 0.7, 0.7));
    column.text("Firma del responsable").alignRight().keepTogether();
  });
});
```

Los estilos se heredan desde la página y los contenedores. El estilo local tiene
prioridad. `style()` combina propiedades, por lo que puedes reutilizar un objeto
y sobrescribir después una propiedad con un método encadenado.

`TextStyle` permite `font`, `fontSize`, `bold`, `italic`, `color`, `align` y `lineHeight`.
Los métodos abreviados son `font()`, `fontSize()`, `lineHeight()`, `bold()`, `italic()`,
`color()`, `alignLeft()`, `alignCenter()` y `alignRight()`.
`bold()` e `italic()` conservan la familia de la fuente seleccionada y se pueden combinar.
Los colores aceptan `rgb(0.1, 0.25, 0.45)` o una cadena hexadecimal como `"#1F4788"`.

### Estilos mezclados en un párrafo

`text()` también acepta una lista de fragmentos. Cada fragmento puede cambiar
`font`, `bold`, `italic` y `color`, y tener su propio `link`:

```ts
column.text([
  "El total es ",
  { text: "S/ 118.00", style: { bold: true, color: "#C00000" } },
  ". Paga en ",
  { text: "example.com/pagos", link: "https://example.com/pagos" },
  ".",
]).fontSize(12).alignRight();
```

El tamaño, el interlineado y la alineación pertenecen al párrafo: se aplican con los
métodos del bloque, no dentro de los fragmentos (hacerlo produce un error que lo
explica). El ajuste de líneas trata el párrafo como un todo, así que una palabra
formada por dos fragmentos no se corta entre ellos. Las celdas de tabla también
aceptan fragmentos: `{ text: ["Precio ", { text: "final", style: { bold: true } }] }`.

`padding()`, `background()` y `border()` decoran un bloque de texto. El padding
admite un número o lados individuales. Si el texto se divide entre páginas, cada
fragmento conserva su decoración y padding. `keepTogether()` impide esa división.
Los bordes de composición tienen un grosor de 0.5 pt.

## Columnas y filas

`column()` apila elementos y permite paginarlos. `gap()` define la separación
entre hermanos (12 pt por defecto), sin crear una página vacía por un espacio final.

```ts
documento.page(page => {
  page.content().row(row => {
    row.gap(16);
    row.item(120).text("Etiqueta fija").bold();
    row.item({ weight: 2 }).column(column => {
      column.gap(4);
      column.text("Nombre del cliente");
      column.text("Dirección que puede ocupar varias líneas");
    });
    row.item("*").text("Importe").alignRight();
  });
});
```

Los números son anchos fijos; `"*"` equivale a peso 1. El espacio restante después
de los anchos fijos y separaciones se reparte proporcionalmente por peso.
`row.item()` usa `"*"` por defecto. Si todos los anchos son fijos, el espacio
sobrante queda a la derecha. Una fila se alinea arriba y tiene la altura del hijo
más alto. Se mantiene completa al paginar, incluidos sus contenedores anidados.

## Tablas

```ts
documento.page(page => {
  page.content().table(table => {
    table.columns(["*", 80, 100]);
    table.header(["Descripción", "Cantidad", "Importe"]);
    table.headerStyle({ bold: true, color: rgb(0.1, 0.25, 0.45) });
    table.padding(8);
    table.row([
      "Servicio de mantenimiento",
      { text: "1", style: { align: "center" } },
      { text: "S/ 250.00", style: { align: "right" } },
    ]);
  });
});
```

- La altura de cada fila depende de la celda más alta.
- Cada fila debe tener exactamente tantas celdas como columnas.
- Las celdas admiten texto o `{ text, style }`.
- `style()` define el estilo común; `headerStyle()` modifica el del encabezado.
- `padding()`, `border()` y `headerBackground()` personalizan la tabla.
- Al continuar en otra página se repite la cabecera, junto con al menos una fila.
- El encabezado es opcional. Una tabla con solo cabecera también se puede dibujar.
- Una fila que cabe en una página nunca se divide: si no hay espacio, pasa completa
  a la siguiente.
- Una fila más alta que una página se divide por líneas: continúa en las páginas
  siguientes, con la cabecera repetida y los bordes de cada celda cerrados en cada tramo.
- Solo hay error si la cabecera no deja sitio ni para una línea de la fila. El mensaje
  indica su índice y el espacio necesario. No se recorta ni se reduce la fuente.

## Imágenes

```ts
import { loadImage } from "sanpdf";

const logo = loadImage(bytesDelArchivo); // JPEG o PNG, como Uint8Array

documento.page(page => {
  page.header().image(logo).width(80);
  page.content().column(column => {
    column.image(logo).height(40).alignCenter();
    column.image(bytesDeOtraFoto); // también acepta los bytes directamente
  });
});
```

- Solo `width()` o solo `height()`: la otra medida conserva la proporción.
- Ambos: la imagen se ajusta dentro de ese recuadro sin deformarse.
- Ninguno: 1 píxel = 1 punto, reducido al ancho disponible si hace falta.
- Un ancho explícito mayor que el disponible produce un `LayoutError`.
- Una misma `PDFImage` se guarda una sola vez en el archivo, aunque se repita en el
  encabezado de cada página. Si pasas bytes, cada llamada crea una imagen nueva.
- PNG admite paleta, escala de grises (1–16 bits), RGB, transparencia (canal alfa o
  `tRNS`) y entrelazado. JPEG admite escala de grises, RGB y CMYK, baseline o progresivo.

## Códigos QR

```ts
column.qrCode("20123456789|01|F001|123|18.00|118.00|2026-09-27|6|20100070970|")
  .size(110)            // lado total en puntos, incluido el margen blanco
  .errorCorrection("Q") // L, M (por defecto), Q o H
  .alignRight();
```

El QR se dibuja con vectores, no como imagen: es nítido a cualquier escala y ocupa
pocos bytes. Se elige automáticamente la versión más pequeña (1–40) y el modo más
compacto (numérico, alfanumérico o bytes UTF-8). El tamaño incluye la zona de silencio
de 4 módulos que exige la norma. Un contenido demasiado largo produce un error claro.

## Separadores y espacios

```ts
column.text("Resumen");
column.divider();                           // línea gris de 1 pt a todo el ancho
column.divider().color("#1F4788").thickness(2);
column.space(mm(10));                       // espacio vertical adicional
```

`space()` se suma al `gap()` de la columna y, como éste, se omite al comienzo de una
página. `mm()`, `cm()` e `inch()` convierten a puntos en cualquier medida.

## Enlaces y marcadores

```ts
column.text("Visita nuestra tienda").link("https://example.com/tienda");
column.text("1. Introducción").bold().bookmark();
column.text("2. Resultados del mes").bold().bookmark("Resultados");
```

- `link()` hace clicable todo el bloque; un fragmento con su propio `link` lo sustituye.
  La dirección debe incluir el esquema: `https://`, `mailto:` o `tel:`.
- `bookmark()` añade una entrada al panel lateral del lector que salta a la página
  donde se dibuja el texto. Sin argumento usa el propio texto como título.
  No se admite en encabezados o pies, porque se repetirían en cada página.

## Componentes reutilizables

Un componente puede ser una función TypeScript que recibe un builder y datos:

```ts
import type { ColumnBuilder } from "sanpdf";

function cliente(column: ColumnBuilder, nombre: string, direccion: string) {
  column.text("Cliente").bold();
  column.text(nombre);
  column.text(direccion);
}

documento.page(page => {
  page.content().column(column => cliente(column, "María López", "Lima"));
});
```

No requiere registro global, herencia ni una clase por plantilla.

## Errores y límites

Un `LayoutError` expone `path`, por ejemplo
`page[1].content.column[3].row[2].cell[1]`, y un mensaje que explica el problema.
Los índices de los mensajes empiezan en 1. Se mide todo antes de renderizar;
una exportación fallida no modifica el modelo ni devuelve un PDF parcial.

Esta versión admite texto (simple o con estilos mezclados), imágenes, códigos QR,
separadores, filas, columnas y tablas de celdas de texto. Todavía no hay celdas
combinadas, fuentes incrustadas, justificación, control de viudas/huérfanas o unión
de un título con el bloque siguiente. Las filas de composición (`row()`) son
indivisibles; las de tabla solo se dividen si superan una página.
Para unir varios textos cortos en un bloque indivisible, se pueden colocar en una
columna dentro de `row.item()`; ese bloque debe caber en una página.

## Ejemplo: factura con imágenes, QR y enlaces

En Node.js, coloca `logo.png` junto al script antes de ejecutarlo:

```js
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { PDF, loadImage, mm } from "sanpdf";

// La misma imagen se guarda una sola vez aunque se repita en el encabezado.
const logo = loadImage(readFileSync("logo.png"));
const pdf = PDF.create({ title: "Factura F001-123" }).page(page => {
  page.size("A4").margin(mm(15));
  page.header().row(row => {
    row.item(mm(30)).image(logo).width(mm(25));
    row.item().text("FACTURA ELECTRÓNICA\nF001-123").bold().alignRight();
  });
  page.content().column(column => {
    column.text("Resumen").fontSize(16).bold().color("#1F4788").bookmark();
    column.text(["Total a pagar: ", { text: "S/ 118.00", style: { bold: true } }]);
    column.divider();
    column.text(["Consulta tu comprobante en ",
      { text: "example.com/comprobantes", link: "https://example.com/comprobantes" }]);
    column.space(mm(5));
    column.qrCode("20123456789|01|F001|123|18.00|118.00|2026-09-27|6|20100070970|")
      .size(mm(30)).alignRight();
  });
});

await writeFile("factura.pdf", pdf.toBytes());
```

Consulta también el [uso en navegador](navegador.md) y los
[límites de codificación, fuentes y formatos](limites.md).
