import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDF, rgb } from "sanpdf";

// Datos ficticios. Edita este objeto para personalizar la carta.
export const datos = {
  remitente: {
    organizacion: "Centro Educativo Los Álamos",
    direccion: "Av. Los Álamos 123, Lima",
    contacto: "contacto@example.com | Tel. 01 555 0100",
    nombre: "María López Torres",
    cargo: "Directora",
  },
  lugar: "Lima",
  fecha: "26 de septiembre de 2026",
  numero: "015-2026",
  destinatario: {
    nombre: "Señor Carlos Mendoza Ruiz",
    cargo: "Gerente de Relaciones Institucionales",
    organizacion: "Empresa Ejemplo S.A.C.",
  },
  asunto: "Solicitud de reunión para una colaboración educativa",
  saludo: "De mi consideración:",
  parrafos: [
    "Me dirijo a usted en representación del Centro Educativo Los Álamos para "
      + "solicitar una reunión en la que podamos evaluar una colaboración orientada "
      + "a fortalecer las oportunidades de aprendizaje de nuestros estudiantes.",
    "Nos gustaría presentar una propuesta de talleres de orientación vocacional "
      + "y actividades de acercamiento al entorno profesional. Consideramos que "
      + "la experiencia de su equipo puede aportar herramientas valiosas para "
      + "que los estudiantes conozcan distintas áreas de trabajo y desarrollen sus habilidades.",
    "Agradeceremos que nos indique una fecha y un horario disponibles durante las "
      + "próximas semanas. La reunión puede realizarse de manera presencial o virtual, "
      + "según su preferencia. Puede comunicarse con nosotros mediante los datos "
      + "incluidos en esta carta para coordinar los detalles.",
    "Agradezco de antemano su atención y quedo a la espera de su respuesta.",
  ],
  despedida: "Atentamente,",
};

export function createLetter(carta = datos) {
  const gris = rgb(0.35, 0.35, 0.35);

  return PDF.create({
    title: `Carta ${carta.numero} - ${carta.asunto}`,
    author: carta.remitente.nombre,
    subject: carta.asunto,
  }).page(page => {
    page.size("A4").margin(56).defaultTextStyle({ fontSize: 11, lineHeight: 16 });
    page.sectionGap(24);

    page.header().column(header => {
      header.gap(5);
      header.text(carta.remitente.organizacion).fontSize(17).lineHeight(22).bold();
      header.text(carta.remitente.direccion).fontSize(9).color(gris);
    });

    page.content().column(column => {
      column.gap(16);
      column.text(`${carta.lugar}, ${carta.fecha}`).alignRight();
      column.text(`CARTA N.º ${carta.numero}`).bold();

      // La fila mantiene juntos los datos del destinatario al cambiar de página.
      column.row(row => {
        row.item().column(recipient => {
          recipient.gap(3);
          recipient.text(carta.destinatario.nombre).bold();
          recipient.text(`${carta.destinatario.cargo}\n${carta.destinatario.organizacion}\nPresente.`);
        });
      });

      column.text(`Asunto: ${carta.asunto}`).bold().keepTogether();
      column.text(carta.saludo);
      for (const parrafo of carta.parrafos) column.text(parrafo);

      // Despedida y firma permanecen juntas; padding deja espacio para firmar a mano.
      column.row(row => {
        row.item().column(signature => {
          signature.gap(4);
          signature.text(carta.despedida);
          signature.text(carta.remitente.nombre).bold().padding({ top: 28 });
          signature.text(carta.remitente.cargo);
        });
      });
    });

    page.footer().row(row => {
      row.item().text(carta.remitente.contacto).fontSize(8).color(gris);
      row.item(110).pageNumber().fontSize(8).alignRight().color(gris);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const document = createLetter().toDocument();
  const directory = new URL("../output/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("carta.pdf", directory), document.toBytes());
  console.log(`Generado output/carta.pdf (${document.pageCount} páginas).`);
}
