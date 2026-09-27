import { finite, pdfNumber } from "../utils/numbers.js";

export interface RGBColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Un color RGB (componentes 0–1) o una cadena hexadecimal: "#1F4788" o "#abc". */
export type Color = RGBColor | string;

/** Componentes RGB entre 0 y 1. */
export function rgb(r: number, g: number, b: number): RGBColor {
  for (const [label, value] of [["r", r], ["g", g], ["b", b]] as const) {
    finite(value, label);
    if (value < 0 || value > 1) throw new RangeError(`${label} debe estar entre 0 y 1.`);
  }
  return Object.freeze({ r, g, b });
}

/** Convierte "#RRGGBB" o "#RGB" (con o sin #) a RGBColor. */
export function hex(value: string): RGBColor {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) throw new RangeError(`Color hexadecimal inválido: "${value}". Usa "#RRGGBB" o "#RGB".`);
  const digits = match[1]!.length === 3 ? [...match[1]!].map(digit => digit + digit).join("") : match[1]!;
  const channel = (index: number) => parseInt(digits.slice(index, index + 2), 16) / 255;
  return rgb(channel(0), channel(2), channel(4));
}

export function resolveColor(color: Color): RGBColor {
  return typeof color === "string" ? hex(color) : rgb(color.r, color.g, color.b);
}

export function colorOperator(color: Color, stroke = false): string {
  const { r, g, b } = resolveColor(color);
  return `${pdfNumber(r)} ${pdfNumber(g)} ${pdfNumber(b)} ${stroke ? "RG" : "rg"}`;
}
