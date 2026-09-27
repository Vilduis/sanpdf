import { rgb } from "../content/Color.js";
import { resolveFont } from "../fonts/measureText.js";
import type { FontOptions } from "../fonts/measureText.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import { layoutRuns } from "./RichText.js";

const black = rgb(0, 0, 0);

export type TextAlignment = "left" | "center" | "right";

export interface TextLayoutOptions extends FontOptions {
  readonly width: number;
  readonly lineHeight?: number;
  readonly align?: TextAlignment;
  /** Divide palabras que exceden el ancho; false produce un error. Por defecto true. */
  readonly breakWords?: boolean;
}

export interface TextLayoutLine {
  readonly text: string;
  readonly width: number;
  readonly x: number;
  /** Línea base relativa al borde superior del bloque. */
  readonly baseline: number;
}

export interface TextLayout {
  readonly lines: readonly TextLayoutLine[];
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  readonly ascent: number;
  readonly descent: number;
  readonly font: StandardFont;
  readonly size: number;
}

/** Calcula sin dibujar. Conserva saltos explícitos y normaliza espacios ASCII consecutivos. */
export function layoutText(text: string, options: TextLayoutOptions): TextLayout {
  const { font, size } = resolveFont(options);
  const layout = layoutRuns([{ text, font, color: black, link: undefined }], {
    width: options.width, size, font,
    ...(options.lineHeight === undefined ? {} : { lineHeight: options.lineHeight }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.breakWords === undefined ? {} : { breakWords: options.breakWords }),
  });
  return {
    lines: layout.lines.map(line => ({
      text: line.segments.map(segment => segment.text).join(""),
      width: line.width, x: line.x, baseline: line.baseline,
    })),
    width: layout.width, height: layout.height, lineHeight: layout.lineHeight,
    ascent: layout.ascent, descent: layout.descent, font, size,
  };
}
