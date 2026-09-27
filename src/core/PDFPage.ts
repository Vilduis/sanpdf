import { encodeQR } from "../barcodes/QRCode.js";
import { colorOperator, rgb } from "../content/Color.js";
import type { Color } from "../content/Color.js";
import type { ImageOptions, LineOptions, LinkOptions, QRCodeOptions, RectangleOptions, TextOptions } from "../content/DrawingOptions.js";
import { encodeWinAnsi } from "../fonts/FontEncoder.js";
import { StandardFonts, validateFont } from "../fonts/StandardFont.js";
import type { StandardFont } from "../fonts/StandardFont.js";
import { toImage } from "../images/Image.js";
import type { PDFImage } from "../images/Image.js";
import { ByteWriter } from "../utils/ByteWriter.js";
import { toHex } from "../utils/encoding.js";
import { finite, pdfNumber, positive } from "../utils/numbers.js";
import { layoutTextBox } from "../layout/TextBox.js";
import type { TextBoxLayout, TextBoxOptions } from "../layout/TextBox.js";
import { validatePageSize } from "./PageSizes.js";

const black = rgb(0, 0, 0);

/** Enlace en coordenadas PDF (origen abajo a la izquierda). */
interface PageLink {
  readonly rect: readonly [number, number, number, number];
  readonly url: string;
}

export class PDFPage {
  private readonly commands: string[] = [];
  private readonly fonts = new Map<StandardFont, string>();
  private readonly images = new Map<PDFImage, string>();
  private readonly links: PageLink[] = [];

  constructor(readonly width: number, readonly height: number) {
    validatePageSize(width, height);
  }

  drawText(text: string, options: TextOptions): this {
    const x = finite(options.x, "x");
    const y = finite(options.y, "y");
    const size = positive(options.size ?? 12, "El tamaño de fuente");
    const lineHeight = positive(options.lineHeight ?? size * 1.2, "El interlineado");
    const font = options.font ?? StandardFonts.Helvetica;
    validateFont(font);
    const lines = text.replace(/\r\n?/g, "\n").split("\n").map(encodeWinAnsi);
    this.writeText(lines.map((bytes, index) => ({ bytes, x, baseline: y + index * lineHeight })),
      font, size, options.color ?? black);
    return this;
  }

  /** Ajusta texto a una caja y devuelve sus medidas y posiciones. y es el borde superior. */
  drawTextBox(text: string, options: TextBoxOptions): TextBoxLayout {
    const layout = layoutTextBox(text, options);
    this.writeText(layout.lines.map((line) => ({ bytes: encodeWinAnsi(line.text), x: line.x, baseline: line.baseline })),
      layout.font, layout.size, options.color ?? black);
    return layout;
  }

  private writeText(lines: readonly { bytes: Uint8Array; x: number; baseline: number }[],
    font: StandardFont, size: number, textColor: Color): void {
    const color = colorOperator(textColor);
    if (lines.length === 0) return;
    const resource = this.fonts.get(font) ?? `F${this.fonts.size + 1}`;
    const commands = ["q", "BT", `/${resource} ${pdfNumber(size)} Tf`, color];
    lines.forEach((line) => {
      commands.push(`1 0 0 1 ${pdfNumber(line.x)} ${pdfNumber(this.height - line.baseline)} Tm`, `<${toHex(line.bytes)}> Tj`);
    });
    commands.push("ET", "Q");
    // Mutación solo después de validar toda la operación.
    this.fonts.set(font, resource);
    this.commands.push(commands.join("\n"));
  }

  drawLine(options: LineOptions): this {
    const width = positive(options.width ?? 1, "El grosor de línea");
    const commands = ["q", colorOperator(options.color ?? black, true), `${pdfNumber(width)} w`,
      `${pdfNumber(options.start.x)} ${pdfNumber(this.height - options.start.y)} m`,
      `${pdfNumber(options.end.x)} ${pdfNumber(this.height - options.end.y)} l`, "S", "Q"];
    this.commands.push(commands.join("\n"));
    return this;
  }

  drawRectangle(options: RectangleOptions): this {
    positive(options.width, "El ancho del rectángulo");
    positive(options.height, "El alto del rectángulo");
    const borderWidth = positive(options.borderWidth ?? 1, "El grosor del borde");
    const fill = options.fillColor;
    const border = options.borderColor ?? (fill === undefined ? black : undefined);
    const commands = ["q"];
    if (fill !== undefined) commands.push(colorOperator(fill));
    if (border !== undefined) commands.push(colorOperator(border, true), `${pdfNumber(borderWidth)} w`);
    commands.push(`${pdfNumber(options.x)} ${pdfNumber(this.height - options.y - options.height)} ${pdfNumber(options.width)} ${pdfNumber(options.height)} re`,
      fill !== undefined ? (border !== undefined ? "B" : "f") : "S", "Q");
    this.commands.push(commands.join("\n"));
    return this;
  }

