export function toHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result.toUpperCase();
}

/** Cadenas de metadatos PDF: UTF-16BE con BOM, distintas del texto de página. */
export function utf16be(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set([0xfe, 0xff]);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Unicode inválido en los metadatos.");
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      const previous = text.charCodeAt(i - 1);
      if (!(previous >= 0xd800 && previous <= 0xdbff)) throw new Error("Unicode inválido en los metadatos.");
    }
    bytes[2 + i * 2] = code >>> 8;
    bytes[3 + i * 2] = code & 255;
  }
  return bytes;
}
