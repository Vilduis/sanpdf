import { PDFReference } from "./PDFObject.js";
import type { PDFValue } from "./PDFObject.js";

export class ObjectRegistry {
  private readonly objects: (PDFValue | undefined)[] = [];

  reserve(): PDFReference {
    this.objects.push(undefined);
    return new PDFReference(this.objects.length);
  }

  add(value: PDFValue): PDFReference {
    const ref = this.reserve();
    this.set(ref, value);
    return ref;
  }

  set(ref: PDFReference, value: PDFValue): void {
    if (ref.id > this.objects.length) throw new Error("Referencia no registrada.");
    if (this.objects[ref.id - 1] !== undefined) throw new Error("Objeto PDF ya asignado.");
    this.objects[ref.id - 1] = value;
  }

  values(): readonly PDFValue[] {
    return this.objects.map((value, index) => {
      if (value === undefined) throw new Error(`Objeto PDF ${index + 1} sin resolver.`);
      return value;
    });
  }
}
