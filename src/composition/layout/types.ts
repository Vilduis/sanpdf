import type { QRErrorCorrection } from "../../barcodes/QRCode.js";
import type { RGBColor } from "../../content/Color.js";
import type { StandardFont } from "../../fonts/StandardFont.js";
import type { PDFImage } from "../../images/Image.js";
import type { RichLayout } from "../../layout/RichText.js";
import type { Insets } from "../../layout/TextBox.js";
import type { TextStyle } from "../model.js";

export interface TextCommand {
  readonly kind: "text";
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly font: StandardFont;
  readonly size: number;
  readonly color: RGBColor;
}
export interface NumberCommand {
  readonly kind: "number";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly style: TextStyle;
}
export interface RectangleCommand {
  readonly kind: "rectangle";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: RGBColor | undefined;
  readonly border: RGBColor | undefined;
}
export interface LineCommand {
  readonly kind: "line";
  readonly x: number;
  /** Eje de la línea horizontal. */
  readonly y: number;
  readonly width: number;
  readonly thickness: number;
  readonly color: RGBColor;
}
export interface ImageCommand {
  readonly kind: "image";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly image: PDFImage;
}
export interface QRCodeCommand {
  readonly kind: "qr";
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly content: string;
  readonly color: RGBColor;
  readonly errorCorrection: QRErrorCorrection;
}
export interface LinkCommand {
  readonly kind: "link";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}
export interface BookmarkCommand {
  readonly kind: "bookmark";
  readonly x: number;
  readonly y: number;
  readonly title: string;
}
export type Command = TextCommand | NumberCommand | RectangleCommand | LineCommand
  | ImageCommand | QRCodeCommand | LinkCommand | BookmarkCommand;
export interface Block {
  readonly height: number;
  readonly commands: readonly Command[];
}
export interface AtomicItem extends Block { readonly kind: "atomic"; readonly path: string; }
export interface TextItem {
  readonly kind: "text";
  readonly path: string;
  readonly width: number;
  readonly layout: RichLayout;
  readonly padding: Insets;
  readonly fill: RGBColor | undefined;
  readonly border: RGBColor | undefined;
  readonly keepTogether: boolean;
  readonly bookmark: string | undefined;
}
export interface TableCell {
  readonly x: number;
  readonly width: number;
  readonly item: TextItem;
}
export interface TableRow {
  readonly path: string;
  readonly cells: readonly TableCell[];
  readonly fill: RGBColor | undefined;
  readonly border: RGBColor;
}
export interface TableItem {
  readonly kind: "table";
  readonly path: string;
  readonly header: Block;
  readonly rows: readonly TableRow[];
}
export type FlowItem = AtomicItem | TextItem | TableItem;
export interface PagePlan {
  readonly width: number;
  readonly height: number;
  readonly commands: readonly Command[];
}

export class LayoutError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "LayoutError";
  }
}
