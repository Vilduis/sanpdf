import { encodeWinAnsi } from "./FontEncoder.js";
import { StandardFonts, validateFont } from "./StandardFont.js";
import type { StandardFont } from "./StandardFont.js";
import { fontMetrics } from "./StandardFontMetrics.js";
import { positive, pdfNumber } from "../utils/numbers.js";

export interface FontOptions {
  readonly font?: StandardFont;
  readonly size?: number;
}

export interface TextMeasurement {
  /** Avance de una línea, sin kerning, igual al usado por el operador Tj. */
  readonly width: number;
  /** Límites conservadores de la fuente, incluyendo acentos y descendentes. */
  readonly ascent: number;
  readonly descent: number;
  readonly height: number;
  readonly leftOverhang: number;
  readonly rightOverhang: number;
}

/** Tamaño tal como se escribe en el PDF (precisión de seis decimales). @internal */
export function resolveFont(options: FontOptions): { font: StandardFont; size: number } {
  const font = options.font ?? StandardFonts.Helvetica;
  validateFont(font);
  const size = Number(pdfNumber(positive(options.size ?? 12, "El tamaño de fuente")));
  positive(size, "El tamaño de fuente representable");
  return { font, size };
}

/** Mide una sola línea; admite los mismos caracteres que drawText. */
export function measureText(text: string, options: FontOptions = {}): TextMeasurement {
  const { font, size } = resolveFont(options);
  const data = fontMetrics[font];
  const bytes = encodeWinAnsi(text);
  let units = 0;
  for (const byte of bytes) {
    const width = data.widths[byte - 32];
    if (!width) throw new Error(`Falta la métrica de ${font} para el byte ${byte}.`);
    units += width;
  }
  const [ascent, descent, left, right] = data.extents.map((value) => value * size / 1000) as [number, number, number, number];
  return { width: units * size / 1000, ascent, descent, height: ascent + descent,
    leftOverhang: left, rightOverhang: right };
}
