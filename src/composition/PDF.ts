import type { PDFDocument, PDFDocumentOptions } from "../core/PDFDocument.js";
import { PageSizes } from "../core/PageSizes.js";
import { PageBuilder } from "./builders.js";
import { paginate } from "./layout/paginate.js";
import type { PageDefinition } from "./model.js";
import { render } from "./render.js";

/** API de composición. Construye un modelo y lo exporta sin acceso a disco o red. */
export class PDF {
  private readonly definitions: PageDefinition[] = [];
  private constructor(private readonly metadata: PDFDocumentOptions) {}

  static create(metadata: PDFDocumentOptions = {}): PDF { return new PDF({ ...metadata }); }

  page(build: (page: PageBuilder) => void): this {
    const definition: PageDefinition = {
      size: PageSizes.A4, margins: 40, style: {}, sectionGap: 12,
      header: undefined, content: undefined, footer: undefined,
    };
    build(new PageBuilder(definition));
    // El callback no conserva referencias mutables al modelo del documento.
    this.definitions.push(copyModel(definition));
    return this;
  }

  toDocument(): PDFDocument {
    if (!this.definitions.length) throw new Error("Añade al menos una página con page() antes de exportar SanPDF.");
    const pages = this.definitions.flatMap((definition, index) => paginate(definition, `page[${index + 1}]`));
    return render(pages, this.metadata);
  }

  toBytes(): Uint8Array { return this.toDocument().toBytes(); }
}

/** Copia arrays y objetos de datos; conserva NaN para validarlo al medir. Las imágenes son inmutables y se comparten. */
function copyModel<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => copyModel(item)) as T;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyModel(item)])) as T;
  }
  return value;
}
