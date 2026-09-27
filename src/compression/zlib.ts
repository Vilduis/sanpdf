// Implementación propia de zlib/deflate (RFC 1950 y 1951), síncrona y sin dependencias.
// Se usa para FlateDecode en streams PDF y para leer los datos IDAT de las imágenes PNG.

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const fixedLiteralLengths = Uint8Array.from({ length: 288 }, (_, symbol) =>
  symbol < 144 ? 8 : symbol < 256 ? 9 : symbol < 280 ? 7 : 8);
const fixedDistanceLengths = new Uint8Array(30).fill(5);

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length;) {
    // 5552 es el máximo de sumas antes de que b pueda desbordar 2^32.
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) { a += bytes[i]!; b += a; }
    a %= 65521;
    b %= 65521;
  }
  return (b * 65536 + a) >>> 0;
}

interface Huffman { readonly counts: Uint16Array; readonly symbols: Uint16Array; }

function huffman(lengths: Uint8Array): Huffman {
  const counts = new Uint16Array(16);
  for (const length of lengths) counts[length]!++;
  const offsets = new Uint16Array(16);
  for (let length = 1; length < 15; length++) offsets[length + 1] = offsets[length]! + counts[length]!;
  const symbols = new Uint16Array(lengths.length);
  lengths.forEach((length, symbol) => { if (length) symbols[offsets[length]!++] = symbol; });
  return { counts, symbols };
}

class BitReader {
  private position = 0;
  private buffer = 0;
  private available = 0;
  constructor(private readonly bytes: Uint8Array, start: number, private readonly end: number) {
    this.position = start;
  }

  bits(count: number): number {
    while (this.available < count) {
      if (this.position >= this.end) throw new Error("Datos comprimidos incompletos.");
      this.buffer |= this.bytes[this.position++]! << this.available;
      this.available += 8;
    }
    const value = this.buffer & ((1 << count) - 1);
    this.buffer >>>= count;
    this.available -= count;
    return value;
  }

  decode(table: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length < 16; length++) {
      code |= this.bits(1);
      const count = table.counts[length]!;
      if (code - count < first) return table.symbols[index + code - first]!;
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("Código Huffman inválido en los datos comprimidos.");
  }

  alignedOffset(): number {
    // Los bits sobrantes del último byte leído se descartan.
    this.buffer = 0;
    this.available = 0;
    return this.position;
  }

  skipTo(offset: number): void { this.position = offset; }
}

