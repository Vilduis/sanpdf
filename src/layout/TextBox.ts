import type { Color } from "../content/Color.js";
import { layoutText } from "./TextLayout.js";
import type { TextLayout, TextLayoutOptions } from "./TextLayout.js";
import { finite, positive } from "../utils/numbers.js";

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type Spacing = number | Partial<Insets>;

export function resolveInsets(value: Spacing = 0): Insets {
  const result = typeof value === "number"
    ? { top: value, right: value, bottom: value, left: value }
    : { top: value.top ?? 0, right: value.right ?? 0, bottom: value.bottom ?? 0, left: value.left ?? 0 };
  for (const number of Object.values(result)) {
    finite(number, "El espaciado");
    if (number < 0) throw new RangeError("El espaciado no puede ser negativo.");
  }
  return result;
}

export interface TextBoxOptions extends TextLayoutOptions {
  readonly x: number;
  /** Borde superior de la caja, a diferencia del y de drawText que es línea base. */
  readonly y: number;
  /** Si se omite, la altura se calcula. Si no cabe, se lanza un error antes de dibujar. */
  readonly height?: number;
  readonly padding?: Spacing;
  readonly verticalAlign?: "top" | "middle" | "bottom";
  readonly color?: Color;
}

export interface TextBoxLayout extends TextLayout {
  readonly x: number;
  readonly y: number;
  readonly nextY: number;
  readonly contentHeight: number;
  readonly padding: Insets;
}

/** Líneas en coordenadas absolutas; altura exterior, incluyendo padding. */
export function layoutTextBox(text: string, options: TextBoxOptions): TextBoxLayout {
  const x = finite(options.x, "x");
  const y = finite(options.y, "y");
  positive(options.width, "El ancho de la caja");
  const padding = resolveInsets(options.padding);
  const layout = layoutText(text, { ...options, width: options.width - padding.left - padding.right });
  const natural = layout.height + padding.top + padding.bottom;
  const height = options.height === undefined ? natural : positive(options.height, "La altura de la caja");
  if (height + 1e-8 < natural) throw new RangeError(`El texto necesita ${natural.toFixed(2)} pt de alto; la caja tiene ${height.toFixed(2)} pt.`);
  const align = options.verticalAlign ?? "top";
  if (!["top", "middle", "bottom"].includes(align)) throw new Error("Alineación vertical inválida.");
  const extra = height - natural;
  const offset = align === "middle" ? extra / 2 : align === "bottom" ? extra : 0;
  const nextY = finite(y + height, "El borde inferior de la caja");
  finite(x + options.width, "El borde derecho de la caja");
  return { ...layout, x, y, width: options.width, height, nextY, padding, contentHeight: layout.height,
    lines: layout.lines.map((line) => ({ ...line, x: x + padding.left + line.x,
      baseline: y + padding.top + offset + line.baseline })) };
}
