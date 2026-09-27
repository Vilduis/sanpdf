import { validatePageSize } from "../../core/PageSizes.js";
import { resolveInsets } from "../../layout/TextBox.js";
import type { PageDefinition } from "../model.js";
import { fragmentHeight, fullRow, linesThatFit, rowFragment, stack, textFragment, translate } from "./blocks.js";
import { measure } from "./measure.js";
import { nonNegative } from "./style.js";
import { LayoutError } from "./types.js";
import type { Block, Command, FlowItem, PagePlan, TableItem, TableRow, TextItem } from "./types.js";

const epsilon = 1e-8;

class PageFlow {
  private commands: Command[] = [];
  private cursor = 0;
  readonly pages: Command[][] = [];
  constructor(private readonly capacity: number) {}

  private newPage(): void {
    this.pages.push(this.commands);
    this.commands = [];
    this.cursor = 0;
  }

  private check(height: number, path: string): void {
    if (height > this.capacity + epsilon) throw new LayoutError(path,
      `El bloque necesita ${height.toFixed(2)} pt de alto; hay ${this.capacity.toFixed(2)} pt disponibles por página.`);
  }

  private place(block: Block): void {
    this.commands.push(...translate(block.commands, 0, this.cursor));
    this.cursor += block.height;
  }

  private atomic(block: Block, path: string): void {
    this.check(block.height, path);
    if (this.cursor + block.height > this.capacity + epsilon) this.newPage();
    this.place(block);
  }

  private text(item: TextItem): void {
    const { layout, padding } = item;
    if (item.keepTogether || !layout.lines.length) {
      this.atomic(textFragment(item), item.path);
      return;
    }
    const minimum = padding.top + padding.bottom + layout.ascent + layout.descent;
    this.check(minimum, item.path);
    let start = 0;
    while (start < layout.lines.length) {
      if (this.cursor + minimum > this.capacity + epsilon) this.newPage();
      const count = Math.min(layout.lines.length - start,
        Math.floor((this.capacity - this.cursor - minimum + epsilon) / layout.lineHeight) + 1);
      this.place(textFragment(item, start, count));
      start += count;
      if (start < layout.lines.length) this.newPage();
    }
  }

  private table(item: TableItem): void {
    const { header } = item;
    if (!item.rows.length) { this.atomic(header, `${item.path}.header`); return; }
    item.rows.forEach((row, index) => {
      const block = fullRow(row);
      const first = index === 0;
      // La cabecera siempre acompaña a la primera fila (o a su primer fragmento).
      const needed = block.height + (first ? header.height : 0);
      if (this.cursor + needed <= this.capacity + epsilon) {
        if (first) this.place(header);
        this.place(block);
      } else if (header.height + block.height <= this.capacity + epsilon) {
        this.newPage();
        this.place(header);
        this.place(block);
      } else this.splitRow(row, header, first);
    });
  }

  /** Reparte las líneas de las celdas entre páginas, repitiendo la cabecera. */
  private splitRow(row: TableRow, header: Block, first: boolean): void {
    const minimum = Math.max(0, ...row.cells.map(cell => fragmentHeight(cell.item, Math.min(1, cell.item.layout.lines.length))));
    this.check(header.height + minimum, `${row.path} (incluye encabezado)`);
    const starts = row.cells.map(() => 0);
    let withHeader = first;
    for (;;) {
      const room = this.capacity - this.cursor - (withHeader ? header.height : 0);
      const counts = row.cells.map((cell, index) =>
        Math.min(cell.item.layout.lines.length - starts[index]!, linesThatFit(cell.item, room)));
      const pending = row.cells.some((cell, index) => starts[index]! < cell.item.layout.lines.length);
      if (pending && !counts.some(Boolean)) {
        this.newPage();
        withHeader = true;
        continue;
      }
      if (withHeader) this.place(header);
      this.place(rowFragment(row, starts, counts));
      counts.forEach((count, index) => { starts[index]! += count; });
      if (row.cells.every((cell, index) => starts[index]! >= cell.item.layout.lines.length)) return;
      this.newPage();
      withHeader = true;
    }
  }

  run(items: readonly FlowItem[]): readonly Command[][] {
    for (const item of items) {
      if (item.kind === "text") this.text(item);
      else if (item.kind === "table") this.table(item);
      else if (!item.commands.length) {
        // Un espacio separador no crea páginas ni ocupa el comienzo de la siguiente.
        if (this.cursor > 0) this.cursor = Math.min(this.capacity, this.cursor + item.height);
      } else this.atomic(item, item.path);
    }
    this.pages.push(this.commands);
    return this.pages;
  }
}

export function paginate(definition: PageDefinition, path: string): PagePlan[] {
  try {
    const [width, height] = definition.size;
    validatePageSize(width, height);
    const margins = resolveInsets(definition.margins);
    const gap = nonNegative(definition.sectionGap, "La separación de encabezado y pie");
    const availableWidth = width - margins.left - margins.right;
    if (availableWidth <= 0) throw new Error("Los márgenes no dejan ancho útil.");
    const section = (name: "header" | "footer") => definition[name]
      ? stack(measure(definition[name], availableWidth, definition.style, `${path}.${name}`, true))
      : { height: 0, commands: [] };
    const header = section("header");
    const footer = section("footer");
    const top = margins.top + header.height + (header.height ? gap : 0);
    const bottom = height - margins.bottom - footer.height - (footer.height ? gap : 0);
    if (bottom <= top) throw new Error("Los márgenes, el encabezado y el pie no dejan altura útil para el contenido.");
    const items = definition.content ? measure(definition.content, availableWidth, definition.style, `${path}.content`) : [];
    return new PageFlow(bottom - top).run(items).map(commands => ({ width, height, commands: [
      ...translate(header.commands, margins.left, margins.top),
      ...translate(commands, margins.left, top),
      ...translate(footer.commands, margins.left, height - margins.bottom - footer.height),
    ] }));
  } catch (error) {
    if (error instanceof LayoutError) throw error;
    throw new LayoutError(path, error instanceof Error ? error.message : String(error));
  }
}
