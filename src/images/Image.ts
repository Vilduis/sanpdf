import { deflate, inflate } from "../compression/zlib.js";
import { PDFDictionary, PDFName, PDFString } from "../core/PDFObject.js";
import type { PDFValue } from "../core/PDFObject.js";

/** @internal Stream de imagen listo para registrarse como XObject. */
export interface ImageStream {
  readonly entries: Readonly<Record<string, PDFValue>>;
  readonly data: Uint8Array;
}

/**
 * Imagen JPEG o PNG ya validada. Crea una con loadImage() y reutilízala:
 * el PDF incluye sus datos una sola vez aunque se dibuje en muchas páginas.
 */
export class PDFImage {
  /** @internal */
  constructor(
    /** Ancho y alto en píxeles. */
    readonly width: number,
    readonly height: number,
    /** @internal */ readonly stream: ImageStream,
    /** @internal */ readonly mask: ImageStream | undefined,
  ) {
    Object.freeze(this);
  }
}

/** Lee un JPEG o PNG. Los datos se copian: modificar los bytes después no altera la imagen. */
export function loadImage(bytes: Uint8Array): PDFImage {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("La imagen debe ser un Uint8Array con el contenido del archivo.");
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJPEG(bytes.slice());
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return parsePNG(bytes);
  throw new Error("Formato de imagen no soportado. Usa JPEG o PNG.");
}

export function toImage(value: Uint8Array | PDFImage): PDFImage {
  return value instanceof PDFImage ? value : loadImage(value);
}

const name = (value: string) => new PDFName(value);
const u16 = (bytes: Uint8Array, offset: number) => (bytes[offset]! << 8) | bytes[offset + 1]!;
const u32 = (bytes: Uint8Array, offset: number) => ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;

function checkSize(width: number, height: number): void {
  if (!width || !height) throw new Error("La imagen no tiene dimensiones válidas.");
  if (width * height > 100_000_000) throw new RangeError("La imagen excede 100 megapíxeles.");
}

function parseJPEG(bytes: Uint8Array): PDFImage {
  let offset = 2;
  let adobe = false;
  let frame: { width: number; height: number; components: number } | undefined;
  while (offset + 4 <= bytes.length && !frame) {
    if (bytes[offset] !== 0xff) throw new Error("JPEG dañado: marcador inválido.");
    let marker = bytes[offset + 1]!;
    while (marker === 0xff && offset + 2 < bytes.length) marker = bytes[++offset + 1]!;
    offset += 2;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = u16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("JPEG dañado: segmento incompleto.");
    const segment = offset + 2;
    if (marker === 0xee && String.fromCharCode(...bytes.subarray(segment, segment + 5)) === "Adobe") adobe = true;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (marker > 0xc2) throw new Error("JPEG no soportado: usa codificación baseline o progresiva (no aritmética ni sin pérdida).");
      if (bytes[segment] !== 8) throw new Error("JPEG no soportado: solo se admiten 8 bits por componente.");
      frame = { height: u16(bytes, segment + 1), width: u16(bytes, segment + 3), components: bytes[segment + 5]! };
    }
    offset += length;
  }
  if (!frame) throw new Error("JPEG dañado: no se encontró la cabecera de la imagen.");
  checkSize(frame.width, frame.height);
  const colorSpace = { 1: "DeviceGray", 3: "DeviceRGB", 4: "DeviceCMYK" }[frame.components];
  if (!colorSpace) throw new Error(`JPEG no soportado: ${frame.components} componentes de color.`);
  const entries: Record<string, PDFValue> = {
    Type: name("XObject"), Subtype: name("Image"), Width: frame.width, Height: frame.height,
    ColorSpace: name(colorSpace), BitsPerComponent: 8, Filter: name("DCTDecode"),
  };
  // Photoshop guarda CMYK invertido y lo indica con el segmento Adobe.
  if (frame.components === 4 && adobe) entries.Decode = [1, 0, 1, 0, 1, 0, 1, 0];
  return new PDFImage(frame.width, frame.height, { entries, data: bytes }, undefined);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] as const;

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface PNGHeader {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colorType: number;
  readonly interlaced: boolean;
}

