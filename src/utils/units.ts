/** Milímetros a puntos: mm(10) ≈ 28.35. */
export function mm(value: number): number { return value * 72 / 25.4; }

/** Centímetros a puntos: cm(1) ≈ 28.35. */
export function cm(value: number): number { return value * 72 / 2.54; }

/** Pulgadas a puntos: inch(1) = 72. */
export function inch(value: number): number { return value * 72; }
