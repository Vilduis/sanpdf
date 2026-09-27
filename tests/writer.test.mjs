import assert from "node:assert/strict";
import test from "node:test";
import { ByteWriter } from "../dist/utils/ByteWriter.js";
import { pdfNumber } from "../dist/utils/numbers.js";
import { PDFDictionary, PDFName, PDFStream, PDFString } from "../dist/core/PDFObject.js";
import { writeObject } from "../dist/writer/ObjectWriter.js";

test("streams binarios conservan todos los bytes y calculan Length sin Unicode", () => {
  const binary = Uint8Array.from({ length: 256 }, (_, index) => index);
  const writer = new ByteWriter();
  writeObject(writer, new PDFStream(binary));
  const result = writer.toBytes();
  const prefix = Buffer.from("<<\n/Length 256\n>>\nstream\n", "ascii");
  assert.deepEqual(result.slice(0, prefix.length), new Uint8Array(prefix));
  assert.deepEqual(result.slice(prefix.length, prefix.length + 256), binary);
  assert.equal(Buffer.from(result.slice(prefix.length + 256)).toString(), "\nendstream");
});

test("sintaxis: números sin exponente, nombres escapados y cadenas hexadecimales", () => {
  for (const [value, expected] of [[0, "0"], [-0, "0"], [10, "10"], [100, "100"],
    [0.25, "0.25"], [1e-6, "0.000001"], [-1e-8, "0"], [1e20, "100000000000000000000"]]) {
    assert.equal(pdfNumber(value), expected);
  }
  assert.throws(() => pdfNumber(Infinity), RangeError);
  assert.throws(() => pdfNumber(1e21), RangeError);
  const writer = new ByteWriter();
  writeObject(writer, new PDFDictionary({ "A/B#": [new PDFName("a/b"), true, null, new PDFString(new Uint8Array([0, 255]))] }));
  assert.equal(Buffer.from(writer.toBytes()).toString(), "<<\n/A#2FB#23 [/a#2Fb true null <00FF>]\n>>");
});
