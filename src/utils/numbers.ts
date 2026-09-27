export function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} debe ser un número finito.`);
  }
  return value;
}

export function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} debe ser mayor que cero.`);
  return value;
}

// PDF no admite notación exponencial. Se conservan hasta seis decimales.
export function pdfNumber(value: number): string {
  finite(value, "El número PDF");
  if (Math.abs(value) >= 1e21) {
    throw new RangeError("El número excede el rango admitido por el escritor PDF.");
  }
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "").replace(/^-0$/, "0");
}
