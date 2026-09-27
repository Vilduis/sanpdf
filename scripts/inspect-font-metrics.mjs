// Herramienta de desarrollo: consulta los AFM de Adobe y muestra datos numéricos.
// No se ejecuta al compilar ni al generar PDFs; el motor usa tablas locales.
import assert from "node:assert/strict";
const check = process.argv.includes("--check");
const local = check ? (await import("../dist/fonts/StandardFontMetrics.js")).fontMetrics : undefined;
const base = "https://raw.githubusercontent.com/foliojs/pdfkit/master/lib/font/data/";
const ascii = ("space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash "
  + "zero one two three four five six seven eight nine colon semicolon less equal greater question at "
  + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").join(" ") + " bracketleft backslash bracketright asciicircum underscore grave "
  + "abcdefghijklmnopqrstuvwxyz".split("").join(" ") + " braceleft bar braceright asciitilde").split(" ");
const upper = ("Euro .notdef quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE .notdef Zcaron .notdef "
  + ".notdef quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe .notdef zcaron Ydieresis "
  + "space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron "
  + "degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown "
  + "Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis "
  + "Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls "
  + "agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis "
  + "eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis").split(" ");
const names = [...ascii, ".notdef", ...upper];
if (names.length !== 224) throw new Error("Mapa WinAnsi incompleto");
const fonts = ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
  "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
  "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"];
for (const font of fonts) {
  const response = await fetch(base + font + ".afm");
  if (!response.ok) throw new Error(`${font}: ${response.status}`);
  const afm = await response.text();
  const metrics = new Map([...afm.matchAll(/^C -?\d+ ; WX (\d+) ; N (\S+) ; B (-?\d+) (-?\d+) (-?\d+) (-?\d+) ;/gm)]
    .map((m) => [m[2], [Number(m[1]), ...m.slice(3).map(Number)]]));
  for (const name of names) if (name !== ".notdef" && !metrics.has(name)) throw new Error(`${font}: falta ${name}`);
  const selected = names.filter((n) => n !== ".notdef").map((n) => metrics.get(n));
  const vertical = /^FontBBox (.*)$/m.exec(afm)[1].trim().split(/\s+/).map(Number);
  const extents = [vertical[3], -vertical[1],
    Math.max(0, ...selected.map((g) => -g[1])), Math.max(0, ...selected.map((g) => g[3] - g[0]))];
  if (check) {
    assert.equal(local[font].widths.length, names.length, font);
    assert.deepEqual(local[font].extents, extents, font);
    names.forEach((name, index) => {
      if (name !== ".notdef") assert.equal(local[font].widths[index], metrics.get(name)[0], `${font}: ${name}`);
    });
    console.log(`${font}: métricas verificadas contra AFM`);
    continue;
  }
  console.log(font, "extents", JSON.stringify(extents));
  if (!font.startsWith("Courier") && !font.includes("Oblique")) {
    console.log("widths", JSON.stringify(names.map((name) => name === ".notdef" ? 0 : metrics.get(name)[0])));
  }
}
