// Caracteres adicionales de Windows-1252 / WinAnsiEncoding.
const extra = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

/** Rechaza caracteres no representables en vez de sustituirlos silenciosamente. */
export function encodeWinAnsi(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
    } else {
      const byte = extra.get(code);
      if (byte === undefined) {
        throw new Error(`Carácter no compatible con WinAnsi: U+${code.toString(16).toUpperCase().padStart(4, "0")}. Se requiere una fuente Unicode incrustada.`);
      }
      bytes.push(byte);
    }
  }
  return new Uint8Array(bytes);
}
