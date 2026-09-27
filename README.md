# SanPDF

Biblioteca TypeScript para **crear PDF con un motor propio**, sin servicios externos
ni dependencias de ejecución. La API pública está en `src/index.ts`.

## Capacidades actuales

- PDF 1.7 con tabla de referencias clásica, páginas A4, A5, Letter, Legal o personalizadas.
- Texto seleccionable, saltos de línea explícitos y doce variantes estándar Helvetica, Times y Courier.
- Codificación WinAnsi: español, acentos, ñ, signos de apertura, euro y otros caracteres occidentales.
- Líneas, rectángulos, rellenos, bordes y colores RGB o hexadecimales (`"#1F4788"`).
- Imágenes JPEG y PNG (paleta, escala de grises, 16 bits, entrelazado y transparencia).
- Códigos QR vectoriales (versiones 1–40, niveles L/M/Q/H), sin imágenes ni dependencias.
- Enlaces a sitios web, correo o teléfono, y marcadores en el panel lateral del lector.
- Compresión propia (FlateDecode) activada por defecto.
- Metadatos Unicode: título, autor, asunto, palabras clave y aplicación creadora.
- Salida `Uint8Array` apta para Node.js y navegador; exportación determinista.
- Medición de texto con métricas AFM locales para las doce fuentes estándar.
- Cajas de texto con ajuste al ancho, padding y alineación horizontal/vertical.
- Flujo de párrafos con márgenes, saltos de página automáticos y bloques indivisibles.
- Composición declarativa con `PDF.create()`: texto, columnas y filas sin coordenadas.
- Tablas con anchos fijos/relativos y encabezados repetidos al paginar; las filas más
  altas que una página se dividen entre páginas.
- Párrafos con estilos mezclados (negrita, cursiva, color o enlace en una palabra).
- Separadores, espacios verticales y unidades `mm()`, `cm()` e `inch()`.
- Encabezados, pies, numeración global y estilos heredados/reutilizables.

## Instalación

```sh
npm install sanpdf
```

