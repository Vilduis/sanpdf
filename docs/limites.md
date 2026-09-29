# Compatibilidad, convenciones y límites

## Paquete y salida

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

## Medidas y dibujo

- Todas las medidas se expresan en puntos: 72 puntos = 1 pulgada.
- `mm()`, `cm()` e `inch()` convierten a puntos: `margin(mm(15))`.
- El origen público está arriba a la izquierda; `x` crece hacia la derecha y `y` hacia abajo.
- En `drawText`, `y` indica la línea base de la primera línea.
- En `drawTextBox`, `y` indica el borde superior y `nextY` devuelve el borde inferior.
- En rectángulos, imágenes y QR, `x` e `y` indican la esquina superior izquierda.
- RGB usa componentes entre 0 y 1, no entre 0 y 255. También se aceptan colores
  hexadecimales (`"#1F4788"`, `"#abc"`) y el conversor `hex()`.
- Texto y líneas son negros por defecto. Un rectángulo sin colores tiene borde
  negro; con solo `fillColor`, tiene relleno sin borde.
- Los tamaños de página deben ser positivos y no superar 14400 puntos por dimensión.
- Los trazos y tamaños deben ser positivos; los números no pueden ser `NaN` ni infinitos.
- Cada operación de dibujo conserva/restaura el estado gráfico y valida antes de añadir contenido.

## Texto y fuentes

Se admiten doce variantes estándar de Helvetica, Times y Courier. Las fuentes
son sustituidas por las disponibles en el lector; todavía no se incrustan fuentes.
El texto es seleccionable y usa WinAnsi: admite español, acentos, ñ, signos de
apertura, euro y otros caracteres occidentales. Emojis y escrituras fuera de esa
codificación producen un error explícito. Los metadatos usan UTF-16BE.

Se normalizan acentos descompuestos a NFC y se admiten saltos LF/CRLF/CR, incluidas
líneas vacías. Las tabulaciones deben sustituirse por espacios. El layout normaliza
espacios ASCII consecutivos y elimina los de los extremos de cada línea explícita;
los espacios no separables se mantienen dentro de su palabra.

Las palabras demasiado largas se dividen por carácter salvo `breakWords: false`,
que provoca un error. También se rechaza un carácter que por sí solo no cabe.
Las medidas son avances sin kerning, coherentes con `Tj`; no equivalen exactamente
a la caja de tinta de los glifos.

El interlineado predeterminado del layout es `size * 1.25`. Un valor menor que los
límites verticales de la fuente se rechaza para evitar superposiciones. `drawText`
conserva su comportamiento propio de interlineado. No hay justificación, separación
silábica ni control automático de líneas viudas/huérfanas.

La biblioteca no hace llamadas de red, pero el lector que abra el documento puede
gestionar sus propios recursos de fuentes.

## Tablas e imágenes

Las celdas de tabla contienen texto simple o con estilos mezclados; no admiten
`rowSpan` ni `colSpan`. Una fila que cabe en una página pasa completa a la siguiente
si falta espacio. Solo se divide si es más alta que una página. Una tabla dentro
de una fila de composición (`row()`) es indivisible, igual que esa fila.

JPEG admite imágenes baseline o progresivas de 8 bits. PNG admite paleta, escala
de grises, RGB, profundidades de hasta 16 bits, entrelazado y transparencia.
Los perfiles ICC y la gamma de los PNG se ignoran.

## Funciones fuera del alcance actual

SanPDF crea documentos nuevos. No incluye lectura/edición de PDF existentes,
cifrado ni firmas digitales. Los límites específicos de paginación y los errores
`LayoutError` están descritos en la [guía de composición](composicion.md).
