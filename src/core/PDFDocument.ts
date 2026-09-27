import { deflate } from "../compression/zlib.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import type { ImageStream, PDFImage } from "../images/Image.js";
import { finite } from "../utils/numbers.js";
import { utf16be } from "../utils/encoding.js";
import { writePDF } from "../writer/PDFWriter.js";
import { ObjectRegistry } from "./ObjectRegistry.js";
import { PageSizes } from "./PageSizes.js";
import type { PageSize } from "./PageSizes.js";
import { PDFDictionary, PDFName, PDFStream, PDFString } from "./PDFObject.js";
import type { PDFReference, PDFValue } from "./PDFObject.js";
import { PDFPage } from "./PDFPage.js";

export interface PDFDocumentOptions {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  readonly creator?: string;
  /** Comprime el contenido de las páginas (FlateDecode). true por defecto. */
  readonly compress?: boolean;
}

interface Bookmark {
  readonly title: string;
  readonly page: PDFPage;
  readonly y: number;
}

export class PDFDocument {
  private readonly pages: PDFPage[] = [];
  private readonly bookmarks: Bookmark[] = [];
  private readonly metadata: PDFDocumentOptions;

  constructor(options: PDFDocumentOptions = {}) {
    this.metadata = { ...options };
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(size: PageSize = PageSizes.A4): PDFPage {
    const page = new PDFPage(size[0], size[1]);
    this.pages.push(page);
    return page;
  }

  /** Añade una entrada al panel de marcadores. y es la distancia desde el borde superior de la página. */
  addBookmark(title: string, page: PDFPage, y = 0): this {
    if (!this.pages.includes(page)) throw new Error("La página del marcador no pertenece a este documento.");
    if (typeof title !== "string" || !title.trim()) throw new Error("El marcador necesita un título.");
    utf16be(title);
    this.bookmarks.push({ title, page, y: finite(y, "La posición del marcador") });
    return this;
  }

  /** Genera un archivo completo; no modifica el documento ni accede a la red/disco. */
  toBytes(): Uint8Array {
    if (this.pages.length === 0) throw new Error("Añade al menos una página antes de exportar el PDF.");
    const compress = this.metadata.compress ?? true;
    const registry = new ObjectRegistry();
    const catalog = registry.reserve();
    const pageTree = registry.reserve();
    const fontReferences = new Map<StandardFont, PDFReference>();
    const imageReferences = new Map<PDFImage, PDFReference>();
    const pageReferences = new Map<PDFPage, PDFReference>();
    const kids: PDFReference[] = [];

    const imageReference = (image: PDFImage): PDFReference => {
      let reference = imageReferences.get(image);
      if (!reference) {
        const stream = (value: ImageStream, extra: Record<string, PDFValue> = {}) =>
          registry.add(new PDFStream(value.data, new PDFDictionary({ ...value.entries, ...extra })));
        reference = stream(image.stream, image.mask ? { SMask: stream(image.mask) } : {});
        imageReferences.set(image, reference);
      }
      return reference;
    };

    for (const page of this.pages) {
      const snapshot = page.snapshot();
      const fontResources: Record<string, PDFValue> = {};
      for (const [font, resource] of snapshot.fonts) {
        let reference = fontReferences.get(font);
        if (!reference) {
          reference = registry.add(new PDFDictionary({
            Type: new PDFName("Font"), Subtype: new PDFName("Type1"),
            BaseFont: new PDFName(font), Encoding: new PDFName("WinAnsiEncoding"),
          }));
          fontReferences.set(font, reference);
        }
        fontResources[resource] = reference;
      }
      const resources: Record<string, PDFValue> = { Font: new PDFDictionary(fontResources) };
      if (snapshot.images.size) {
        const images: Record<string, PDFValue> = {};
        for (const [image, resource] of snapshot.images) images[resource] = imageReference(image);
        resources.XObject = new PDFDictionary(images);
      }
      const content = registry.add(compress
        ? new PDFStream(deflate(snapshot.content), new PDFDictionary({ Filter: new PDFName("FlateDecode") }))
        : new PDFStream(snapshot.content));
      const entries: Record<string, PDFValue> = {
        Type: new PDFName("Page"), Parent: pageTree,
        MediaBox: [0, 0, page.width, page.height],
        Resources: new PDFDictionary(resources),
        Contents: content,
      };
      if (snapshot.links.length) {
        entries.Annots = snapshot.links.map(link => new PDFDictionary({
          Type: new PDFName("Annot"), Subtype: new PDFName("Link"), Rect: link.rect, Border: [0, 0, 0],
          A: new PDFDictionary({ S: new PDFName("URI"), URI: new PDFString(ascii(link.url)) }),
        }));
      }
      const reference = registry.add(new PDFDictionary(entries));
      pageReferences.set(page, reference);
      kids.push(reference);
    }

    registry.set(pageTree, new PDFDictionary({ Type: new PDFName("Pages"), Kids: kids, Count: kids.length }));
    const catalogEntries: Record<string, PDFValue> = { Type: new PDFName("Catalog"), Pages: pageTree };
    if (this.bookmarks.length) {
      const outlines = registry.reserve();
      const items = this.bookmarks.map(() => registry.reserve());
      this.bookmarks.forEach((bookmark, index) => {
        const entries: Record<string, PDFValue> = {
          Title: new PDFString(utf16be(bookmark.title)), Parent: outlines,
          Dest: [pageReferences.get(bookmark.page)!, new PDFName("XYZ"), 0, bookmark.page.height - bookmark.y, null],
        };
        if (index > 0) entries.Prev = items[index - 1]!;
        if (index < items.length - 1) entries.Next = items[index + 1]!;
        registry.set(items[index]!, new PDFDictionary(entries));
      });
      registry.set(outlines, new PDFDictionary({
        Type: new PDFName("Outlines"), First: items[0]!, Last: items.at(-1)!, Count: items.length,
      }));
      catalogEntries.Outlines = outlines;
      catalogEntries.PageMode = new PDFName("UseOutlines");
    }
    registry.set(catalog, new PDFDictionary(catalogEntries));
    const info: Record<string, PDFValue> = { Producer: new PDFString(utf16be("SanPDF")) };
    for (const [key, pdfKey] of [
      ["title", "Title"], ["author", "Author"], ["subject", "Subject"],
      ["keywords", "Keywords"], ["creator", "Creator"],
    ] as const) {
      const value = this.metadata[key];
      if (value !== undefined) info[pdfKey] = new PDFString(utf16be(value));
    }
    return writePDF(registry, catalog, registry.add(new PDFDictionary(info)));
  }
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, char => char.charCodeAt(0));
}
