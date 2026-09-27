// Codificador QR (ISO/IEC 18004) propio: modos numérico, alfanumérico y bytes UTF-8,
// versiones 1–40, cuatro niveles de corrección y selección automática de máscara.

/** L ≈ 7 %, M ≈ 15 %, Q ≈ 25 %, H ≈ 30 % de datos recuperables. */
export type QRErrorCorrection = "L" | "M" | "Q" | "H";

export interface QRMatrix {
  readonly size: number;
  readonly version: number;
  /** true = módulo oscuro; indexado como modules[fila][columna]. */
  readonly modules: readonly (readonly boolean[])[];
}

const LEVELS: Record<QRErrorCorrection, { ordinal: number; format: number }> = {
  L: { ordinal: 0, format: 1 }, M: { ordinal: 1, format: 0 }, Q: { ordinal: 2, format: 3 }, H: { ordinal: 3, format: 2 },
};

const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const ECC_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

interface Mode { readonly indicator: number; readonly countBits: readonly [number, number, number]; }
const NUMERIC: Mode = { indicator: 1, countBits: [10, 12, 14] };
const ALPHA: Mode = { indicator: 2, countBits: [9, 11, 13] };
const BYTE: Mode = { indicator: 4, countBits: [8, 16, 16] };

function rawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number, level: number): number {
  return Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[level]![version]! * ECC_BLOCKS[level]![version]!;
}

class Bits {
  readonly values: number[] = [];
  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.values.push((value >>> i) & 1);
  }
}

interface Segment { readonly mode: Mode; readonly count: number; readonly data: Bits; }

function segment(text: string): Segment {
  const data = new Bits();
  if (/^\d*$/.test(text)) {
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3);
      data.push(Number(group), group.length * 3 + 1);
    }
    return { mode: NUMERIC, count: text.length, data };
  }
  if ([...text].every(char => ALPHANUMERIC.includes(char))) {
    for (let i = 0; i < text.length; i += 2) {
      const first = ALPHANUMERIC.indexOf(text[i]!);
      if (i + 1 < text.length) data.push(first * 45 + ALPHANUMERIC.indexOf(text[i + 1]!), 11);
      else data.push(first, 6);
    }
    return { mode: ALPHA, count: text.length, data };
  }
  const bytes = utf8(text);
  for (const byte of bytes) data.push(byte, 8);
  return { mode: BYTE, count: bytes.length, data };
}

function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) throw new Error("Unicode inválido en el contenido del código QR.");
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 63);
    else if (code < 0x10000) bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 63, 0x80 | code & 63);
    else bytes.push(0xf0 | code >> 18, 0x80 | code >> 12 & 63, 0x80 | code >> 6 & 63, 0x80 | code & 63);
  }
  return bytes;
}

// Reed-Solomon sobre GF(2^8) con el polinomio 0x11D.
function multiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = multiply(root, 2);
  }
  return result;
}

function remainder(data: readonly number[], generator: readonly number[]): number[] {
  const result = new Array<number>(generator.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    generator.forEach((coefficient, index) => { result[index] = result[index]! ^ multiply(coefficient, factor); });
  }
  return result;
}

function interleave(data: readonly number[], version: number, level: number): number[] {
  const blocks = ECC_BLOCKS[level]![version]!;
  const eccLength = ECC_PER_BLOCK[level]![version]!;
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = blocks - raw % blocks;
  const shortLength = Math.floor(raw / blocks);
  const generator = divisor(eccLength);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const ecc = remainder(block, generator);
    if (i < shortBlocks) block.push(0);
    all.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < all[0]!.length; i++) {
    all.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]!);
    });
  }
  return result;
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let position = version * 4 + 10; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  readonly reserved: boolean[][];
  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  set(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.reserved[y]![x] = true;
  }
}

function drawFunctionPatterns(grid: Grid): void {
  const { size, version } = grid;
  for (let i = 0; i < size; i++) { grid.set(6, i, i % 2 === 0); grid.set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) grid.set(x, y, distance !== 2 && distance !== 4);
    }
  }
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((x, i) => positions.forEach((y, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      grid.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }));
  drawFormat(grid, 0, 0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + i % 3;
      const b = Math.floor(i / 3);
      grid.set(a, b, dark);
      grid.set(b, a, dark);
    }
  }
}

