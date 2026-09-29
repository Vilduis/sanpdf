import type { QRErrorCorrection } from "../barcodes/QRCode.js";
import type { Color } from "../content/Color.js";
import type { PageSize } from "../core/PageSizes.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import type { PDFImage } from "../images/Image.js";
import type { Spacing } from "../layout/TextBox.js";
import type { TextAlignment } from "../layout/TextLayout.js";

export interface TextStyle {
  readonly font?: StandardFont;
  readonly fontSize?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: Color;
  readonly align?: TextAlignment;
  readonly lineHeight?: number;
}

/** Estilo de un fragmento dentro de un párrafo. Tamaño, interlineado y alineación son del párrafo. */
export interface SpanStyle {
  readonly font?: StandardFont;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: Color;
}

export interface Span {
  readonly text: string;
  readonly style?: SpanStyle;
  /** Dirección que se abre al hacer clic en el fragmento. */
  readonly link?: string;
}

/** Texto simple o una lista de fragmentos: ["El ", { text: "total", style: { bold: true } }, " es…"]. */
export type TextContent = string | readonly (string | Span)[];

export function toSpans(value: TextContent): Span[] {
  if (typeof value === "string") return [{ text: value }];
  if (!Array.isArray(value)) throw new TypeError("El texto debe ser una cadena o una lista de fragmentos.");
  return value.map(item => typeof item === "string" ? { text: item } : { ...item });
}

export interface BoxStyle {
  readonly padding?: Spacing;
  readonly background?: Color;
  readonly border?: Color;
}

/** Los números son puntos; * reparte el espacio restante por igual. */
export type ColumnWidth = number | "*" | { readonly weight: number };
export interface Cell {
  readonly text: TextContent;
  readonly style?: TextStyle;
}
export type CellValue = string | Cell;

export interface TextNode {
  readonly kind: "text";
  spans: Span[];
  style: TextStyle;
  box: BoxStyle;
  keepTogether: boolean;
  pageNumber: boolean;
  link: string | undefined;
  bookmark: string | undefined;
}
export interface ColumnNode {
  readonly kind: "column";
  children: Node[];
  gap: number;
  style: TextStyle;
}
export interface RowNode {
  readonly kind: "row";
  children: { width: ColumnWidth; node: Node }[];
  gap: number;
  style: TextStyle;
}
export interface TableNode {
  readonly kind: "table";
  columns: ColumnWidth[];
  header: CellValue[] | undefined;
  rows: CellValue[][];
  style: TextStyle;
  headerStyle: TextStyle;
  padding: Spacing;
  border: Color;
  headerBackground: Color;
}
export interface ImageNode {
  readonly kind: "image";
  readonly image: PDFImage;
  width: number | undefined;
  height: number | undefined;
  align: TextAlignment;
}
export interface QRCodeNode {
  readonly kind: "qr";
  readonly content: string;
  size: number;
  color: Color;
  errorCorrection: QRErrorCorrection;
  align: TextAlignment;
}
export interface DividerNode {
  readonly kind: "divider";
  color: Color;
  thickness: number;
}
interface SpaceNode {
  readonly kind: "space";
  readonly height: number;
}
export type Node = TextNode | ColumnNode | RowNode | TableNode | ImageNode | QRCodeNode | DividerNode | SpaceNode;

export interface PageDefinition {
  size: PageSize;
  margins: Spacing;
  style: TextStyle;
  header: Node | undefined;
  content: Node | undefined;
  footer: Node | undefined;
  sectionGap: number;
}
