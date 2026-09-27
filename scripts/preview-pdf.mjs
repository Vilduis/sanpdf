// Utilidad de desarrollo: renderiza un PDF local mediante PDF.js.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const input = process.argv[2];
if (!input) throw new Error("Uso: pnpm preview output/ejemplo-api.pdf");
const standardFontDataUrl = dirname(require.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/") + "/standard_fonts/";
const path = resolve(input);
const task = getDocument({ data: new Uint8Array(await readFile(path)), standardFontDataUrl, stopAtErrors: true });
try {
  const doc = await task.promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const target = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvasContext: target.context, viewport }).promise;
      const output = path.replace(/\.pdf$/i, "") + `-page-${i}.png`;
      await writeFile(output, target.canvas.toBuffer("image/png"));
      console.log(output);
    } finally { doc.canvasFactory.destroy(target); }
  }
} finally { await task.destroy(); }
