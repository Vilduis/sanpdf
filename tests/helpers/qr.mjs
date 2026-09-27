import jsQR from "jsqr";

/** Rasteriza una matriz QR (con zona de silencio) y la lee con un decodificador independiente. */
export function decodeMatrix({ size, modules }, scale = 4) {
  const border = 4;
  const side = (size + border * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!modules[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = (((y + border) * scale + dy) * side + (x + border) * scale + dx) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 0;
    }
  }
  return jsQR(data, side, side)?.data;
}
