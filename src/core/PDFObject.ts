export class PDFName {
  constructor(readonly value: string) {
    if (!/^[\x21-\x7e]+$/.test(value)) throw new Error("El nombre PDF debe ser ASCII imprimible.");
  }
}

export class PDFReference {
  constructor(readonly id: number) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Referencia PDF inválida.");
  }
}

export class PDFString {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes.slice();
  }
}

export class PDFDictionary {
  readonly entries: ReadonlyMap<string, PDFValue>;
  constructor(entries: Record<string, PDFValue>) {
    this.entries = new Map(Object.entries(entries));
  }
}

export class PDFStream {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array, readonly dictionary = new PDFDictionary({})) {
    this.bytes = bytes.slice();
  }
}

export type PDFValue = null | boolean | number | PDFName | PDFReference | PDFString
  | PDFDictionary | PDFStream | readonly PDFValue[];
