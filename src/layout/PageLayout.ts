import type { PDFDocument } from "../core/PDFDocument.js";
import type { PDFPage } from "../core/PDFPage.js";
import { PageSizes, validatePageSize } from "../core/PageSizes.js";
import type { PageSize } from "../core/PageSizes.js";
import { colorOperator, rgb } from "../content/Color.js";
import type { Color } from "../content/Color.js";
import { finite } from "../utils/numbers.js";
import { layoutText } from "./TextLayout.js";
import type { TextLayoutOptions } from "./TextLayout.js";
import { resolveInsets } from "./TextBox.js";
import type { Insets, Spacing, TextBoxLayout } from "./TextBox.js";

export interface PageLayoutOptions {
  readonly pageSize?: PageSize;
  readonly margins?: Spacing;
}

export interface ParagraphOptions extends Omit<TextLayoutOptions, "width"> {
  readonly color?: Color;
  readonly spaceAfter?: number;
  /** Mantiene el párrafo entero; si supera una página útil, se rechaza. */
  readonly keepTogether?: boolean;
}

export interface ParagraphFragment extends TextBoxLayout {
  readonly page: PDFPage;
}

/** Flujo vertical en páginas nuevas del documento; no modifica páginas anteriores. */
export class PageLayout {
  readonly margins: Insets;
  readonly width: number;
  readonly contentHeight: number;
  private readonly size: PageSize;
  private currentPage: PDFPage;
  private cursor: number;

  constructor(private readonly document: PDFDocument, options: PageLayoutOptions = {}) {
    this.size = Object.freeze([...(options.pageSize ?? PageSizes.A4)]) as PageSize;
    // Valida sin añadir páginas al documento ante opciones incorrectas.
    validatePageSize(this.size[0], this.size[1]);
    this.margins = Object.freeze(resolveInsets(options.margins ?? 40));
    this.width = this.size[0] - this.margins.left - this.margins.right;
    this.contentHeight = this.size[1] - this.margins.top - this.margins.bottom;
    if (this.width <= 0 || this.contentHeight <= 0) throw new RangeError("Los márgenes no dejan espacio útil en la página.");
    this.currentPage = document.addPage(this.size);
    this.cursor = this.margins.top;
  }

  get page(): PDFPage { return this.currentPage; }
  get y(): number { return this.cursor; }
  get remainingHeight(): number { return this.size[1] - this.margins.bottom - this.cursor; }

  newPage(): PDFPage {
    this.currentPage = this.document.addPage(this.size);
    this.cursor = this.margins.top;
    return this.currentPage;
  }

  /** Reserva espacio para un bloque indivisible, pasando de página si es necesario. */
  ensureSpace(height: number): PDFPage {
    this.validateHeight(height);
    if (height > this.remainingHeight + 1e-8) this.newPage();
    return this.currentPage;
  }

  /** Avanza en la página actual. No crea una página vacía por un espacio final. */
  advance(height: number): void {
    this.validateHeight(height);
    if (height > this.remainingHeight + 1e-8) throw new RangeError("No hay espacio; llama a ensureSpace antes de dibujar el bloque.");
    this.cursor += height;
  }

  private validateHeight(height: number): void {
    finite(height, "La altura del bloque");
    if (height < 0 || height > this.contentHeight + 1e-8) throw new RangeError("La altura del bloque no cabe en una página útil.");
  }

  /** Ajusta y divide un párrafo entre páginas, sin perder líneas. */
  paragraph(text: string, options: ParagraphOptions = {}): readonly ParagraphFragment[] {
    const layout = layoutText(text, { ...options, width: this.width });
    const color = options.color ?? rgb(0, 0, 0);
    colorOperator(color);
    const spaceAfter = finite(options.spaceAfter ?? 0, "El espacio después del párrafo");
    if (spaceAfter < 0) throw new RangeError("El espacio después del párrafo no puede ser negativo.");
    if (!layout.lines.length) return [];
    const lineBox = layout.ascent + layout.descent;
    if (lineBox > this.contentHeight) throw new RangeError("Una línea no cabe en la página útil.");
    if (options.keepTogether) this.ensureSpace(layout.height);

    const fragments: ParagraphFragment[] = [];
    let index = 0;
    while (index < layout.lines.length) {
      this.ensureSpace(lineBox);
      const capacity = Math.floor((this.remainingHeight - lineBox + 1e-8) / layout.lineHeight) + 1;
      const count = Math.min(capacity, layout.lines.length - index);
      const lines = layout.lines.slice(index, index + count);
      const height = lineBox + (count - 1) * layout.lineHeight;
      // Conserva los saltos calculados, incluyendo líneas vacías al inicio/final.
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.text) this.currentPage.drawText(line.text, {
          x: this.margins.left + line.x, y: this.cursor + layout.ascent + i * layout.lineHeight,
          font: layout.font, size: layout.size, color,
        });
      }
      fragments.push({ ...layout, page: this.currentPage, x: this.margins.left, y: this.cursor,
        height, nextY: this.cursor + height, contentHeight: height, padding: resolveInsets(0),
        lines: lines.map((line, i) => ({ ...line, x: this.margins.left + line.x,
          baseline: this.cursor + layout.ascent + i * layout.lineHeight })) });
      this.advance(height);
      index += count;
      if (index < layout.lines.length) this.newPage();
    }
    this.advance(Math.min(spaceAfter, Math.max(0, this.remainingHeight)));
    return fragments;
  }
}