Hasta que el paquete se publique en npm, puedes usarlo como se explica en
[Usarla en otro proyecto](#usarla-en-otro-proyecto).

## Desarrollo

Usa Node.js 24 o posterior para las herramientas y pruebas del repositorio.

```sh
pnpm install
pnpm build
pnpm test
pnpm example
```

El ejemplo genera `output/ejemplo-api.pdf`. TypeScript, PDF.js y jsQR son dependencias
**de desarrollo**: PDF.js se utiliza como lector independiente en las pruebas y
para producir vistas previas PNG; jsQR comprueba que los códigos QR generados se pueden
leer. No participan en la generación ni se importan desde `src/`.

### Ejemplo: pedido con la API pública

[`examples/api.mjs`](examples/api.mjs) muestra las capacidades actuales usando
únicamente las exportaciones de `sanpdf` para generar el documento:

- Crear un pedido con metadatos y páginas A4 sin calcular coordenadas.
- Organizar los datos del cliente en filas y columnas.
- Aplicar estilos compartidos, alineaciones, padding y fondos.
- Distribuir una tabla de 42 artículos entre páginas, repitiendo su cabecera.
- Repetir encabezados y numerar los pies como «Página X de Y».
- Obtener los bytes con `toBytes()` y guardarlos desde Node.js.

```powershell
pnpm example
Start-Process ".\output\ejemplo-api.pdf"
```

Edita los textos y opciones en `examples/api.mjs` y vuelve a ejecutar el comando.
También puedes importar su función `createExample()` para obtener el documento
sin escribir archivos automáticamente.

Para generar una vista previa PNG por página:

```sh
pnpm preview output/ejemplo-api.pdf
```

Esta utilidad de desarrollo utiliza PDF.js; el motor propio sigue funcionando
sin dependencias de ejecución ni red.

### Ejemplo: carta formal

[`examples/carta.mjs`](examples/carta.mjs) genera una carta de solicitud de reunión
con membrete, fecha, destinatario, asunto, párrafos y espacio para firma manuscrita.
Edita el objeto `datos` para personalizarla; no necesitas calcular coordenadas.

```powershell
pnpm example:carta
Start-Process ".\output\carta.pdf"
```

También puedes importar `createLetter(datos)` y llamar a `toBytes()` para generar
la carta desde tu aplicación. Los datos del destinatario y el bloque de firma se
mantienen juntos al paginar; el encabezado y el pie se repiten automáticamente.

## Uso: construir un documento

```ts
import { PDF } from "sanpdf";

const pdf = PDF.create({ title: "Mi pedido" });

pdf.page(page => {
  page.size("A4").margin(40);
  page.header().text("Pedido de venta").fontSize(24).bold();

  page.content().column(column => {
    column.gap(16);
    column.text("Cliente: María López");
    column.table(table => {
      table.columns(["*", 70, 100]);
      table.header(["Producto", "Cantidad", "Importe"]);
      table.row(["Televisor", "1", "S/ 1699.00"]);
      table.row(["Cable HDMI", "2", "S/ 40.00"]);
    });
    column.text("Total: S/ 1739.00").bold().alignRight();
  });

  page.footer().pageNumber().alignCenter();
});

const bytes = pdf.toBytes();
```

`page()` define una sección que puede ocupar varias páginas físicas. SanPDF calcula
las posiciones, ajusta el texto y repite su encabezado y pie. Cada llamada adicional
a `page()` comienza una sección nueva; la numeración abarca el documento completo.

El texto se divide por líneas cuando hace falta. Las filas y los textos marcados
con `keepTogether()` pasan completos a la siguiente página. Un bloque indivisible
mayor que una página produce un `LayoutError` con su ubicación y los límites de espacio.

Consulta [la guía de composición](docs/composicion.md) para filas, estilos, tablas,
componentes reutilizables, arquitectura y límites actuales.

### Imágenes, QR, enlaces y estilos mezclados

```ts
import { readFileSync } from "node:fs";
import { PDF, loadImage, mm } from "sanpdf";

// loadImage valida el archivo una vez; el PDF guarda la imagen una sola vez
// aunque se repita en el encabezado de cada página.
const logo = loadImage(readFileSync("logo.png"));

const pdf = PDF.create({ title: "Factura F001-123" }).page(page => {
  page.size("A4").margin(mm(15));
  page.header().row(row => {
    row.item(mm(30)).image(logo).width(mm(25));
    row.item().text("FACTURA ELECTRÓNICA
F001-123").bold().alignRight();
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
```

Más detalles en [la guía de composición](docs/composicion.md).

## API de bajo nivel: dibujo por coordenadas

```ts
import { readFileSync } from "node:fs";
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
  x: 40,
  y: 100,
  size: 12,
  lineHeight: 18,
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

page.drawImage(readFileSync("logo.jpg"), { x: 40, y: 300, width: 120 });
page.drawQRCode("https://example.com", { x: 400, y: 300, size: 100 });
page.addLink({ x: 40, y: 450, width: 200, height: 20, url: "https://example.com" });
pdf.addBookmark("Portada", page);

const bytes = pdf.toBytes();
```

`drawImage` acepta los bytes del archivo o una imagen de `loadImage()`. Si solo
indicas `width` o `height`, se conserva la proporción. `drawQRCode` usa `size` como
lado total, incluida la zona de silencio de 4 módulos. `addLink` crea un área
clicable invisible; combínala con texto o rectángulos.

### Medir y ajustar texto

```ts
import { measureText, layoutTextBox } from "sanpdf";

const medida = measureText("¡Hola, España!", { size: 12 });
console.log(medida.width); // avance horizontal, en puntos

const opciones = {
  x: 40, y: 280, width: 300,
  size: 12, padding: 8,
  align: "center" as const,
};

// Calcula sin dibujar (útil para decidir la altura de una fila).
const calculo = layoutTextBox("Un texto largo que se ajusta al ancho disponible.", opciones);

// Dibuja y devuelve las mismas medidas. Aquí y es el BORDE SUPERIOR.
const caja = page.drawTextBox("Un texto largo que se ajusta al ancho disponible.", opciones);
console.log(caja.height, caja.nextY, calculo.lines);
```

`align` admite `left`, `center` y `right`. `verticalAlign` admite `top`, `middle`
y `bottom` cuando especificas `height`. Si una altura fija es insuficiente, se
produce un error antes de dibujar; el texto no se recorta silenciosamente.
`padding` puede ser un número o un objeto con `top`, `right`, `bottom` y `left`.

### Párrafos entre páginas

```ts
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

// Cada fragmento expone la página y las posiciones calculadas de sus líneas.
const archivo = informe.toBytes();
```

`PageLayout` crea páginas nuevas en el documento. Para dibujar bloques propios,
usa `ensureSpace(alto)`, dibuja en `flujo.page` a partir de `flujo.y` y llama a
`advance(alto)`. `ensureSpace` no consume espacio; `advance` sí. Los bloques
indivisibles más altos que el área útil se rechazan. `paragraph` divide el texto
por líneas salvo que uses `keepTogether`.

### Guardar en Node.js

```ts
import { writeFile } from "node:fs/promises";

await writeFile("informe.pdf", bytes);
```

### Descargar en un navegador

```ts
const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = "informe.pdf";
document.body.append(link);
link.click();
link.remove();
setTimeout(() => URL.revokeObjectURL(url), 30_000);
```

### Usarla en otro proyecto

Desde esta carpeta:

```sh
pnpm pack
```

Instala el archivo `.tgz` generado desde tu otro proyecto:

```sh
pnpm add /ruta/al/archivo.tgz
```

El paquete es ESM y publica JavaScript compilado y declaraciones TypeScript en
`dist/`, con `exports` y `types`. El proyecto se llama **SanPDF** y el nombre del
paquete y de las importaciones es `sanpdf`. No es necesario publicarlo en npm
para utilizarlo mediante el archivo `.tgz`.

## Convenciones

- Todas las medidas se expresan en puntos: 72 puntos = 1 pulgada.
- El origen público está arriba a la izquierda; `x` crece hacia la derecha y `y` hacia abajo.
- **`drawText`:** `y` indica la línea base de la primera línea.
- **`drawTextBox`:** `y` indica el borde superior de la caja. `nextY` devuelve su borde inferior.
- **Rectángulos:** `x`, `y` indican su esquina superior izquierda.
- RGB usa componentes entre 0 y 1, no entre 0 y 255. También puedes escribir `"#1F4788"`
  o `"#abc"` donde se acepte un color, o convertirlo con `hex()`.
- `mm()`, `cm()` e `inch()` convierten a puntos: `margin(mm(15))`.
- Imágenes y códigos QR usan `x`, `y` como su esquina superior izquierda.
- Texto y líneas son negros por defecto. Un rectángulo sin colores tiene borde negro;
  con solo `fillColor`, tiene relleno sin borde.
- Los tamaños de página deben ser positivos y no superar 14400 puntos por dimensión.
- Los trazos y tamaños deben ser positivos; los números no pueden ser `NaN` o infinitos.
- El documento necesita al menos una página. Una página vacía sí es válida.
- `toBytes()` crea una copia independiente y permite seguir editando/exportando el documento.
- Cada operación de dibujo conserva/restaura el estado gráfico y valida antes de añadir contenido.

## Alcance actual

La biblioteca genera documentos nuevos. Todavía no incluye fuentes incrustadas,
celdas combinadas (`rowSpan`/`colSpan`), lectura/edición de PDF existentes, cifrado
ni firmas. Las celdas de tabla contienen texto (simple o con estilos mezclados). Una
fila que cabe en una página pasa completa a la siguiente; solo se divide si es más
alta que una página. Una tabla dentro de una fila de composición es indivisible.
Los JPEG deben ser baseline o progresivos de 8 bits; los perfiles ICC y la gamma de
los PNG se ignoran.

Las fuentes estándar son sustituidas por las disponibles en el lector. Para
una apariencia tipográfica totalmente controlada será necesario incrustar fuentes.
El texto de página usa WinAnsi; emojis y escrituras fuera de esa codificación
producen un error explícito. Se normalizan acentos descompuestos a NFC y se admiten
saltos LF/CRLF/CR; las tabulaciones deben sustituirse por espacios. Los metadatos
sí usan UTF-16BE. La biblioteca no hace llamadas de red, pero el lector PDF que
abra el documento puede gestionar sus propios recursos de fuentes.

`drawText` conserva el posicionamiento manual. `drawTextBox` ajusta dentro de una
caja, pero no crea páginas; para paginar se utiliza `PageLayout.paragraph`.
El layout normaliza espacios ASCII consecutivos y respeta saltos explícitos;
las palabras demasiado largas se dividen por carácter salvo `breakWords: false`.
Las medidas son avances sin kerning, coherentes con `Tj`. El interlineado por
defecto del layout es `size * 1.25`; uno menor que los límites verticales de la
fuente se rechaza para evitar superposiciones. `drawText` mantiene su interlineado
anterior por compatibilidad. No hay justificación, separación silábica ni control
automático de líneas viudas/huérfanas.

El contenido de las páginas se comprime con un deflate propio (desactívalo con
`{ compress: false }` para inspeccionar el PDF). El archivo se construye en memoria.
No se declara conformidad PDF/A ni PDF/UA.

## Arquitectura

```text
src/index.ts          API pública
composition/          Builders y modelo de composición
composition/layout/   Medición, distribución y plan de páginas
composition/render.ts Adaptador del plan a primitivas PDF
core/                 Documento, páginas, tipos PDF y registro de objetos
writer/               Serialización de objetos, streams, xref y trailer
content/              Opciones de dibujo y colores
images/               Lectura de JPEG y PNG (filtros, entrelazado, alfa)
barcodes/             Codificador QR con Reed-Solomon
compression/          Deflate/inflate (zlib) propios
fonts/                Fuentes estándar, codificación WinAnsi y métricas AFM
layout/               Medición de bloques, cajas de texto y flujo paginado
utils/                Escritura binaria, codificaciones y números
```

Ver [docs/composicion.md](docs/composicion.md) para la API declarativa,
[docs/formato-pdf.md](docs/formato-pdf.md) para la base técnica y
[docs/fase-2.md](docs/fase-2.md) para el diagnóstico, las métricas y el alcance del layout.
