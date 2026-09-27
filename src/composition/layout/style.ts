import { resolveColor, rgb } from "../../content/Color.js";
import type { RGBColor } from "../../content/Color.js";
import { StandardFonts, validateFont } from "../../fonts/StandardFont.js";
import type { StandardFont } from "../../fonts/StandardFont.js";
import type { TextLayoutOptions } from "../../layout/TextLayout.js";
import { finite, positive } from "../../utils/numbers.js";
import type { ColumnWidth, TextStyle } from "../model.js";

const boldFonts: Record<StandardFont, StandardFont> = {
  Helvetica: StandardFonts.HelveticaBold,
  "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Helvetica-Oblique": StandardFonts.HelveticaBoldOblique,
  "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  "Times-Roman": StandardFonts.TimesBold,
  "Times-Bold": StandardFonts.TimesBold,
  "Times-Italic": StandardFonts.TimesBoldItalic,
  "Times-BoldItalic": StandardFonts.TimesBoldItalic,
  Courier: StandardFonts.CourierBold,
  "Courier-Bold": StandardFonts.CourierBold,
  "Courier-Oblique": StandardFonts.CourierBoldOblique,
  "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
};

const italicFonts: Record<StandardFont, StandardFont> = {
  Helvetica: StandardFonts.HelveticaOblique,
  "Helvetica-Bold": StandardFonts.HelveticaBoldOblique,
  "Helvetica-Oblique": StandardFonts.HelveticaOblique,
  "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  "Times-Roman": StandardFonts.TimesItalic,
  "Times-Bold": StandardFonts.TimesBoldItalic,
  "Times-Italic": StandardFonts.TimesItalic,
  "Times-BoldItalic": StandardFonts.TimesBoldItalic,
  Courier: StandardFonts.CourierOblique,
  "Courier-Bold": StandardFonts.CourierBoldOblique,
  "Courier-Oblique": StandardFonts.CourierOblique,
  "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
};

/** Variante de la familia según bold/italic; conserva lo que la fuente ya tenga. */
export function styleFont(style: Pick<TextStyle, "font" | "bold" | "italic">): StandardFont {
  const font = style.font ?? StandardFonts.Helvetica;
  validateFont(font);
  const bold = style.bold ? boldFonts[font] : font;
  return style.italic ? italicFonts[bold] : bold;
}

export function textOptions(style: TextStyle, width: number): TextLayoutOptions {
  return {
    width, font: styleFont(style), size: style.fontSize ?? 12,
    align: style.align ?? "left",
    ...(style.lineHeight === undefined ? {} : { lineHeight: style.lineHeight }),
  };
}

export function textColor(style: TextStyle): RGBColor {
  return resolveColor(style.color ?? rgb(0, 0, 0));
}

export function nonNegative(value: number, label: string): number {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} no puede ser negativo.`);
  return value;
}

export function columnWidths(columns: readonly ColumnWidth[], available: number, gap = 0): number[] {
  if (!columns.length) throw new Error("Define al menos una columna.");
  nonNegative(gap, "El espacio entre columnas");
  let fixed = gap * (columns.length - 1);
  let weights = 0;
  for (const column of columns) {
    if (typeof column === "number") fixed += positive(column, "El ancho de columna");
    else weights += column === "*" ? 1 : positive(column.weight, "El peso de columna");
  }
  const remaining = available - fixed;
  if (remaining < -1e-8 || (weights > 0 && remaining <= 0)) {
    throw new RangeError(`Las columnas requieren más ancho del disponible (${available.toFixed(2)} pt).`);
  }
  return columns.map(column => typeof column === "number" ? column
    : remaining * (column === "*" ? 1 : column.weight) / weights);
}
