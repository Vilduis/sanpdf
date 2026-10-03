import type { QRErrorCorrection } from "../barcodes/QRCode.js";
import { rgb } from "../content/Color.js";
import type { Color } from "../content/Color.js";
import { PageSizes } from "../core/PageSizes.js";
import type { PageSize } from "../core/PageSizes.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import { toImage } from "../images/Image.js";
import type { PDFImage } from "../images/Image.js";
import type { Spacing } from "../layout/TextBox.js";
import { toSpans } from "./model.js";
import type {
  CellValue, ColumnNode, ColumnWidth, DividerNode, ImageNode, Node, PageDefinition, QRCodeNode,
  RowNode, Span, TableNode, TextContent, TextNode, TextStyle,
} from "./model.js";

export class TextBuilder {
  constructor(private readonly node: TextNode) {}
  style(style: TextStyle): this { this.node.style = { ...this.node.style, ...style }; return this; }
  fontSize(value: number): this { return this.style({ fontSize: value }); }
  lineHeight(value: number): this { return this.style({ lineHeight: value }); }
  font(value: StandardFont): this { return this.style({ font: value }); }
  bold(): this { return this.style({ bold: true }); }
  italic(): this { return this.style({ italic: true }); }
  color(value: Color): this { return this.style({ color: value }); }
  alignLeft(): this { return this.style({ align: "left" }); }
  alignCenter(): this { return this.style({ align: "center" }); }
  alignRight(): this { return this.style({ align: "right" }); }
  padding(value: Spacing): this { this.node.box = { ...this.node.box, padding: value }; return this; }
  background(value: Color): this { this.node.box = { ...this.node.box, background: value }; return this; }
  border(value: Color): this { this.node.box = { ...this.node.box, border: value }; return this; }
  keepTogether(): this { this.node.keepTogether = true; return this; }
  /** Todo el bloque abre esta dirección al hacer clic. Los fragmentos con su propio link la sustituyen. */
  link(url: string): this { this.node.link = url; return this; }
  /** Añade el texto (o el título indicado) al panel de marcadores del PDF. */
  bookmark(title?: string): this { this.node.bookmark = title ?? this.node.spans.map(span => span.text).join(""); return this; }
}

export class ImageBuilder {
  constructor(private readonly node: ImageNode) {}
  /** Ancho en puntos; si no indicas alto, se conserva la proporción. */
  width(value: number): this { this.node.width = value; return this; }
  /** Alto en puntos; con ancho y alto, la imagen se ajusta dentro de ese recuadro sin deformarse. */
  height(value: number): this { this.node.height = value; return this; }
  alignLeft(): this { this.node.align = "left"; return this; }
  alignCenter(): this { this.node.align = "center"; return this; }
  alignRight(): this { this.node.align = "right"; return this; }
}

export class QRCodeBuilder {
  constructor(private readonly node: QRCodeNode) {}
  /** Lado en puntos, incluida la zona de silencio (100 por defecto). */
  size(value: number): this { this.node.size = value; return this; }
  color(value: Color): this { this.node.color = value; return this; }
  /** L, M (por defecto), Q o H: más corrección tolera más daño, pero necesita más módulos. */
  errorCorrection(value: QRErrorCorrection): this { this.node.errorCorrection = value; return this; }
  alignLeft(): this { this.node.align = "left"; return this; }
  alignCenter(): this { this.node.align = "center"; return this; }
  alignRight(): this { this.node.align = "right"; return this; }
}

export class DividerBuilder {
  constructor(private readonly node: DividerNode) {}
  color(value: Color): this { this.node.color = value; return this; }
  thickness(value: number): this { this.node.thickness = value; return this; }
}