function parsePNG(bytes: Uint8Array): PDFImage {
  let header: PNGHeader | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const data: Uint8Array[] = [];
  let ended = false;
  for (let offset = 8; offset < bytes.length && !ended;) {
    if (offset + 12 > bytes.length) throw new Error("PNG dañado: bloque incompleto.");
    const length = u32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error(`PNG dañado: el bloque ${type} está incompleto.`);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== u32(bytes, offset + 8 + length)) {
      throw new Error(`PNG dañado: la suma de verificación del bloque ${type} no coincide.`);
    }
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      if (length !== 13) throw new Error("PNG dañado: cabecera inválida.");
      header = { width: u32(chunk, 0), height: u32(chunk, 4), depth: chunk[8]!, colorType: chunk[9]!, interlaced: chunk[12] === 1 };
      if (chunk[10] !== 0 || chunk[11] !== 0 || chunk[12]! > 1) throw new Error("PNG no soportado: método de compresión, filtro o entrelazado desconocido.");
      if (!DEPTHS[header.colorType]?.includes(header.depth)) {
        throw new Error(`PNG dañado: tipo de color ${header.colorType} con ${header.depth} bits no es válido.`);
      }
      checkSize(header.width, header.height);
    } else if (!header) throw new Error("PNG dañado: falta la cabecera IHDR.");
    else if (type === "PLTE") palette = chunk.slice();
    else if (type === "tRNS") transparency = chunk.slice();
    else if (type === "IDAT") data.push(chunk);
    else if (type === "IEND") ended = true;
    offset = end;
  }
  if (!header) throw new Error("PNG dañado: falta la cabecera IHDR.");
  if (!data.length) throw new Error("PNG dañado: no contiene datos de imagen.");
  if (header.colorType === 3 && (!palette || palette.length % 3 || palette.length > 768)) throw new Error("PNG dañado: paleta ausente o inválida.");
  const compressed = concat(data);
  const { width, height, depth, colorType } = header;
  const colors = CHANNELS[colorType]!;
  const colorSpace: PDFValue = colorType === 3
    ? [name("Indexed"), name("DeviceRGB"), palette!.length / 3 - 1, new PDFString(palette!)]
    : name(colorType === 0 || colorType === 4 ? "DeviceGray" : "DeviceRGB");
  const base = { Type: name("XObject"), Subtype: name("Image"), Width: width, Height: height, ColorSpace: colorSpace };

  // Sin transparencia ni entrelazado, PDF interpreta directamente los datos PNG comprimidos.
  if (!header.interlaced && colorType <= 3 && !transparency) {
    return new PDFImage(width, height, {
      entries: { ...base, BitsPerComponent: depth, Filter: name("FlateDecode"),
        DecodeParms: new PDFDictionary({ Predictor: 15, Colors: colors, BitsPerComponent: depth, Columns: width }) },
      data: compressed,
    }, undefined);
  }
  return decodedPNG(header, inflate(compressed), base, palette, transparency);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Deshace filtros y entrelazado; separa el canal alfa en una máscara SMask. */