class Output {
  private data: Uint8Array;
  length = 0;
  constructor(size: number) { this.data = new Uint8Array(Math.max(1024, size)); }
  private reserve(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    const next = new Uint8Array(Math.max(this.data.length * 2, this.length + extra));
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  push(byte: number): void { this.reserve(1); this.data[this.length++] = byte; }
  append(bytes: Uint8Array): void { this.reserve(bytes.length); this.data.set(bytes, this.length); this.length += bytes.length; }
  copy(distance: number, length: number): void {
    if (distance > this.length) throw new Error("Distancia inválida en los datos comprimidos.");
    this.reserve(length);
    for (let i = 0; i < length; i++, this.length++) this.data[this.length] = this.data[this.length - distance]!;
  }
  toBytes(): Uint8Array { return this.data.slice(0, this.length); }
}

function inflateBlock(reader: BitReader, output: Output, literals: Huffman, distances: Huffman): void {
  for (;;) {
    const symbol = reader.decode(literals);
    if (symbol < 256) { output.push(symbol); continue; }
    if (symbol === 256) return;
    const lengthIndex = symbol - 257;
    if (lengthIndex >= 29) throw new Error("Longitud inválida en los datos comprimidos.");
    const length = LENGTH_BASE[lengthIndex]! + reader.bits(LENGTH_EXTRA[lengthIndex]!);
    const distanceIndex = reader.decode(distances);
    if (distanceIndex >= 30) throw new Error("Distancia inválida en los datos comprimidos.");
    output.copy(DIST_BASE[distanceIndex]! + reader.bits(DIST_EXTRA[distanceIndex]!), length);
  }
}

function dynamicTables(reader: BitReader): [Huffman, Huffman] {
  const literalCount = reader.bits(5) + 257;
  const distanceCount = reader.bits(5) + 1;
  const codeLengthCount = reader.bits(4) + 4;
  if (literalCount > 286 || distanceCount > 30) throw new Error("Cabecera de bloque comprimido inválida.");
  const codeLengths = new Uint8Array(19);
  for (let i = 0; i < codeLengthCount; i++) codeLengths[CODE_LENGTH_ORDER[i]!] = reader.bits(3);
  const codeLengthTable = huffman(codeLengths);
  const lengths = new Uint8Array(literalCount + distanceCount);
  for (let i = 0; i < lengths.length;) {
    const symbol = reader.decode(codeLengthTable);
    if (symbol < 16) { lengths[i++] = symbol; continue; }
    let repeat: number;
    let value = 0;
    if (symbol === 16) {
      if (i === 0) throw new Error("Repetición sin longitud previa en los datos comprimidos.");
      value = lengths[i - 1]!;
      repeat = 3 + reader.bits(2);
    } else repeat = symbol === 17 ? 3 + reader.bits(3) : 11 + reader.bits(7);
    if (i + repeat > lengths.length) throw new Error("Longitudes de código excedidas en los datos comprimidos.");
    lengths.fill(value, i, i + repeat);
    i += repeat;
  }
  if (!lengths[256]) throw new Error("Falta el código de fin de bloque en los datos comprimidos.");
  return [huffman(lengths.subarray(0, literalCount)), huffman(lengths.subarray(literalCount))];
}

/** Descomprime un stream zlib completo y verifica su suma Adler-32. */
export function inflate(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 6) throw new Error("Datos zlib incompletos.");
  const cmf = bytes[0]!;
  const flags = bytes[1]!;
  if ((cmf & 15) !== 8 || (cmf >> 4) > 7 || (cmf * 256 + flags) % 31 !== 0) throw new Error("Cabecera zlib inválida.");
  if (flags & 32) throw new Error("Los diccionarios zlib predefinidos no están soportados.");
  const reader = new BitReader(bytes, 2, bytes.length);
  const output = new Output(bytes.length * 4);
  const fixed: [Huffman, Huffman] = [huffman(fixedLiteralLengths), huffman(fixedDistanceLengths)];
  let last = 0;
  while (!last) {
    last = reader.bits(1);
    const type = reader.bits(2);
    if (type === 0) {
      const offset = reader.alignedOffset();
      if (offset + 4 > bytes.length) throw new Error("Datos comprimidos incompletos.");
      const length = bytes[offset]! | bytes[offset + 1]! << 8;
      if ((length ^ 0xffff) !== (bytes[offset + 2]! | bytes[offset + 3]! << 8)) throw new Error("Bloque sin compresión dañado.");
      if (offset + 4 + length > bytes.length) throw new Error("Datos comprimidos incompletos.");
      output.append(bytes.subarray(offset + 4, offset + 4 + length));
      reader.skipTo(offset + 4 + length);
    } else if (type === 1) inflateBlock(reader, output, ...fixed);
    else if (type === 2) inflateBlock(reader, output, ...dynamicTables(reader));
    else throw new Error("Tipo de bloque comprimido inválido.");
  }
  const end = reader.alignedOffset();
  if (end + 4 > bytes.length) throw new Error("Falta la suma de verificación zlib.");
  const result = output.toBytes();
  const expected = ((bytes[end]! << 24) | (bytes[end + 1]! << 16) | (bytes[end + 2]! << 8) | bytes[end + 3]!) >>> 0;
  if (adler32(result) !== expected) throw new Error("Suma de verificación zlib incorrecta.");
  return result;
}

class BitWriter {
  private readonly output = new Output(4096);
  private buffer = 0;
  private count = 0;
  bits(value: number, count: number): void {
    this.buffer |= value << this.count;
    this.count += count;
    while (this.count >= 8) {
      this.output.push(this.buffer & 255);
      this.buffer >>>= 8;
      this.count -= 8;
    }
  }
  align(): void { if (this.count) this.bits(0, 8 - this.count); }
  bytes(bytes: Uint8Array): void { this.align(); this.output.append(bytes); }
  toBytes(): Uint8Array { this.align(); return this.output.toBytes(); }
}

