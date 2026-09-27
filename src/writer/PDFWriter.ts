import { PDFDictionary } from "../core/PDFObject.js";
import type { PDFReference } from "../core/PDFObject.js";
import type { ObjectRegistry } from "../core/ObjectRegistry.js";
import { ByteWriter } from "../utils/ByteWriter.js";
import { writeObject } from "./ObjectWriter.js";

export function writePDF(registry: ObjectRegistry, root: PDFReference, info: PDFReference): Uint8Array {
  const writer = new ByteWriter();
  writer.writeAscii("%PDF-1.7\n%");
  writer.write(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 10]));
  const offsets: number[] = [0];
  const objects = registry.values();
  objects.forEach((object, index) => {
    offsets.push(writer.length);
    writer.writeAscii(`${index + 1} 0 obj\n`);
    writeObject(writer, object);
    writer.writeAscii("\nendobj\n");
  });
  const xrefOffset = writer.length;
  writer.writeAscii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) {
    if (offset > 9_999_999_999) throw new RangeError("Archivo demasiado grande para xref clásico.");
    writer.writeAscii(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  writer.writeAscii("trailer\n");
  writeObject(writer, new PDFDictionary({ Size: objects.length + 1, Root: root, Info: info }));
  writer.writeAscii(`\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return writer.toBytes();
}
