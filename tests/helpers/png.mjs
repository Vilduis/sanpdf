import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * Codificador PNG de prueba. sample(x, y) devuelve los valores de cada canal
 * (ya en la profundidad indicada). Usa filtros variados para ejercitar el decodificador.
 */
export function encodePNG({ width, height, colorType, depth = 8, sample, palette, transparency, interlace = false }) {
  const channels = CHANNELS[colorType];
  const passes = interlace ? ADAM7 : [[0, 0, 1, 1]];
  const rows = [];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rowBytes = Math.ceil(pw * channels * depth / 8);
    const bpp = Math.max(1, (channels * depth) >> 3);
    let previous = new Uint8Array(rowBytes);
    for (let r = 0; r < ph; r++) {
      const raw = new Uint8Array(rowBytes);
      for (let c = 0; c < pw; c++) {
        const values = sample(x0 + c * dx, y0 + r * dy);
        values.forEach((value, channel) => {
          const s = c * channels + channel;
          if (depth === 16) { raw[s * 2] = value >> 8; raw[s * 2 + 1] = value & 255; }
          else if (depth === 8) raw[s] = value;
          else { const bit = s * depth; raw[bit >> 3] |= value << (8 - depth - (bit & 7)); }
        });
      }
      const filter = r % 5;
      const out = new Uint8Array(rowBytes + 1);
      out[0] = filter;
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= bpp ? raw[i - bpp] : 0, b = previous[i], c = i >= bpp ? previous[i - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
        out[i + 1] = (raw[i] - predictor) & 255;
      }
      rows.push(out);
      previous = raw;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = depth; header[9] = colorType; header[12] = interlace ? 1 : 0;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header)];
  if (palette) parts.push(chunk("PLTE", Uint8Array.from(palette.flat())));
  if (transparency) parts.push(chunk("tRNS", Uint8Array.from(transparency)));
  const data = deflateSync(Buffer.concat(rows.map(row => Buffer.from(row))));
  // Varios IDAT para comprobar que se concatenan.
  const middle = data.length >> 1;
  parts.push(chunk("IDAT", data.subarray(0, middle)), chunk("IDAT", data.subarray(middle)), chunk("IEND", new Uint8Array(0)));
  return new Uint8Array(Buffer.concat(parts));
}
