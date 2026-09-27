import type { QRErrorCorrection } from "../barcodes/QRCode.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import type { Color } from "./Color.js";

export interface TextOptions {
  readonly x: number;
  /** Distancia desde el borde superior hasta la línea base de la primera línea. */
  readonly y: number;
  readonly size?: number;
  readonly font?: StandardFont;
  readonly color?: Color;
  /** Distancia entre líneas; por defecto size * 1.2. Admite saltos explícitos. */
  readonly lineHeight?: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LineOptions {
  readonly start: Point;
  readonly end: Point;
  readonly color?: Color;
  readonly width?: number;
}

export interface RectangleOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fillColor?: Color;
  readonly borderColor?: Color;
  readonly borderWidth?: number;
}

export interface ImageOptions {
  readonly x: number;
  /** Borde superior de la imagen. */
  readonly y: number;
  /** Si solo indicas una dimensión, la otra respeta la proporción. Sin ninguna, 1 píxel = 1 punto. */
  readonly width?: number;
  readonly height?: number;
}

export interface QRCodeOptions {
  readonly x: number;
  /** Borde superior del código. */
  readonly y: number;
  /** Lado total en puntos, incluida la zona de silencio. */
  readonly size: number;
  readonly color?: Color;
  /** Nivel de corrección: "M" por defecto. */
  readonly errorCorrection?: QRErrorCorrection;
  /** Módulos de margen blanco alrededor del código (4 por defecto, como exige la norma). */
  readonly quietZone?: number;
}

export interface LinkOptions {
  readonly x: number;
  /** Borde superior del área del enlace. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Dirección con esquema: "https://…", "mailto:…" o "tel:…". */
  readonly url: string;
}
