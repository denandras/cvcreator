// Hungarian + extended-Latin glyph test: exports the demo CV with a header that
// uses every letter the app promises (ő Ű Ő ű, German ß ẞ, Romanian ș ț, Turkish
// ğ ı ş, Polish ąćęłńóśźż, Czech čďěňřšťůž, Nordic å æ ø) and prints what the
// exporter actually put in the PDF (pdftotext) plus a PNG for eyeballing.
// Run: node_modules/.bin/sucrase-node scripts/cv-glyph-test.js [fontId]
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const repo = "/home/denandras/repos/cvcreator";
const fontId = process.argv[2] || "inter";
const outDir = "/home/denandras/.hermes/cache/scratch/cv-glyphs";
fs.mkdirSync(outDir, { recursive: true });

const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) {
  if (r.startsWith("@/")) r = path.join(repo, "src", r.slice(2));
  return orig.call(this, r, ...a);
};

const rf = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (typeof u === "string" && u.startsWith("/fonts/cv/")) {
    try {
      const d = fs.readFileSync(path.join(repo, "public", u));
      const b = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
      return { ok: true, status: 200, arrayBuffer: async () => b };
    } catch {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
  }
  return rf(u, o);
};

const NAME = "Őrült Űrhajós Árvíztűrő Tükörfúrógép";
const TITLE = "ÁÉÍÓÖŐÚÜŰ őű ß ẞ șț ğış ąćęłńóśźż čďěňřšťůž å æ ø";

(async () => {
  const { getDemoSections, getDemoDesign } = require(path.join(repo, "src/lib/demo-data.ts"));
  const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));
  const design = { ...getDemoDesign(), font_family: fontId };
  const bytes = await exportToPdf(null, {
    cvData: {
      profileName: NAME,
      profileTitle: TITLE,
      profilePicture: null,
      sections: getDemoSections(),
      design,
      activeLang: "hu",
    },
    output: "arraybuffer",
  });
  const pdf = path.join(outDir, `glyphs-${fontId}.pdf`);
  fs.writeFileSync(pdf, Buffer.from(bytes));

  const txt = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf-8" });
  const head = txt.split("\n").slice(0, 4);
  console.log(`font: ${fontId}`);
  console.log("PDF header text:\n  " + head.join("\n  "));
  const required = "ŐŰŐűáéíóöúüßẞșțğışąćęłńóśźżčďěňřšťůžåæø";
  const missing = [...new Set(required)].filter((ch) => !txt.includes(ch));
  console.log("missing glyphs in PDF text:", missing.length ? missing.join(" ") : "none");

  try {
    execFileSync("pdftoppm", ["-r", "200", "-png", "-f", "1", "-l", "1", pdf, path.join(outDir, `glyphs-${fontId}`)], { stdio: "ignore" });
    console.log("png:", path.join(outDir, `glyphs-${fontId}-1.png`));
  } catch (e) {
    console.log("pdftoppm failed:", e.message);
  }
  process.exit(missing.length ? 1 : 0);
})().catch((e) => {
  console.error("FAIL:", e && (e.stack || e.message));
  process.exit(2);
});