/** Longitudes Huffman limitadas: si el árbol excede el límite, suaviza frecuencias y repite. */
function codeLengths(frequencies: ArrayLike<number>, limit: number): Uint8Array {
  const freq = Array.from(frequencies);
  // Deflate exige al menos un bit por código; dos símbolos evitan árboles degenerados.
  let used = freq.filter(Boolean).length;
  for (let symbol = 0; used < 2; symbol++) if (!freq[symbol]) { freq[symbol] = 1; used++; }
  for (;;) {
    const lengths = new Uint8Array(freq.length);
    const nodes: { weight: number; symbols: number[] }[] = [];
    freq.forEach((weight, symbol) => { if (weight) nodes.push({ weight, symbols: [symbol] }); });
    // Orden estable: la salida es determinista para la misma entrada.
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight || a.symbols[0]! - b.symbols[0]!);
      const a = nodes.shift()!;
      const b = nodes.shift()!;
      for (const symbol of a.symbols) lengths[symbol]!++;
      for (const symbol of b.symbols) lengths[symbol]!++;
      nodes.push({ weight: a.weight + b.weight, symbols: a.symbols.concat(b.symbols) });
    }
    if (Math.max(...lengths) <= limit) return lengths;
    for (let i = 0; i < freq.length; i++) if (freq[i]) freq[i] = (freq[i]! + 1) >> 1;
  }
}

/** Códigos canónicos invertidos, listos para escribirse del bit menos significativo al más. */
function canonicalCodes(lengths: Uint8Array): Uint16Array {
  const counts = new Uint16Array(16);
  for (const length of lengths) if (length) counts[length]!++;
  const next = new Uint16Array(16);
  for (let length = 1, code = 0; length < 16; length++) {
    next[length] = code;
    code = (code + counts[length]!) << 1;
  }
  const codes = new Uint16Array(lengths.length);
  lengths.forEach((length, symbol) => {
    if (!length) return;
    let value = next[length]!++;
    let reversed = 0;
    for (let i = 0; i < length; i++) { reversed = (reversed << 1) | (value & 1); value >>= 1; }
    codes[symbol] = reversed;
  });
  return codes;
}

const lengthSymbol = new Uint16Array(259);
for (let index = 0; index < 29; index++) {
  for (let length = LENGTH_BASE[index]!; length < LENGTH_BASE[index]! + (1 << LENGTH_EXTRA[index]!) && length < 259; length++) {
    lengthSymbol[length] = index;
  }
}
lengthSymbol[258] = 28;

function distanceSymbol(distance: number): number {
  let low = 0;
  let high = 29;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (DIST_BASE[middle]! <= distance) low = middle; else high = middle - 1;
  }
  return low;
}

interface Block {
  /** Literales (0–255) o longitudes (256 + longitud); distancias en paralelo. */
  readonly values: Int32Array;
  readonly distances: Int32Array;
  readonly count: number;
  readonly start: number;
  readonly end: number;
}

const WINDOW = 32768;
const MAX_CHAIN = 128;
const BLOCK_SYMBOLS = 32768;

