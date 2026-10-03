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
Requiere Node.js 18 o superior.

## Inicio rápido

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

Ejemplos completos: [pedido](https://github.com/Vilduis/sanpdf/blob/main/examples/api.mjs)
y [carta](https://github.com/Vilduis/sanpdf/blob/main/examples/carta.mjs).

## Funciones principales

- `PDF.create()` y `page()`: crear el documento y configurar sus páginas.
- `text()`, `column()` y `row()`: añadir texto y organizar el contenido.
- `table()`: crear tablas con cabeceras repetidas, celdas combinadas
  (`colSpan`/`rowSpan`) y paginación automática.
- `image()` y `qrCode()`: insertar imágenes JPEG/PNG y códigos QR.
- `header()`, `footer()` y `pageNumber()`: añadir encabezados, pies y numeración.
- `toBytes()`: obtener el PDF para guardarlo o descargarlo.

## Contenido

- [Páginas y secciones](#páginas-y-secciones)
- [Texto y estilos](#texto-y-estilos)
- [Columnas y filas](#columnas-y-filas)
- [Tablas](#tablas) y [celdas combinadas](#celdas-combinadas)
- [Imágenes](#imágenes)
- [Códigos QR](#códigos-qr)
- [Separadores y espacios](#separadores-y-espacios)
- [Enlaces y marcadores](#enlaces-y-marcadores)
- [Componentes reutilizables](#componentes-reutilizables)
- [Errores](#errores)
- [Ejemplo: factura con imágenes, QR y enlaces](#ejemplo-factura-con-imágenes-qr-y-enlaces)
- [Uso en el navegador](#uso-en-el-navegador)
- [API personalizada](#api-personalizada)
- [Límites y compatibilidad](#límites-y-compatibilidad)

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
- `toBytes()` produce los bytes. `toDocument()` devuelve un `PDFDocument` independiente
  para seguir dibujando con la [API personalizada](#api-personalizada). Cada exportación
  vuelve a calcular el diseño.
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

`padding()`, `background()` y `border()` decoran un bloque de texto. El padding
admite un número o lados individuales. Si el texto se divide entre páginas, cada
fragmento conserva su decoración y padding. `keepTogether()` impide esa división.
Los bordes de composición tienen un grosor de 0.5 pt.

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
más alto. Se mantiene completa al paginar, incluidos sus contenedores anidados,
por lo que debe caber en una página. Para unir varios textos cortos en un bloque
indivisible, colócalos en una columna dentro de `row.item()`.

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

- Las columnas usan los mismos anchos que `row()`: números fijos, `"*"` o `{ weight }`.
- La altura de cada fila depende de la celda más alta.
- Cada fila debe cubrir exactamente todas las columnas.
- Las celdas admiten texto o `{ text, style, colSpan, rowSpan }`.
- `style()` define el estilo común; `headerStyle()` modifica el del encabezado.
- `padding()`, `border()` y `headerBackground()` personalizan la tabla.
- El encabezado es opcional. Una tabla con solo cabecera también se puede dibujar.
- Al continuar en otra página se repite la cabecera, junto con al menos una fila.
- Una fila que cabe en una página nunca se divide: si no hay espacio, pasa completa
  a la siguiente.
- Una fila más alta que una página se divide por líneas: continúa en las páginas
  siguientes, con la cabecera repetida y los bordes de cada celda cerrados en cada tramo.
- Solo hay error si la cabecera no deja sitio ni para una línea de la fila. El mensaje
  indica su índice y el espacio necesario. No se recorta ni se reduce la fuente.
- Una tabla dentro de `row()` es indivisible, igual que esa fila.

### Celdas combinadas

`colSpan` une columnas y `rowSpan` une filas. Como en HTML, las filas siguientes
omiten las posiciones que ya cubre una celda con `rowSpan`. `headerRow()` añade
filas de cabecera para agrupar columnas.

```ts
documento.page(page => {
  page.content().table(table => {
    table.columns(["*", 70, 70, 80]);
    table.header([
      { text: "Producto", rowSpan: 2 },
      { text: "Ventas", colSpan: 2, style: { align: "center" } },
      { text: "Total", rowSpan: 2, style: { align: "right" } },
    ]);
    table.headerRow(["Ene", "Feb"]); // la 1.ª y la 4.ª columna ya están cubiertas
    table.row([{ text: "Zona norte", rowSpan: 2 }, "10", "20", "30"]);
    table.row(["5", "5", "10"]);      // sin celda para "Producto"
    table.row([{ text: "Total general", colSpan: 3 }, "40"]);
  });
});
```

- `header()` define una sola fila de cabecera y reemplaza las anteriores;
  `headerRow()` añade otra. Todas se repiten juntas en cada página.
- `colSpan` y `rowSpan` son enteros desde 1. Un `rowSpan` no puede salir de la
  cabecera ni pasar de la última fila.
- Si una celda combinada necesita más altura que la suma de sus filas, la diferencia
  se reparte por igual entre ellas. El texto se alinea arriba.
- Las filas unidas por `rowSpan` forman un grupo que nunca se divide: si no cabe,
  pasa completo a la página siguiente. Un grupo más alto que una página produce un
  `LayoutError` con su rango, por ejemplo `row[3-4]`. Las filas sin `rowSpan`
  (aunque usen `colSpan`) se siguen dividiendo por líneas cuando hace falta.
- Una celda que excede las columnas, se superpone con una combinada o una fila que
  no cubre todas las columnas producen un error que indica la fila y la celda.

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

Los formatos admitidos se detallan en [Límites y compatibilidad](#límites-y-compatibilidad).

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

## Errores

Un `LayoutError` expone `path`, por ejemplo
`page[1].content.column[3].row[2].cell[1]`, y un mensaje que explica el problema.
Los índices de los mensajes empiezan en 1. Se mide todo antes de renderizar;
una exportación fallida no modifica el modelo ni devuelve un PDF parcial.

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

## Uso en el navegador

SanPDF devuelve un `Uint8Array` y no accede al disco ni a la red. En una aplicación
con un bundler compatible con ESM (por ejemplo, Vite), instala `sanpdf` e impórtalo
como cualquier dependencia. El navegador por sí solo no resuelve el nombre
`"sanpdf"` sin un bundler o un mapa de importaciones.

Llama a esta función desde un botón de tu aplicación para crear y descargar el PDF:

```js
import { PDF } from "sanpdf";

export function descargarPDF() {
  const pdf = PDF.create({ title: "Mi documento" });
  pdf.page(page => {
    page.size("A4").margin(40);
    page.content().text("¡Hola, España!").fontSize(20);
  });

  const bytes = pdf.toBytes();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "informe.pdf";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
```

Para usar imágenes, obtén sus bytes antes de construir el documento. Por ejemplo,
con un `File` seleccionado en un campo de archivo:

```js
import { loadImage } from "sanpdf";

const logo = loadImage(new Uint8Array(await archivo.arrayBuffer()));
```

Después usa `page.header().image(logo).width(80)` o `column.image(logo)`.
Los callbacks de `page()` son síncronos; completa las operaciones asíncronas antes
de llamarlos.

## API personalizada

Usa `PDFDocument` cuando quieras decidir tú la posición exacta de cada elemento:
plantillas, formularios preimpresos, etiquetas o diseños libres. Las medidas están
en puntos; el origen está arriba a la izquierda.

### Dibujar en posiciones exactas

```js
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { PDFDocument, PageSizes, StandardFonts, rgb } from "sanpdf";

const pdf = new PDFDocument({ title: "Mi informe", author: "José" });
const page = pdf.addPage(PageSizes.A4);

page.drawText("¡Hola, España!", {
  x: 40,
  y: 60,
  size: 20,
  font: StandardFonts.HelveticaBold,
  color: rgb(0.15, 0.25, 0.4),
});

page.drawText("Primera línea\nSegunda línea", {
  x: 40, y: 100, size: 12, lineHeight: 18,
});

page.drawRectangle({
  x: 40, y: 150, width: 200, height: 70,
  fillColor: rgb(0.94, 0.96, 0.98),
  borderColor: rgb(0.15, 0.25, 0.4),
  borderWidth: 1,
});

page.drawLine({
  start: { x: 40, y: 250 },
  end: { x: 300, y: 250 },
  width: 1,
});

// Coloca un archivo logo.jpg junto al script antes de ejecutarlo.
page.drawImage(readFileSync("logo.jpg"), { x: 40, y: 300, width: 120 });
page.drawQRCode("https://example.com", { x: 400, y: 300, size: 100 });
page.drawText("Visitar sitio web", { x: 40, y: 465, size: 12 });
page.addLink({ x: 40, y: 450, width: 200, height: 20, url: "https://example.com" });
pdf.addBookmark("Portada", page);

await writeFile("informe.pdf", pdf.toBytes());
```

- En `drawText`, `y` indica la línea base de la primera línea.
- En rectángulos, imágenes y QR, `x` e `y` indican la esquina superior izquierda.
- Texto y líneas son negros por defecto. Un rectángulo sin colores tiene borde
  negro; con solo `fillColor`, tiene relleno sin borde.
- `drawImage` acepta bytes o una imagen creada con `loadImage()`. Si solo indicas
  `width` o `height`, conserva la proporción. Una misma `PDFImage` se almacena una
  sola vez aunque se dibuje repetidamente.
- `drawQRCode` usa `size` como lado total, incluida la zona de silencio de 4 módulos.
  Admite versiones 1–40 y niveles de corrección L/M/Q/H.
- `addLink` crea un área clicable invisible; combínala con texto o rectángulos.
- Cada operación de dibujo conserva/restaura el estado gráfico y valida antes de
  añadir contenido.

### Medir y ajustar texto

```js
import { PDFDocument, measureText, layoutTextBox } from "sanpdf";

const pdf = new PDFDocument();
const page = pdf.addPage();
const medida = measureText("¡Hola, España!", { size: 12 });
console.log(medida.width); // avance horizontal, en puntos

const texto = "Un texto largo que se ajusta al ancho disponible.";
const opciones = {
  x: 40, y: 280, width: 300,
  size: 12, padding: 8,
  align: "center",
};

// Calcula sin dibujar, por ejemplo para decidir la altura de una fila.
const calculo = layoutTextBox(texto, opciones);

// Dibuja y devuelve las mismas medidas. Aquí y es el borde superior.
const caja = page.drawTextBox(texto, opciones);
console.log(caja.height, caja.nextY, calculo.lines);
```

En TypeScript, usa `align: "center" as const` si guardas las opciones en una variable,
o anótala con el tipo `TextBoxOptions`.

- `measureText` mide una línea; usa `layoutText` para medir texto con saltos.
- `layoutText` calcula líneas con posiciones relativas. `layoutTextBox` añade
  posición absoluta, padding y alineación vertical.
- En `drawTextBox`, `y` indica el borde superior y `nextY` devuelve el borde inferior.
- `align` admite `left`, `center` y `right`.
- `verticalAlign` admite `top`, `middle` y `bottom` cuando especificas `height`.
- `padding` puede ser un número o un objeto con `top`, `right`, `bottom` y `left`.
- Una altura fija insuficiente produce un error antes de dibujar; no se recorta
  el texto ni se reduce automáticamente su tamaño.

### Párrafos entre páginas

```js
import { PDFDocument, PageLayout, StandardFonts } from "sanpdf";

const informe = new PDFDocument();
const flujo = new PageLayout(informe, { margins: 48 });

flujo.paragraph("Título del informe", {
  font: StandardFonts.HelveticaBold, size: 18,
  keepTogether: true, spaceAfter: 16,
});

const fragmentos = flujo.paragraph("Contenido muy extenso...", {
  size: 12, lineHeight: 16, spaceAfter: 12,
});

// Cada fragmento expone su página y las posiciones calculadas de sus líneas.
console.log(fragmentos);
const bytes = informe.toBytes();
```

`PageLayout` crea páginas nuevas en el documento. Para dibujar bloques propios:

1. Llama a `ensureSpace(alto)` para reservar espacio en la página actual o pasar a otra.
2. Dibuja en `flujo.page`, a partir de `flujo.y`.
3. Llama a `advance(alto)` para mover el cursor.

`ensureSpace` no consume espacio; `advance` sí. `paragraph` divide el texto por
líneas salvo que uses `keepTogether`. Los bloques indivisibles más altos que el
área útil se rechazan. El espacio posterior se consume hasta el margen inferior
sin crear páginas vacías.

`drawText` conserva el posicionamiento manual. `drawTextBox` ajusta dentro de
una caja, pero no crea páginas. Para paginar, usa `PageLayout.paragraph` o
`PDF.create()`.

## Límites y compatibilidad

### Paquete y salida

- Paquete ESM con JavaScript compilado y declaraciones TypeScript en `dist/`.
  La entrada pública es `sanpdf`; no se ofrece una entrada CommonJS `require`.
- Motor sin dependencias de ejecución ni servicios externos; salida `Uint8Array`
  para Node.js y navegador. El JavaScript compilado tiene como objetivo ES2022.
- Genera PDF 1.7 con tabla de referencias clásica. No declara conformidad PDF/A ni PDF/UA.
- El documento completo se construye en memoria y su exportación es determinista.
- Se necesita al menos una página; una página vacía sí es válida.
- `toBytes()` crea una copia independiente y permite seguir editando/exportando.
- La compresión FlateDecode está activada por defecto. Usa `{ compress: false }`
  en las opciones del documento para inspeccionar su contenido sin comprimir.

### Medidas y colores

- Todas las medidas se expresan en puntos: 72 puntos = 1 pulgada.
- `mm()`, `cm()` e `inch()` convierten a puntos: `margin(mm(15))`.
- El origen está arriba a la izquierda; `x` crece hacia la derecha y `y` hacia abajo.
- RGB usa componentes entre 0 y 1, no entre 0 y 255. También se aceptan colores
  hexadecimales (`"#1F4788"`, `"#abc"`) y el conversor `hex()`.
- Los tamaños de página deben ser positivos y no superar 14400 puntos por dimensión.
- Los trazos y tamaños deben ser positivos; los números no pueden ser `NaN` ni infinitos.

### Texto y fuentes

Se admiten doce variantes estándar de Helvetica, Times y Courier. Las fuentes
son sustituidas por las disponibles en el lector; todavía no se incrustan fuentes.
El texto es seleccionable y usa WinAnsi: admite español, acentos, ñ, signos de
apertura, euro y otros caracteres occidentales. Emojis y escrituras fuera de esa
codificación producen un error explícito. Los metadatos usan UTF-16BE.

Se normalizan acentos descompuestos a NFC y se admiten saltos LF/CRLF/CR, incluidas
líneas vacías. Las tabulaciones deben sustituirse por espacios. El ajuste de texto
normaliza espacios ASCII consecutivos y elimina los de los extremos de cada línea
explícita; los espacios no separables se mantienen dentro de su palabra.

Las palabras demasiado largas se dividen por carácter salvo `breakWords: false`,
que provoca un error. También se rechaza un carácter que por sí solo no cabe.
Las medidas son avances sin kerning, coherentes con `Tj`; no equivalen exactamente
a la caja de tinta de los glifos.

El interlineado predeterminado es `size * 1.25`. Un valor menor que los límites
verticales de la fuente se rechaza para evitar superposiciones. `drawText`
conserva su comportamiento propio de interlineado. No hay justificación, separación
silábica, control automático de líneas viudas/huérfanas ni unión de un título con
el bloque siguiente.

La biblioteca no hace llamadas de red, pero el lector que abra el documento puede
gestionar sus propios recursos de fuentes.

### Formatos de imagen

- JPEG: escala de grises, RGB y CMYK de 8 bits, baseline o progresivo.
- PNG: paleta, escala de grises, RGB, profundidades de hasta 16 bits, entrelazado y
  transparencia (canal alfa o `tRNS`).
- Los perfiles ICC y la gamma de los PNG se ignoran.

### Fuera del alcance actual

SanPDF crea documentos nuevos. Todavía no incluye fuentes incrustadas, lectura o
edición de PDF existentes, cifrado ni firmas digitales.

## Desarrollo

```sh
pnpm install
pnpm test
```

## Licencia

[MIT](https://github.com/Vilduis/sanpdf/blob/main/LICENSE) © 2026 Vilduis