function decodedPNG(header: PNGHeader, raw: Uint8Array, base: Record<string, PDFValue>,
  palette: Uint8Array | undefined, transparency: Uint8Array | undefined): PDFImage {
  const { width, height, depth, colorType } = header;
  const channels = CHANNELS[colorType]!;
  const sampleBytes = depth === 16 ? 2 : 1;
  const pixelBits = channels * depth;
  const filterBytes = Math.max(1, pixelBits >> 3);
  const samples = new Uint8Array(width * height * channels * sampleBytes);
  let position = 0;

  for (const [x0, y0, dx, dy] of header.interlaced ? ADAM7 : [[0, 0, 1, 1] as const]) {
    const passWidth = Math.ceil((width - x0) / dx);
    const passHeight = Math.ceil((height - y0) / dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const rowBytes = Math.ceil(passWidth * pixelBits / 8);
    let previous = new Uint8Array(rowBytes);
    for (let row = 0; row < passHeight; row++) {
      if (position + 1 + rowBytes > raw.length) throw new Error("PNG dañado: faltan datos de imagen.");
      const filter = raw[position]!;
      const current = raw.slice(position + 1, position + 1 + rowBytes);
      position += 1 + rowBytes;
      unfilter(filter, current, previous, filterBytes);
      const y = y0 + row * dy;
      for (let column = 0; column < passWidth; column++) {
        const target = (y * width + x0 + column * dx) * channels;
        for (let channel = 0; channel < channels; channel++) {
          const sample = column * channels + channel;
          if (depth === 16) {
            samples[(target + channel) * 2] = current[sample * 2]!;
            samples[(target + channel) * 2 + 1] = current[sample * 2 + 1]!;
          } else if (depth === 8) samples[target + channel] = current[sample]!;
          else {
            const bit = sample * depth;
            samples[target + channel] = (current[bit >> 3]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
          }
        }
      }
      previous = current;
    }
  }

  const pixels = width * height;
  const colorChannels = colorType === 4 || colorType === 6 ? channels - 1 : channels;
  const alphaDepth = colorType === 4 || colorType === 6 ? depth : 8;
  const alpha = new Uint8Array(pixels * (alphaDepth === 16 ? 2 : 1));
  const color = new Uint8Array(pixels * colorChannels * sampleBytes);
  const maximum = (1 << depth) - 1;
  const paletteSize = palette ? palette.length / 3 : 0;
  let opaque = true;

  for (let pixel = 0; pixel < pixels; pixel++) {
    const source = pixel * channels * sampleBytes;
    color.set(samples.subarray(source, source + colorChannels * sampleBytes), pixel * colorChannels * sampleBytes);
    if (colorType === 4 || colorType === 6) {
      const a = source + colorChannels * sampleBytes;
      if (alphaDepth === 16) { alpha[pixel * 2] = samples[a]!; alpha[pixel * 2 + 1] = samples[a + 1]!; }
      else alpha[pixel] = samples[a]!;
      if (samples[a] !== 255 || (alphaDepth === 16 && samples[a + 1] !== 255)) opaque = false;
      continue;
    }
    let visible = true;
    if (colorType === 3) {
      const index = samples[source]!;
      if (index >= paletteSize) throw new Error("PNG dañado: índice de color fuera de la paleta.");
      if (transparency && index < transparency.length) {
        alpha[pixel] = transparency[index]!;
        if (alpha[pixel] !== 255) opaque = false;
        continue;
      }
    } else if (transparency) {
      visible = false;
      for (let channel = 0; channel < colorChannels && !visible; channel++) {
        const value = depth === 16 ? u16(samples, source + channel * 2) : samples[source + channel]!;
        if (value !== u16(transparency, channel * 2)) visible = true;
      }
    }
    alpha[pixel] = visible ? 255 : 0;
    if (!visible) opaque = false;
  }

  // Gris de 1, 2 o 4 bits se expande a 8 bits; los índices de paleta se conservan.
  if (colorType === 0 && depth < 8) for (let i = 0; i < color.length; i++) color[i] = Math.round(color[i]! * 255 / maximum);
  const mask: ImageStream | undefined = opaque ? undefined : {
    entries: { Type: name("XObject"), Subtype: name("Image"), Width: width, Height: height,
      ColorSpace: name("DeviceGray"), BitsPerComponent: alphaDepth, Filter: name("FlateDecode") },
    data: deflate(alpha),
  };
  return new PDFImage(width, height, {
    entries: { ...base, BitsPerComponent: depth === 16 ? 16 : 8, Filter: name("FlateDecode") },
    data: deflate(color),
  }, mask);
}

function unfilter(filter: number, current: Uint8Array, previous: Uint8Array, bpp: number): void {
  const length = current.length;
  switch (filter) {
    case 0: return;
    case 1: for (let i = bpp; i < length; i++) current[i] = (current[i]! + current[i - bpp]!) & 255; return;
    case 2: for (let i = 0; i < length; i++) current[i] = (current[i]! + previous[i]!) & 255; return;
    case 3:
      for (let i = 0; i < length; i++) current[i] = (current[i]! + (((i >= bpp ? current[i - bpp]! : 0) + previous[i]!) >> 1)) & 255;
      return;
    case 4:
      for (let i = 0; i < length; i++) {
        const a = i >= bpp ? current[i - bpp]! : 0;
        const b = previous[i]!;
        const c = i >= bpp ? previous[i - bpp]! : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        current[i] = (current[i]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      return;
    default: throw new Error(`PNG dañado: filtro de fila ${filter} desconocido.`);
  }
}
