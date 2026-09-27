import { PDFDictionary, PDFName, PDFReference, PDFStream, PDFString } from "../core/PDFObject.js";
import type { PDFValue } from "../core/PDFObject.js";
import { ByteWriter } from "../utils/ByteWriter.js";
import { toHex } from "../utils/encoding.js";
import { pdfNumber } from "../utils/numbers.js";

function name(value: string): string {
  const validated = new PDFName(value);
  return "/" + validated.value.replace(/[#%()/<>\[\]{}]/g,
    (char) => `#${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function writeObject(writer: ByteWriter, value: PDFValue): void {
  if (value === null) writer.writeAscii("null");
  else if (typeof value === "boolean") writer.writeAscii(String(value));
  else if (typeof value === "number") writer.writeAscii(pdfNumber(value));
  else if (value instanceof PDFName) writer.writeAscii(name(value.value));
  else if (value instanceof PDFReference) writer.writeAscii(`${value.id} 0 R`);
  else if (value instanceof PDFString) writer.writeAscii(`<${toHex(value.bytes)}>`);
  else if (value instanceof PDFStream) {
    const entries = Object.fromEntries(value.dictionary.entries);
    entries.Length = value.bytes.length;
    writeObject(writer, new PDFDictionary(entries));
    writer.writeAscii("\nstream\n");
    writer.write(value.bytes);
    writer.writeAscii("\nendstream");
  } else if (value instanceof PDFDictionary) {
    writer.writeAscii("<<");
    for (const [key, item] of value.entries) {
      writer.writeAscii(`\n${name(key)} `);
      writeObject(writer, item);
    }
    writer.writeAscii("\n>>");
  } else if (Array.isArray(value)) {
    writer.writeAscii("[");
    value.forEach((item: PDFValue, index: number) => {
      if (index > 0) writer.writeAscii(" ");
      writeObject(writer, item);
    });
    writer.writeAscii("]");
  } else {
    throw new TypeError("Tipo de objeto PDF desconocido.");
  }
}