function* lz77(input: Uint8Array): Generator<Block> {
  const head = new Int32Array(1 << 15).fill(-1);
  const previous = new Int32Array(WINDOW);
  const hash = (i: number) => ((input[i]! << 10) ^ (input[i + 1]! << 5) ^ input[i + 2]!) & 0x7fff;
  const insert = (i: number) => {
    if (i + 2 >= input.length) return;
    const h = hash(i);
    previous[i & (WINDOW - 1)] = head[h]!;
    head[h] = i;
  };
  let values = new Int32Array(BLOCK_SYMBOLS);
  let distances = new Int32Array(BLOCK_SYMBOLS);
  let count = 0;
  let start = 0;
  let position = 0;
  while (position < input.length) {
    let bestLength = 0;
    let bestDistance = 0;
    if (position + 2 < input.length) {
      const maximum = Math.min(258, input.length - position);
      let candidate = head[hash(position)]!;
      for (let chain = MAX_CHAIN; candidate >= 0 && position - candidate <= WINDOW && chain > 0; chain--) {
        if (input[candidate + bestLength] === input[position + bestLength]) {
          let length = 0;
          while (length < maximum && input[candidate + length] === input[position + length]) length++;
          if (length > bestLength) {
            bestLength = length;
            bestDistance = position - candidate;
            if (length === maximum) break;
          }
        }
        const next = previous[candidate & (WINDOW - 1)]!;
        if (next >= candidate) break;
        candidate = next;
      }
    }
    if (bestLength >= 3) {
      values[count] = 256 + bestLength;
      distances[count++] = bestDistance;
      for (let i = 0; i < bestLength; i++) insert(position + i);
      position += bestLength;
    } else {
      values[count] = input[position]!;
      distances[count++] = 0;
      insert(position++);
    }
    if (count === BLOCK_SYMBOLS) {
      yield { values, distances, count, start, end: position };
      values = new Int32Array(BLOCK_SYMBOLS);
      distances = new Int32Array(BLOCK_SYMBOLS);
      count = 0;
      start = position;
    }
  }
  yield { values, distances, count, start, end: position };
}

function writeSymbols(writer: BitWriter, block: Block, literalLengths: Uint8Array, distanceLengths: Uint8Array): void {
  const literalCodes = canonicalCodes(literalLengths);
  const distanceCodes = canonicalCodes(distanceLengths);
  for (let i = 0; i < block.count; i++) {
    const value = block.values[i]!;
    if (value < 256) { writer.bits(literalCodes[value]!, literalLengths[value]!); continue; }
    const length = value - 256;
    const index = lengthSymbol[length]!;
    writer.bits(literalCodes[257 + index]!, literalLengths[257 + index]!);
    if (LENGTH_EXTRA[index]) writer.bits(length - LENGTH_BASE[index]!, LENGTH_EXTRA[index]!);
    const distance = block.distances[i]!;
    const symbol = distanceSymbol(distance);
    writer.bits(distanceCodes[symbol]!, distanceLengths[symbol]!);
    if (DIST_EXTRA[symbol]) writer.bits(distance - DIST_BASE[symbol]!, DIST_EXTRA[symbol]!);
  }
  writer.bits(literalCodes[256]!, literalLengths[256]!);
}

/** Codificación RLE de las longitudes con los símbolos 16, 17 y 18. */
function runLengths(lengths: Uint8Array): { symbol: number; extra: number; bits: number }[] {
  const result: { symbol: number; extra: number; bits: number }[] = [];
  for (let i = 0; i < lengths.length;) {
    const value = lengths[i]!;
    let run = 1;
    while (i + run < lengths.length && lengths[i + run] === value) run++;
    i += run;
    if (value === 0) {
      while (run >= 11) { const n = Math.min(run, 138); result.push({ symbol: 18, extra: n - 11, bits: 7 }); run -= n; }
      if (run >= 3) { result.push({ symbol: 17, extra: run - 3, bits: 3 }); run = 0; }
    } else {
      result.push({ symbol: value, extra: 0, bits: 0 });
      run--;
      while (run >= 3) { const n = Math.min(run, 6); result.push({ symbol: 16, extra: n - 3, bits: 2 }); run -= n; }
    }
    for (; run > 0; run--) result.push({ symbol: value, extra: 0, bits: 0 });
  }
  return result;
}

function symbolCost(block: Block, literalLengths: Uint8Array, distanceLengths: Uint8Array): number {
  let bits = literalLengths[256]!;
  for (let i = 0; i < block.count; i++) {
    const value = block.values[i]!;
    if (value < 256) { bits += literalLengths[value]!; continue; }
    const index = lengthSymbol[value - 256]!;
    const symbol = distanceSymbol(block.distances[i]!);
    bits += literalLengths[257 + index]! + LENGTH_EXTRA[index]! + distanceLengths[symbol]! + DIST_EXTRA[symbol]!;
  }
  return bits;
}