export class ContentBuilder {
  constructor(private readonly append: (node: Node) => void) {}
  /** Texto simple o fragmentos con estilos: ["Total: ", { text: "S/ 10", style: { bold: true } }]. */
  text(value: TextContent): TextBuilder {
    return this.addText(toSpans(value), false);
  }
  pageNumber(format = "Página {page} de {pages}"): TextBuilder {
    return this.addText([{ text: format }], true);
  }
  private addText(spans: Span[], pageNumber: boolean): TextBuilder {
    const node: TextNode = { kind: "text", spans, style: {}, box: {}, keepTogether: pageNumber, pageNumber, link: undefined, bookmark: undefined };
    this.append(node);
    return new TextBuilder(node);
  }
  /** Imagen JPEG o PNG. Pasa los bytes del archivo o una imagen de loadImage(). */
  image(source: Uint8Array | PDFImage): ImageBuilder {
    const node: ImageNode = { kind: "image", image: toImage(source), width: undefined, height: undefined, align: "left" };
    this.append(node);
    return new ImageBuilder(node);
  }
  qrCode(content: string): QRCodeBuilder {
    const node: QRCodeNode = { kind: "qr", content, size: 100, color: rgb(0, 0, 0), errorCorrection: "M", align: "left" };
    this.append(node);
    return new QRCodeBuilder(node);
  }
  /** Línea horizontal que ocupa todo el ancho disponible. */
  divider(): DividerBuilder {
    const node: DividerNode = { kind: "divider", color: rgb(0.75, 0.78, 0.82), thickness: 1 };
    this.append(node);
    return new DividerBuilder(node);
  }
  /** Espacio vertical en puntos. Al inicio de una página se omite, igual que gap(). */
  space(height: number): void {
    this.append({ kind: "space", height });
  }
  column(build: (column: ColumnBuilder) => void): void {
    const node: ColumnNode = { kind: "column", children: [], gap: 12, style: {} };
    build(new ColumnBuilder(node));
    this.append(node);
  }
  row(build: (row: RowBuilder) => void): void {
    const node: RowNode = { kind: "row", children: [], gap: 12, style: {} };
    build(new RowBuilder(node));
    this.append(node);
  }
  table(build: (table: TableBuilder) => void): void {
    const node: TableNode = {
      kind: "table", columns: [], header: [], rows: [], style: {}, headerStyle: { bold: true },
      padding: 8, border: rgb(0.75, 0.78, 0.82), headerBackground: rgb(0.94, 0.96, 0.98),
    };
    build(new TableBuilder(node));
    this.append(node);
  }
}

export class ColumnBuilder extends ContentBuilder {
  constructor(private readonly node: ColumnNode) { super(child => node.children.push(child)); }
  gap(value: number): this { this.node.gap = value; return this; }
  style(value: TextStyle): this { this.node.style = { ...this.node.style, ...value }; return this; }
}

function singleSlot(assign: (node: Node) => void): ContentBuilder {
  let filled = false;
  return new ContentBuilder(node => {
    if (filled) throw new Error("Este contenedor ya tiene contenido. Usa column() para añadir varios elementos.");
    assign(node);
    filled = true;
  });
}

export class RowBuilder {
  constructor(private readonly node: RowNode) {}
  gap(value: number): this { this.node.gap = value; return this; }
  style(value: TextStyle): this { this.node.style = { ...this.node.style, ...value }; return this; }
  item(width: ColumnWidth = "*"): ContentBuilder {
    // Reserva el orden incluso si el usuario conserva el builder para rellenarlo después.
    const child = { width, node: { kind: "column", children: [], gap: 0, style: {} } as Node };
    this.node.children.push(child);
    return singleSlot(node => { child.node = node; });
  }
}

export class TableBuilder {
  constructor(private readonly node: TableNode) {}
  columns(values: readonly ColumnWidth[]): this { this.node.columns = [...values]; return this; }
  header(values: readonly CellValue[]): this { this.node.header = [[...values]]; return this; }
  /** Añade otra fila de cabecera. */
  headerRow(values: readonly CellValue[]): this { this.node.header.push([...values]); return this; }
  row(values: readonly CellValue[]): this { this.node.rows.push([...values]); return this; }
  style(value: TextStyle): this { this.node.style = { ...this.node.style, ...value }; return this; }
  headerStyle(value: TextStyle): this { this.node.headerStyle = { ...this.node.headerStyle, ...value }; return this; }
  padding(value: Spacing): this { this.node.padding = value; return this; }
  border(value: Color): this { this.node.border = value; return this; }
  headerBackground(value: Color): this { this.node.headerBackground = value; return this; }
}

export class PageBuilder {
  private readonly slots: Record<"header" | "content" | "footer", ContentBuilder>;
  constructor(private readonly definition: PageDefinition) {
    this.slots = {
      header: singleSlot(node => { definition.header = node; }),
      content: singleSlot(node => { definition.content = node; }),
      footer: singleSlot(node => { definition.footer = node; }),
    };
  }
  size(value: keyof typeof PageSizes | PageSize): this {
    this.definition.size = typeof value === "string" ? PageSizes[value] : value;
    return this;
  }
  margin(value: Spacing): this { this.definition.margins = value; return this; }
  defaultTextStyle(value: TextStyle): this { this.definition.style = { ...this.definition.style, ...value }; return this; }
  sectionGap(value: number): this { this.definition.sectionGap = value; return this; }
  header(): ContentBuilder { return this.slots.header; }
  content(): ContentBuilder { return this.slots.content; }
  footer(): ContentBuilder { return this.slots.footer; }
}
