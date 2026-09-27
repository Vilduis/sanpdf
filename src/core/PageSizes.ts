import { positive } from "../utils/numbers.js";

export type PageSize = readonly [width: number, height: number];

export function validatePageSize(width: number, height: number): void {
  positive(width, "El ancho de página");
  positive(height, "El alto de página");
  if (width > 14400 || height > 14400) throw new RangeError("Las dimensiones de página no pueden superar 14400 puntos.");
}

/** Dimensiones en puntos (72 puntos = 1 pulgada). */
export const PageSizes = Object.freeze({
  A4: Object.freeze([595.275591, 841.889764] as const),
  A5: Object.freeze([419.527559, 595.275591] as const),
  Letter: Object.freeze([612, 792] as const),
  Legal: Object.freeze([612, 1008] as const),
});