function drawFormat(grid: Grid, levelFormat: number, mask: number): void {
  const data = (levelFormat << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const size = grid.size;
  for (let i = 0; i <= 5; i++) grid.set(8, i, bit(i));
  grid.set(8, 7, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) grid.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) grid.set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) grid.set(8, size - 15 + i, bit(i));
  grid.set(8, size - 8, true);
}

function drawCodewords(grid: Grid, codewords: readonly number[]): void {
  const size = grid.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
        if (!grid.reserved[y]![x] && i < codewords.length * 8) {
          grid.modules[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
];

function applyMask(grid: Grid, mask: number): void {
  const test = MASKS[mask]!;
  for (let y = 0; y < grid.size; y++) for (let x = 0; x < grid.size; x++) {
    if (!grid.reserved[y]![x] && test(x, y)) grid.modules[y]![x] = !grid.modules[y]![x];
  }
}

/** Penalizaciones de la norma: rachas, bloques 2×2, patrones de localizador y balance. */
function penalty(grid: Grid): number {
  const { size, modules } = grid;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) { run++; continue; }
      if (run >= 5) score += run - 2;
      run = 1;
    }
    const pattern = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= size; i++) {
      if (!pattern.every((dark, k) => get(i + k) === dark)) continue;
      const lightBefore = [1, 2, 3, 4].every(k => i - k < 0 || !get(i - k));
      const lightAfter = [0, 1, 2, 3].every(k => i + 7 + k >= size || !get(i + 7 + k));
      if (lightBefore || lightAfter) score += 40;
    }
  };
  for (let y = 0; y < size; y++) line(x => modules[y]![x]!);
  for (let x = 0; x < size; x++) line(y => modules[y]![x]!);
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (modules[y]![x]) dark++;
    if (x + 1 < size && y + 1 < size) {
      const value = modules[y]![x];
      if (modules[y]![x + 1] === value && modules[y + 1]![x] === value && modules[y + 1]![x + 1] === value) score += 3;
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Codifica texto en la versión más pequeña posible para el nivel de corrección indicado. */
export function encodeQR(text: string, errorCorrection: QRErrorCorrection = "M"): QRMatrix {
  if (typeof text !== "string" || text.length === 0) throw new Error("El contenido del código QR no puede estar vacío.");
  const settings = LEVELS[errorCorrection];
  if (!settings) throw new Error(`Nivel de corrección QR inválido: ${String(errorCorrection)}. Usa L, M, Q o H.`);
  const level = settings.ordinal;
  const content = segment(text.normalize("NFC"));
  let version = 1;
  let capacity = 0;
  let used = 0;
  for (; version <= 40; version++) {
    const countBits = content.mode.countBits[version < 10 ? 0 : version < 27 ? 1 : 2];
    capacity = dataCodewords(version, level) * 8;
    used = 4 + countBits + content.data.values.length;
    if (content.count < 2 ** countBits && used <= capacity) break;
  }
  if (version > 40) {
    throw new RangeError(`El contenido es demasiado largo para un código QR con corrección ${errorCorrection}. Reduce el texto o usa el nivel L.`);
  }
  const bits = new Bits();
  bits.push(content.mode.indicator, 4);
  bits.push(content.count, content.mode.countBits[version < 10 ? 0 : version < 27 ? 1 : 2]);
  bits.values.push(...content.data.values);
  bits.push(0, Math.min(4, capacity - bits.values.length));
  bits.push(0, (8 - bits.values.length % 8) % 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.values.length; i += 8) {
    codewords.push(bits.values.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  for (let pad = 0xec; codewords.length < capacity / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);

  const grid = new Grid(version);
  drawFunctionPatterns(grid);
  drawCodewords(grid, interleave(codewords, version, level));
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(grid, mask);
    drawFormat(grid, settings.format, mask);
    const score = penalty(grid);
    if (score < bestScore) { best = mask; bestScore = score; }
    applyMask(grid, mask);
  }
  applyMask(grid, best);
  drawFormat(grid, settings.format, best);
  return { size: grid.size, version, modules: grid.modules };
}
