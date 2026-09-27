/** Acumula bytes sin depender de Buffer, DOM ni APIs de Node.js. */
export class ByteWriter {
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;

  get length(): number {
    return this.byteLength;
  }

  write(bytes: Uint8Array): void {
    const copy = bytes.slice();
    this.chunks.push(copy);
    this.byteLength += copy.length;
  }

  writeAscii(text: string): void {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 127) throw new Error("Se esperaba sintaxis PDF ASCII.");
      bytes[i] = code;
    }
    this.write(bytes);
  }

  toBytes(): Uint8Array {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
