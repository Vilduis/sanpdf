# Uso en navegador

SanPDF devuelve un `Uint8Array` y no accede al disco ni a la red. En una aplicación
con un bundler compatible con ESM (por ejemplo, Vite), instala `sanpdf` e impórtalo
como cualquier dependencia. El navegador por sí solo no resuelve el nombre
`"sanpdf"` sin un bundler o un mapa de importaciones.

## Crear y descargar

Llama a esta función desde un botón de tu aplicación:

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

## Cargar imágenes

La aplicación obtiene los bytes antes de construir el documento. Por ejemplo,
para un `File` seleccionado mediante un campo de archivo:

```js
import { loadImage } from "sanpdf";

const logo = loadImage(new Uint8Array(await archivo.arrayBuffer()));
```

Después usa `page.header().image(logo).width(80)` o `column.image(logo)`.
Los callbacks de `page()` son síncronos; completa las operaciones asíncronas antes
de llamarlos. Consulta la [guía de composición](composicion.md) para el resto de la API.
