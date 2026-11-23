// Verifies the PDF download filename: accented names must transliterate
// ("Dénes András" -> "Denes_Andras_hu-en.pdf"), never "_"-mangle.
// Run: node_modules/.bin/sucrase-node scripts/cv-filename-test.js
const path = require("path");
const fs = require("fs");

const repo = "/home/denandras/repos/cvcreator";
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

const cases = [
  { name: "Dénes András", langs: ["hu", "en"] },
  { name: "Dénes András", langs: ["hu"] },
  { name: "Őrült Űrhajós", langs: ["hu"] },
  { name: "", langs: [] },
];

async function main() {
  const { jsPDF } = require(path.join(repo, "node_modules/jspdf/dist/jspdf.node.min.js"));
  const origSave = jsPDF.API.save;
  let captured = null;
  jsPDF.API.save = function (filename) {
    captured = filename;
    return origSave ? origSave.call(this, filename) : undefined;
  };
  const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));

  let fail = 0;
  for (const c of cases) {
    captured = null;
    const data = {
      profileName: c.name,
      profileTitle: "Trombonist",
      profilePicture: null,
      sections: [],
      design: {},
      activeLang: "hu",
    };
    const allLanguages =
      c.langs.length > 1
        ? c.langs.map((code) => ({ code, name: c.name, title: "Trombonist" }))
        : undefined;
    await exportToPdf(null, { cvData: data, allLanguages });
    console.log(JSON.stringify(c), "=>", captured);
  }
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error("FAIL:", e && (e.stack || e.message));
  process.exit(1);
});
