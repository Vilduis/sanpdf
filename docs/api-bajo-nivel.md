# API de bajo nivel

Usa `PDFDocument` para controlar las coordenadas. Para componer documentos sin
calcular posiciones, consulta la [guía de composición](composicion.md).
Las medidas están en puntos; el origen está arriba a la izquierda.

## Dibujo por coordenadas

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

`drawImage` acepta bytes o una imagen creada con `loadImage()`. Si solo indicas
`width` o `height`, conserva la proporción. Una misma instancia de `PDFImage`
se almacena una sola vez aunque se dibuje repetidamente.

`drawQRCode` usa `size` como lado total, incluida la zona de silencio de 4 módulos.
Admite versiones 1–40 y niveles de corrección L/M/Q/H. `addLink` crea un área
clicable invisible; combínala con texto o rectángulos.

## Medir y ajustar texto

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
- `align` admite `left`, `center` y `right`.
- `verticalAlign` admite `top`, `middle` y `bottom` cuando especificas `height`.
- `padding` puede ser un número o un objeto con `top`, `right`, `bottom` y `left`.
- Una altura fija insuficiente produce un error antes de dibujar; no se recorta
  el texto ni se reduce automáticamente su tamaño.

## Párrafos entre páginas

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
una caja, pero no crea páginas. Para paginar, usa `PageLayout.paragraph` o la API
de composición.

Consulta las [convenciones y límites](limites.md) para las diferencias entre
línea base y borde superior, codificación y comportamiento del ajuste de texto.