  /**
   * Dibuja un JPEG o PNG. Acepta los bytes del archivo o una imagen de loadImage();
   * para repetir la misma imagen en varias páginas, usa loadImage() una vez.
   */
  drawImage(source: Uint8Array | PDFImage, options: ImageOptions): this {
    const image = toImage(source);
    const x = finite(options.x, "x");
    const y = finite(options.y, "y");
    const ratio = image.width / image.height;
    const width = options.width !== undefined ? positive(options.width, "El ancho de la imagen")
      : options.height !== undefined ? positive(options.height, "El alto de la imagen") * ratio : image.width;
    const height = options.height !== undefined ? positive(options.height, "El alto de la imagen") : width / ratio;
    const resource = this.images.get(image) ?? `Im${this.images.size + 1}`;
    const command = ["q", `${pdfNumber(width)} 0 0 ${pdfNumber(height)} ${pdfNumber(x)} ${pdfNumber(this.height - y - height)} cm`,
      `/${resource} Do`, "Q"].join("\n");
    this.images.set(image, resource);
    this.commands.push(command);
    return this;
  }

  /** Dibuja un código QR vectorial. El tamaño incluye la zona de silencio. */
  drawQRCode(content: string, options: QRCodeOptions): this {
    const x = finite(options.x, "x");
    const y = finite(options.y, "y");
    const size = positive(options.size, "El tamaño del código QR");
    const quietZone = options.quietZone ?? 4;
    if (!Number.isInteger(quietZone) || quietZone < 0) throw new RangeError("La zona de silencio debe ser un entero de módulos mayor o igual que cero.");
    const color = colorOperator(options.color ?? black);
    const { size: count, modules } = encodeQR(content, options.errorCorrection ?? "M");
    const module = size / (count + quietZone * 2);
    const commands = ["q", color];
    modules.forEach((row, rowIndex) => {
      // Une módulos oscuros consecutivos: menos operadores y sin juntas visibles.
      for (let column = 0; column < count;) {
        if (!row[column]) { column++; continue; }
        const start = column;
        while (column < count && row[column]) column++;
        const left = x + (quietZone + start) * module;
        const top = y + (quietZone + rowIndex) * module;
        commands.push(`${pdfNumber(left)} ${pdfNumber(this.height - top - module)} ${pdfNumber((column - start) * module)} ${pdfNumber(module)} re`);
      }
    });
    commands.push("f", "Q");
    this.commands.push(commands.join("\n"));
    return this;
  }

  /** Crea un área que abre una dirección al hacer clic. No dibuja nada. */
  addLink(options: LinkOptions): this {
    const x = finite(options.x, "x");
    const y = finite(options.y, "y");
    const width = positive(options.width, "El ancho del enlace");
    const height = positive(options.height, "El alto del enlace");
    this.links.push({ rect: [x, this.height - y - height, x + width, this.height - y], url: normalizeURL(options.url) });
    return this;
  }

  /** @internal Instantánea independiente para el serializador. */
  snapshot(): {
    content: Uint8Array;
    fonts: ReadonlyMap<StandardFont, string>;
    images: ReadonlyMap<PDFImage, string>;
    links: readonly PageLink[];
  } {
    const writer = new ByteWriter();
    writer.writeAscii(this.commands.length ? this.commands.join("\n") + "\n" : "");
    return { content: writer.toBytes(), fonts: new Map(this.fonts), images: new Map(this.images), links: [...this.links] };
  }
}

/** Exige un esquema y codifica en porcentaje los caracteres que no son ASCII visibles. */
export function normalizeURL(url: string): string {
  if (typeof url !== "string" || !/^[a-z][a-z0-9+.-]*:\S/i.test(url.trim())) {
    throw new Error(`Enlace inválido: "${String(url)}". Incluye el esquema, por ejemplo "https://ejemplo.com" o "mailto:ventas@ejemplo.com".`);
  }
  let result = "";
  for (const char of url.trim()) {
    const code = char.codePointAt(0)!;
    result += code > 32 && code < 127 ? char : encodeURIComponent(char);
  }
  return result;
}
