import assert from "node:assert/strict";
import test from "node:test";
import { createExample } from "../examples/api.mjs";
import { withPDF } from "./helpers/reader.mjs";

test("ejemplo público: pedido legible, metadatos y artículos completos entre páginas", async () => {
  const pdf = createExample().toDocument();
  assert.ok(pdf.pageCount >= 2, "la demostración debe activar la paginación automática");
  await withPDF(pdf.toBytes(), async (reader) => {
    assert.equal(reader.numPages, pdf.pageCount);
    const { info } = await reader.getMetadata();
    assert.equal(info.Title, "Ejemplo de la API de SanPDF");
    assert.equal(info.Producer, "SanPDF");
    const paginas = [];
    for (let numero = 1; numero <= reader.numPages; numero++) {
      const page = await reader.getPage(numero);
      const content = await page.getTextContent();
      paginas.push(content.items.map((item) => item.str).join(" "));
    }
    assert.match(paginas[0], /María López/);
    const texto = paginas.join(" ");
    for (let numero = 1; numero <= 42; numero++) {
      assert.equal(texto.split(`Artículo ${String(numero).padStart(2, "0")}`).length - 1, 1);
    }
    assert.match(paginas.at(-1), /¡Gracias por tu pedido!/);
    paginas.forEach((pagina, index) => {
      assert.ok(pagina.includes(`Página ${index + 1} de ${pdf.pageCount}`));
    });
  });
});
