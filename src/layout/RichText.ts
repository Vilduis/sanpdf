import type { RGBColor } from "../content/Color.js";
import { encodeWinAnsi } from "../fonts/FontEncoder.js";
import { measureText, resolveFont } from "../fonts/measureText.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import { fontMetrics } from "../fonts/StandardFontMetrics.js";
import { finite, positive } from "../utils/numbers.js";
import type { TextAlignment } from "./TextLayout.js";

/** @internal Fragmento de un párrafo con fuente, color y enlace propios. Todos comparten tamaño. */
export interface TextRun {
  readonly text: string;
  readonly font: StandardFont;
  readonly color: RGBColor;
  readonly link: string | undefined;
}

export interface RunSegment {
  readonly text: string;
  readonly font: StandardFont;
  readonly color: RGBColor;
  readonly link: string | undefined;
  /** Relativo al borde izquierdo del bloque. */
  readonly x: number;
  readonly width: number;
}

export interface RichLine {
  readonly segments: readonly RunSegment[];
  /** Inicio de la línea tras aplicar la alineación, relativo al borde izquierdo del bloque. */
  readonly x: number;
  readonly width: number;
  /** Línea base relativa al borde superior del bloque. */
  readonly baseline: number;
}

export interface RichLayout {
  readonly lines: readonly RichLine[];
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  readonly ascent: number;
  readonly descent: number;
  readonly size: number;
}

export interface RichLayoutOptions {
  readonly width: number;
  readonly size: number;
  /** Fuente del párrafo: define la altura mínima aunque ningún fragmento la use. */
  readonly font: StandardFont;
  readonly lineHeight?: number;
  readonly align?: TextAlignment;
  /** Divide palabras que exceden el ancho; false produce un error. Por defecto true. */
  readonly breakWords?: boolean;
}

interface Glyph { readonly char: string; readonly run: number; readonly units: number; }

/**
 * Distribuye fragmentos con estilos distintos en líneas. Respeta saltos explícitos,
 * normaliza espacios ASCII consecutivos y divide palabras que exceden el ancho.
 */
export function layoutRuns(runs: readonly TextRun[], options: RichLayoutOptions): RichLayout {
  const width = positive(options.width, "El ancho del texto");
  const { size } = resolveFont({ font: options.font, size: options.size });
  const fonts = new Set<StandardFont>([options.font]);
  for (const run of runs) if (run.text) { resolveFont({ font: run.font, size }); fonts.add(run.font); }
  const metrics = [...fonts].map(font => measureText("", { font, size }));
  const ascent = Math.max(...metrics.map(m => m.ascent));
  const descent = Math.max(...metrics.map(m => m.descent));
  const leftOverhang = Math.max(...metrics.map(m => m.leftOverhang));
  const rightOverhang = Math.max(...metrics.map(m => m.rightOverhang));
  const lineHeight = positive(options.lineHeight ?? size * 1.25, "El interlineado");
  if (lineHeight < ascent + descent) throw new RangeError("El interlineado es menor que la altura de la fuente (acentos y descendentes).");
  const align = options.align ?? "left";
  if (!["left", "center", "right"].includes(align)) throw new Error("Alineación de texto inválida.");
  const available = width - leftOverhang - rightOverhang;
  if (available <= 0) throw new RangeError("El ancho es insuficiente para la fuente.");
  const scale = size / 1000;
  const fits = (units: number) => units * scale <= available + 1e-8;

  const normalized = runs.map(run => run.text.normalize("NFC").replace(/\r\n?/g, "\n"));
  const paragraphs: Glyph[][] = normalized.join("") === "" ? [] : [[]];
  normalized.forEach((text, index) => {
    const widths = fontMetrics[runs[index]!.font].widths;
    text.split("\n").forEach((piece, pieceIndex) => {
      if (pieceIndex > 0) paragraphs.push([]);
      const bytes = encodeWinAnsi(piece);
      const paragraph = paragraphs.at(-1)!;
      // Tras NFC, WinAnsi produce un byte por carácter.
      [...piece].forEach((char, i) => {
        const units = widths[bytes[i]! - 32];
        if (!units) throw new Error(`Falta la métrica de ${runs[index]!.font} para el byte ${bytes[i]}.`);
        paragraph.push({ char, run: index, units });
      });
    });
  });

  const lines: Glyph[][] = [];
  for (const paragraph of paragraphs) {
    let start = 0;
    let end = paragraph.length;
    while (start < end && paragraph[start]!.char === " ") start++;
    while (end > start && paragraph[end - 1]!.char === " ") end--;
    if (start === end) { lines.push([]); continue; }
    const words: { gap: Glyph | undefined; glyphs: Glyph[] }[] = [];
    let gap: Glyph | undefined;
    for (let i = start; i < end; i++) {
      const glyph = paragraph[i]!;
      if (glyph.char === " ") { gap ??= glyph; continue; }
      if (gap || !words.length) { words.push({ gap: words.length ? gap : undefined, glyphs: [] }); gap = undefined; }
      words.at(-1)!.glyphs.push(glyph);
    }
    let current: Glyph[] = [];
    let units = 0;
    for (const word of words) {
      const wordUnits = word.glyphs.reduce((sum, glyph) => sum + glyph.units, 0);
      const gapUnits = current.length && word.gap ? word.gap.units : 0;
      if (fits(units + gapUnits + wordUnits)) {
        if (current.length && word.gap) current.push(word.gap);
        current.push(...word.glyphs);
        units += gapUnits + wordUnits;
        continue;
      }
      if (current.length) { lines.push(current); current = []; units = 0; }
      if (fits(wordUnits)) { current = [...word.glyphs]; units = wordUnits; continue; }
      if (options.breakWords === false) {
        throw new RangeError(`La palabra no cabe en el ancho disponible: ${word.glyphs.map(glyph => glyph.char).join("")}`);
      }
      for (const glyph of word.glyphs) {
        if (!fits(glyph.units)) throw new RangeError(`El carácter ${glyph.char} no cabe en el ancho disponible.`);
        if (current.length && !fits(units + glyph.units)) { lines.push(current); current = []; units = 0; }
        current.push(glyph);
        units += glyph.units;
      }
    }
    if (current.length) lines.push(current);
  }

  const height = lines.length ? ascent + descent + (lines.length - 1) * lineHeight : 0;
  finite(height, "La altura del texto");
  return {
    lines: lines.map((glyphs, index) => {
      const total = glyphs.reduce((sum, glyph) => sum + glyph.units, 0);
      const advance = total * scale;
      const x = leftOverhang + (align === "center" ? (available - advance) / 2 : align === "right" ? available - advance : 0);
      const segments: RunSegment[] = [];
      let before = 0;
      for (let i = 0; i < glyphs.length;) {
        const run = glyphs[i]!.run;
        let text = "";
        let segmentUnits = 0;
        for (; i < glyphs.length && glyphs[i]!.run === run; i++) { text += glyphs[i]!.char; segmentUnits += glyphs[i]!.units; }
        const { font, color, link } = runs[run]!;
        segments.push({ text, font, color, link, x: x + before * scale, width: segmentUnits * scale });
        before += segmentUnits;
      }
      return { segments, x, width: advance, baseline: ascent + index * lineHeight };
    }),
    width, height, lineHeight, ascent, descent, size,
  };
}
