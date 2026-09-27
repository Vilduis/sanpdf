# Fase 2 — medición y maquetación

> Nota histórica: la plantilla de evaluación y sus pruebas específicas se retiraron
> al unificar los ejemplos. El ejemplo vigente es `examples/api.mjs`, ejecutable con
> `pnpm example`. Las secciones sobre el reporte describen el trabajo de esa fase.

## Diagnóstico de la primera plantilla

El escritor binario y la codificación ya generaban un archivo que los lectores
podían abrir. Eso no garantizaba una maquetación correcta:

- Los bordes, líneas base y alturas estaban definidos por coordenadas de una imagen
  de 791 píxeles de ancho, escaladas a A4, sin relación con las medidas del texto.
- El título comenzaba siempre en `x = 225` en esa escala; no estaba centrado mediante
  su ancho tipográfico.
- La altura y el padding de cada celda no se comprobaban. Verificar únicamente los
  márgenes exteriores de la página no detectaba posibles invasiones de celdas vecinas.
- Oficina, tipo de reporte, objetivos y comentario dependían de saltos `\n` manuales.
- El bucle de objetivos usaba `index === 0 ? 707 : 744`: el tercer objetivo se
  superponía al segundo, y todos los siguientes también.
- La tabla y el comentario se dibujaban siempre a la misma altura; añadir texto
  o filas no desplazaba el contenido posterior ni creaba páginas.
- El centrado de porcentajes era un cálculo particular del ejemplo para dígitos y `%`.

La solución incorpora medidas reutilizables a la biblioteca y calcula las filas
de la plantilla a partir de esas medidas.

## Relación con Developing with PDF

El capítulo 4, especialmente las páginas impresas 63–75, distingue caracteres,
glifos, métricas y posiciones. La figura 4-2 distingue el avance de un glifo de
su caja visible. El operador `Tj` avanza por los anchos de los glifos, sin aplicar
kerning automáticamente; por tanto, la medición usa esos mismos avances.

Las cajas, párrafos y tablas son cálculos de nuestra capa de maquetación. No son
operadores nativos de PDF que distribuyan contenido por sí solos. Esto también
separa la maquetación visual del etiquetado lógico del capítulo 11.

Se conserva `q/Q` para aislar las operaciones gráficas. `BT/ET` delimitan objetos
de texto, pero no sustituyen a `q/Q` ni reinician todos los parámetros del estado.

Al aplicar el libro hay que distinguir algunas erratas de las reglas del formato:
una caja PDF se expresa como `[xMin yMin xMax yMax]`, no como ancho/alto salvo
la coincidencia cuando el origen es cero. La conversión RGB desde 0–255 es
`componente / 255`. El nombre de fuente se declara mediante `/BaseFont`.

## Métricas locales

`src/fonts/StandardFontMetrics.ts` contiene tablas numéricas de avances para los
bytes WinAnsi admitidos. Los datos proceden de los AFM de las fuentes estándar
de Adobe, disponibles en este espejo:

https://github.com/foliojs/pdfkit/tree/master/lib/font/data

Los AFM consultados contienen el aviso de Adobe Systems Incorporated, años
1985, 1987, 1989, 1990 y 1997. Se extraen datos métricos; no se importa código
de generación de PDFKit ni programas de fuente. Helvetica Oblique comparte
avances con Helvetica, y BoldOblique con Bold. Las cuatro variantes Courier
tienen un avance de 600 unidades. Cada variante conserva límites propios.

`scripts/inspect-font-metrics.mjs` permite contrastar las tablas con esos AFM:

```sh
pnpm build
node scripts/inspect-font-metrics.mjs --check
```

Esta comprobación de mantenimiento necesita red. **La compilación, las pruebas
normales y la generación no descargan métricas ni requieren ese script.**

