import type { Block, Command, FlowItem, TableRow, TextItem } from "./types.js";

export function translate(commands: readonly Command[], x: number, y: number): Command[] {
  return commands.map(command => ({ ...command, x: command.x + x, y: command.y + y }));
}

/** Altura de un fragmento de texto con count líneas, incluido el padding. */
export function fragmentHeight(item: TextItem, count: number): number {
  const { layout, padding } = item;
  return padding.top + padding.bottom + (count ? layout.ascent + layout.descent + (count - 1) * layout.lineHeight : 0);
}

/** Líneas que caben en una altura dada (0 si ni una línea cabe). */
export function linesThatFit(item: TextItem, height: number): number {
  const room = height - fragmentHeight(item, 1);
  return room < -1e-8 ? 0 : Math.floor((room + 1e-8) / item.layout.lineHeight) + 1;
}

export function textFragment(item: TextItem, start = 0, count = item.layout.lines.length): Block {
  const { layout, padding, width } = item;
  const height = fragmentHeight(item, count);
  const commands: Command[] = [];
  if (height > 0 && (item.fill || item.border)) {
    commands.push({ kind: "rectangle", x: 0, y: 0, width, height, fill: item.fill, border: item.border });
  }
  if (start === 0 && item.bookmark !== undefined) commands.push({ kind: "bookmark", x: 0, y: 0, title: item.bookmark });
  for (const line of layout.lines.slice(start, start + count)) {
    const baseline = padding.top + line.baseline - start * layout.lineHeight;
    for (const segment of line.segments) {
      commands.push({
        kind: "text", x: padding.left + segment.x, y: baseline,
        text: segment.text, font: segment.font, size: layout.size, color: segment.color,
      });
      if (segment.link !== undefined) commands.push({
        kind: "link", x: padding.left + segment.x, y: baseline - layout.ascent,
        width: segment.width, height: layout.ascent + layout.descent, url: segment.link,
      });
    }
  }
  return { height, commands };
}

/** Parte de una fila de tabla: starts/counts indican qué líneas de cada celda se dibujan. */
export function rowFragment(row: TableRow, starts: readonly number[], counts: readonly number[]): Block {
  const height = Math.max(0, ...row.cells.map((cell, index) => fragmentHeight(cell.item, counts[index]!)));
  const commands: Command[] = [];
  row.cells.forEach((cell, index) => {
    if (height > 0) commands.push({ kind: "rectangle", x: cell.x, y: 0, width: cell.width, height, fill: row.fill, border: row.border });
    commands.push(...translate(textFragment(cell.item, starts[index]!, counts[index]!).commands, cell.x, 0));
  });
  return { height, commands };
}

export function fullRow(row: TableRow): Block {
  const tops = [0];
  for (const height of row.heights) tops.push(tops[tops.length - 1]! + height);
  const commands: Command[] = [];
  for (const cell of row.cells) {
    const y = tops[cell.row]!;
    const height = tops[cell.row + cell.rowSpan]! - y;
    if (height > 0) commands.push({ kind: "rectangle", x: cell.x, y, width: cell.width, height, fill: row.fill, border: row.border });
    commands.push(...translate(textFragment(cell.item).commands, cell.x, y));
  }
  return { height: tops[tops.length - 1]!, commands };
}

/** Mide un contenedor indivisible; nunca pagina dentro de una fila o cabecera. */
export function stack(items: readonly FlowItem[]): Block {
  let height = 0;
  const commands: Command[] = [];
  const append = (block: Block) => {
    commands.push(...translate(block.commands, 0, height));
    height += block.height;
  };
  for (const item of items) {
    if (item.kind === "table") {
      append(item.header);
      item.rows.forEach(row => append(fullRow(row)));
    } else append(item.kind === "text" ? textFragment(item) : item);
  }
  return { height, commands };
}
