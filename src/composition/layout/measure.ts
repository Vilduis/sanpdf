import { encodeQR } from "../../barcodes/QRCode.js";
import { resolveColor } from "../../content/Color.js";
import { normalizeURL } from "../../core/PDFPage.js";
import { layoutRuns } from "../../layout/RichText.js";
import type { TextRun } from "../../layout/RichText.js";
import { resolveInsets } from "../../layout/TextBox.js";
import type { TextAlignment } from "../../layout/TextLayout.js";
import { positive } from "../../utils/numbers.js";
import { toSpans } from "../model.js";
import type { CellValue, Node, TableNode, TextNode, TextStyle } from "../model.js";
import { fullRow, stack, textFragment, translate } from "./blocks.js";
import { columnWidths, nonNegative, styleFont, textColor, textOptions } from "./style.js";
import { LayoutError } from "./types.js";
import type { Command, FlowItem, TableRow, TextItem } from "./types.js";

const spanStyleKeys = new Set(["font", "bold", "italic", "color"]);

export function measure(node: Node, width: number, inherited: TextStyle, path: string, inSection = false): FlowItem[] {
  try {
    const style = "style" in node ? { ...inherited, ...node.style } : inherited;
    switch (node.kind) {
      case "text": {
        if (node.bookmark !== undefined && inSection) throw new Error("bookmark() no se admite en el encabezado o pie: se repetiría en cada página.");
        if (!node.pageNumber) return [measureText(node, width, style, path)];
        if (!inSection) throw new Error("pageNumber() solo se admite en el encabezado o pie de página.");
        // Se mide con seis dígitos por número; el texto real se escribe al conocer el total.
        const format = node.spans.map(span => span.text).join("");
        const sample = format.replaceAll("{page}", "888888").replaceAll("{pages}", "888888");
        const item = measureText({ ...node, spans: [{ text: sample }] }, width, style, path);
        if (item.layout.lines.length !== 1) throw new Error("La numeración debe caber en una línea, reservando hasta seis dígitos.");
        const block = textFragment(item);
        return [{ kind: "atomic", path, height: block.height, commands: [
          ...block.commands.filter(command => command.kind === "rectangle"),
          { kind: "number", x: item.padding.left, y: item.padding.top,
            width: width - item.padding.left - item.padding.right, height: item.layout.height, format, style },
        ] }];
      }
      case "column": {
        nonNegative(node.gap, "El espacio entre elementos");
        return node.children.flatMap((child, index) => [
          ...(index ? [{ kind: "atomic" as const, path, height: node.gap, commands: [] }] : []),
          ...measure(child, width, style, `${path}.column[${index + 1}]`, inSection),
        ]);
      }
      case "row": {
        const widths = columnWidths(node.children.map(child => child.width), width, node.gap);
        const commands: Command[] = [];
        let x = 0;
        let height = 0;
        node.children.forEach((child, index) => {
          const block = stack(measure(child.node, widths[index]!, style, `${path}.row[${index + 1}]`, inSection));
          commands.push(...translate(block.commands, x, 0));
          height = Math.max(height, block.height);
          x += widths[index]! + node.gap;
        });
        return [{ kind: "atomic", path, height, commands }];
      }
      case "table": {
        const widths = columnWidths(node.columns, width);
        const border = resolveColor(node.border);
        const headerFill = resolveColor(node.headerBackground);
        const header = node.header
          ? fullRow(measureTableRow(node.header, node, widths, { ...style, ...node.headerStyle }, `${path}.header`, headerFill, border))
          : { height: 0, commands: [] };
        const rows = node.rows.map((cells, index) =>
          measureTableRow(cells, node, widths, style, `${path}.row[${index + 1}]`, undefined, border));
        return [{ kind: "table", path, header, rows }];
      }
      case "image": {
        const ratio = node.image.width / node.image.height;
        let w: number;
        let h: number;
        if (node.width !== undefined && node.height !== undefined) {
          const boxWidth = positive(node.width, "El ancho de la imagen");
          const boxHeight = positive(node.height, "El alto de la imagen");
          w = Math.min(boxWidth, boxHeight * ratio);
          h = w / ratio;
        } else if (node.width !== undefined) {
          w = positive(node.width, "El ancho de la imagen");
          h = w / ratio;
        } else if (node.height !== undefined) {
          h = positive(node.height, "El alto de la imagen");
          w = h * ratio;
        } else {
          // Sin tamaño: 1 píxel = 1 punto, reducido al ancho disponible.
          w = Math.min(node.image.width, width);
          h = w / ratio;
        }
        if (w > width + 1e-8) throw new RangeError(`La imagen necesita ${w.toFixed(2)} pt de ancho; hay ${width.toFixed(2)} pt disponibles.`);
        return [{ kind: "atomic", path, height: h, commands: [
          { kind: "image", x: alignOffset(node.align, width, w), y: 0, width: w, height: h, image: node.image },
        ] }];
      }
      case "qr": {
        const size = positive(node.size, "El tamaño del código QR");
        if (size > width + 1e-8) throw new RangeError(`El código QR necesita ${size.toFixed(2)} pt de ancho; hay ${width.toFixed(2)} pt disponibles.`);
        encodeQR(node.content, node.errorCorrection);
        return [{ kind: "atomic", path, height: size, commands: [
          { kind: "qr", x: alignOffset(node.align, width, size), y: 0, size, content: node.content,
            color: resolveColor(node.color), errorCorrection: node.errorCorrection },
        ] }];
      }
      case "divider": {
        const thickness = positive(node.thickness, "El grosor de la línea");
        return [{ kind: "atomic", path, height: thickness, commands: [
          { kind: "line", x: 0, y: thickness / 2, width, thickness, color: resolveColor(node.color) },
        ] }];
      }
      case "space":
        return [{ kind: "atomic", path, height: nonNegative(node.height, "El espacio"), commands: [] }];
    }
  } catch (error) {
    if (error instanceof LayoutError) throw error;
    throw new LayoutError(path, error instanceof Error ? error.message : String(error));
  }
}

