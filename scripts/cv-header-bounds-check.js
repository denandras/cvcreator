// End-to-end: does a long multi-alphabet name/title now stay INSIDE the A4
// page, wrapped over several lines? Uses pdftotext -bbox to get every word's
// box and compares against the page box — out-of-page ink is exactly what
// poppler (and a printer) loses.
// Run: node_modules/.bin/sucrase-node scripts/cv-header-bounds-check.js [fontId]
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const repo = "/home/denandras/repos/cvcreator";
const fontId = process.argv[2] || "inter";
const outDir = "/home/denandras/.hermes/cache/scratch/cv-glyph-bounds";
fs.mkdirSync(outDir, { recursive: true });

const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) {
  if (r.startsWith("@/")) r = path.join(repo, "src", r.slice(2));
  return orig.call(this, r, ...a);
};
const realFetch = globalThis.fetch;
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
  return realFetch(u, o);
};

const NAME = "Őrült Űrhajós Árvíztűrő Tükörfúrógép Nagyon Hosszú Név Keresztnév Második Keresztnév Vezetéknév";
const TITLE = "ÁÉÍÓÖŐÚÜŰ őű ß ẞ șț ğış ąćęłńóśźż čďěňřšťůž å æ ø — szenior mérnök, épületgépész tervező, projektvezető";

(async () => {
  const { getDemoSections, getDemoDesign } = require(path.join(repo, "src/lib/demo-data.ts"));
  const { exportToPdf } = require(path.join(repo, "src/lib/pdf-export.ts"));
  const bytes = await exportToPdf(null, {
    cvData: {
      profileName: NAME,
      profileTitle: TITLE,
      profilePicture: null,
      sections: getDemoSections(),
      design: { ...getDemoDesign(), font_family: fontId },
      activeLang: "hu",
    },
    output: "arraybuffer",
  });
  const pdf = path.join(outDir, `bounds-${fontId}.pdf`);
  fs.writeFileSync(pdf, Buffer.from(bytes));

  const xml = execFileSync("pdftotext", ["-bbox", "-f", "1", "-l", "1", pdf, "-"], { encoding: "utf-8" });
  const page = xml.match(/<page width="([\d.]+)" height="([\d.]+)"/);
  const W = +page[1], H = +page[2];
  const words = [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }));
  const over = words.filter((w) => w.x1 > W - 0.5 || w.x0 < 0.5 || w.y1 > H - 0.5 || w.y0 < 0.5);
  console.log(`page ${W.toFixed(1)}x${H.toFixed(1)}pt, words=${words.length}`);
  console.log(`words outside the page: ${over.length}${over.length ? " -> " + over.slice(0, 5).map((w) => `${w.t}@x${w.x1.toFixed(1)}`).join(", ") : ""}`);
  const header = words.filter((w) => w.y0 < 160).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows = new Map();
  for (const w of header) {
    const key = [...rows.keys()].find((k) => Math.abs(k - w.y0) < 2.5) ?? w.y0;
    rows.set(key, [...(rows.get(key) || []), w]);
  }
  console.log(`header ink lines: ${rows.size}`);
  for (const [y, ws] of [...rows].sort((a, b) => a[0] - b[0])) {
    const x0 = Math.min(...ws.map((w) => w.x0)), x1 = Math.max(...ws.map((w) => w.x1));
    console.log(`  y=${y.toFixed(1).padStart(6)} x=${x0.toFixed(1)}..${x1.toFixed(1)} (margin 36..${(W - 36).toFixed(1)}) h=${(Math.max(...ws.map((w) => w.y1)) - y).toFixed(1)} ${x1 > W - 36 + 1 ? "OVERFLOW" : "ok"}`);
  }
  execFileSync("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "1", pdf, path.join(outDir, `bounds-${fontId}`)], { stdio: "ignore" });
  console.log("png:", path.join(outDir, `bounds-${fontId}-1.png`));
})().catch((e) => {
  console.error("FAIL:", e && (e.stack || e.message));
  process.exit(2);
});
