# Base técnica del motor

## Referencias

- ISO 32000-1:2008, PDF 1.7, copia publicada por Adobe:
  https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
- Documentación técnica Adobe:
  https://opensource.adobe.com/dc-acrobat-sdk-docs/library/index.html
- Leonard Rosenthol, *Developing with PDF*, O'Reilly: guía conceptual complementaria.

En la fase 2 el usuario aportó *Developing with PDF*. Se consultaron especialmente
los capítulos 1, 2 y 4 del material compartido para estructura, estado gráfico,
fuentes, métricas y posicionamiento. El libro se utiliza como guía; la referencia
normativa sigue siendo ISO 32000. Esto no constituye una certificación del estándar.

## Estructura emitida

1. Cabecera `%PDF-1.7` y comentario con bytes altos para indicar contenido binario.
2. Objetos indirectos numerados desde 1, generación 0.
3. Catálogo `/Catalog` apuntando al árbol `/Pages`.
4. Cada `/Page` declara `/Parent`, `/MediaBox`, `/Resources` y `/Contents`.
5. Fuentes `/Type1` estándar con `/WinAnsiEncoding`, compartidas entre páginas.
6. Streams de contenido con `/Length` medido en bytes, sin contar el separador previo a `endstream`.
7. Tabla clásica `xref`; cada entrada ocupada contiene el desplazamiento de su objeto.
8. `trailer` con `/Size`, `/Root` y `/Info`.
9. `startxref` con el desplazamiento de `xref`, seguido de `%%EOF`.

`ObjectRegistry` permite reservar catálogo y árbol antes de conocer los hijos.
El escritor rechaza reservas sin resolver. `ByteWriter` es la única fuente de
verdad para calcular posiciones; el binario nunca se convierte a UTF-8.

## Texto y gráficos

- Texto: `BT`, `Tf`, `Tm`, `Tj`, `ET`.
- Color: `rg` para relleno, `RG` para trazo.
- Líneas: `w`, `m`, `l`, `S`.
- Rectángulos: `re`, con `f`, `S` o `B`.
- Aislamiento de estado: `q` y `Q` por operación pública.

La API convierte `y` desde arriba a coordenadas PDF desde abajo. Para texto,
`yPDF = alturaPagina - y`; para rectángulos se resta además la altura del rectángulo.
Los saltos explícitos se posicionan mediante una matriz de texto por línea.

El texto de página se codifica a WinAnsi y se serializa en hexadecimal para evitar
ambigüedades con paréntesis, barras y caracteres especiales. Los metadatos se
codifican a UTF-16BE con BOM. No se tratan las cadenas JavaScript como bytes PDF.

## Verificación

Las pruebas comprueban los offsets `xref` y longitudes de streams a nivel de bytes.
PDF.js, usado solo en desarrollo, abre los archivos y verifica páginas, metadatos,
texto extraído, posiciones de texto y operadores gráficos. Se incluyen fuentes
estándar del propio lector para que las pruebas no descarguen recursos.

Estas pruebas son una comprobación de interoperabilidad, no una validación
exhaustiva de toda la especificación PDF.

## Próximas etapas

1. **Implementado en fase 2:** métricas AFM, ajuste por ancho, cajas y flujo de párrafos
   paginado. El ejemplo `examples/api.mjs` demuestra estas capacidades públicas.
2. **Implementado:** JPEG como Image XObject con `DCTDecode` (gris, RGB y CMYK con
   la inversión de Adobe), sin recomprimir.
3. **Implementado:** PNG. Sin transparencia ni entrelazado, los datos IDAT pasan tal cual
   con `DecodeParms` (Predictor 15). En los demás casos se deshacen filtros y entrelazado
   Adam7, y el alfa (o `tRNS`) se separa en una `SMask`.
4. **Implementado:** compresión `FlateDecode` con un deflate propio (LZ77 + Huffman
   dinámico, fijo o bloques sin comprimir según el menor tamaño) e inflate para PNG.
5. **Implementado:** anotaciones `/Link` con acciones `/URI` y marcadores (`/Outlines`
   con destinos `/XYZ`). Códigos QR dibujados como rectángulos en un único relleno.
6. TrueType: tablas de fuente, métricas, mapeo de caracteres/glifos, fuentes
   compuestas y `ToUnicode`. Definir explícitamente el alcance de composición de texto.
7. Celdas combinadas en tablas. Ver [composicion.md](composicion.md).

El alcance de cada etapa se añade a la API pública únicamente cuando está implementado
y verificado.