function writeBlock(writer: BitWriter, input: Uint8Array, block: Block, last: boolean): void {
  const literalFrequency = new Uint32Array(286);
  const distanceFrequency = new Uint32Array(30);
  literalFrequency[256] = 1;
  for (let i = 0; i < block.count; i++) {
    const value = block.values[i]!;
    if (value < 256) literalFrequency[value]!++;
    else {
      literalFrequency[257 + lengthSymbol[value - 256]!]!++;
      distanceFrequency[distanceSymbol(block.distances[i]!)]!++;
    }
  }
  const literalLengths = codeLengths(literalFrequency, 15);
  const distanceLengths = codeLengths(distanceFrequency, 15);
  let literalCount = 286;
  while (literalCount > 257 && !literalLengths[literalCount - 1]) literalCount--;
  let distanceCount = 30;
  while (distanceCount > 1 && !distanceLengths[distanceCount - 1]) distanceCount--;
  const combined = new Uint8Array(literalCount + distanceCount);
  combined.set(literalLengths.subarray(0, literalCount));
  combined.set(distanceLengths.subarray(0, distanceCount), literalCount);
  const runs = runLengths(combined);
  const runFrequency = new Uint32Array(19);
  for (const run of runs) runFrequency[run.symbol]!++;
  const runLengthsTable = codeLengths(runFrequency, 7);
  let codeLengthCount = 19;
  while (codeLengthCount > 4 && !runLengthsTable[CODE_LENGTH_ORDER[codeLengthCount - 1]!]) codeLengthCount--;

  let headerBits = 14 + codeLengthCount * 3;
  for (const run of runs) headerBits += runLengthsTable[run.symbol]! + run.bits;
  const dynamicBits = 3 + headerBits + symbolCost(block, literalLengths, distanceLengths);
  const fixedBits = 3 + symbolCost(block, fixedLiteralLengths, fixedDistanceLengths);
  const raw = block.end - block.start;
  const storedBits = (Math.ceil(raw / 65535) || 1) * 40 + raw * 8;

  if (storedBits <= dynamicBits && storedBits <= fixedBits) {
    let offset = block.start;
    do {
      const size = Math.min(65535, block.end - offset);
      const final = last && offset + size === block.end;
      writer.bits(final ? 1 : 0, 1);
      writer.bits(0, 2);
      writer.bytes(new Uint8Array([size & 255, size >> 8, ~size & 255, (~size >> 8) & 255]));
      writer.bytes(input.subarray(offset, offset + size));
      offset += size;
    } while (offset < block.end);
  } else if (fixedBits <= dynamicBits) {
    writer.bits(last ? 1 : 0, 1);
    writer.bits(1, 2);
    writeSymbols(writer, block, fixedLiteralLengths, fixedDistanceLengths);
  } else {
    writer.bits(last ? 1 : 0, 1);
    writer.bits(2, 2);
    writer.bits(literalCount - 257, 5);
    writer.bits(distanceCount - 1, 5);
    writer.bits(codeLengthCount - 4, 4);
    for (let i = 0; i < codeLengthCount; i++) writer.bits(runLengthsTable[CODE_LENGTH_ORDER[i]!]!, 3);
    const runCodes = canonicalCodes(runLengthsTable);
    for (const run of runs) {
      writer.bits(runCodes[run.symbol]!, runLengthsTable[run.symbol]!);
      if (run.bits) writer.bits(run.extra, run.bits);
    }
    writeSymbols(writer, block, literalLengths.subarray(0, literalCount), distanceLengths.subarray(0, distanceCount));
  }
}

/** Comprime en formato zlib (el que espera FlateDecode). Salida determinista. */
export function deflate(input: Uint8Array): Uint8Array {
  const writer = new BitWriter();
  writer.bits(0x78, 8);
  writer.bits(0x9c, 8);
  const blocks = lz77(input);
  let current = blocks.next();
  while (!current.done) {
    const next = blocks.next();
    writeBlock(writer, input, current.value, !!next.done);
    current = next;
  }
  const checksum = adler32(input);
  writer.bytes(new Uint8Array([checksum >>> 24, (checksum >>> 16) & 255, (checksum >>> 8) & 255, checksum & 255]));
  return writer.toBytes();
}
