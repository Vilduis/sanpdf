import { PDFDocument } from "../core/PDFDocument.js";
import type { PDFDocumentOptions } from "../core/PDFDocument.js";
import { textColor, textOptions } from "./layout/style.js";
import type { PagePlan } from "./layout/types.js";

export function render(pages: readonly PagePlan[], metadata: PDFDocumentOptions): PDFDocument {
  const document = new PDFDocument(metadata);
  pages.forEach((plan, index) => {
    const page = document.addPage([plan.width, plan.height]);
    for (const command of plan.commands) {
      switch (command.kind) {
        case "text":
          page.drawText(command.text, { x: command.x, y: command.y,
            font: command.font, size: command.size, color: command.color });
          break;
        case "rectangle":
          page.drawRectangle({ x: command.x, y: command.y, width: command.width, height: command.height,
            borderWidth: 0.5,
            ...(command.fill ? { fillColor: command.fill } : {}),
            ...(command.border ? { borderColor: command.border } : {}),
          });
          break;
        case "line":
          page.drawLine({ start: { x: command.x, y: command.y }, end: { x: command.x + command.width, y: command.y },
            width: command.thickness, color: command.color });
          break;
        case "image":
          page.drawImage(command.image, { x: command.x, y: command.y, width: command.width, height: command.height });
          break;
        case "qr":
          page.drawQRCode(command.content, { x: command.x, y: command.y, size: command.size,
            color: command.color, errorCorrection: command.errorCorrection });
          break;
        case "link":
          page.addLink({ x: command.x, y: command.y, width: command.width, height: command.height, url: command.url });
          break;
        case "bookmark":
          document.addBookmark(command.title, page, command.y);
          break;
        case "number":
          page.drawTextBox(command.format.replaceAll("{page}", String(index + 1)).replaceAll("{pages}", String(pages.length)), {
            ...textOptions(command.style, command.width), x: command.x, y: command.y,
            height: command.height, color: textColor(command.style),
          });
          break;
      }
    }
  });
  return document;
}