La fórmula de avance es `sum(anchoGlifo) * tamaño / 1000`. Los límites verticales
son conservadores y usan el FontBBox, no solamente Ascender/Descender: también
reservan espacio para mayúsculas acentuadas. Las cajas reservan extensión lateral
para glifos que sobresalen de su avance, particularmente en cursivas. El ancho
devuelto por `measureText` sigue siendo el avance, no la caja de tinta exacta.

## API y comportamiento

- `measureText`: mide una línea con la misma normalización NFC y WinAnsi que el
  dibujado. Los saltos de línea se miden mediante `layoutText`, no con esta función.
- `layoutText`: calcula líneas con posiciones relativas, considerando fuente,
  tamaño, ancho, interlineado y alineación izquierda/centro/derecha.
- `layoutTextBox`: añade posición absoluta, padding y alineación vertical; devuelve
  medidas sin modificar la página.
- `PDFPage.drawTextBox`: dibuja esas líneas y devuelve la misma información.
- `PageLayout`: mantiene márgenes, página actual y cursor vertical. `paragraph`
  divide por líneas; `ensureSpace` sirve para bloques indivisibles.

La altura de contenido es `ascenso + descenso + (líneas - 1) * interlineado`.
La altura exterior suma padding superior e inferior. El `y` de una caja es su
borde superior; la línea base se obtiene añadiendo padding y ascenso. `drawText`
conserva su convención anterior de `y` como línea base.

Los saltos LF, CRLF y CR se conservan, incluyendo líneas vacías. Los espacios
ASCII consecutivos se normalizan a uno en layout y se eliminan en los extremos
de cada línea explícita. Los espacios no separables se mantienen dentro de su
palabra. Las palabras que exceden una línea se dividen por carácter; con
`breakWords: false` se rechazan. Un carácter que por sí solo no cabe también
se rechaza. No se aplica separación silábica ni justificación.

Una altura fija insuficiente produce un error antes de dibujar. No se implementa
recorte silencioso ni reducción automática del tamaño de letra. En `PageLayout`,
un párrafo `keepTogether` debe caber en una página útil. El espacio después de un
párrafo se consume hasta el margen inferior y no crea páginas vacías.

## Reporte actualizado

La antigua plantilla de evaluación usaba medidas en puntos y márgenes de 72 pt a los
lados y 48 pt arriba/abajo. Las filas crecen según el contenido más alto; las filas
posteriores se desplazan. El título y los porcentajes usan alineación medida.

Los objetivos admiten una cantidad variable. Al pasar de página se repiten su
sección y cabecera. El porcentaje global se repite en una celda combinada por
fragmento de página, manteniendo su significado global. No se divide una fila
de objetivos entre páginas: una fila más alta que el área útil se rechaza con
un error explícito. Los comentarios sí continúan por líneas con su cabecera.

Los bordes se pintan al final y los segmentos colineales se unen, respetando las
celdas combinadas y evitando dibujar dos veces una misma línea compartida.
ESTADO permanece blanco. El resultado son textos y vectores, no una imagen pegada.

## Verificación realizada durante la fase 2

- Contraste de todas las métricas de las doce fuentes con sus AFM.
- Contraste de avances con PDF.js para los caracteres WinAnsi admitidos.
- Límites exactos, palabras largas, acentos descompuestos y saltos vacíos.
- Alturas insuficientes y validación antes de modificar página o flujo.
- Posiciones obtenidas mediante el lector independiente y geometría dentro del
  padding de las celdas, además de los márgenes exteriores.
- Párrafos multipágina y prueba de regresión con 45 objetivos, nombres largos y
  comentarios extensos; cada identificador debe aparecer exactamente una vez.
- Renderizado a imagen y comprobación del fondo de ESTADO y encabezados grises.

PDF.js sigue siendo una herramienta de desarrollo, no parte del motor distribuido.
La siguiente ampliación de tablas genéricas podrá reutilizar estas medidas,
pero la plantilla no pretende ser una implementación completa de `rowSpan`/`colSpan`.
