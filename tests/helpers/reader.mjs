import { createRequire } from "node:module";
import { dirname } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const standardFontDataUrl = dirname(require.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/") + "/standard_fonts/";

export async function withPDF(bytes, callback) {
  const task = getDocument({ data: bytes.slice(), standardFontDataUrl, stopAtErrors: true });
  try { return await callback(await task.promise); }
  finally { await task.destroy(); }
}

/** Renderiza una página con PDF.js y devuelve sus píxeles RGBA. */
export async function renderPage(bytes, number = 1, scale = 2) {
  return withPDF(bytes, async reader => {
    const page = await reader.getPage(number);
    const viewport = page.getViewport({ scale });
    const target = reader.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvasContext: target.context, viewport }).promise;
      const { width, height } = target.canvas;
      const { data } = target.context.getImageData(0, 0, width, height);
      /** Color en coordenadas PDF de SanPDF (puntos, origen arriba a la izquierda). */
      const pixel = (x, y) => {
        const offset = (Math.floor(y * scale) * width + Math.floor(x * scale)) * 4;
        return [data[offset], data[offset + 1], data[offset + 2]];
      };
      return { width, height, data: new Uint8ClampedArray(data), pixel };
    } finally { reader.canvasFactory.destroy(target); }
  });
}