function alignOffset(align: TextAlignment, available: number, used: number): number {
  if (!["left", "center", "right"].includes(align)) throw new Error("Alineación inválida.");
  return align === "center" ? (available - used) / 2 : align === "right" ? available - used : 0;
}

function measureText(node: TextNode, width: number, style: TextStyle, path: string): TextItem {
  const padding = resolveInsets(node.box.padding);
  const fill = node.box.background === undefined ? undefined : resolveColor(node.box.background);
  const border = node.box.border === undefined ? undefined : resolveColor(node.box.border);
  const blockLink = node.link === undefined ? undefined : normalizeURL(node.link);
  const runs: TextRun[] = node.spans.map((span, index) => {
    if (typeof span.text !== "string") throw new TypeError(`El fragmento ${index + 1} necesita un texto.`);
    for (const key of Object.keys(span.style ?? {})) {
      if (!spanStyleKeys.has(key)) {
        throw new Error(`El fragmento ${index + 1} no admite "${key}": los fragmentos solo cambian font, bold, italic y color; el tamaño, interlineado y alineación son del párrafo.`);
      }
    }
    const spanStyle = { ...style, ...span.style };
    return { text: span.text, font: styleFont(spanStyle), color: textColor(spanStyle),
      link: span.link === undefined ? blockLink : normalizeURL(span.link) };
  });
  const options = textOptions(style, width - padding.left - padding.right);
  const layout = layoutRuns(runs, {
    width: options.width, size: options.size!, font: options.font!, align: options.align!,
    ...(options.lineHeight === undefined ? {} : { lineHeight: options.lineHeight }),
  });
  return { kind: "text", path, width, padding, fill, border, layout, keepTogether: node.keepTogether, bookmark: node.bookmark };
}

function measureTableRow(cells: readonly CellValue[], table: TableNode, widths: readonly number[], style: TextStyle,
  path: string, fill: TableRow["fill"], border: TableRow["border"]): TableRow {
  if (cells.length !== widths.length) {
    throw new LayoutError(path, `Se esperaban ${widths.length} celdas y se recibieron ${cells.length}.`);
  }
  let x = 0;
  return { path, fill, border, cells: cells.map((value, index) => {
    const cell = typeof value === "string" ? { text: value } : value;
    const cellPath = `${path}.cell[${index + 1}]`;
    const [item] = measure({
      kind: "text", spans: toSpans(cell.text), style: cell.style ?? {}, box: { padding: table.padding }, keepTogether: false, pageNumber: false,
      link: undefined, bookmark: undefined,
    }, widths[index]!, style, cellPath) as [TextItem];
    const result = { x, width: widths[index]!, item };
    x += widths[index]!;
    return result;
  }) };
}
