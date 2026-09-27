export const StandardFonts = Object.freeze({
  Helvetica: "Helvetica",
  HelveticaBold: "Helvetica-Bold",
  HelveticaOblique: "Helvetica-Oblique",
  HelveticaBoldOblique: "Helvetica-BoldOblique",
  TimesRoman: "Times-Roman",
  TimesBold: "Times-Bold",
  TimesItalic: "Times-Italic",
  TimesBoldItalic: "Times-BoldItalic",
  Courier: "Courier",
  CourierBold: "Courier-Bold",
  CourierOblique: "Courier-Oblique",
  CourierBoldOblique: "Courier-BoldOblique",
} as const);

export type StandardFont = typeof StandardFonts[keyof typeof StandardFonts];

export function validateFont(font: StandardFont): void {
  if (!(Object.values(StandardFonts) as string[]).includes(font)) {
    throw new Error(`Fuente estándar no admitida: ${font}`);
  }
}
